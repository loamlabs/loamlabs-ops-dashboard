// lib/signature-build/hub/pricing.js
// Price of one hub-choice variant = the builder's own total for that exact recipe (default colours), minus 10 percent, same method as the masters
// (AGENT_C_PRECONFIGURED_MASTERS_REPORT.md; verified: master 4 list $2,403.00 -> $2,162.70). A manual override per hub wins. Pure.
const { ASSEMBLY, HOOK_FLANGE_FEE, DISCOUNT } = require('./constants');

const lc = (s) => String(s || '').trim().toLowerCase();
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * The builder's assembly fee per wheel for a wheel SET (not a single wheel): hub rate and rim rate, the higher one when both exist,
 * else the one that exists, else the default. Returns { fee, rule } so the plan can say where the number came from.
 */
function assemblyPerWheel(hubVendor, rimVendor, table = ASSEMBLY, opts = {}) {
    const base = assemblyBase(hubVendor, rimVendor, table);
    // HOOK FLANGE: half the fee, rounded up to the next variant that exists; never for a customer's own hub or rim
    const own = lc(hubVendor) === 'your own component' || lc(rimVendor) === 'your own component';
    if (opts.hookFlange && !own && HOOK_FLANGE_FEE[base.fee] !== undefined) {
        const half = HOOK_FLANGE_FEE[base.fee];
        return { fee: half, rule: `${base.rule}; hook flange hub: half the fee rounded up to the next variant ($${base.fee} -> $${half})` };
    }
    return base;
}
function assemblyBase(hubVendor, rimVendor, table) {
    const h = table.hub[lc(hubVendor)];
    const r = table.rim[lc(rimVendor)];
    if (h !== undefined && r !== undefined) return h >= r ? { fee: h, rule: `hub vendor ${hubVendor} ($${h}) is not lower than rim vendor ${rimVendor} ($${r})` } : { fee: r, rule: `rim vendor ${rimVendor} ($${r}) is higher than hub vendor ${hubVendor} ($${h})` };
    if (h !== undefined) return { fee: h, rule: `hub vendor ${hubVendor} ($${h}); the rim vendor ${rimVendor} has no rate in the builder` };
    if (r !== undefined) return { fee: r, rule: `rim vendor ${rimVendor} ($${r}); the hub vendor ${hubVendor} has no rate in the builder` };
    return { fee: table.default, rule: `neither ${hubVendor} nor ${rimVendor} has a rate in the builder, so the default $${table.default}` };
}

// PER-SPOKE: the builder discounts per unit and Shopify floors the 10% discount of ONE unit to the cent ($319.99 -> $288.00, $64.99 -> $58.50, $1.72 -> $1.55),
// so a per-spoke line is (price - floor(10% of price)) x quantity. Whole cents inside, dollars outside.
function discountedUnit(price) {
    const cents = Math.round(Number(price) * 100);
    return (cents - Math.floor(cents / 10)) / 100;
}
/** A wheel's spokes at a per-spoke price: list price and the discounted price (per-unit floor) for `count` spokes. */
function perSpokeWheel(price, count) {
    return { list: round2(Number(price) * count), discounted: round2(discountedUnit(price) * count) };
}

/**
 * @param {object} p { frontRim, rearRim, frontHub, rearHub, spokes, nipples (prices, per wheel for spokes and nipples), hubVendor, rimVendor, override|null }
 * @returns {{assembly:{perWheel:number, rule:string}, listTotal:number, builderPrice:number, price:number, overridden:boolean}}
 */
function variantPrice(p) {
    const a = assemblyPerWheel(p.hubVendor, p.rimVendor, p.table, { hookFlange: !!p.hookFlange });
    // PER-SPOKE (p.perSpoke = { price, frontCount, rearCount } when the spoke variant is a per-spoke one, Length "Each"): spokes = price per spoke x the wheel's count, discounted
    // per unit (floored 10% per spoke); everything else as before. Products without it (p.spokes = one price per wheel) are priced exactly as today.
    const per = p.perSpoke && Number(p.perSpoke.price) > 0 ? { f: perSpokeWheel(p.perSpoke.price, p.perSpoke.frontCount), r: perSpokeWheel(p.perSpoke.price, p.perSpoke.rearCount) } : null;
    const spokesList = per ? per.f.list + per.r.list : 2 * Number(p.spokes);
    const parts = Number(p.frontRim) + Number(p.rearRim) + Number(p.frontHub) + Number(p.rearHub) + spokesList + 2 * Number(p.nipples);
    const listTotal = round2(parts + 2 * a.fee);
    const builderPrice = per ? round2(round2((listTotal - spokesList) * (1 - DISCOUNT)) + per.f.discounted + per.r.discounted) : round2(listTotal * (1 - DISCOUNT));
    const overridden = typeof p.override === 'number' && p.override > 0;
    return { assembly: { perWheel: a.fee, rule: a.rule }, listTotal, builderPrice, price: overridden ? round2(p.override) : builderPrice, overridden, ...(per ? { perSpoke: { front: per.f, rear: per.r } } : {}) };
}
module.exports = { assemblyPerWheel, variantPrice, discountedUnit, perSpokeWheel, round2 };
