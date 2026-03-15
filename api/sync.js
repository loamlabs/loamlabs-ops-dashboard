import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const cleanNum = (str) => str ? str.toString().replace(/\D/g, '') : '';

async function getShopifyToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });
  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  const authHeader = req.headers['x-loam-secret'];
  if (authHeader !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: rules, error } = await supabase.from('watcher_rules').select('*');
    if (error) throw error;

    const adminToken = await getShopifyToken();
    let updated = [], attention = [], inSync = [];

    for (const rule of rules) {
      const vResponse = await fetch(`${rule.vendor_url}.js`);
      const vData = await vResponse.json();
      const spokeGoal = cleanNum(rule.option_values["Spoke Count"]);
      const isFrontRule = rule.title.toLowerCase().includes('front');

      let candidates = vData.variants.filter(v => {
        const vTitle = v.public_title.toLowerCase();
        const spokeMatch = cleanNum(v.public_title) === spokeGoal;
        if (isFrontRule) return spokeMatch && vTitle.includes('front');
        return spokeMatch && (vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms') || vTitle.includes('microspline'));
      });

      if (candidates.length > 0) {
        const highestPriceVariant = candidates.reduce((prev, current) => (prev.price > current.price) ? prev : current);
        const vendorPrice = highestPriceVariant.price / 100;
        const vendorAvailable = highestPriceVariant.available;
        const goalPrice = parseFloat(vendorPrice * (rule.price_adjustment_factor || 1.0)).toFixed(2);

        const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice inventoryPolicy inventoryQuantity product { outOfStockAction: metafield(namespace: "custom", key: "out_of_stock_action") { value } } } }`,
            variables: { id: `gid://shopify/ProductVariant/${rule.shopify_variant_id}` }
          })
        });
        const sData = await sResponse.json();
        const variant = sData.data.productVariant;
        
        const myPrice = parseFloat(variant.price).toFixed(2);
        const myComparePrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;
        const myPolicy = variant.inventoryPolicy;
        const myQty = variant.inventoryQuantity;
        const outOfStockAction = variant.product.outOfStockAction?.value || 'Make Unavailable (Track Inventory)';

        let needsUpdate = false;
        let updatePayload = { id: rule.shopify_variant_id };
        let reasons = [];

        // --- SALE PRESERVATION LOGIC ---
        if (goalPrice !== myPrice) {
          updatePayload.price = goalPrice;
          
          // If you had a higher compare-at price, keep that same "Sale Gap"
          if (myComparePrice && parseFloat(myComparePrice) > parseFloat(myPrice)) {
            const gap = parseFloat(myComparePrice) - parseFloat(myPrice);
            updatePayload.compare_at_price = (parseFloat(goalPrice) + gap).toFixed(2);
            reasons.push(`Price: $${myPrice} → $${goalPrice} (Sale Badge Preserved)`);
          } else {
            reasons.push(`Price: $${myPrice} → $${goalPrice}`);
          }
          needsUpdate = true;
        }

        // --- AVAILABILITY LOGIC ---
        if (!vendorAvailable && myQty <= 0) {
           if (outOfStockAction === 'Make Unavailable (Track Inventory)' && myPolicy !== 'DENY') {
              updatePayload.inventory_policy = 'deny';
              updatePayload.inventory_quantity = 0;
              reasons.push("Stock: Made Unavailable");
              needsUpdate = true;
           } else if (outOfStockAction === 'Switch to Special Order Template' && myPolicy !== 'CONTINUE') {
              updatePayload.inventory_policy = 'continue';
              reasons.push("Stock: Set to Special Order");
              needsUpdate = true;
           }
        } else if (vendorAvailable && myPolicy !== 'CONTINUE') {
          updatePayload.inventory_policy = 'continue';
          reasons.push("Stock: Restored Special Order");
          needsUpdate = true;
        }

        if (needsUpdate && rule.auto_update === true) {
          await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: updatePayload })
          });
          updated.push({ title: rule.title, reasons: reasons.join(', ') });
        } else if (needsUpdate) {
          attention.push({ title: rule.title, vendorPrice, myPrice });
        } else {
          inSync.push({ title: rule.title, myPrice });
        }

        await supabase.from('watcher_rules').update({ 
          last_price: Math.round(vendorPrice * 100), 
          last_availability: vendorAvailable,
          last_run_at: new Date().toISOString() 
        }).eq('id', rule.id);
      }
    }

    if (updated.length > 0 || attention.length > 0) {
      const updatedHtml = updated.map(i => `<li style="color:green; margin-bottom:8px;">🚀 <b>UPDATED:</b> ${i.title}<br><small style="color:#666;">${i.reasons}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red; margin-bottom:8px;">⚠️ <b>ACTION REQUIRED:</b> ${i.title}<br><small style="color:#666;">Vendor: $${i.vendorPrice} | Mine: $${i.myPrice}</small></li>`).join('');
      const syncHtml = inSync.map(i => `<li style="color:gray; margin-bottom:4px;">Verified: ${i.title} ($${i.myPrice})</li>`).join('');

      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>',
        to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher: ${updated.length} Syncs, ${attention.length} Alerts`,
        html: `<div style="font-family:sans-serif; max-width:600px;"><h2>Report</h2>${updated.length > 0 ? `<h3>🚀 Automated Syncs</h3><ul>${updatedHtml}</ul>` : ''}${attention.length > 0 ? `<h3>⚠️ Manual Action Needed</h3><ul>${attentionHtml}</ul>` : ''}<hr><h3 style="color:#666;">✅ Items In Sync</h3><ul>${syncHtml}</ul></div>`
      });
    }

    res.status(200).json({ updated, attention, inSync });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
