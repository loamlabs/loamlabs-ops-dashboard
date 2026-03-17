import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const cleanNum = (str) => str ? str.toString().replace(/\D/g, '') : '';

async function getShopifyToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' })
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
      if (!rule.vendor_url) continue;

      try {
        const vResponse = await fetch(`${rule.vendor_url}.js`);
        const vData = await vResponse.json();
        
        const spokeGoal = cleanNum(rule.option_values["Spoke Count"]);
        const isFrontRule = rule.title.toLowerCase().includes('front');

        // MATCHING LOGIC
        let candidates = [];
        const spokeGoal = cleanNum(rule.option_values["Spoke Count"]);
        const isFrontRule = rule.title.toLowerCase().includes('front');
        let candidates = [];

        switch (rule.vendor_name?.toLowerCase()) {
          case 'berd':
            candidates = vData.variants.filter(v => {
              const vTitle = v.public_title.toLowerCase();
              const hasSpokeCount = vTitle.includes(`${spokeGoal} spoke`) || vTitle.includes(`${spokeGoal}h`) || vTitle.includes(`${spokeGoal} hole`);
              if (!hasSpokeCount) return false;
              if (isFrontRule) return vTitle.includes('front');
              
              const is157 = vTitle.includes('157') || vTitle.includes('super');
              const is142 = vTitle.includes('142') || vTitle.includes('road') || vTitle.includes('gravel');
              const is148 = vTitle.includes('148') || (vTitle.includes('boost') && !is157);

              // Match against the Registry Title from Supabase
              if (rule.title.includes('157') || rule.title.toLowerCase().includes('super')) return is157;
              if (rule.title.includes('142')) return is142;
              if (rule.title.includes('148')) return is148;

              return vTitle.includes('rear');
            });
            break;

          default:
            candidates = vData.variants.filter(v => {
              const vTitle = v.public_title.toLowerCase();
              const spokeMatch = vTitle.includes(`${spokeGoal} spoke`) || vTitle.includes(`${spokeGoal}h`) || vTitle.includes(`${spokeGoal} hole`);
              if (isFrontRule) return spokeMatch && vTitle.includes('front');
              return spokeMatch && (vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'));
            });
        }

        if (candidates.length > 0) {
          const highestPriceVariant = candidates.reduce((prev, current) => (prev.price > current.price) ? prev : current);
          const vendorPrice = highestPriceVariant.price / 100;
          const vendorAvailable = highestPriceVariant.available;
          const goalPrice = parseFloat(vendorPrice * (rule.price_adjustment_factor || 1.1111)).toFixed(2);

          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice inventoryQuantity product { vendor } } }`,
              variables: { id: `gid://shopify/ProductVariant/${rule.shopify_variant_id}` }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data.productVariant;
          
          const myPrice = parseFloat(variant.price).toFixed(2);
          const myComparePrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;

          let needsUpdate = false, updatePayload = { id: rule.shopify_variant_id }, reasons = [];
          const priceDropPercent = (myPrice - goalPrice) / myPrice;
          let marginAlert = priceDropPercent > (rule.price_drop_threshold || 0.20);

          if (goalPrice !== myPrice && !marginAlert) {
            updatePayload.price = goalPrice;
            if (myComparePrice && parseFloat(myComparePrice) > parseFloat(myPrice)) {
              updatePayload.compare_at_price = (parseFloat(goalPrice) + (parseFloat(myComparePrice) - parseFloat(myPrice))).toFixed(2);
            }
            reasons.push(`Sync: $${myPrice} -> $${goalPrice}`);
            needsUpdate = true;
          }

          if (needsUpdate && rule.auto_update === true) {
            await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
              method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ variant: updatePayload })
            });
            updated.push({ title: rule.title, reason: reasons.join(', ') });
          } else if (needsUpdate || marginAlert) {
            attention.push({ title: rule.title, reason: marginAlert ? `Margin Alert: ${Math.round(priceDropPercent*100)}% drop` : reasons.join(', ') });
          } else { inSync.push({ title: rule.title, myPrice }); }

          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: vendorAvailable, 
            last_run_at: new Date(), 
            last_log: reasons[0] || 'In Sync' 
          }).eq('id', rule.id);
        }
      } catch (err) { console.error(`Error on ${rule.title}:`, err.message); }
    }

    // --- SEND EMAIL REPORT ---
    if (updated.length > 0 || attention.length > 0) {
      const updatedHtml = updated.map(i => `<li style="color:green;">🚀 <b>UPDATED:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red;">⚠️ <b>ALERT:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher Report: ${updated.length} Updates`,
        html: `<div style="font-family:sans-serif;"><h2>Shop Sync Report</h2>${updatedHtml}${attentionHtml}</div>`
      });
    }

    res.status(200).json({ updated: updated.length, attention: attention.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
