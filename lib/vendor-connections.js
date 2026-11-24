// lib/vendor-connections.js
// READ ONLY counting for the connection dots on the Vendor Watcher vendor buttons.
// Per vendor: how many of the vendor's items (registry rows = watcher_rules, one per store variant, ACTIVE products only) are
//   - Watcher connected: the rule has a non-empty vendor_url AND auto_update is on (what pages/api/sync.js needs: it skips a rule without a vendor_url
//     and writes only when auto_update === true); a rule with no URL (Hope, Hydra2, Project321 B2B ...) does not count;
//   - BTI connected: the variant has a REAL BTI part number (not blank, not IGNORE: same test as loamlabs-bti-sync/lib/plan-variant.js isRealPartNumber)
//     AND BTI monitoring is on (bti_monitoring_enabled, the flag pages/api/sync.js reads next to the part number).
// State per kind: 'full' = every item has it, 'partial' = at least one but not all, 'none' = zero (or the vendor has no active items).
const { isRealNumber } = require('./bti-number');

const isOn = (v) => v === true || v === 'true';
const hasUrl = (v) => typeof v === 'string' && v.trim() !== '';
const state = (n, total) => (!total || n === 0 ? 'none' : n === total ? 'full' : 'partial');

/**
 * @param {object[]} rules  watcher_rules rows (shopify_variant_id, shopify_product_id, vendor_name, vendor_url, auto_update, bti_part_number, bti_monitoring_enabled)
 * @param {Set<string>|string[]|null} activeProductIds  ids of ACTIVE store products; rows of other products (draft, archived, missing) are ignored. null = count every row.
 * @returns {Object<string,{total:number,watcher:number,bti:number,watcherState:string,btiState:string}>}
 */
function countConnections(rules, activeProductIds = null) {
    const active = activeProductIds ? new Set([...activeProductIds].map(String)) : null;
    const seen = new Set(); const out = {};
    for (const r of rules || []) {
        const vendor = r && r.vendor_name; if (!vendor) continue;
        const variant = String(r.shopify_variant_id); if (seen.has(variant)) continue; seen.add(variant);   // one row per variant, as the registry shows it
        if (active && !active.has(String(r.shopify_product_id))) continue;
        const v = out[vendor] || (out[vendor] = { total: 0, watcher: 0, bti: 0 });
        v.total++;
        if (hasUrl(r.vendor_url) && r.auto_update === true) v.watcher++;
        if (isRealNumber(r.bti_part_number) && isOn(r.bti_monitoring_enabled)) v.bti++;
    }
    for (const v of Object.values(out)) { v.watcherState = state(v.watcher, v.total); v.btiState = state(v.bti, v.total); }
    return out;
}

module.exports = { countConnections };
