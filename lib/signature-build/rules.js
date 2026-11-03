// lib/signature-build/rules.js
// Rim rules (custom.pre_configured_wheel_rules): build, conflict check, append (never replace), remove.
const { productGid, variantGid } = require('./util');

function parseRules(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: true, rules: [] };
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) return { ok: false, error: 'the stored rules are not a list' };
        return { ok: true, rules: v };
    } catch (e) {
        return { ok: false, error: 'the stored rules are not valid JSON' };
    }
}

const lower = (a) => (Array.isArray(a) ? a.map((x) => String(x).toLowerCase()) : []);

/** Empty / missing list = every colour. Two lists overlap when they share a colour, or either is "every colour". */
function coloursOverlap(a, b) {
    const x = lower(a), y = lower(b);
    if (x.length === 0 || y.length === 0) return true;
    return x.some((c) => y.includes(c));
}

/** An unset size matches anything; two different set sizes never match the same build. */
function sizesCompatible(a, b) {
    return ['frontWheelSize', 'rearWheelSize'].every((k) => !(a[k] && b[k] && a[k] !== b[k]));
}

const hasProductIds = (r) => !!(r && r.requiredFrontHubProductId && r.requiredRearHubProductId && r.requiredSpokeProductId);

/** Does existing rule E match some of the same builds as new rule N? (false when E cannot be compared) */
function conflicts(n, e) {
    if (!hasProductIds(e)) return false;
    return n.requiredFrontHubProductId === e.requiredFrontHubProductId
        && n.requiredRearHubProductId === e.requiredRearHubProductId
        && n.requiredSpokeProductId === e.requiredSpokeProductId
        && n.pairedRimProductId === e.pairedRimProductId
        && coloursOverlap(n.hubColors, e.hubColors)
        && coloursOverlap(n.spokeColors, e.spokeColors)
        && sizesCompatible(n, e);
}

/**
 * @returns {{ conflicting:string[], nameExists:boolean, notComparable:number }}
 */
function checkRule(newRule, existing) {
    return {
        conflicting: existing.filter((e) => conflicts(newRule, e)).map((e) => e.name || '(unnamed rule)'),
        nameExists: existing.some((e) => e && e.name === newRule.name),
        notComparable: existing.filter((e) => !hasProductIds(e)).length,
    };
}

/**
 * Build the rule object.
 * @param {object} p { name, masterVariantId, frontRimProduct, rearRimProduct, thisRimProduct, frontHubProduct, rearHubProduct, spokeProduct, hubColors, spokeColors, specs? }
 */
function buildRule(p) {
    const same = p.frontRimProduct === p.rearRimProduct;
    const other = p.thisRimProduct === p.frontRimProduct ? p.rearRimProduct : p.frontRimProduct;
    const rule = {
        name: p.name,
        pairedRimProductId: productGid(same ? p.thisRimProduct : other),
        requiredFrontHubProductId: productGid(p.frontHubProduct),
        requiredRearHubProductId: productGid(p.rearHubProduct),
        requiredSpokeProductId: productGid(p.spokeProduct),
        masterVariantGid: variantGid(p.masterVariantId),
        hubColors: p.hubColors,
        spokeColors: p.spokeColors,
        valves: 'extra',
        freehubLine: true,
    };
    if (p.specs) { rule.frontWheelSize = p.specs.frontWheelSize; rule.rearWheelSize = p.specs.rearWheelSize; }
    return rule;
}

/** Append one rule to the stored value. Returns the new raw string. Never touches the other rules. */
function appendRule(raw, rule) {
    const parsed = parseRules(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    return JSON.stringify([...parsed.rules, rule]);
}

/** Remove this run's rule (by name + master variant) from the stored value. Keeps every other rule. */
function removeRule(raw, name, masterVariantGid) {
    const parsed = parseRules(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    return JSON.stringify(parsed.rules.filter((r) => !(r && r.name === name && r.masterVariantGid === masterVariantGid)));
}

module.exports = { parseRules, checkRule, conflicts, buildRule, appendRule, removeRule, coloursOverlap, sizesCompatible, hasProductIds };
