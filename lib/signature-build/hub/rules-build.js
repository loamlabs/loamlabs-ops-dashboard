// lib/signature-build/hub/rules-build.js
// Rim rules for hub choice: one rule per hub x spacing x rim product (contract section B). Pure.
// Fields: the existing ones plus frontHubSpacing, rearHubSpacing, hubColorsAny:true (no hubColors list), hubPriceCents {front, rear},
// frontWheelSize and rearWheelSize on EVERY rule, and a unique readable name equal to the variant's ruleName.
const { productGid, variantGid, stable } = require('../util');
const { parseRules, checkRule } = require('../rules');

const PLACEHOLDER = (key) => `__NEW_VARIANT__${key}`;   // replaced by the real variant gid once the variant exists

/**
 * @param {object} p { name, thisRimProduct, frontRimProduct, rearRimProduct, frontHubProduct, rearHubProduct, spokeProduct, spokeColors,
 *                     labels:{front,rear} (the hub's own spacing labels), sizes:{front,rear}, hubPriceCents:{front,rear}, variantKey }
 */
function buildHubRule(p) {
    const same = String(p.frontRimProduct) === String(p.rearRimProduct);
    const other = String(p.thisRimProduct) === String(p.frontRimProduct) ? p.rearRimProduct : p.frontRimProduct;
    return {
        name: p.name,
        pairedRimProductId: productGid(same ? p.thisRimProduct : other),
        requiredFrontHubProductId: productGid(p.frontHubProduct),
        requiredRearHubProductId: productGid(p.rearHubProduct),
        requiredSpokeProductId: productGid(p.spokeProduct),
        masterVariantGid: PLACEHOLDER(p.variantKey),
        hubColorsAny: true,
        spokeColors: p.spokeColors,
        valves: 'extra',
        freehubLine: true,
        frontHubSpacing: p.labels.front,   // the store's exact Step 2 label for this hub, e.g. "20x110mm (Boost)"
        rearHubSpacing: p.labels.rear,
        hubPriceCents: { front: p.hubPriceCents.front, rear: p.hubPriceCents.rear },
        frontWheelSize: p.sizes.front,
        rearWheelSize: p.sizes.rear,
    };
}

/** Two new rules may never both match one build. Same logic as the existing conflict check, plus the spacing fields. */
function rulesOverlap(a, b) {
    const { conflicts } = require('../rules');
    return conflicts(a, b);
}

/**
 * Mutual exclusion among the new rules of one rim, and conflicts with the rules already on the rim (masters 1 to 10 and the 36 legacy ones).
 * @returns {{ internal: string[], existing: {rule:string, other:string}[], nameExists: string[], notComparable: number }}
 */
function checkHubRules(newRules, existingRules) {
    const internal = [], existing = [], nameExists = [];
    for (let i = 0; i < newRules.length; i++) {
        for (let j = i + 1; j < newRules.length; j++) {
            if (newRules[i].name === newRules[j].name) internal.push(`two rules are both called "${newRules[i].name}"`);
            else if (rulesOverlap(newRules[i], newRules[j])) internal.push(`"${newRules[i].name}" and "${newRules[j].name}" would both match the same build`);
        }
    }
    let notComparable = 0;
    for (const n of newRules) {
        const c = checkRule(n, existingRules);
        c.conflicting.forEach((other) => existing.push({ rule: n.name, other }));
        if (c.nameExists) nameExists.push(n.name);
        notComparable = Math.max(notComparable, c.notComparable);
    }
    return { internal, existing, nameExists, notComparable };
}

/** Append several rules; never touches the others. */
function appendRules(raw, rules) {
    const p = parseRules(raw);
    if (!p.ok) throw new Error(p.error);
    return JSON.stringify([...p.rules, ...rules]);
}

/** Remove this run's rules (by name and master variant). Keeps every other rule. */
function removeRules(raw, pairs) {
    const p = parseRules(raw);
    if (!p.ok) throw new Error(p.error);
    const key = (n, g) => `${n}\u0000${g}`;
    const drop = new Set(pairs.map((x) => key(x.name, x.masterVariantGid)));
    return JSON.stringify(p.rules.filter((r) => !(r && drop.has(key(r.name, r.masterVariantGid)))));
}

/** Replace the placeholder variant gids with the real ones. */
function withRealVariants(rules, gidByKey) {
    return rules.map((r) => {
        const m = /^__NEW_VARIANT__(.+)$/.exec(r.masterVariantGid);
        if (!m) return r;
        if (!gidByKey[m[1]]) throw new Error(`no variant was created for ${m[1]}`);
        return { ...r, masterVariantGid: variantGid(gidByKey[m[1]]) };
    });
}

const rulesFingerprint = (rules) => stable(rules.map((r) => r.name));

module.exports = { buildHubRule, checkHubRules, appendRules, removeRules, withRealVariants, rulesOverlap, rulesFingerprint, PLACEHOLDER };
