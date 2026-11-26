// lib/auto-discovery.js
// Which store variants already have a Watcher rule? PURE.
// Auto-discovery adds a rule for every store variant "without one". A variant counts as having one when ANY rule row exists for it,
// with or without a vendor link: a row without a link is how we say "the vendor does not make this" (links cleared, or watcher-ignore).
// Before (Nov 26): only rows WITH a link counted, so discovery re-created every link-less row with the product's first link and undid the clean-up.

/** @returns {Set<string>} variant ids of every rule row given, whatever its vendor_url */
function ruleVariantIdSet(rules) {
    return new Set((Array.isArray(rules) ? rules : []).filter((r) => r && r.shopify_variant_id != null).map((r) => String(r.shopify_variant_id)));
}

/** @returns {string[]} store variant ids that need a new rule */
function variantsNeedingRules(storeVariantIds, rules) {
    const have = ruleVariantIdSet(rules);
    return [...storeVariantIds].map(String).filter((id) => !have.has(id));
}

module.exports = { ruleVariantIdSet, variantsNeedingRules };
