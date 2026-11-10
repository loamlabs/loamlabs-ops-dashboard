// lib/ethirteen-rim.js
// Keeps e*thirteen's rim families apart (DH, EN, GR): a rule for the "DH" rim must not read an "EN" or "GR" variant of the same size. PURE.
// Bug fixed: the rule title was compared in its original case ("DH") against lower-case tokens, so the check never fired.

/** true when the variant belongs to ANOTHER family than the rule's title names (so it must not match) */
function familyConflict(ruleTitle, vendorVariantTitle) {
    const ruleTokens = String(ruleTitle || '').toLowerCase().split(' ');
    const vTokens = String(vendorVariantTitle || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    if (ruleTokens.includes('dh') && !vTokens.includes('dh') && (vTokens.includes('en') || vTokens.includes('gr'))) return true;
    if (ruleTokens.includes('en') && !vTokens.includes('en') && (vTokens.includes('dh') || vTokens.includes('gr'))) return true;
    if (ruleTokens.includes('gr') && !vTokens.includes('gr') && (vTokens.includes('dh') || vTokens.includes('en'))) return true;
    return false;
}

module.exports = { familyConflict };
