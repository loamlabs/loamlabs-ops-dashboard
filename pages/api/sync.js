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
  const authHeader = req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'];
  const isValidCron = authHeader === process.env.CRON_SECRET;
  const isValidDash = authHeader === process.env.DASHBOARD_PASSWORD;

  if (!isValidCron && !isValidDash) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
        const vTitleCleanup = (t) => t.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

        let candidates = vData.variants.filter(v => {
          const vTitle = vTitleCleanup(v.public_title);
          // Permissive Spoke Check
          const hasSpoke = vTitle.includes(`${spokeGoal} spoke`) || vTitle.includes(`${spokeGoal}h`) || vTitle.includes(`${spokeGoal} hole`) || vTitle.split(' ').includes(spokeGoal);
          if (!hasSpoke) return false;

          if (isFrontRule) return vTitle.includes('front');
          
          // Rear/Axle Logic
          const is157 = vTitle.includes('157') || vTitle.includes('super');
          const is142 = vTitle.includes('142') || vTitle.includes('road') || vTitle.includes('gravel');
          const is148 = vTitle.includes('148') || (vTitle.includes('boost') && !is157 && !is142);

          if (rule.title.includes('157')) return is157;
          if (rule.title.includes('142')) return is142;
          if (rule.title.includes('148')) return is148;

          return vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms');
        });

        if (candidates.length > 0) {
          const winner = candidates.reduce((prev, curr) => (prev.price > curr.price) ? prev : curr);
          const vendorPrice = winner.price / 100;
          const factor = rule.price_adjustment_factor || 1.1111;
          const goalPrice = parseFloat(vendorPrice * factor).toFixed(2);

          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice inventoryQuantity product { vendor } } }`,
              variables: { id: `gid://shopify/gid/ProductVariant/${rule.shopify_variant_id}`.replace('gid/gid/', 'gid/') }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data?.productVariant;
          
          if (!variant) {
            await supabase.from('watcher_rules').update({ last_log: `Shopify ID ${rule.shopify_variant_id} not found.` }).eq('id', rule.id);
            continue;
          }

          const myPrice = parseFloat(variant.price).toFixed(2);
          const isDiff = Number(goalPrice) !== Number(myPrice);

          if (isDiff && rule.auto_update === true) {
            await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
              method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ variant: { id: rule.shopify_variant_id, price: goalPrice } })
            });
            updated.push({ title: rule.title });
          }

          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: winner.available,
            last_run_at: new Date().toISOString(),
            last_log: `Matched: ${winner.public_title}. Goal: $${goalPrice}.`
          }).eq('id', rule.id);

        } else {
          // LOG FAILURE TO DATABASE
          await supabase.from('watcher_rules').update({ 
            last_log: `FAILED: No Berd variants matched "${spokeGoal}" and Position. Check URL.` 
          }).eq('id', rule.id);
        }
      } catch (err) { console.error(err); }
    }

    if (updated.length > 0 || attention.length > 0) {
      const updatedHtml = updated.map(i => `<li style="color:green;">🚀 <b>UPDATED:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red;">⚠️ <b>ALERT:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher Report: ${updated.length} Updates`,
        html: `<div style="font-family:sans-serif;"><h2>Shop Sync Report</h2><ul>${updatedHtml}${attentionHtml}</ul></div>`
      });
    }

    res.status(200).json({ updated: updated.length, attention: attention.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
