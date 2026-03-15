import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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
      const spokeNum = rule.option_values["Spoke Count"]?.replace(/\D/g, '');
      const isFrontRule = rule.title.toLowerCase().includes('front');

      let candidates = vData.variants.filter(v => {
        const title = v.public_title.toLowerCase();
        const spokeMatch = v.public_title.includes(spokeNum);
        if (isFrontRule) return spokeMatch && title.includes('front');
        return spokeMatch && (title.includes('rear') || title.includes('xd') || title.includes('hg') || title.includes('ms'));
      });

      if (candidates.length > 0) {
        // 1. VENDOR DATA
        const highestPriceVariant = candidates.reduce((prev, current) => (prev.price > current.price) ? prev : current);
        const vendorPrice = highestPriceVariant.price / 100;
        const vendorAvailable = highestPriceVariant.available;
        const goalPrice = (vendorPrice * (rule.price_adjustment_factor || 1.0)).toFixed(2);

        // 2. SHOPIFY DATA (GraphQL used to get Product-level Metafields)
        const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query($id: ID!) { 
              productVariant(id: $id) { 
                price 
                inventoryPolicy 
                inventoryQuantity 
                product { 
                  outOfStockAction: metafield(namespace: "custom", key: "out_of_stock_action") { value } 
                } 
              } 
            }`,
            variables: { id: `gid://shopify/ProductVariant/${rule.shopify_variant_id}` }
          })
        });
        const sData = await sResponse.json();
        const variant = sData.data.productVariant;
        const myPrice = parseFloat(variant.price).toFixed(2);
        const myPolicy = variant.inventoryPolicy; // 'CONTINUE' or 'DENY'
        const myQty = variant.inventoryQuantity;
        const outOfStockAction = variant.product.outOfStockAction?.value || 'Make Unavailable (Track Inventory)';

        // 3. LOGIC DETERMINATION
        let needsUpdate = false;
        let updatePayload = { id: rule.shopify_variant_id };

        // Price Logic
        if (goalPrice !== myPrice) {
          updatePayload.price = goalPrice;
          needsUpdate = true;
        }

        // Availability Logic (BTI ALIGNED)
        if (!vendorAvailable) {
           if (outOfStockAction === 'Make Unavailable (Track Inventory)') {
              if (myPolicy !== 'DENY' || myQty > 0) {
                updatePayload.inventory_policy = 'deny';
                updatePayload.inventory_quantity = 0;
                needsUpdate = true;
              }
           } else {
              // Switch to Special Order -> Policy must be CONTINUE
              if (myPolicy !== 'CONTINUE') {
                updatePayload.inventory_policy = 'continue';
                needsUpdate = true;
              }
           }
        } else {
          // Vendor is In Stock -> Ensure we can sell it
          if (myPolicy !== 'CONTINUE') {
            updatePayload.inventory_policy = 'continue';
            needsUpdate = true;
          }
        }

        // 4. EXECUTION
        if (needsUpdate && rule.auto_update === true) {
          await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: updatePayload })
          });
          updated.push({ title: rule.title, reason: needsUpdate ? "Price/Stock Sync" : "" });
        } else if (needsUpdate) {
          attention.push({ title: rule.title });
        } else {
          inSync.push({ title: rule.title });
        }

        await supabase.from('watcher_rules').update({ last_price: Math.round(vendorPrice * 100), last_run_at: new Date() }).eq('id', rule.id);
      }
    }

    if (updated.length > 0 || attention.length > 0) {
      const updatedHtml = updated.map(i => `<li>✅ <b>UPDATED:</b> ${i.title}</li>`).join('');
      const attentionHtml = attention.map(i => `<li>⚠️ <b>MISMATCH:</b> ${i.title}</li>`).join('');
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>',
        to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher Report: ${updated.length} Syncs`,
        html: `<div style="font-family:sans-serif;"><h2>Report</h2><ul>${updatedHtml}${attentionHtml}</ul></div>`
      });
    }

    res.status(200).json({ updated, attention, inSync });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
