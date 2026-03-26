import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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
      let query = supabase.from('watcher_rules').select('*');
      
      if (req.body?.ruleIds && Array.isArray(req.body.ruleIds)) {
        query = query.in('id', req.body.ruleIds);
      } else if (req.query?.id) {
        query = query.eq('id', req.query.id);
      }

      const { data, error } = await query.range(rangeStart, rangeStart + 999);
      if (error) throw error;
      if (data && data.length > 0) {
        rules = rules.concat(data);
        if (data.length < 1000 || req.body?.ruleIds || req.query?.id) hasMore = false;
        else rangeStart += 1000;
      } else {
        hasMore = false;
      }
    }

    const adminToken = await getShopifyToken();
    let updated = [], attention = [], inSync = [];
    let stockChanges = [], oosReminders = [];
    
    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (AppleChromebook; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    for (const rule of rules) {
      try {
        const itemTags = Array.isArray(rule.tags) ? rule.tags : [];
        if (itemTags.includes('watcher-ignore')) continue;
        if (!rule.vendor_url) continue;

        const url = `${rule.vendor_url}.js`;
        const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        let vResponse;
        try {
          vResponse = await fetch(url, { headers: { 'User-Agent': randomUA } });
          if (!vResponse.ok) throw new Error(`Fetch failed (${vResponse.status})`);
        } catch (fetchErr) {
          const errLog = `Fetch failed for ${url}: ${fetchErr.message}`;
          console.error(`[SYNC ERROR] ${errLog}`);
          await supabase.from('watcher_rules').update({
              last_log: errLog,
              last_run_at: new Date().toISOString()
          }).eq('id', rule.id);
          continue;
        }

        const textObj = await vResponse.text();
        let vData;
        try {
          vData = JSON.parse(textObj);
        } catch(e) {
          const errLog = `JSON Parse failed: ${url}`;
          console.error(`[SYNC ERROR] ${errLog}`);
          await supabase.from('watcher_rules').update({
              last_log: errLog,
              last_run_at: new Date().toISOString()
          }).eq('id', rule.id);
          continue;
        }

        let parsedOptions = rule.option_values || {};
        if (typeof parsedOptions === 'string') {
          try { parsedOptions = JSON.parse(parsedOptions); } catch (e) {}
        }
        const normalize = (t) => String(t || "").toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

        // 1. DYNAMIC MATCHING ENGINE
        let winner = null;
        let vStatus = 'No specific match logic applied';
        const ruleTitle = normalize(rule.title);
        const isHub = ruleTitle.includes('hub');
        const isRim = ruleTitle.includes('rim');
        const isE13Wheelset = rule.vendor_name === 'e*thirteen' && ruleTitle.includes('wheels');

        if (isE13Wheelset) {
            const FRONT_WHEEL_URL_MAP = {
              'https://www.ethirteen.com/products/grappler-sidekick-flux-carbon-downhill-wheels': 'https://www.ethirteen.com/products/grappler-sidekick-flux-carbon-downhill-wheels-front',
              'https://www.ethirteen.com/products/grappler-sidekick-flux-carbon-enduro-wheels': 'https://www.ethirteen.com/products/grappler-sidekick-flux-carbon-enduro-wheels-front',
              'https://www.ethirteen.com/products/sylvan-sidekick-race-alloy-all-mountain-wheels': 'https://www.ethirteen.com/products/sylvan-sidekick-race-aluminum-all-mountain-wheels-front',
              'https://www.ethirteen.com/products/sylvan-sidekick-race-carbon-all-mountain-wheels': 'https://www.ethirteen.com/products/sylvan-sidekick-race-carbon-all-mountain-wheels-front',
            };

            let rearSizeValue = null, frontWheelValue = null, driverValue = null;
            for (const [optName, optValue] of Object.entries(parsedOptions)) {
                if (!optValue) continue;
                if (optName.toLowerCase().includes('rear')) rearSizeValue = optValue.toLowerCase().replace(/["']/g, '').trim();
                if (optName.toLowerCase().includes('front') || optValue.toLowerCase().includes('front')) frontWheelValue = optValue.toLowerCase().replace(/["']/g, '').trim();
                if (optName.toLowerCase().includes('driver') || optName.toLowerCase().includes('axle') || optName.toLowerCase().includes('freehub') || optName.toLowerCase().includes('cassette')) driverValue = optValue.toLowerCase().replace(/["']/g, '').trim();
            }

            if (rearSizeValue) {
                const sizeMatch = rearSizeValue.match(/(27\.5|29)/);
                const axleMatch = rearSizeValue.match(/(148|157)/);
                const isSuperboost = rearSizeValue.includes('superboost') || rearSizeValue.includes('157');

                const rearCandidates = vData.variants.filter(v => {
                    const vt = normalize(v.public_title).replace(/["']/g, '');
                    if (!vt.includes('rear')) return false;
                    if (sizeMatch && !vt.includes(sizeMatch[1])) return false;
                    if (axleMatch && !vt.includes(axleMatch[1])) return false;
                    if (isSuperboost && !vt.includes('superboost') && !vt.includes('157')) return false;
                    if (!isSuperboost && (vt.includes('superboost') || vt.includes('157'))) return false;
                    return true;
                });

                if (rearCandidates.length > 0) {
                    const bestRear = rearCandidates.reduce((a, b) => (a.price > b.price ? a : b));
                    let finalPrice = bestRear.price;
                    let finalAvail = bestRear.available;

                    const hasFront = frontWheelValue && frontWheelValue !== 'no front wheel' && frontWheelValue !== 'none';
                    if (hasFront) {
                        let frontUrl = FRONT_WHEEL_URL_MAP[rule.vendor_url?.replace(/\/$/, '')];
                        if (!frontUrl && rule.vendor_url) frontUrl = rule.vendor_url.replace(/\/$/, '') + '-front';
                        if (frontUrl) {
                            try {
                                const frontResp = await fetch(frontUrl + '.js', { headers: { 'User-Agent': randomUA } });
                                const frontData = await frontResp.json();
                                if (frontData?.variants?.length > 0) {
                                    const bestFront = frontData.variants.reduce((a, b) => (a.price > b.price ? a : b));
                                    finalPrice += bestFront.price;
                                    finalAvail = finalAvail && bestFront.available;
                                }
                            } catch (fe) { console.error(`Front wheel fetch failed for ${frontUrl}: ${fe.message}`); }
                        }
                    }

                    if (driverValue) {
                        let driverSurcharge = 17995; 
                        if (driverValue.includes('7p') || driverValue.includes('7sp') || driverValue.includes('cassette')) {
                            driverSurcharge = 42995; 
                        }
                        finalPrice += driverSurcharge;
                    }

                    winner = { 
                      price: finalPrice, 
                      available: finalAvail, 
                      public_title: `${bestRear.public_title} + ${hasFront ? 'Front' : 'No Front'} + Driver Surcharge`
                    };
                }
            }
        } else {
          let candidates = vData.variants.filter(v => {
            const vTitle = normalize(v.public_title);
            if (rule.vendor_name === 'Berd') {
              let reqTokens = [];
              let isI9Hub = false;
              for (const [optName, optValue] of Object.entries(parsedOptions)) {
                  if (optName.toLowerCase().includes('hub') && optValue && optValue.toLowerCase().includes('i9')) { isI9Hub = true; break; }
              }
              if (isI9Hub) return vTitle.includes('industry nine');
              for (const [optName, optValue] of Object.entries(parsedOptions)) {
                 if (!optValue || optValue.toLowerCase() === 'default title') continue;
                 if (isHub && optName.toLowerCase().includes('color')) continue;
                 if (isHub && optName.toLowerCase().includes('spoke')) continue;
                 let tokens = optValue.toLowerCase().replace(/×/g, 'x').replace(/[\"\']/g, '').split(/[\s/+\-]+/).filter(t => t.length > 0);
                 reqTokens.push(...tokens);
              }
              const normalizedTitleForTokens = vTitle.replace(/[\"\']/g, '');
              for (let token of reqTokens) { if (!normalizedTitleForTokens.includes(token)) return false; }
              if (isHub) {
                  const isFrontRule = ruleTitle.includes('front');
                  if (isFrontRule && !vTitle.includes('front')) return false;
                  if (!isFrontRule && !(vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms'))) return false;
                  const axleMatch = ['100', '110', '142', '148', '157'].find(size => ruleTitle.includes(size));
                  if (axleMatch && !vTitle.includes(axleMatch)) return false;
                  let hasSpokeOption = false, spokeMatch = false;
                  for (const [optName, optValue] of Object.entries(parsedOptions)) {
                      if (optName.toLowerCase().includes('spoke')) {
                          hasSpokeOption = true;
                          const numOnly = optValue.toString().replace(/\D/g, '');
                          if (numOnly && (vTitle.includes(`${numOnly} spoke`) || vTitle.includes(`${numOnly}h`) || vTitle.includes(`${numOnly} hole`))) spokeMatch = true;
                      }
                  }
                  if (hasSpokeOption && !spokeMatch) return false;
              }
              return true;
            } else if (rule.vendor_name === 'e*thirteen') {
               if (isRim) {
                  let expectedSize = parsedOptions["Size"] ? parsedOptions["Size"].toLowerCase() : null;
                  if (expectedSize) {
                      if (expectedSize.includes('700c') && !vTitle.includes('700c')) expectedSize = '29';
                      const cleanExpected = expectedSize.replace(/["'\\\\ ]/g, '');
                      const cleanVTitle = vTitle.replace(/["' ]/g, '');
                      const sizeString = cleanExpected.replace(/[^\d.c]/g, ''); 
                      if (!cleanVTitle.includes(sizeString)) return false;
                  }
                  const spokeCount = parsedOptions["Spoke Count"] ? parsedOptions["Spoke Count"].toLowerCase() : null;
                  if (spokeCount && !vTitle.includes(spokeCount)) return false;
                  const ruleTokens = ruleTitle.split(' ');
                  const vTokens = vTitle.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
                  if (ruleTokens.includes('dh') && !vTokens.includes('dh') && (vTokens.includes('en') || vTokens.includes('gr'))) return false;
                  if (ruleTokens.includes('en') && !vTokens.includes('en') && (vTokens.includes('dh') || vTokens.includes('gr'))) return false;
                  if (ruleTokens.includes('gr') && !vTokens.includes('gr') && (vTokens.includes('dh') || vTokens.includes('en'))) return false;
               }
               if (isHub) {
                  const isFrontRule = ruleTitle.includes('front');
                  if (isFrontRule && !vTitle.includes('front') && !vTitle.includes('15x') && !vTitle.includes('15mm') && !vTitle.includes('110x')) return false;
                  if (!isFrontRule && !vTitle.includes('rear') && !vTitle.includes('148') && !vTitle.includes('157')) return false;
                  let expectedHoles = null;
                  if (parsedOptions["Spoke Count"]) expectedHoles = parsedOptions["Spoke Count"].toString().replace(/\D/g, '');
                  if (expectedHoles && !vTitle.includes(`${expectedHoles} hole`) && !vTitle.includes(`${expectedHoles}h`) && !vTitle.includes(`${expectedHoles} h`)) return false;
                  if (ruleTitle.includes('superboost') && !vTitle.includes('157')) return false;
                  if (!ruleTitle.includes('superboost') && ruleTitle.includes('rear') && !vTitle.includes('148')) return false;
                  if (ruleTitle.includes('sidekick sl')) {
                     if (!vTitle.includes('110x15mm')) return false;
                  } else if (ruleTitle.includes('sidekick') && !ruleTitle.includes('sl') && isHub && isFrontRule) {
                     if (vTitle.includes('110x15mm') && !vTitle.includes('15/20')) return false;
                  }
                  if (!ruleTitle.includes('7spd') && !ruleTitle.includes('7 spd') && (vTitle.includes('7spd') || vTitle.includes('7 spd'))) return false;
                  if (!ruleTitle.includes('mini') && vTitle.includes('mini')) return false;
               }
               return true;
            }
            return true;
          });

          if (candidates.length > 0) {
            winner = candidates.reduce((prev, curr) => (prev.price > curr.price) ? prev : curr);
            if (!winner || winner.price === 0) {
               const ruleTokens = Object.values(parsedOptions).flatMap(v => String(v).toLowerCase().split(/[\s/]+/).filter(t => t.length > 1));
               const bestMatch = candidates.map(c => {
                  const score = ruleTokens.filter(t => c.public_title.toLowerCase().includes(t)).length;
                  return { variant: c, score };
               }).sort((a, b) => b.score - a.score)[0];
               if (bestMatch && bestMatch.score > 0) {
                  winner = bestMatch.variant;
                  vStatus = `Matched by tokens (${ruleTokens.join(', ')}).`;
               }
            }
          }
        }

        console.log(`[RULE: ${rule.id}] Processing "${rule.title}" | Winner: "${winner?.public_title || 'None'}" | Status: ${vStatus}`);
        if (winner) {
          const variantGid = `gid://shopify/ProductVariant/${rule.shopify_variant_id}`;
          const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
            method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query($id: ID!) { productVariant(id: $id) { price compareAtPrice inventoryQuantity inventoryPolicy product { id handle } btiMonitor: metafield(namespace: "custom", key: "inventory_monitoring_enabled") { value } } }`,
              variables: { id: variantGid }
            })
          });
          const sData = await sResponse.json();
          const variant = sData.data?.productVariant;
          if (!variant) throw new Error(`Shopify ID ${rule.shopify_variant_id} not found`);

          const currentBtiFlag = variant.btiMonitor ? (variant.btiMonitor.value === 'true') : null;
          const productHandle = variant.product?.handle || '';
          const vendorPrice = winner.price / 100;
          const stdFactor = rule.price_adjustment_factor || 1.0;
          let goalPriceNum = vendorPrice * stdFactor;
          let isDeepSale = false;

          if (rule.original_msrp && rule.original_msrp > 0) {
            const discountRatio = (rule.original_msrp - vendorPrice) / rule.original_msrp;
            if (discountRatio >= 0.10) { goalPriceNum = vendorPrice / 0.90; isDeepSale = true; }
          }
          const goalPrice = parseFloat(goalPriceNum).toFixed(2);
          const myPrice = parseFloat(variant.price).toFixed(2);
          const myCompare = variant.compareAtPrice ? parseFloat(variant.compareAtPrice).toFixed(2) : null;
          const isDiff = Number(goalPrice) !== Number(myPrice);
          const needsPriceUpdate = isDiff || (myCompare && Number(myCompare) < Number(goalPrice));

          let newPriceLastChangedAt = rule.price_last_changed_at || null;
          if (rule.last_price !== winner.price) {
            newPriceLastChangedAt = new Date().toISOString();
            if (isDeepSale) attention.push({ title: rule.title, reason: `Drastic Sale Detected: Vendor Price dropped to $${vendorPrice.toFixed(2)}!` });
          } else if (newPriceLastChangedAt && isDeepSale) {
            const daysPersistent = (new Date() - new Date(newPriceLastChangedAt)) / (1000 * 60 * 60 * 24);
            if (Math.floor(daysPersistent) === 45) attention.push({ title: rule.title, reason: `Sale Price persistent for 45 days: Confirm as New MSRP?` });
          }

          let finalShopifyPriceNum = Number(myPrice);
          let updatePayloadForPrice = { id: rule.shopify_variant_id };
          let shouldPutPrice = false;

          if (needsPriceUpdate && rule.auto_update === true && !rule.needs_review) {
             updatePayloadForPrice.price = goalPrice;
             if (myCompare && Number(myCompare) > Number(myPrice)) {
                const gap = Number(myCompare) - Number(myPrice);
                updatePayloadForPrice.compare_at_price = (Number(goalPrice) + gap).toFixed(2);
             } else { updatePayloadForPrice.compare_at_price = goalPrice; }
             shouldPutPrice = true;
             finalShopifyPriceNum = Number(goalPrice);
          }

          let currentEffectiveBtiFlag = currentBtiFlag;
          if (rule.auto_update === true && !rule.needs_review) {
             if (winner.available && currentBtiFlag === true) {
                console.log(`[SYNC] Vendor BACK-IN-STOCK for ${rule.title}. Reclaiming INVENTORY authority from BTI.`);
                updatePayloadForPrice.metafields = [{ namespace: "custom", key: "inventory_monitoring_enabled", value: "false", type: "boolean" }];
                shouldPutPrice = true;
                currentEffectiveBtiFlag = false;
             } else if (!winner.available && (rule.bti_monitoring_enabled === true || rule.bti_monitoring_enabled === 'true') && currentBtiFlag !== true) {
                console.log(`[SYNC] Vendor OOS for ${rule.title}. Deferring INVENTORY to BTI.`);
                updatePayloadForPrice.metafields = [{ namespace: "custom", key: "inventory_monitoring_enabled", value: "true", type: "boolean" }];
                shouldPutPrice = true;
                currentEffectiveBtiFlag = true;
             }
          }

          if (shouldPutPrice) {
             await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: updatePayloadForPrice })
             }).catch(e => console.error(e));
             if (needsPriceUpdate && rule.auto_update === true && !rule.needs_review) updated.push({ title: rule.title, reason: `Price Adjusted ($${myPrice} -> $${goalPrice})` });
          }

          let effectivePolicy = variant.inventoryPolicy;
          if (rule.auto_update === true && currentEffectiveBtiFlag !== true) {
            const shopifyQty = variant.inventoryQuantity || 0;
            const vendorInStock = winner.available;
            if (shopifyQty <= 0) {
              if (!vendorInStock && effectivePolicy === 'CONTINUE') {
                await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                  method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ variant: { id: rule.shopify_variant_id, inventory_policy: 'deny' } })
                });
                stockChanges.push({ title: rule.title, action: '🔴 Made Unavailable (Vendor OOS)' });
                effectivePolicy = 'DENY';
              } else if (vendorInStock && effectivePolicy === 'DENY') {
                await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                  method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ variant: { id: rule.shopify_variant_id, inventory_policy: 'continue' } })
                });
                stockChanges.push({ title: rule.title, action: '🟢 Back In Stock (Vendor Available)' });
                effectivePolicy = 'CONTINUE';
              }
            }
          }

          let newOutOfStockSince = rule.out_of_stock_since || null;
          if (effectivePolicy === 'DENY') {
            if (!newOutOfStockSince) newOutOfStockSince = new Date().toISOString();
            else {
              const daysOOS = (new Date() - new Date(newOutOfStockSince)) / (1000 * 60 * 60 * 24);
              if (Math.floor(daysOOS) === 90) attention.push({ title: rule.title, reason: `Out of Stock for 3 Months. Discontinued?` });
            }
          } else newOutOfStockSince = null;

          if (rule.oos_reminder_enabled !== false && newOutOfStockSince) {
            const daysSinceOOS = Math.floor((new Date() - new Date(newOutOfStockSince)) / (1000 * 60 * 60 * 24));
            const reminderInterval = rule.oos_reminder_days || 20;
            if (daysSinceOOS > 0 && daysSinceOOS % reminderInterval === 0) oosReminders.push({ title: rule.title, days: daysSinceOOS });
          }

          let newLog = `Synced (${winner.available ? 'In Stock' : 'OOS'}). Link: https://loamlabs.com/products/${productHandle}`;
          if (!winner.available && currentEffectiveBtiFlag === true) newLog = `Vendor OOS (Matched: "${winner.public_title}"). Deferring INVENTORY to BTI. Link: https://loamlabs.com/products/${productHandle}`;

          await supabase.from('watcher_rules').update({ 
            last_price: Math.round(vendorPrice * 100), 
            last_availability: winner.available,
            last_run_at: new Date().toISOString(),
            last_log: newLog,
            price_last_changed_at: newPriceLastChangedAt,
            out_of_stock_since: newOutOfStockSince,
            current_shopify_price: Math.round(finalShopifyPriceNum * 100),
            current_compare_at_price: updatePayloadForPrice.compare_at_price ? Math.round(Number(updatePayloadForPrice.compare_at_price) * 100) : (myCompare ? Math.round(Number(myCompare) * 100) : null),
            bti_inventory_active: !!currentEffectiveBtiFlag
          }).eq('id', rule.id);

        } else {
           const vendorOptions = vData.variants.slice(0, 2).map(v => v.public_title).join(', ');
           await supabase.from('watcher_rules').update({ 
             last_log: `FAILED: Found 0 matches for parsed options. Vendor uses: ${vendorOptions}`,
             last_run_at: new Date().toISOString()
           }).eq('id', rule.id);
        }
      } catch (ruleError) {
        console.error(`FAILURE on rule ${rule.id} (${rule.title}):`, ruleError);
        attention.push({ title: rule.title, reason: `Sync Failed: ${ruleError.message}` });
        await supabase.from('watcher_rules').update({ 
            last_log: `CRASHED: ${ruleError.message.slice(0, 100)}`,
            last_run_at: new Date().toISOString()
        }).eq('id', rule.id).catch(() => {});
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('sync_logs').delete().lt('created_at', thirtyDaysAgo);

    const hasReport = updated.length > 0 || attention.length > 0 || stockChanges.length > 0 || oosReminders.length > 0;
    if (hasReport) {
      const updatedHtml = updated.map(i => `<li style="color:green;">🚀 <b>UPDATED:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red;">⚠️ <b>ALERT:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      let stockHtml = stockChanges.length > 0 ? `<h3 style="margin-top:20px;">📦 Stock Status Changes (${stockChanges.length})</h3><ul>` + stockChanges.map(s => `<li>${s.action}: <b>${s.title}</b></li>`).join('') + '</ul>' : '';
      let oosHtml = oosReminders.length > 0 ? `<h3 style="margin-top:20px;">⏰ Items Still Out of Stock</h3><ul>` + oosReminders.map(r => `<li><b>${r.title}</b> — out of stock for <b>${r.days} days</b></li>`).join('') + '</ul>' : '';
      const totalAlerts = updated.length + attention.length + stockChanges.length;
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher: ${totalAlerts} Updates${oosReminders.length > 0 ? ` + ${oosReminders.length} OOS Reminders` : ''}`,
        html: `<div style="font-family:sans-serif;"><h2>Shop Sync Report</h2><ul>${updatedHtml}${attentionHtml}</ul>${stockHtml}${oosHtml}</div>`
      });
    }

    const logStatus = hasReport ? 'success' : 'no_changes';
    const logMessage = hasReport ? `Sync completed with ${updated.length} price updates and ${stockChanges.length} stock status changes.` : 'Sync completed. No changes detected.';
    await supabase.from('sync_logs').insert([{ status: logStatus, updated_count: updated.length, attention_count: attention.length, stock_changes_count: stockChanges.length, oos_reminders_count: oosReminders.length, message: logMessage }]);

    res.status(200).json({ updated: updated.length, attention: attention.length, stock_changes: stockChanges.length });
  } catch (err) { 
    await supabase.from('sync_logs').insert([{ status: 'error', message: `CRITICAL ERROR: ${err.message}` }]);
    res.status(500).json({ error: err.message }); 
  }
}
