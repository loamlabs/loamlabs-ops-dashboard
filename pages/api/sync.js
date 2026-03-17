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
  // 1. Unified Security Handshake
  const authHeader = req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'];
  if (authHeader !== process.env.CRON_SECRET && authHeader !== process.env.DASHBOARD_PASSWORD) {
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
        
        // --- START REPLACEMENT: CHARACTER NORMALIZATION ---
        const normalize = (t) => t.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
        const spokeGoal = cleanNum(rule.option_values["Spoke Count"]);
        const isFrontRule = rule.title.toLowerCase().includes('front');

        let candidates = vData.variants.filter(v => {
          const vTitle = normalize(v.public_title);
          const ruleTitle = normalize(rule.title);
          
          const hasSpoke = vTitle.includes(`${spokeGoal} spoke`) || vTitle.includes(`${spokeGoal}h`) || vTitle.includes(`${spokeGoal} hole`);
          if (!hasSpoke) return false;
          if (isFrontRule) return vTitle.includes('front');
          
          const is157 = vTitle.includes('157') || vTitle.includes('super');
          const is142 = vTitle.includes('142') || vTitle.includes('road') || vTitle.includes('gravel');
          const is148 = vTitle.includes('148') || (vTitle.includes('boost') && !is157 && !is142);

          if (ruleTitle.includes('157')) return is157;
          if (ruleTitle.includes('142')) return is142;
          if (ruleTitle.includes('148')) return is148;
          return vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms');
        });
        // --- END REPLACEMENT ---

        if (candidates.length > 0) {
          const winner = candidates.reduce((prev, curr) => (prev.price > curr.price) ? prev : curr);
          const vendorPrice = winner.price / 100;
          const goalPrice = parseFloat(vendorPrice * (rule.price_adjustment_factor || 1.1111)).toFixed(2);

          // 3. SHOPIFY DATA (Preserving Sale Gap)
          const variantGid = `gid://shopify/ProductVariant/${rule.shopify_variant_id}`;
          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice product { vendor } } }`,
              variables: { id: variantGid }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data?.productVariant;
          if (!variant) throw new Error("Shopify ID not found");

          const myPrice = parseFloat(variant.price).toFixed(2);
          const myCompare = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;
          const isDiff = Number(goalPrice) !== Number(myPrice);

          let updatePayload = { id: rule.shopify_variant_id, price: goalPrice };
          let changeReason = "";

          if (isDiff && !rule.needs_review) {
            // SALE PRESERVATION LOGIC
            if (myCompare && Number(myCompare) > Number(myPrice)) {
              const gap = Number(myCompare) - Number(myPrice);
              updatePayload.compare_at_price = (Number(goalPrice) + gap).toFixed(2);
              changeReason = `$${myPrice} -> $${goalPrice} (Sale Gap Preserved)`;
            } else {
              changeReason = `$${myPrice} -> $${goalPrice}`;
            }

            if (rule.auto_update === true) {
            // 1. Fetch ALL variants for this product from Shopify
            const pResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/products/${rule.shopify_product_id}.json`, {
              headers: { 'X-Shopify-Access-Token': adminToken }
            });
            const pData = await pResponse.json();
            
            // 2. Find all variants that match the same Spoke Count (ignoring colors)
            const siblingsToUpdate = pData.product.variants.filter(v => {
              const vTitle = v.title.toLowerCase().replace(/×/g, 'x');
              return vTitle.includes(spokeGoal);
            });

            // 3. Update every matching variant (Black Spoke, White Spoke, etc.)
            for (const sibling of siblingsToUpdate) {
              await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${sibling.id}.json`, {
                method: 'PUT',
                headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: { id: sibling.id, price: goalPrice } })
              });
            }
            updated.push({ title: rule.title, reason: `Updated ${siblingsToUpdate.length} color variants to $${goalPrice}` });
          }
            } else {
              attention.push({ title: rule.title, reason: `Manual Sync Required: ${changeReason}` });
            }
          } else {
            inSync.push({ title: rule.title });
          }

          // 4. PERSISTENCE UPDATE
          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: winner.available,
            last_run_at: new Date().toISOString(),
            last_log: `Matched: "${winner.public_title}".`
          }).eq('id', rule.id);

        } else {
          // 5. DIAGNOSTIC LOG (Writes to your Dashboard)
          const vendorOptions = vData.variants.slice(0, 2).map(v => v.public_title).join(', ');
          await supabase.from('watcher_rules').update({ 
            last_log: `FAILED: Found 0 matches for ${spokeGoal}h. Vendor uses: ${vendorOptions}` 
          }).eq('id', rule.id);
        }
      } catch (err) { console.error(`Error on ${rule.title}:`, err.message); }
    }

    // 6. GATED REPORTING
    if (updated.length > 0 || attention.length > 0) {
      const updatedHtml = updated.map(i => `<li style="color:green;">🚀 <b>UPDATED:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red;">⚠️ <b>ALERT:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher: ${updated.length} Updates, ${attention.length} Alerts`,
        html: `<div style="font-family:sans-serif;"><h2>Shop Sync Report</h2><ul>${updatedHtml}${attentionHtml}</ul></div>`
      });
    }

    res.status(200).json({ updated: updated.length, attention: attention.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
