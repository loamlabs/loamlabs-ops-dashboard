import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import fs from 'fs';
import { mergeBtiNumber } from '../../lib/bti-number';
import { isLiveVariant, breakerTripped } from '../../lib/breaker';
import { groupOosReminders } from '../../lib/oos-summary';
import { SURCHARGE_URL, findSurchargeCents } from '../../lib/ethirteen-surcharge';
import { pickRearVariant } from '../../lib/ethirteen-wheel';
import { familyConflict } from '../../lib/ethirteen-rim';
import { valveMatches } from '../../lib/ethirteen-valve';
import { decideOwner, isOneOwnerVendor } from '../../lib/ownership';
import { decideReviewFlag } from '../../lib/review-flag';
import { createFailureTracker } from '../../lib/vendor-page-failures';
import { guardAfterWatcher } from '../../lib/guard-trigger';
import { fetchVendorText, isPoliteRule, gapMs } from '../../lib/watcher-fetch';
import { matchColourHoles, readProject321 } from '../../lib/watcher-project321';
import { isPhilWood, matchPhilWood } from '../../lib/watcher-philwood';
import { createFlipLimiter, isStockOnly, priceDecision, priceLines, PRICE_CAP, needsSecondRun, closeNeedsApproval, flipCapFor, confirmedTwice, timeBudgetExceeded, urlBreakerTripped, groupLines, productOfTitle, hasTag } from '../../lib/watcher-safety';
import { withoutSkippedLengths } from '../../lib/spoke-length-skip';
import { spacingOf, driverStates, planFreehubList } from '../../lib/freehub-follow';
import { stampSince, parseSince, classify, createLinkReport, redirectedAway } from '../../lib/broken-links';

export const maxDuration = 300; // Allow Vercel to run up to 5 minutes

// Initialize Supabase only if credentials exist
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Helper to check supabase
const checkSupabase = (res) => {
  if (!supabase) {
    res.status(500).json({ 
      error: 'Supabase configuration is missing. Please check the server environment variables.',
      details: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is undefined.'
    });
    return false;
  }
  return true;
};

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

// Writes variant metafields with GraphQL variables (no string building). Returns { ok, errors }.
async function setVariantMetafields(adminToken, variantId, entries) {
  try {
    const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`,
        variables: { m: entries.map(e => ({ ownerId: `gid://shopify/ProductVariant/${variantId}`, namespace: 'custom', key: e.key, type: e.type, value: e.value })) }
      })
    });
    const data = await response.json();
    const errors = [...(data.errors || []).map(e => e.message), ...(data.data?.metafieldsSet?.userErrors || []).map(e => e.message)];
    return { ok: errors.length === 0 && !!data.data, errors };
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
}

// tag 'freehub-follow' (lib/freehub-follow.js): read the hub product's freehub list and our last observation, write them back
async function readHubFreehub(adminToken, productId) {
  const r = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
    method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query($id: ID!) { product(id: $id) { title list: metafield(namespace: "custom", key: "freehub") { value } watch: metafield(namespace: "custom", key: "freehub_watch") { value } } }`, variables: { id: `gid://shopify/Product/${productId}` } })
  });
  const d = await r.json();
  const p = d.data && d.data.product; if (!p) return null;
  let list = null, watch = null;
  try { list = p.list ? JSON.parse(p.list.value) : null; } catch (e) { list = null; }
  try { watch = p.watch ? JSON.parse(p.watch.value) : null; } catch (e) { watch = null; }
  return { title: p.title, list, watch };
}
async function writeHubMetafields(adminToken, productId, entries) {
  try {
    const r = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`, variables: { m: entries.map((e) => ({ ownerId: `gid://shopify/Product/${productId}`, namespace: 'custom', key: e.key, type: e.type, value: e.value })) } })
    });
    const d = await r.json();
    return !(d.errors && d.errors.length) && !((d.data && d.data.metafieldsSet && d.data.metafieldsSet.userErrors) || []).length;
  } catch (e) { return false; }
}

let shopifyProductVariantsCache = {};

async function getShopifyVariant(adminToken, productId, variantId) {
  const cacheKey = String(productId);
  if (!shopifyProductVariantsCache[cacheKey]) {
    shopifyProductVariantsCache[cacheKey] = {};
    let hasNext = true;
    let cursor = null;
    const productGid = `gid://shopify/Product/${productId}`;

    while (hasNext) {
      const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: ID!, $after: String) {
            product(id: $id) {
              variants(first: 250, after: $after) {
                pageInfo { hasNextPage }
                edges {
                  cursor
                  node {
                    id
                    price
                    compareAtPrice
                    inventoryQuantity
                    inventoryPolicy
                    product { id handle status }
                    btiMonitor: metafield(namespace: "custom", key: "bti_sync_authority") { value }
                    btiNumber: metafield(namespace: "custom", key: "bti_part_number") { value }
                  }
                }
              }
            }
          }`,
          variables: { id: productGid, after: cursor }
        })
      });
      const data = await response.json();
      if (data.errors) {
        console.error(`[API] fetchAllVariants returned errors for ${productId}:`, JSON.stringify(data.errors));
        break;
      }
      const connection = data.data?.product?.variants;
      if (connection && connection.edges) {
        connection.edges.forEach(edge => {
          const rawId = edge.node.id.split('/').pop();
          shopifyProductVariantsCache[cacheKey][rawId] = edge.node;
        });
        hasNext = connection.pageInfo?.hasNextPage;
        cursor = connection.edges[connection.edges.length - 1]?.cursor;
      } else {
        hasNext = false;
      }
    }
  }
  return shopifyProductVariantsCache[cacheKey][String(variantId)] || null;
}
  
async function runAutoDiscovery(adminToken, supabase, initialRules) {
  const productMap = {};
  for (const rule of initialRules) {
    if (!rule.vendor_url) continue; // Skip BTI Sync products and anything without a Vendor URL
    if (!productMap[rule.shopify_product_id]) {
      productMap[rule.shopify_product_id] = { vendor_url: rule.vendor_url, rules: [] };
    }
    productMap[rule.shopify_product_id].rules.push(rule);
  }

  let totalAdded = 0;
  let totalDeleted = 0;

  for (const [productId, data] of Object.entries(productMap)) {
    console.log(`[AUTO-DISCOVERY] Checking Shopify Product ${productId}...`);
    let hasNextPage = true;
    let cursor = null;
    const shopifyVariants = new Map();
    let productTitle, productVendor, productTags;

    while (hasNextPage) {
      const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: ID!, $cursor: String) {
            product(id: $id) {
              title vendor tags
              variants(first: 250, after: $cursor) {
                pageInfo { hasNextPage }
                edges {
                  cursor
                  node {
                    id title sku
                    selectedOptions { name value }
                    metafields(first: 10, namespace: "custom") { edges { node { key value } } }
                  }
                }
              }
            }
          }`,
          variables: { id: `gid://shopify/Product/${productId}`, cursor: cursor }
        })
      });
      const resData = await response.json();
      const product = resData.data?.product;
      if (!product) break;

      productTitle = product.title;
      productVendor = product.vendor;
      productTags = product.tags;

      for (const edge of product.variants.edges) {
        const v = edge.node;
        const vId = v.id.split('/').pop();
        shopifyVariants.set(vId, v);
      }
      hasNextPage = product.variants.pageInfo.hasNextPage;
      if (hasNextPage) cursor = product.variants.edges[product.variants.edges.length - 1].cursor;
    }

    if (shopifyVariants.size === 0) continue;

    const existingVariantIds = data.rules.map(r => String(r.shopify_variant_id));
    const toDelete = existingVariantIds.filter(id => !shopifyVariants.has(id));
    if (toDelete.length > 0) {
      console.log(`[AUTO-DISCOVERY] Deleting ${toDelete.length} orphaned rules for product ${productId}.`);
      await supabase.from('watcher_rules').delete().in('shopify_variant_id', toDelete);
      totalDeleted += toDelete.length;
    }

    const newVariants = [];
    for (const [vId, v] of shopifyVariants.entries()) {
      if (!existingVariantIds.includes(vId)) {
        const mappedOptions = {};
        let packSize = 1;
        v.selectedOptions.forEach(opt => { 
          mappedOptions[opt.name] = opt.value; 
          if (opt.name === 'Pack Size') packSize = parseInt(opt.value, 10) || 1;
        });
        mappedOptions.__order = v.selectedOptions.map(o => o.name);
        
        // Inherit custom mappings (like Type or Secure Lock) from existing rules
        if (data.rules.length > 0) {
            const templateOpts = data.rules[0].option_values || {};
            if (templateOpts['Type']) mappedOptions['Type'] = templateOpts['Type'];
            if (templateOpts['Secure Lock v Non-Secure Lock']) mappedOptions['Secure Lock v Non-Secure Lock'] = templateOpts['Secure Lock v Non-Secure Lock'];
        }
        
        const spokeOptNames = Object.keys(mappedOptions).filter(k => k.toLowerCase().includes('spoke') && k !== 'pack size');
        if (spokeOptNames.length > 0) {
           let val = mappedOptions[spokeOptNames[0]];
           if (!val.toLowerCase().includes('spokes')) {
              mappedOptions[spokeOptNames[0]] = val + ' Spokes';
           }
        }
        
        const mFields = {};
        v.metafields.edges.forEach(e => { mFields[e.node.key] = e.node.value; });

        newVariants.push({
          shopify_product_id: productId,
          shopify_variant_id: vId,
          title: `${productTitle} (${v.title})`.replace(/×/g, 'x').trim(),
          vendor_name: productVendor,
          site_type: 'SHOPIFY',
          option_values: mappedOptions,
          vendor_url: data.vendor_url,
          tags: productTags || [],
          bti_part_number: mergeBtiNumber(mFields.bti_part_number, null),
          bti_inventory_active: mFields.bti_sync_authority === 'true',
          auto_update: true,
          price_adjustment_factor: packSize
        });
      }
    }

    if (newVariants.length > 0) {
      console.log(`[AUTO-DISCOVERY] Adding ${newVariants.length} new variants for product ${productId}.`);
      await supabase.from('watcher_rules').upsert(newVariants, { onConflict: 'shopify_variant_id' });
      totalAdded += newVariants.length;
    }
  }

  return { totalAdded, totalDeleted };
}

