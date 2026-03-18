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
  const authHeader = req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'];
  if (authHeader !== process.env.CRON_SECRET && authHeader !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let rules = [];
    let hasMore = true;
    let rangeStart = 0;

    while (hasMore) {
      const { data, error } = await supabase.from('watcher_rules').select('*').range(rangeStart, rangeStart + 999);
      if (error) throw error;
      if (data && data.length > 0) {
        rules = rules.concat(data);
        if (data.length < 1000) hasMore = false;
        else rangeStart += 1000;
      } else {
        hasMore = false;
      }
    }

    const adminToken = await getShopifyToken();
    let updated = [], attention = [], inSync = [];

    for (const rule of rules) {
      if (!rule.vendor_url) continue;

      let vendorPrice;
      const url = `${rule.vendor_url}.js`;
      const vResponse = await fetch(url);
      if (!vResponse.ok) {
        console.log(`Berd endpoint returned ${vResponse.status} for ${url}, skipping...`);
        continue;
      }
      const textObj = await vResponse.text();
      let vData;
      try {
        vData = JSON.parse(textObj);
      } catch(e) {
        console.log(`Berd endpoint returned non-JSON payload for ${url}, skipping...`);
        continue;
      }

      try {
        let parsedOptions = rule.option_values || {};
        if (typeof parsedOptions === 'string') {
          try { parsedOptions = JSON.parse(parsedOptions); } catch (e) {}
        }
        const spokeGoal = cleanNum(parsedOptions["Spoke Count"]);
        const isFrontRule = rule.title.toLowerCase().includes('front');
        const normalize = (t) => String(t || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

        // 1. DYNAMIC MATCHING ENGINE (TOKENIZED)
        let candidates = vData.variants.filter(v => {
          const vTitle = normalize(v.public_title);
          const ruleTitle = normalize(rule.title);
          const isHub = ruleTitle.includes('hub');
          const isRim = ruleTitle.includes('rim');
          
          if (rule.vendor_name === 'Berd') {
            let reqTokens = [];
            for (const [optName, optValue] of Object.entries(parsedOptions)) {
               if (!optValue || optValue.toLowerCase() === 'default title') continue;
               
               // Berd skips "Color" in hub titles, avoiding false negatives
               if (isHub && optName.toLowerCase().includes('color')) continue;

               // Handle spoke count independently below
               if (isHub && optName.toLowerCase().includes('spoke')) continue;

               // Tokenize option values (e.g. "HAWK30 29" -> ["hawk30", "29"])
               let tokens = optValue.toLowerCase().replace(/×/g, 'x').replace(/[\"\']/g, '').split(/[\s/+\-]+/).filter(t => t.length > 0);
               reqTokens.push(...tokens);
            }

            // Ensure vTitle contains all required tokens
            const normalizedTitleForTokens = vTitle.replace(/[\"\']/g, '');
            for (let token of reqTokens) {
                if (!normalizedTitleForTokens.includes(token)) {
                    return false;
                }
            }

            if (isHub) {
                const isFrontRule = ruleTitle.includes('front');
                if (isFrontRule && !vTitle.includes('front')) return false;
                if (!isFrontRule && !(vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'))) return false;

                const axleMatch = ['100', '110', '142', '148', '157'].find(size => ruleTitle.includes(size));
                if (axleMatch && !vTitle.includes(axleMatch)) return false;

                // Enforce Spoke Count for hubs
                let hasSpokeOption = false;
                let spokeMatch = false;
                for (const [optName, optValue] of Object.entries(parsedOptions)) {
                    if (optName.toLowerCase().includes('spoke')) {
                        hasSpokeOption = true;
                        const numOnly = cleanNum(optValue);
                        if (numOnly && (vTitle.includes(`${numOnly} spoke`) || vTitle.includes(`${numOnly}h`) || vTitle.includes(`${numOnly} hole`))) {
                            spokeMatch = true;
                        }
                    }
                }
                if (hasSpokeOption && !spokeMatch) return false;
            }
            return true;
          } 
          else if (rule.vendor_name === 'e*thirteen') {
             // RIM LOGIC
             if (isRim) {
                let expectedSize = parsedOptions["Size"] ? parsedOptions["Size"].toLowerCase() : null;
                if (expectedSize) {
                    if (expectedSize.includes('700c') && !vTitle.includes('700c')) {
                         expectedSize = '29';
                    }
                    const cleanExpected = expectedSize.replace(/["'\\\\ ]/g, '');
                    const cleanVTitle = vTitle.replace(/["' ]/g, '');
                    
                    const sizeString = cleanExpected.replace(/[^\d.c]/g, ''); 
                    
                    if (!cleanVTitle.includes(sizeString)) {
                        return false;
                    }
                }

                const spokeCount = parsedOptions["Spoke Count"] ? parsedOptions["Spoke Count"].toLowerCase() : null;
                if (spokeCount && !vTitle.includes(spokeCount)) return false;

                // Only require DH/EN/GR if the vendor actually specifies it in the variant title
                const ruleTokens = ruleTitle.split(' ');
                const vTokens = vTitle.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
                
                if (ruleTokens.includes('dh') && !vTokens.includes('dh') && (vTokens.includes('en') || vTokens.includes('gr'))) return false;
                if (ruleTokens.includes('en') && !vTokens.includes('en') && (vTokens.includes('dh') || vTokens.includes('gr'))) return false;
                if (ruleTokens.includes('gr') && !vTokens.includes('gr') && (vTokens.includes('dh') || vTokens.includes('en'))) return false;
             }

             // HUB LOGIC
             if (isHub) {
                const isFrontRule = ruleTitle.includes('front');
                if (isFrontRule && !vTitle.includes('front') && !vTitle.includes('15x') && !vTitle.includes('15mm') && !vTitle.includes('110x')) return false;
                
                if (!isFrontRule && !vTitle.includes('rear') && !vTitle.includes('148') && !vTitle.includes('157')) return false;

                let expectedHoles = null;
                if (parsedOptions["Spoke Count"]) {
                   expectedHoles = cleanNum(parsedOptions["Spoke Count"]);
                } else if (ruleTitle.includes('28h')) expectedHoles = '28';
                else if (ruleTitle.includes('32h')) expectedHoles = '32';

                if (expectedHoles && !vTitle.includes(`${expectedHoles} hole`) && !vTitle.includes(`${expectedHoles}h`) && !vTitle.includes(`${expectedHoles} h`)) {
                    return false;
                }

                if (ruleTitle.includes('superboost') && !vTitle.includes('157')) return false;
                if (!ruleTitle.includes('superboost') && ruleTitle.includes('rear') && !vTitle.includes('148')) return false;
                
                // Special e*thirteen hub variants (DM 7spd, Mini HG) shouldn't match standard MTB hub rules unless specified
                if (!ruleTitle.includes('7spd') && !ruleTitle.includes('7 spd') && (vTitle.includes('7spd') || vTitle.includes('7 spd'))) return false;
                if (!ruleTitle.includes('mini') && vTitle.includes('mini')) return false;

                // E*thirteen often groups SL hubs underneath generic front hubs without appending 'SL' to the variant title.
                // We will NOT strictly fail 'sl' if it's missing from the variant title.
             }
             return true;
          }

          // Fallback if vendor not strictly mapped yet
          return true;
        });


        if (candidates.length > 0) {
          const winner = candidates.reduce((prev, curr) => (prev.price > curr.price) ? prev : curr);
          const vendorPrice = winner.price / 100;

          // Sale Reversion & Smart Margin Safety Logic
          const stdFactor = rule.price_adjustment_factor || 1.0;
          let goalPriceNum = vendorPrice * stdFactor;
          let isDeepSale = false;

          if (rule.original_msrp && rule.original_msrp > 0) {
            const discountRatio = (rule.original_msrp - vendorPrice) / rule.original_msrp;
            if (discountRatio >= 0.10) {
              // 10%+ SALE: Adjust final price so that a 10% builder discount matches the vendor sale price exactly
              goalPriceNum = vendorPrice / 0.90;
              isDeepSale = true;
            }
          }
          const goalPrice = parseFloat(goalPriceNum).toFixed(2);

          // 45-Day New Normal Timer Logic & Drastic Sale
          let newPriceLastChangedAt = rule.price_last_changed_at || null;
          if (rule.last_price !== winner.price) {
            newPriceLastChangedAt = new Date().toISOString();
            if (isDeepSale) {
               attention.push({ title: rule.title, reason: `Drastic Sale Detected: Vendor Price dropped to $${vendorPrice.toFixed(2)}!` });
            }
          } else if (newPriceLastChangedAt && isDeepSale) {
            const daysPersistent = (new Date() - new Date(newPriceLastChangedAt)) / (1000 * 60 * 60 * 24);
            if (Math.floor(daysPersistent) === 45) {
               attention.push({ title: rule.title, reason: `Sale Price persistent for 45 days: Confirm as New MSRP?` });
            }
          }

          // Out-of-Stock Stopwatch
          let newOutOfStockSince = rule.out_of_stock_since || null;
          if (!winner.available) {
             if (!newOutOfStockSince) {
                newOutOfStockSince = new Date().toISOString();
             } else {
                const daysOOS = (new Date() - new Date(newOutOfStockSince)) / (1000 * 60 * 60 * 24);
                if (Math.floor(daysOOS) === 90 || Math.floor(daysOOS) === 91 || Math.floor(daysOOS) === 92) {
                   attention.push({ title: rule.title, reason: `Out of Stock for 3 Months. Discontinued or Backorder?` });
                }
             }
          } else {
             newOutOfStockSince = null;
          }

          const variantGid = `gid://shopify/ProductVariant/${rule.shopify_variant_id}`;
          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice product { id } } }`,
              variables: { id: variantGid }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data?.productVariant;
          if (!variant) throw new Error("Shopify ID not found");

          const myPrice = parseFloat(variant.price).toFixed(2);
          const myCompare = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;
          let finalShopifyPriceNum = Number(myPrice);
          const isDiff = Number(goalPrice) !== Number(myPrice);

          let updatePayload = { id: rule.shopify_variant_id, price: goalPrice };
          let changeReason = "";

          if (isDiff && !rule.needs_review) {
            if (myCompare && Number(myCompare) > Number(myPrice)) {
              const gap = Number(myCompare) - Number(myPrice);
              updatePayload.compare_at_price = (Number(goalPrice) + gap).toFixed(2);
              changeReason = `$${myPrice} -> $${goalPrice} (Sale Gap Preserved)`;
            } else {
              // Phase 8: Safety Flush to prevent inverted discounts bleeding to the storefront when Base raises over Compare.
              updatePayload.compare_at_price = goalPrice;
              changeReason = `$${myPrice} -> $${goalPrice}`;
            }

            if (rule.auto_update === true) {
              await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: updatePayload })
              });
              updated.push({ title: rule.title, reason: changeReason });
              finalShopifyPriceNum = Number(goalPrice);
            } else {
              attention.push({ title: rule.title, reason: `Manual Sync Required: ${changeReason}` });
            }
          } else { inSync.push({ title: rule.title }); }

          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: winner.available,
            last_run_at: new Date().toISOString(),
            last_log: `Matched: "${winner.public_title}".`,
            price_last_changed_at: newPriceLastChangedAt,
            out_of_stock_since: newOutOfStockSince,
            current_shopify_price: Math.round(finalShopifyPriceNum * 100),
            current_compare_at_price: myCompare ? Math.round(Number(myCompare) * 100) : null
          }).eq('id', rule.id);

        } else {
          const vendorOptions = vData.variants.slice(0, 2).map(v => v.public_title).join(', ');
          await supabase.from('watcher_rules').update({ 
            last_log: `FAILED: Found 0 matches for parsed options. Vendor uses: ${vendorOptions}` 
          }).eq('id', rule.id);
        }
      } catch (err) { console.error(`Error on ${rule.title}:`, err.message); }
    }

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
