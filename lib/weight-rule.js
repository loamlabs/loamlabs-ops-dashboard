// lib/weight-rule.js  (PURE)
// The weight rule of the dashboard's daily-tasks button, same idea as the data audit (loamlabs-data-audit lib/data-health.js weightIssueLine):
// a product passes when it has a product-level weight, OR every variant has its own weight, OR (spoke products only) it has the base weight custom.spoke_base_weight_g.
// Spoke products lost their product-level weight_g on Nov 17 2026 (the base weight replaced it), so without the third condition all 16 would be reported as missing.
const has = (v) => !!v;   // same test the button always used: a metafield value that is present and not an empty string

/** @param {{tags?: string[], productWeight?: any, spokeBase?: any, variantWeights?: any[]}} p  @returns {boolean} true when the weight is MISSING */
function weightMissing({ tags = [], productWeight, spokeBase, variantWeights = [] }) {
    const productHas = has(productWeight);
    const spokeHas = tags.includes('component:spoke') && has(spokeBase);
    const allVariants = variantWeights.length > 0 && variantWeights.every(has);
    return !(productHas || spokeHas || allVariants);
}

module.exports = { weightMissing };