export default async function handler(req, res) {
  const handlerStartedAt = Date.now();
  shopifyProductVariantsCache = {};
  if (!checkSupabase(res)) return;
  const authHeader = (req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'])?.trim();
  if (authHeader !== process.env.CRON_SECRET?.trim() && authHeader !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const fetchRules = async () => {
      let _rules = [];
      if (req.body?.ruleIds && Array.isArray(req.body.ruleIds)) {
         const ruleIds = req.body.ruleIds;
         const chunkSize = 150;
         for (let i = 0; i < ruleIds.length; i += chunkSize) {
            const chunk = ruleIds.slice(i, i + chunkSize);
            const { data, error } = await supabase.from('watcher_rules').select('*').in('id', chunk);
            if (error) throw error;
            if (data) _rules = _rules.concat(data);
         }
         return _rules;
      }

      let hasMore = true;
      let rangeStart = 0;
      while (hasMore) {
        let query = supabase.from('watcher_rules').select('*');
        if (req.body?.productId || req.query?.productId) {
          query = query.eq('shopify_product_id', req.body?.productId || req.query?.productId);
        } else if (req.query?.id) {
          query = query.eq('id', req.query.id);
        }
        if (req.query?.vendor) query = query.ilike('vendor_name', String(req.query.vendor));   // one vendor only (Project321 runs as its own call: 5 s between its pages)
        const { data, error } = await query.range(rangeStart, rangeStart + 999);
        if (error) throw error;
        if (data && data.length > 0) {
          _rules = _rules.concat(data);
          if (data.length < 1000 || req.query?.id) hasMore = false;
          else rangeStart += 1000;
        } else {
          hasMore = false;
        }
      }
      return _rules;
    };

    let rules = await fetchRules();

    const adminToken = await getShopifyToken();

    // AUTO DISCOVERY PHASE
    if (rules.length > 0) {
      console.log(`[SYNC] Running Auto-Discovery phase...`);
      const autoRes = await runAutoDiscovery(adminToken, supabase, rules);
      if (autoRes.totalAdded > 0 || autoRes.totalDeleted > 0) {
        console.log(`[SYNC] Auto-Discovery complete. Added ${autoRes.totalAdded}, Deleted ${autoRes.totalDeleted}. Re-fetching rules...`);
        rules = await fetchRules();
      } else {
        console.log(`[SYNC] Auto-Discovery complete. No additions or deletions found.`);
      }
    }
    let updated = [], attention = [], inSync = [];
    let stockChanges = [], oosReminders = [];
    const ownershipLines = [];   // owner flips and number restores done by the Watcher this run (allowlisted vendors)
    const processedProducts = new Set();
    const autoCreatedVariants = [];
    // Collect IDs of rules that were processed but had NO changes, so we can
    // bulk-update their last_run_at in a single query at the end instead of
    // awaiting thousands of individual row updates.
    const unchangedRuleIds = [];
    // Circuit breaker: "vendor does not offer this variant" -> Shopify 'deny' writes are held back
    // until the end of the run, so a vendor site change (0 matches for many rules) cannot switch off a whole product line.
    const vendorStats = {};
    const pendingNoMatchDeny = [];
    // Only items LIVE in Shopify (active, sellable or in stock) count toward the stop (lib/breaker.js); items already unavailable for months do not.
    const nowIso = new Date().toISOString();
    
    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      'Mozilla/5.0 (AppleChromebook; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    const urlCache = {};
    const ethirteenCache = {};
    // safety nets (lib/watcher-safety.js): flip cap per vendor (both directions), baseline proposals, held flips, per-page breaker
    const vendorRuleCounts = {};
    rules.forEach((r) => { if (r.vendor_url) vendorRuleCounts[r.vendor_name || 'unknown'] = (vendorRuleCounts[r.vendor_name || 'unknown'] || 0) + 1; });
    const flipLimiter = createFlipLimiter((vendor) => flipCapFor(vendorRuleCounts[vendor] || 0));
    const baselineItems = [], heldOnceItems = [], autoApprovedItems = [];
    const priceLimiter = createFlipLimiter(PRICE_CAP);   // 'auto-approve-price': at most 40 price writes per vendor per run
    const autoPriceItems = [], basePriceItems = [], waitPriceItems = [];
    const freehubJobs = new Map();   // productId -> { rule, variants } for rules tagged 'freehub-follow'
    const urlStats = {};
    let stoppedForTime = 0;
    const pageFailures = createFailureTracker();   // vendor pages that could not be read, with how many rules were not checked because of it
    // broken vendor links (lib/broken-links.js): one line per broken page at the top of the email
    const linkReport = createLinkReport();
    const failedPages = {};      // url -> { what, since } for pages that could not be read this run
    const redirectedTo = {};     // url -> final url, when the vendor redirected us to another page
    const noMatchByUrl = {};     // url -> [{ rule, log }] rules that found 0 matches on a page that WAS read
    const rulesPerUrl = {};
    rules.forEach((r) => { if (r.vendor_url && !(Array.isArray(r.tags) && r.tags.includes('watcher-ignore'))) { const u = r.vendor_url.endsWith('.js') ? r.vendor_url : `${r.vendor_url}.js`; rulesPerUrl[u] = (rulesPerUrl[u] || 0) + 1; } });
    const surchargeProblems = new Map();   // e*thirteen surcharge page problems, reported once per run instead of once per wheel set

    for (const rule of rules) {
      try {
        const itemTags = Array.isArray(rule.tags) ? rule.tags : [];
        if (itemTags.includes('watcher-ignore')) continue;
        if (!rule.vendor_url) continue;
        const polite = isPoliteRule(rule);
        // polite vendors (5 s between pages) run as their own call (?vendor=Project321) or for one product / chosen rows (dashboard buttons), never in the full run, so they cannot push it past 300 s
        if (polite && !req.query?.vendor && !req.query?.productId && !req.body?.productId && !req.query?.id && !(req.body?.ruleIds && req.body.ruleIds.length)) continue;
        if (timeBudgetExceeded(handlerStartedAt)) { stoppedForTime++; continue; }   // stop cleanly at 270 s; the rest is reported

        const url = rule.vendor_url.endsWith('.js') ? rule.vendor_url : `${rule.vendor_url}.js`;
        const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        
        let vData;

        // Skip immediately if we already know this URL is dead (e.g. 404)
        if (urlCache[url] === 'FAILED') {
            pageFailures.skip(url);
            if (failedPages[url]) linkReport.add({ url, vendor: rule.vendor_name, product: productOfTitle(rule.title), what: failedPages[url].what, since: failedPages[url].since });
            continue;
        }

        if (urlCache[url]) {
          vData = urlCache[url];
        } else {
          // Wait before fetching to avoid rate limits (5 s for polite vendors)
          await new Promise(r => setTimeout(r, gapMs(polite)));
          let vResponseText;
          try {
            vResponseText = await fetchVendorText({ url, polite, randomUA, onInfo: (i) => { if (i && i.redirected && redirectedAway(url, i.finalUrl)) redirectedTo[url] = i.finalUrl; } });   // 10 s timeout; polite: honest agent, one try, no retry after 429/403
          } catch (fetchErr) {
            const errLog = stampSince(`Fetch failed for ${url}: ${fetchErr.message}${fetchErr.blocked ? ' (blocked: not retried)' : ''}`, rule.last_log, nowIso);
            console.error(`[SYNC ERROR] ${errLog}`);
            
            // Only write if the error log actually changed
            if (rule.last_log !== errLog) {
              await supabase.from('watcher_rules').update({
                  last_log: errLog,
                  last_run_at: nowIso
              }).eq('id', rule.id);
            } else {
              unchangedRuleIds.push(rule.id);
            }
            // Mark as failed in cache so we don't retry and sleep for every rule that points to this dead URL
            urlCache[url] = 'FAILED';
            pageFailures.fail(url, fetchErr.message);
            failedPages[url] = { what: classify(fetchErr.message), since: parseSince(errLog) };
            linkReport.add({ url, vendor: rule.vendor_name, product: productOfTitle(rule.title), what: failedPages[url].what, since: failedPages[url].since });
            
            // Add a long delay if rate limited so we don't completely spam them
            await new Promise(r => setTimeout(r, 2000));
            continue; // Skip processing this rule so we don't accidentally mark it Out of Stock!
          }

          const textObj = vResponseText;
          try {
            vData = JSON.parse(textObj);
            urlCache[url] = vData;
          } catch(e) {
            const errLog = stampSince(`JSON Parse failed: ${url}`, rule.last_log, nowIso);
            console.error(`[SYNC ERROR] ${errLog}`);
            
            // Only write if the error log actually changed
            if (rule.last_log !== errLog) {
              await supabase.from('watcher_rules').update({
                  last_log: errLog,
                  last_run_at: nowIso
              }).eq('id', rule.id);
            } else {
              unchangedRuleIds.push(rule.id);
            }
            // Mark as failed in cache
            urlCache[url] = 'FAILED';
            pageFailures.fail(url, 'The page did not return readable data');
            failedPages[url] = { what: classify('did not return readable data'), since: parseSince(errLog) };
            linkReport.add({ url, vendor: rule.vendor_name, product: productOfTitle(rule.title), what: failedPages[url].what, since: failedPages[url].since });
            continue; // Skip processing this rule so we don't accidentally mark it Out of Stock!
          }
        }

        if (hasTag(rule, 'freehub-follow') && vData && Array.isArray(vData.variants) && !freehubJobs.has(String(rule.shopify_product_id))) freehubJobs.set(String(rule.shopify_product_id), { rule, variants: vData.variants });

        let parsedOptions = rule.option_values || {};
        if (typeof parsedOptions === 'string') {
          try { parsedOptions = JSON.parse(parsedOptions); } catch (e) {}
        }
        parsedOptions = { ...parsedOptions };
        delete parsedOptions.__order;
          const normalize = (t) => String(t || "").replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
          // Helper to strip " Spokes" suffix for uniform matching of spoke counts
          function normalizeSpokeCount(val) {
            return String(val || "").replace(/\s*Spokes$/i, "").trim();
          }

        // SPOKE DYNAMIC SYNC AUTO-DETECTION & CREATION (PART 2)
        const isSpokeProduct = rule.tags?.includes('spokes') || ['10180231921971', '10182494191923'].includes(String(rule.shopify_product_id));
        if (isSpokeProduct && !processedProducts.has(String(rule.shopify_product_id))) {
          const prodIdStr = String(rule.shopify_product_id);
          processedProducts.add(prodIdStr);
          console.log(`[SYNC SPOKES] Checking for new option values on product: ${rule.title} (ID: ${prodIdStr})`);

          try {
            // 1. Fetch current options from Shopify Product via GraphQL
            const shopifyProdResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: `query($id: ID!) {
                  product(id: $id) {
                    id
                    title
                    options {
                      id
                      name
                      values
                    }
                  }
                }`,
                variables: { id: `gid://shopify/Product/${prodIdStr}` }
              })
            });
            const shopifyProdData = await shopifyProdResponse.json();
            
            if (shopifyProdData.errors) {
              console.error(`[SYNC SPOKES] GraphQL error fetching options for ${prodIdStr}:`, JSON.stringify(shopifyProdData.errors));
            } else {
              const shopifyProduct = shopifyProdData.data?.product;
              if (shopifyProduct) {
                const lengthOption = shopifyProduct.options.find(opt => opt.name.toLowerCase() === 'length');
                const colorOption = shopifyProduct.options.find(opt => opt.name.toLowerCase() === 'color');
                const countOption = shopifyProduct.options.find(opt => opt.name.toLowerCase() === 'spoke count');
                
                const existingLengths = lengthOption ? lengthOption.values : [];
                const existingColors = colorOption ? colorOption.values : ['Black'];
                const existingCounts = countOption ? countOption.values : ['14 Spokes', '18 Spokes', '20 Spokes', '26 Spokes', '30 Spokes', '34 Spokes', '38 Spokes'];

                // 2. Extract Velonix option values (lengths)
                const velonixLengths = vData.options?.find(opt => opt.name.toLowerCase() === 'length')?.values || [];
                
                // Compare and filter missing lengths
                const missingLengths = withoutSkippedLengths(prodIdStr, velonixLengths.filter(vl => !existingLengths.includes(vl)));   // lengths Jerry decided to ignore (lib/spoke-length-skip.js) are not reported
                
                // Apply strict safety bounds: numbers between 130 and 320
                const validMissingLengths = missingLengths.filter(vl => {
                  const numOnly = parseInt(vl.replace(/\D/g, ''));
                  return !isNaN(numOnly) && numOnly >= 130 && numOnly <= 320;
                });

                if (validMissingLengths.length > 0) {
                  console.log(`[SYNC SPOKES] Found ${validMissingLengths.length} missing valid lengths on Velonix: ${validMissingLengths.join(', ')}`);
                  
                  // Show the FULL list since the user needs to manually add them
                  const fullList = validMissingLengths.join(', ');
                  attention.push({
                    title: rule.title.split('(')[0].trim(),
                    reason: `Vendor added ${validMissingLengths.length} new lengths not currently on your store: ${fullList}.`
                  });
                  
                  console.log(`[SYNC SPOKES] Added missing lengths warning to email report. Skipping auto-creation.`);
                } else {
                  console.log(`[SYNC SPOKES] No new options detected for product ${prodIdStr}.`);
                }
              }
            }
          } catch (spokeErr) {
            console.error(`[SYNC SPOKES] CRITICAL ERROR during spoke auto-detection:`, spokeErr);
          }
        }

        // 1. DYNAMIC MATCHING ENGINE
        let winner = null;
        let p321Read = null;
        const isP321 = String(rule.vendor_name || '').trim().toLowerCase() === 'project321';
        const isPW = isPhilWood(rule.vendor_name);   // Phil Wood hubs: hole count + color, Standard bearing (lib/watcher-philwood.js)
        let vStatus = 'No specific match logic applied';
        const ruleTitle = normalize(rule.title);
        const ruleTitleLower = ruleTitle.toLowerCase();
        const isHub = ruleTitleLower.includes('hub');
        const isRim = ruleTitleLower.includes('rim');
        const isE13Wheelset = rule.vendor_name === 'e*thirteen' && ruleTitleLower.includes('wheels');

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
                const ov = optValue.toLowerCase();
                if (optName.toLowerCase().includes('rear')) rearSizeValue = ov.replace(/["']/g, '').trim();
                if (optName.toLowerCase().includes('front') || ov.includes('front')) frontWheelValue = ov.replace(/["']/g, '').trim();
                if (
                    optName.toLowerCase().includes('driver') || 
                    optName.toLowerCase().includes('axle') || 
                    optName.toLowerCase().includes('freehub') || 
                    optName.toLowerCase().includes('cassette') ||
                    ov === 'ms' || ov === 'xd' || ov === 'hg' || ov === 'mini hg' || ov.includes('7 spd') || ov.includes('mini-hg')
                ) {
                    driverValue = ov.replace(/["']/g, '').trim();
                }
            }

            if (true) {
                const sizeMatch = rearSizeValue ? rearSizeValue.match(/(27\.5|29)/) : null;
                const axleMatch = rearSizeValue ? rearSizeValue.match(/(148|157)/) : null;
                const isSuperboost = rearSizeValue ? (rearSizeValue.includes('superboost') || rearSizeValue.includes('157')) : false;

                const isRearNone = !rearSizeValue || rearSizeValue === 'none' || rearSizeValue === 'no rear wheel' || rearSizeValue.includes('no rear');
                
                let finalPrice = 0;
                let finalAvail = true;
                let usedRear = null;
                let kitIncludedInRear = false;   // complete-wheel listing: the freehub is already in the rear wheel price

                if (!isRearNone) {
                  // Rear wheel: see lib/ethirteen-wheel.js. The current e*thirteen listing is a COMPLETE wheel (freehub already in the price),
                  // so exactly the rule's freehub variant is taken and no separate kit price is added. If the rear wheel cannot be found
                  // the rule is skipped; it is never priced as $0.
                  const rear = pickRearVariant(vData.variants, { size: sizeMatch ? sizeMatch[1] : null, axle: axleMatch ? axleMatch[1] : null, superboost: isSuperboost, driver: driverValue });
                  if (!rear.ok) {
                      const rearErr = new Error(`Wheel price not read: ${rear.reason}`);
                      rearErr.surchargeProblem = true;
                      throw rearErr;
                  }
                  usedRear = rear.variant;
                  kitIncludedInRear = rear.kitIncluded;
                  finalPrice += rear.price;
                  finalAvail = finalAvail && usedRear.available;
                }

                    const hasFront = frontWheelValue && frontWheelValue !== 'no front wheel' && frontWheelValue !== 'none';
                    if (hasFront) {
                        let frontUrl = FRONT_WHEEL_URL_MAP[rule.vendor_url?.replace(/\/$/, '')];
                        if (!frontUrl && rule.vendor_url) frontUrl = rule.vendor_url.replace(/\/$/, '') + '-front';
                        if (frontUrl) {
                            try {
                                const frontJsUrl = frontUrl + '.js';
                                if (!ethirteenCache[frontJsUrl]) {
                                    await new Promise(r => setTimeout(r, 600));
                                    const frontResp = await fetch(frontJsUrl, { headers: { 'User-Agent': randomUA } });
                                    if (!frontResp.ok) throw new Error(`Front wheel fetch failed (${frontResp.status})`);
                                    ethirteenCache[frontJsUrl] = await frontResp.json();
                                }
                                const frontData = ethirteenCache[frontJsUrl];
                                if (!(frontData?.variants?.length > 0)) {
                                    const frontErr = new Error('Wheel price not read: front wheel page has no variants');
                                    frontErr.surchargeProblem = true;
                                    throw frontErr;
                                }
                                {
                                    const bestFront = frontData.variants.reduce((a, b) => (Math.max(a.price, a.compare_at_price || 0) > Math.max(b.price, b.compare_at_price || 0) ? a : b));
                                    finalPrice += Math.max(bestFront.price, bestFront.compare_at_price || 0);
                                    finalAvail = finalAvail && bestFront.available;
                                }
                            } catch (fe) { 
                                console.error(`Front wheel fetch failed for ${frontUrl}: ${fe.message}`);
                                throw fe; // Re-throw to abort partial calculation
                            }
                        }
                    }

                    if (driverValue && driverValue !== 'none' && driverValue !== 'no freehub' && !kitIncludedInRear) {
                        // Driver/freehub-kit surcharge: PRICE only, read from e*thirteen's "Sidekick Freehub Kits" page (lib/ethirteen-surcharge.js).
                        // The kit's availability is never read, so a sold-out kit changes nothing. If the price cannot be determined
                        // the rule is skipped (no guessed number, nothing written, no hub marked unavailable).
                        const accJsUrl = SURCHARGE_URL + '.js';
                        let accData = ethirteenCache[accJsUrl];
                        if (!accData) {
                            try {
                                await new Promise(r => setTimeout(r, 600));
                                const accResp = await fetch(accJsUrl, { headers: { 'User-Agent': randomUA } });
                                if (!accResp.ok) throw new Error(`HTTP ${accResp.status}`);
                                accData = await accResp.json();
                            } catch (ae) {
                                accData = { __failed: ae.message };      // remembered for the whole run: one failed fetch, not one per wheel set
                            }
                            ethirteenCache[accJsUrl] = accData;
                        }
                        const sur = accData.__failed
                            ? { ok: false, reason: `surcharge page unavailable (${accData.__failed})` }
                            : findSurchargeCents(accData, driverValue);
                        if (!sur.ok) {
                            const surErr = new Error(`Surcharge not read: ${sur.reason}`);
                            surErr.surchargeProblem = true;
                            throw surErr;
                        }
                        if (sur.pricesDiffer) console.warn(`[SYNC] e*thirteen kit prices differ by hub model for ${sur.kit}; using the higher one.`);
                        finalPrice += sur.cents;
                        console.log(`[SYNC] Dynamic Surcharge for ${driverValue} (${sur.kit}): $${(sur.cents / 100).toFixed(2)} from ${SURCHARGE_URL}`);
                    }

                    winner = { 
                      price: finalPrice, 
                      available: finalAvail, 
                      public_title: `${usedRear ? usedRear.public_title : 'No Rear'} + ${hasFront ? 'Front' : 'No Front'} + Driver Surcharge`
                    };
                }
        } else {
          let candidates = isP321 ? matchColourHoles(vData.variants, parsedOptions) : isPW ? matchPhilWood(vData.variants, parsedOptions) : vData.variants.filter(v => {
            const vTitle = normalize(v.public_title).toLowerCase();
            if (rule.vendor_name === 'Berd') {
              let reqTokens = [];
              const ruleTitleLower = ruleTitle.toLowerCase();
              let isI9Hub = ruleTitleLower.includes('i9') || ruleTitleLower.includes('industry nine');
              let isOnyxHub = ruleTitleLower.includes('onyx');
              if (isI9Hub || isOnyxHub) {
                  const targetHub = isI9Hub ? 'industry nine' : 'onyx';
                  if (!vTitle.includes(targetHub)) return false;
                  let targetColor = null;
                  for (const [on, ov] of Object.entries(parsedOptions)) {
                      if (on.toLowerCase().includes('color')) targetColor = normalize(ov).toLowerCase().replace(/spokes?/g, '').trim();
                  }
                  if (targetColor && !vTitle.toLowerCase().includes(targetColor)) return false;
                  return true;
              }
              
              for (const [optName, optValue] of Object.entries(parsedOptions)) {
                 if (!optValue || optValue.toLowerCase() === 'default title') continue;
                 if (isHub && optName.toLowerCase().includes('color')) continue;
                 if (isHub && optName.toLowerCase().includes('spoke')) continue;
                 let tokens = optValue.toLowerCase()
                     .replace(/×/g, 'x')
                     .replace(/[\"\':(),]/g, '')
                     .replace(/\bhg11\b/g, 'shimano') // map hg11 to shimano to match 'Shimano 11SP'
                     .replace(/\bhg\b/g, 'shimano') // map hg to shimano
                     .replace(/\b(\d+)h\b/g, '$1') // map 24h -> 24
                     .replace(/mm\b/g, '') // map 148mm -> 148
                     .split(/[\s/+\-]+/)
                     .filter(t => t.length > 0 && t !== '11sp' && t !== 'spoke' && t !== 'spokes'); // Drop spoke(s) keywords
                     
                 if (isHub) {
                     tokens = tokens.filter(t => t !== 'black' && t !== 'white' && t !== 'silver' && t !== 'color');
                 }
                 reqTokens.push(...tokens);
              }
              const normalizedTitleForTokens = vTitle.toLowerCase()
                 .replace(/[\"\':(),]/g, '')
                 .replace(/shimano 11sp/g, 'shimano')
                 .replace(/\bhg\b/g, 'shimano');
                 
              for (let token of reqTokens) { 
                 if (!normalizedTitleForTokens.includes(token)) {
                    if (rule.title.includes('HAWK27')) console.log(`[DEBUG] Token mismatch for ${rule.title}: Token '${token}' not found in '${normalizedTitleForTokens}'. parsedOptions: ${JSON.stringify(parsedOptions)}`);
                    return false; 
                 }
              }
              if (isHub) {
                  const isFrontRule = ruleTitle.toLowerCase().includes('front');
                  if (isFrontRule && !vTitle.includes('front')) return false;
                  if (!isFrontRule && !(vTitle.includes('rear') || vTitle.includes('xd') || vTitle.includes('hg') || vTitle.includes('ms') || vTitle.includes('shimano'))) return false;
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
               if (ruleTitleLower.includes('valve')) return valveMatches(v.public_title, parsedOptions);   // Quick Fill valves: colour + length (lib/ethirteen-valve.js)
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
                  if (spokeCount && !vTitle.includes(normalizeSpokeCount(spokeCount))) return false;
                  if (familyConflict(ruleTitle, vTitle)) return false;   // DH / EN / GR families stay apart (lib/ethirteen-rim.js)
               }
               if (isHub) {
                  const isFrontRule = ruleTitleLower.includes('front');
                  if (isFrontRule && !vTitle.includes('front') && !vTitle.includes('15x') && !vTitle.includes('15mm') && !vTitle.includes('110x')) return false;
                  if (!isFrontRule && !vTitle.includes('rear') && !vTitle.includes('148') && !vTitle.includes('157')) return false;
                  let expectedHoles = null;
                  if (parsedOptions["Spoke Count"]) expectedHoles = parsedOptions["Spoke Count"].toString().replace(/\D/g, '');
                  if (expectedHoles && !vTitle.includes(`${expectedHoles} hole`) && !vTitle.includes(`${expectedHoles}h`) && !vTitle.includes(`${expectedHoles} h`)) return false;
                  if (ruleTitleLower.includes('superboost') && !vTitle.includes('157')) return false;
                  if (!ruleTitleLower.includes('superboost') && ruleTitleLower.includes('rear') && !vTitle.includes('148')) return false;
                  if (ruleTitleLower.includes('sidekick sl')) {
                     if (!vTitle.includes('110x15mm')) return false;
                  } else if (ruleTitleLower.includes('sidekick') && !ruleTitleLower.includes('sl') && isHub && isFrontRule) {
                     if (ruleTitleLower.includes('20x110')) {
                        if (!vTitle.includes('15/20')) return false;
                     } else {
                        if (vTitle.includes('15/20')) return false;
                     }
                  }
                  if (!ruleTitleLower.includes('7spd') && !ruleTitleLower.includes('7 spd') && (vTitle.includes('7spd') || vTitle.includes('7 spd'))) return false;
                  if (!ruleTitleLower.includes('mini') && vTitle.includes('mini')) return false;
               }
               return true;
            } else if (rule.vendor_name?.toLowerCase() === 'velonix' || (rule.vendor_url && rule.vendor_url.toLowerCase().includes('velonix'))) {
               const vTitleLower = vTitle.toLowerCase();
               let targetColor = null;
               let targetLength = null;
               let targetType = null;
               let targetSecure = null;
               for (const [on, ov] of Object.entries(parsedOptions)) {
                  if (on.toLowerCase().includes('color')) {
                     targetColor = normalize(ov).toLowerCase();
                     if (targetColor === 'turquoise') targetColor = 'turqoise';
                  }
                  if ((on.toLowerCase().includes('length') || on.toLowerCase().includes('size')) && !on.toLowerCase().includes('pack')) {
                     targetLength = normalize(ov).toLowerCase().replace('mm', '').trim();
                  }
                  if (on.toLowerCase() === 'type') targetType = normalize(ov).toLowerCase();
                  if (on.toLowerCase().includes('secure')) targetSecure = normalize(ov).toLowerCase();
               }
               
               if (targetColor && !vTitleLower.includes(targetColor)) return false;
               if (targetType && !vTitleLower.includes(targetType)) return false;
               if (targetSecure) {
                  const isSecureLock = targetSecure === 'secure lock';
                  if (isSecureLock && (vTitleLower.includes('non-secure lock') || vTitleLower.includes('non secure lock'))) return false;
                  if (!vTitleLower.includes(targetSecure)) return false;
               }
               if (targetLength) {
                  // Velonix lengths are formatted like "152mm" in the public_title
                  if (!vTitleLower.includes(targetLength + 'mm') && !vTitleLower.includes(targetLength + ' mm') && !vTitleLower.split(/[\s/]+/).includes(targetLength)) {
                     return false;
                  }
               }
               return true;
            }

            // Generic Hub/Rim filtering for all other vendors (like OneUp)
            if (isHub || isRim) {
                const vTitleLower = vTitle.toLowerCase();
                // 1. Color matching
                let targetColor = null;
                for (const [on, ov] of Object.entries(parsedOptions)) {
                    if (on.toLowerCase().includes('color')) targetColor = normalize(ov).toLowerCase();
                }
                if (targetColor && !vTitleLower.includes(targetColor)) return false;

                // 2. Spoke Count / Hole matching
                let targetHoles = null;
                for (const [on, ov] of Object.entries(parsedOptions)) {
                    if (on.toLowerCase().includes('spoke') || on.toLowerCase().includes('count') || on.toLowerCase().includes('hole')) {
                        const numOnly = ov.toString().replace(/\D/g, '');
                        if (numOnly) targetHoles = numOnly;
                    }
                }
                if (targetHoles && !vTitleLower.includes(targetHoles) && !vTitleLower.includes(targetHoles + 'h')) return false;

                // 3. Axle/Spacing matching (generic)
                const spacingMatch = ruleTitle.match(/(100|110|142|148|157)/);
                if (spacingMatch && !vTitleLower.includes(spacingMatch[1])) return false;

                vStatus = `Filtered by generic ${isHub ? 'Hub' : 'Rim'} logic`;
            }

            return true;
          });

          if (candidates.length > 0) {
            winner = candidates.reduce((prev, curr) => (Math.max(prev.price, prev.compare_at_price || 0) > Math.max(curr.price, curr.compare_at_price || 0)) ? prev : curr);
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
            
            // IF multiple candidates match (e.g. hub with different freehubs), consider it available if ANY of the candidates are available.
            if (winner && candidates.length > 1) {
              const anyAvailable = candidates.some(c => c.available);
              winner = { ...winner, available: anyAvailable };
              if (anyAvailable) vStatus += ` (Aggregated availability from ${candidates.length} variants)`;
            }
            if (winner && isP321) {   // Project321: price from the highest color (tag price-max-color), pre-order read from the option text, never from 'available' alone
              p321Read = readProject321({ candidates, variants: vData.variants, rule });
              if (p321Read) { winner = { ...winner, price: p321Read.price, available: p321Read.available }; vStatus += ` ${p321Read.note || ''}`.trimEnd(); }
            }
          }
        }

        const vendorKey = rule.vendor_name || 'unknown';
        if (!vendorStats[vendorKey]) vendorStats[vendorKey] = { total: 0, noMatch: 0, liveTotal: 0, liveNoMatch: 0 };
        vendorStats[vendorKey].total++;
        if (!winner) vendorStats[vendorKey].noMatch++;
        if (!urlStats[url]) urlStats[url] = { live: 0, noMatch: 0 };

        console.log(`[RULE: ${rule.id}] Processing "${rule.title}" | Winner: "${winner?.public_title || 'None'}" | Status: ${vStatus}`);
        if (winner) {
          const variant = await getShopifyVariant(adminToken, rule.shopify_product_id, rule.shopify_variant_id);
          if (!variant) {
            console.warn(`[SYNC] Variant ID ${rule.shopify_variant_id} not found for rule ${rule.id}. Skipping.`);
            attention.push({ title: rule.title, reason: 'Variant not found in Shopify; rule skipped.' });
            // Skip further processing for this rule
            continue;
          }
const currentBtiFlag = variant.btiMonitor ? (variant.btiMonitor.value === 'true') : null;

          // --- ONE OWNER PER VARIANT (allowlisted vendors only, see lib/ownership.js) ---
          // The Watcher alone writes custom.bti_sync_authority: vendor in stock = false (Watcher owns inventory), vendor out of stock = true (BTI owns).
          // It never writes IGNORE, never wipes a number, and restores a lost number only from the exact real value stored in watcher_rules.
          // These writes do not wait for price approval. Everything else (non-allowlisted vendors) keeps the old behaviour below.
          const ownership = decideOwner({
            vendorAllowed: isOneOwnerVendor(rule.vendor_name),
            autoUpdate: rule.auto_update === true,
            vendorInStock: winner.available,
            currentFlag: variant.btiMonitor ? variant.btiMonitor.value : null,
            shopifyNumber: variant.btiNumber ? variant.btiNumber.value : null,
            storedNumber: rule.bti_part_number
          });
          let ownerFlagNow = currentBtiFlag;   // the flag as it stands after any write below
          if (ownership.managed) {
            const ownerWrites = [];
            if (ownership.restoreNumber) ownerWrites.push({ key: 'bti_part_number', value: ownership.restoreNumber, type: 'single_line_text_field' });
            if (ownership.writeFlag && ownership.desiredFlag !== null) ownerWrites.push({ key: 'bti_sync_authority', value: String(ownership.desiredFlag), type: 'boolean' });
            if (ownerWrites.length > 0) {
              const result = await setVariantMetafields(adminToken, rule.shopify_variant_id, ownerWrites);
              if (result.ok) {
                if (ownership.writeFlag && ownership.desiredFlag !== null) ownerFlagNow = ownership.desiredFlag;
                if (ownership.restoreNumber) ownershipLines.push(`${rule.title}: BTI part number ${ownership.restoreNumber} restored (it was blank or IGNORE in Shopify)`);
                if (ownership.writeFlag && ownership.desiredFlag !== null) ownershipLines.push(`${rule.title}: inventory owner is now ${ownership.desiredFlag ? 'BTI (vendor out of stock)' : 'the Watcher (vendor in stock)'}`);
              } else {
                attention.push({ title: rule.title, reason: `Could not update owner/number in Shopify (${result.errors.join('; ').slice(0, 120)}). Nothing was changed for this item.` });
              }
            }
            if (ownership.numberMismatch) attention.push({ title: rule.title, reason: `BTI part number in Shopify (${variant.btiNumber?.value}) differs from the stored one (${rule.bti_part_number}). Nothing was changed; please check.` });
          }
          if (isLiveVariant(variant)) { vendorStats[vendorKey].liveTotal++; urlStats[url].live++; }
          const productHandle = variant.product?.handle || '';
          const vendorPrice = winner ? (Math.max(winner.price, winner.compare_at_price || 0) / 100) : 0;
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
          const ignorePriceUpdate = String(rule.shopify_product_id) === '10180231921971' || String(rule.shopify_product_id) === '10191716548915' || rule.tags?.includes('spokes') || rule.title.toLowerCase().includes('nipples') || isStockOnly(rule);   // tag 'stock-only': the Watcher never touches this rule's price
          const needsPriceUpdate = !ignorePriceUpdate && (isDiff || (myCompare && Number(myCompare) < Number(goalPrice))) && (winner.available || currentBtiFlag !== true || ownership.managed);

          let needsStockUpdate = false;
          let stockAction = null;
          let currentEffectiveBtiFlag = ownerFlagNow;
          const shopifyQty = variant.inventoryQuantity || 0;
          const vendorInStock = winner.available;

          if (rule.auto_update === true && currentEffectiveBtiFlag !== true && shopifyQty <= 0 && !(p321Read && p321Read.holdStock)) {
              if (!vendorInStock && variant.inventoryPolicy === 'CONTINUE') {
                  needsStockUpdate = true;
                  stockAction = 'deny';
              } else if (vendorInStock && variant.inventoryPolicy === 'DENY') {
                  needsStockUpdate = true;
                  stockAction = 'continue';
              }
          }

          let forceNeedsReview = rule.needs_review;

          const forceApprove = req.body && req.body.force_approve;
          const autoApproveOos = hasTag(rule, 'auto-approve-oos');   // Jerry's tag: a close does not wait for approval (still logged, one line per product)
          const requiresReviewForStock = closeNeedsApproval({ needsStockUpdate, stockAction, rule });   // not for auto-approve-oos rows, not in baseline mode

          // tag 'auto-approve-price' (lib/watcher-safety.js priceDecision): small, twice-confirmed price changes need no approval
          let priceMode = needsPriceUpdate ? priceDecision({ rule, myPrice, goalPrice, vendorCents: Math.round(vendorPrice * 100) }) : 'ask';
          if (priceMode === 'auto' && !priceLimiter.tryFlip(vendorKey)) priceMode = 'capped';
          const priceNeedsReview = needsPriceUpdate && priceMode === 'ask';
          const priceItem = { product: productOfTitle(rule.title), from: Number(myPrice), to: Number(goalPrice) };
          if (needsPriceUpdate && priceMode === 'baseline') basePriceItems.push(priceItem);
          if (needsPriceUpdate && priceMode === 'wait') waitPriceItems.push(priceItem);

          let reviewReason = rule.review_reason || null;
          if ((priceNeedsReview || requiresReviewForStock) && !forceApprove) {
              forceNeedsReview = true;
              let reasonStr = [];
              if (priceNeedsReview) {
                  reasonStr.push(`Price Change: $${myPrice} -> $${goalPrice}`);
              }
              if (requiresReviewForStock) {
                  reasonStr.push(`Vendor OOS`);
              }
              reviewReason = reasonStr.join(' | ');
              attention.push({ title: rule.title, reason: `🚨 APPROVAL REQUIRED: ${reviewReason}` });
          } else if (forceApprove) {
              forceNeedsReview = false;
              reviewReason = null;
              console.log(`[!] Force Overriding and applying updates for ${rule.title}`);
          } else if (decideReviewFlag({ needsPriceUpdate: priceNeedsReview, requiresReviewForStock, forceApprove, flagged: forceNeedsReview }) === 'clear') {
              // Nothing is waiting for approval any more (vendor price equals Shopify again), whether or not the vendor has it in stock.
              forceNeedsReview = false;
              reviewReason = null;
              console.log(`[SYNC] Clearing stuck review flag for ${rule.title} because nothing is waiting for approval.`);
          }

          let newPriceLastChangedAt = rule.price_last_changed_at || null;
          if (rule.last_price !== winner.price) {
            newPriceLastChangedAt = new Date().toISOString();
            if (isDeepSale) attention.push({ title: rule.title, reason: `Drastic Sale Detected: Vendor Price is $${vendorPrice.toFixed(2)}!` });
          } else if (newPriceLastChangedAt && isDeepSale) {
            const daysPersistent = (new Date() - new Date(newPriceLastChangedAt)) / (1000 * 60 * 60 * 24);
            if (Math.floor(daysPersistent) === 45) attention.push({ title: rule.title, reason: `Sale Price persistent for 45 days: Confirm as New MSRP?` });
          }

          let finalShopifyPriceNum = Number(myPrice);
          let updatePayloadForPrice = { id: rule.shopify_variant_id };
          let shouldPutPrice = false;

          if (rule.auto_update === true && !forceNeedsReview && !ownership.managed) {
             if (winner.available && (currentBtiFlag === true || forceApprove)) {
                console.log(`[SYNC] Vendor BACK-IN-STOCK for ${rule.title}. Reclaiming authority from BTI by clearing part number.`);
                updatePayloadForPrice.metafields = [{ namespace: "custom", key: "bti_part_number", value: "IGNORE", type: "single_line_text_field" }];
                shouldPutPrice = true;
                currentEffectiveBtiFlag = false;
             } else if (!winner.available && rule.bti_part_number && (rule.bti_monitoring_enabled === true || rule.bti_monitoring_enabled === 'true' || rule.tags?.includes('bti-sync')) && currentBtiFlag !== true) {
                console.log(`[SYNC] Vendor OOS for ${rule.title}. Deferring authority to BTI by restoring part number.`);
                updatePayloadForPrice.metafields = [{ namespace: "custom", key: "bti_part_number", value: String(rule.bti_part_number), type: "single_line_text_field" }];
                shouldPutPrice = true;
                currentEffectiveBtiFlag = true;
             } else if (currentBtiFlag === true && !rule.bti_part_number) {
                console.log(`[SYNC] Clearing stale BTI flag for ${rule.title} (no bti_part_number). Watcher will manage inventory directly.`);
                updatePayloadForPrice.metafields = [{ namespace: "custom", key: "bti_sync_authority", value: "false", type: "boolean" }];
                shouldPutPrice = true;
                currentEffectiveBtiFlag = false;
             }
          }

          if (needsPriceUpdate && rule.auto_update === true && !forceNeedsReview && (priceMode === 'auto' || priceMode === 'ask')) {
             updatePayloadForPrice.price = goalPrice;
             const baseCompare = myCompare ? Number(myCompare) : 0;
             if (baseCompare > Number(goalPrice)) {
                updatePayloadForPrice.compare_at_price = myCompare;
             } else {
                updatePayloadForPrice.compare_at_price = goalPrice; 
             }
             shouldPutPrice = true;
             finalShopifyPriceNum = Number(goalPrice);
          }

          if (shouldPutPrice) {
             if (updatePayloadForPrice.metafields) {
                 const m = updatePayloadForPrice.metafields[0];
                 await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
                     method: 'POST',
                     headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                     body: JSON.stringify({ query: `mutation { metafieldsSet(metafields: [{ownerId: "gid://shopify/ProductVariant/${rule.shopify_variant_id}", namespace: "${m.namespace}", key: "${m.key}", value: "${m.value}", type: "${m.type}"}]) { userErrors { message } } }` })
                 });
                 delete updatePayloadForPrice.metafields;
             }
             await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: updatePayloadForPrice })
             }).catch(e => console.error(e));
             if (needsPriceUpdate && rule.auto_update === true && !forceNeedsReview && (priceMode === 'auto' || priceMode === 'ask')) { if (priceMode === 'auto') autoPriceItems.push(priceItem); else updated.push({ title: rule.title, reason: `Price Adjusted ($${myPrice} -> $${goalPrice})` }); }
          }

          let effectivePolicy = variant.inventoryPolicy;
          let stockWriteAllowed = needsStockUpdate && rule.auto_update === true && !forceNeedsReview;
          if (stockWriteAllowed) {
              const productName = productOfTitle(rule.title);
              if (hasTag(rule, 'baseline')) { stockWriteAllowed = false; baselineItems.push({ product: productName, action: stockAction === 'deny' ? 'would close' : 'would open' }); }
              else if (needsSecondRun(rule, polite) && !confirmedTwice(rule, winner.available)) { stockWriteAllowed = false; heldOnceItems.push({ product: productName, action: stockAction === 'deny' ? 'close waits for a second run' : 'open waits for a second run' }); }
              else if (!flipLimiter.tryFlip(vendorKey)) { stockWriteAllowed = false; }
              else if (autoApproveOos) autoApprovedItems.push({ product: productName, action: stockAction === 'deny' ? 'closed' : 'opened' });
          }
          if (stockWriteAllowed) {
              await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
                method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ variant: { id: rule.shopify_variant_id, inventory_policy: stockAction } })
              });
              if (stockAction === 'deny') {
                if (!autoApproveOos) stockChanges.push({ title: rule.title, action: '🔴 Made Unavailable (Vendor OOS)' });
                effectivePolicy = 'DENY';
              } else {
                if (!autoApproveOos) stockChanges.push({ title: rule.title, action: '🟢 Back In Stock (Vendor Available)' });
                effectivePolicy = 'CONTINUE';
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

          let newLog = `Synced (${winner.available ? 'In Stock' : 'OOS'}). Link: https://loamlabsusa.com/products/${productHandle}`;
          if (!winner.available && currentEffectiveBtiFlag === true) newLog = `Vendor OOS (Matched: "${winner.public_title}"). Deferring INVENTORY to BTI. Link: https://loamlabsusa.com/products/${productHandle}`;

          // --- DIFFERENTIAL UPDATE: Only write to DB if something actually changed ---
          const newLastPrice = Math.round(vendorPrice * 100);
          const newCurrentShopifyPrice = Math.round(finalShopifyPriceNum * 100);
          const newCurrentCompareAtPrice = updatePayloadForPrice.compare_at_price ? Math.round(Number(updatePayloadForPrice.compare_at_price) * 100) : (myCompare ? Math.round(Number(myCompare) * 100) : null);
          const newBtiInventoryActive = !!currentEffectiveBtiFlag;

          const hasChanged = (
            rule.last_price !== newLastPrice ||
            rule.last_availability !== winner.available ||
            rule.last_log !== newLog ||
            rule.price_last_changed_at !== newPriceLastChangedAt ||
            rule.out_of_stock_since !== newOutOfStockSince ||
            rule.current_shopify_price !== newCurrentShopifyPrice ||
            rule.current_compare_at_price !== newCurrentCompareAtPrice ||
            rule.bti_inventory_active !== newBtiInventoryActive ||
            rule.needs_review !== forceNeedsReview ||
            rule.review_reason !== reviewReason
          );

          if (hasChanged) {
            await supabase.from('watcher_rules').update({ 
              last_price: newLastPrice, 
              last_availability: winner.available,
              last_run_at: nowIso,
              last_log: newLog,
              price_last_changed_at: newPriceLastChangedAt,
              out_of_stock_since: newOutOfStockSince,
              current_shopify_price: newCurrentShopifyPrice,
              current_compare_at_price: newCurrentCompareAtPrice,
              bti_inventory_active: newBtiInventoryActive,
              needs_review: forceNeedsReview,
              review_reason: reviewReason
            }).eq('id', rule.id);
          } else {
            // Nothing changed — queue for bulk last_run_at update at the end
            unchangedRuleIds.push(rule.id);
          }

        } else {
           const vendorOptions = vData.variants.slice(0, 2).map(v => v.public_title).join(', ');
           const failLog = stampSince(`FAILED: Found 0 matches for parsed options. Vendor uses: ${vendorOptions}`, rule.last_log, nowIso);
           (noMatchByUrl[url] = noMatchByUrl[url] || []).push({ rule, since: parseSince(failLog) });
           
           if (rule.auto_update === true) {
             const variant = await getShopifyVariant(adminToken, rule.shopify_product_id, rule.shopify_variant_id);
             if (isLiveVariant(variant)) { vendorStats[vendorKey].liveTotal++; vendorStats[vendorKey].liveNoMatch++; urlStats[url].live++; urlStats[url].noMatch++; }
             if (variant && (variant.inventoryQuantity || 0) <= 0 && variant.inventoryPolicy === 'CONTINUE') {
                 // held back; applied after the loop unless the circuit breaker trips for this vendor
                 pendingNoMatchDeny.push({ rule, vendorKey, url });
             }
           }

           if (rule.last_log !== failLog || rule.last_availability !== false) {
             await supabase.from('watcher_rules').update({ 
               last_log: failLog,
               last_availability: false,
               last_run_at: nowIso
             }).eq('id', rule.id);
           } else {
             unchangedRuleIds.push(rule.id);
           }
        }
      } catch (ruleError) {
        console.error(`FAILURE on rule ${rule.id} (${rule.title}):`, ruleError);
        if (ruleError.surchargeProblem) {
          surchargeProblems.set(ruleError.message, (surchargeProblems.get(ruleError.message) || 0) + 1);
        } else {
          attention.push({ title: rule.title, reason: `Sync Failed: ${ruleError.message}` });
        }
        await supabase.from('watcher_rules').update({
          last_log: `CRASHED: ${ruleError.message.slice(0, 100)}`,
          last_run_at: nowIso
        }).eq('id', rule.id);
      }
    }

    // --- CIRCUIT BREAKER: apply (or hold back) the "vendor does not offer this variant" deny writes ---
    const trippedVendors = new Set();
    for (const [vendor, st] of Object.entries(vendorStats)) {
      if (breakerTripped(st)) {
        trippedVendors.add(vendor);
        console.error(`[SYNC BREAKER] ${vendor}: ${st.liveNoMatch} of ${st.liveTotal} live items found 0 vendor matches (${st.noMatch} of ${st.total} checked in all). Holding back unavailable-writes.`);
        attention.push({ title: `${vendor}: sync safety stop`, reason: `${st.liveNoMatch} of ${st.liveTotal} items that are live in your shop found no matching vendor variant (more than 20%). The vendor site probably changed. No items were switched to unavailable for this vendor; please check the vendor pages and the rule options.` });
      }
    }
    const trippedUrls = new Set();
    for (const [u, st] of Object.entries(urlStats)) {
      if (urlBreakerTripped(st)) {
        trippedUrls.add(u);
        attention.push({ title: 'Vendor page safety stop', reason: `${st.noMatch} of ${st.live} live items on ${u} found no match (the page may have changed). Nothing on it was made unavailable.` });
      }
    }
    for (const { rule, vendorKey, url: pendingUrl } of pendingNoMatchDeny) {
      if (trippedVendors.has(vendorKey)) continue;
      if (trippedUrls.has(pendingUrl)) continue;
      if (hasTag(rule, 'baseline')) { baselineItems.push({ product: productOfTitle(rule.title), action: 'would close (not on the vendor page)' }); continue; }
      if (!flipLimiter.tryFlip(vendorKey)) continue;
      try {
        await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
          method: 'PUT', headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: { id: rule.shopify_variant_id, inventory_policy: 'deny' } })
        });
        stockChanges.push({ title: rule.title, action: '🔴 Made Unavailable (Vendor Does Not Offer)' });
        attention.push({ title: rule.title, reason: 'NOTE: Variant not found on vendor page; marked unavailable.' });
      } catch (denyErr) {
        console.error(`[SYNC] Could not mark ${rule.title} unavailable:`, denyErr);
        attention.push({ title: rule.title, reason: `Sync Failed: could not mark unavailable (${denyErr.message})` });
      }
    }

    // grouped lines: baseline proposals, flips that wait for a second run, auto-approved closes/opens, the flip cap, the time stop
    groupLines(baselineItems).forEach((l) => attention.push({ title: 'Baseline (nothing written)', reason: l }));
    groupLines(heldOnceItems).forEach((l) => attention.push({ title: 'Waiting for a second run', reason: l }));
    groupLines(autoApprovedItems).forEach((l) => stockChanges.push({ title: l, action: '📦 Auto-approved' }));
    // freehub lists (tag 'freehub-follow'): one line per hub, at most 10 list changes per run; 'baseline' writes only our own observation, never the list
    const freehubCap = createFlipLimiter(10);
    for (const [fhProductId, job] of freehubJobs.entries()) {
      try {
        const cur = await readHubFreehub(adminToken, fhProductId);
        const spacing = spacingOf(job.rule.title);
        if (!cur || !Array.isArray(cur.list) || !spacing) { attention.push({ title: `Freehub list (${job.rule.title})`, reason: 'No freehub list or no 148/157 spacing in the title; nothing checked.' }); continue; }
        const plan = planFreehubList({ list: cur.list, watch: cur.watch, states: driverStates(job.variants, spacing) });
        const hubName = cur.title.replace(/^e\*thirteen /, '');
        plan.notes.forEach((n) => attention.push({ title: `Freehub list: ${hubName}`, reason: n }));
        const watchChanged = JSON.stringify(plan.newWatch) !== JSON.stringify(cur.watch);
        const baseline = hasTag(job.rule, 'baseline');
        const parts = [plan.removed.length ? `${plan.removed.join(', ')} removed from the freehub list (e*thirteen shows it out of stock)` : '', plan.added.length ? `${plan.added.join(', ')} added back (in stock again)` : ''].filter(Boolean).join('; ');
        if (plan.changed && baseline) { attention.push({ title: 'Baseline (nothing written)', reason: `${hubName}: would change the freehub list: ${parts}` }); }
        else if (plan.changed && !freehubCap.tryFlip('freehub')) { /* held: counted below */ }
        else if (plan.changed) {
          const ok = await writeHubMetafields(adminToken, fhProductId, [{ key: 'freehub', type: 'list.single_line_text_field', value: JSON.stringify(plan.newList) }, { key: 'freehub_watch', type: 'json', value: JSON.stringify(plan.newWatch) }]);
          if (ok) stockChanges.push({ title: `${hubName}: ${parts}`, action: '🔧 Freehub list' });
          else attention.push({ title: `Freehub list: ${hubName}`, reason: 'Could not write the freehub list to Shopify; nothing was changed.' });
        } else if (watchChanged) {
          await writeHubMetafields(adminToken, fhProductId, [{ key: 'freehub_watch', type: 'json', value: JSON.stringify(plan.newWatch) }]);
        }
      } catch (fe) { attention.push({ title: `Freehub list (${job.rule.title})`, reason: `Could not check: ${String(fe.message).slice(0, 100)}` }); }
    }
    Object.entries(freehubCap.held).forEach(([, n]) => attention.push({ title: 'Sync safety stop (freehub lists)', reason: `${n} freehub list change${n === 1 ? '' : 's'} NOT written this run (limit of 10 per run reached). They are picked up on the next run.` }));

    flipLimiter.lines().forEach((l) => attention.push({ title: 'Sync safety stop', reason: l }));
    priceLines(basePriceItems, 'would be repriced').forEach((l) => attention.push({ title: 'Baseline prices (nothing written)', reason: l }));
    priceLines(waitPriceItems, 'wait for a second run at the same vendor price').forEach((l) => attention.push({ title: 'Waiting for a second run (price)', reason: l }));
    priceLines(autoPriceItems, 'repriced').forEach((l) => stockChanges.push({ title: l, action: '💲 Auto-approved price' }));
    Object.entries(priceLimiter.held).forEach(([v, n]) => attention.push({ title: 'Sync safety stop (prices)', reason: `${v}: ${n} price change${n === 1 ? '' : 's'} NOT written this run (limit of ${PRICE_CAP} per vendor per run reached). They are picked up on the next run.` }));
    if (stoppedForTime > 0) attention.push({ title: 'Sync stopped for time', reason: `The run reached 270 s and stopped cleanly; ${stoppedForTime} rule${stoppedForTime === 1 ? '' : 's'} were not checked today.` });

    // e*thirteen surcharge problems: one line per distinct problem, not one per wheel set
    for (const [msg, count] of surchargeProblems.entries()) {
      attention.push({ title: 'e*thirteen wheel sets: price not read', reason: `${msg}. ${count} wheel set${count === 1 ? '' : 's'} skipped this run (their price and stock were left unchanged).` });
    }

    // vendor pages that could not be read: one line per page, with the number of rules that were not checked
    // (the old one-line-per-page alerts are replaced by the "Broken vendor links" section at the top of the email)
    // a page that WAS read but where EVERY active rule on it found 0 matches is a broken link too (moved, renamed, product removed)
    for (const [u, list] of Object.entries(noMatchByUrl)) {
      if (list.length === rulesPerUrl[u] && !failedPages[u]) {
        const what = redirectedTo[u] ? `redirected to ${redirectedTo[u]}` : classify('Found 0 matches');
        list.forEach(({ rule, since }) => linkReport.add({ url: u, vendor: rule.vendor_name, product: productOfTitle(rule.title), what, since }));
      }
    }
    const linkSection = linkReport.section(nowIso);

    // --- BULK TIMESTAMP UPDATE for all unchanged rules ---
    // This is the key performance optimization: instead of thousands of sequential
    // row updates, we update last_run_at for ALL unchanged rules in chunked bulk queries.
    if (unchangedRuleIds.length > 0) {
      console.log(`[SYNC] Bulk-updating last_run_at for ${unchangedRuleIds.length} unchanged rules...`);
      const chunkSize = 500;
      for (let i = 0; i < unchangedRuleIds.length; i += chunkSize) {
        const chunk = unchangedRuleIds.slice(i, i + chunkSize);
        const { error: bulkErr } = await supabase
          .from('watcher_rules')
          .update({ last_run_at: nowIso })
          .in('id', chunk);
        if (bulkErr) console.error('[SYNC] Bulk last_run_at update error:', bulkErr);
      }
      console.log(`[SYNC] Bulk timestamp update complete.`);
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('sync_logs').delete().lt('created_at', thirtyDaysAgo);

    const hasReport = linkSection.count > 0 || updated.length > 0 || ownershipLines.length > 0 || attention.length > 0 || stockChanges.length > 0 || oosReminders.length > 0 || autoCreatedVariants.length > 0;
    if (hasReport) {
      const updatedHtml = updated.map(i => `<li style="color:green;">🚀 <b>UPDATED:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      const attentionHtml = attention.map(i => `<li style="color:red;">⚠️ <b>ALERT:</b> ${i.title}<br><small>${i.reason}</small></li>`).join('');
      let autoCreatedHtml = '';
      if (autoCreatedVariants.length > 0) {
        autoCreatedHtml = `<h3 style="margin-top:20px; color:#4F46E5;">✨ Auto-Created Spoke Variants (${autoCreatedVariants.length})</h3><ul>` + 
          autoCreatedVariants.map(v => `<li>Created variant: <b>${v.productTitle} (${v.variantTitle})</b> at $${v.price}</li>`).join('') + '</ul>';
      }
      let stockHtml = stockChanges.length > 0 ? `<h3 style="margin-top:20px;">📦 Stock Status Changes (${stockChanges.length})</h3><ul>` + stockChanges.map(s => `<li>${s.action}: <b>${s.title}</b></li>`).join('') + '</ul>' : '';
      let ownershipHtml = '';
      if (ownershipLines.length > 0) {
        ownershipHtml = `<h3 style="margin-top:20px;">🔁 Inventory Owner / Number Restores (${ownershipLines.length})</h3><ul>` +
          ownershipLines.slice(0, 10).map(l => `<li>${l}</li>`).join('') +
          (ownershipLines.length > 10 ? `<li>…and ${ownershipLines.length - 10} more</li>` : '') + '</ul>';
      }
      let oosHtml = '';
      if (oosReminders.length > 0) {
        const oosGroups = groupOosReminders(oosReminders, 10);
        oosHtml = `<h3 style="margin-top:20px;">⏰ Items Still Out of Stock (${oosGroups.totalItems} items in ${oosGroups.totalProducts} products)</h3><ul>` +
          oosGroups.lines.map(g => `<li><b>${g.product}</b> — ${g.count} item${g.count === 1 ? '' : 's'} out, longest <b>${g.maxDays} days</b></li>`).join('') +
          (oosGroups.more > 0 ? `<li>…and ${oosGroups.more} more product${oosGroups.more === 1 ? '' : 's'}</li>` : '') + '</ul>';
      }
      const totalAlerts = updated.length + attention.length + stockChanges.length + ownershipLines.length + autoCreatedVariants.length;
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL,
        subject: `Vendor Watcher: ${totalAlerts} Updates${autoCreatedVariants.length > 0 ? ` (+${autoCreatedVariants.length} New Variants)` : ''}${oosReminders.length > 0 ? ` + ${oosReminders.length} OOS Reminders` : ''}${linkSection.count > 0 ? ` + ${linkSection.count} broken link${linkSection.count === 1 ? '' : 's'}` : ''}`,
        html: `<div style="font-family:sans-serif;">${linkSection.html}<h2>Shop Sync Report</h2><ul>${updatedHtml}${attentionHtml}</ul>${autoCreatedHtml}${stockHtml}${ownershipHtml}${oosHtml}</div>`
      });
    }

    const logStatus = hasReport ? 'success' : 'no_changes';
    const logMessage = hasReport ? `Sync completed with ${updated.length} price updates and ${stockChanges.length} stock status changes.` : 'Sync completed. No changes detected.';
    await supabase.from('sync_logs').insert([{ status: logStatus, updated_count: updated.length, attention_count: attention.length, stock_changes_count: stockChanges.length, oos_reminders_count: oosReminders.length, message: logMessage }]);

    // the build guard, started right after the Watcher (dry run for now: plans only, writes nothing to the store; the result goes to sync_logs). Never changes this response.
    // the guard emails only when it changes something (same sender and recipient as the Watcher report)
    const guardMail = process.env.REPORT_EMAIL ? async (subject, lines) => {
      await resend.emails.send({ from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL, subject, html: `<div style="font-family:sans-serif;"><h2>Build availability guard</h2><ul>${lines.map((l) => `<li>${String(l).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>` });
    } : null;
    await guardAfterWatcher({ env: process.env, supabase, sendEmail: guardMail, startedAtMs: handlerStartedAt });

    res.status(200).json({ updated: updated.length, attention: attention.length, stock_changes: stockChanges.length });
  } catch (err) { 
    console.error('CRITICAL SYNC ERROR:', err);
    await supabase.from('sync_logs').insert([{ status: 'error', message: `CRITICAL ERROR: ${err.message}` }]);
    res.status(500).json({ error: err.message }); 
  }
}
