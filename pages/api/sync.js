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
      try {
        const vResponse = await fetch(`${rule.vendor_url}.js`);
        const vData = await vResponse.json();
        const spokeGoal = cleanNum(rule.option_values["Spoke Count"]);
        const isFrontRule = rule.title.toLowerCase().includes('front');

        let candidates = vData.variants.filter(v => {
          const vTitle = v.public_title.toLowerCase();
          const spokeMatch = cleanNum(v.public_title) === spokeGoal;
          if (isFrontRule) return spokeMatch && vTitle.includes('front');
          return spokeMatch && (vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'));
        });

        if (candidates.length > 0) {
          const highestPriceVariant = candidates.reduce((prev, current) => (prev.price > current.price) ? prev : current);
          const vendorPrice = highestPriceVariant.price / 100;
          const vendorAvailable = highestPriceVariant.available;
          
          // Apply Adjustment Factor (Default 1.1111)
          const factor = rule.price_adjustment_factor || 1.1111;
          const goalPrice = parseFloat(vendorPrice * factor).toFixed(2);

          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST',
            headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice inventoryPolicy inventoryQuantity } }`,
              variables: { id: `gid://shopify/ProductVariant/${rule.shopify_variant_id}` }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data.productVariant;
          
          const myPrice = parseFloat(variant.price).toFixed(2);
          const myComparePrice = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;

          let needsUpdate = false;
          let updatePayload = { id: rule.shopify_variant_id };
          let reasons = [];
          let marginAlert = false;

          // Margin Check
          const priceDropPercent = (myPrice - goalPrice) / myPrice;
          if (priceDropPercent > (rule.price_drop_threshold || 0.20)) {
             marginAlert = true;
             reasons.push(`MARGIN ALERT: ${Math.round(priceDropPercent * 100)}% drop.`);
          }

          if (goalPrice !== myPrice && !marginAlert) {
            updatePayload.price = goalPrice;
            if (myComparePrice && parseFloat(myComparePrice) > parseFloat(myPrice)) {
              const gap = parseFloat(myComparePrice) - parseFloat(myPrice);
              updatePayload.compare_at_price = (parseFloat(goalPrice) + gap).toFixed(2);
            }
            reasons.push(`Price Sync: $${myPrice} → $${goalPrice}`);
            needsUpdate = true;
          }

          // Execute Update
          if (needsUpdate && rule.auto_update === true && !marginAlert) {
            await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
              method: 'PUT',
              headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ variant: updatePayload })
            });
            updated.push({ title: rule.title, reasons: reasons.join(', ') });
          } else if (needsUpdate || marginAlert) {
            attention.push({ title: rule.title, reasons: reasons.join(', ') });
            if (marginAlert) await supabase.from('watcher_rules').update({ needs_review: true, review_reason: reasons[0] }).eq('id', rule.id);
          } else {
            inSync.push({ title: rule.title, myPrice });
          }

          // Update Rule Record and Log
          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: vendorAvailable,
            last_run_at: new Date().toISOString(),
            last_log: marginAlert ? reasons[0] : `Vendor $${vendorPrice} matched. Loam Price: $${goalPrice}. Status: ${needsUpdate ? 'Updated Shopify' : 'In Sync'}`
          }).eq('id', rule.id);
        }
      } catch (innerErr) {
        console.error(`Error on rule ${rule.title}:`, innerErr);
        await supabase.from('watcher_rules').update({ last_log: `Error: ${innerErr.message}` }).eq('id', rule.id);
      }
    }

    res.status(200).json({ updated: updated.length, attention: attention.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
