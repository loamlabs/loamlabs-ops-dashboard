// lib/signature-build/hub/pricing.js
// Price of one hub-choice variant = the builder's own total for that exact recipe (default colours), minus 10 percent, same method as the masters
// (AGENT_C_PRECONFIGURED_MASTERS_REPORT.md; verified: master 4 list $2,403.00 -> $2,162.70). A manual override per hub wins. Pure.
const { ASSEMBLY, DISCOUNT } = require('./constants');

const lc = (s) => String(s || '').trim().toLowerCase();
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * The builder's assembly fee per wheel for a wheel SET (not a single wheel): hub rate and rim rate, the higher one when both exist,
 * else the one that exists, else the default. Returns { fee, rule } so the plan can say where the number came from.
 */
function assemblyPerWheel(hubVendor, rimVendor, table = ASSEMBLY) {
    const h = table.hub[lc(hubVendor)];
    const r = table.rim[lc(rimVendor)];
    if (h !== undefined && r !== undefined) return h >= r ? { fee: h, rule: `hub vendor ${hubVendor} ($${h}) is not lower than rim vendor ${rimVendor} ($${r})` } : { fee: r, rule: `rim vendor ${rimVendor} ($${r}) is higher than hub vendor ${hubVendor} ($${h})` };
    if (h !== undefined) return { fee: h, rule: `hub vendor ${hubVendor} ($${h}); the rim vendor ${rimVendor} has no rate in the builder` };
    if (r !== undefined) return { fee: r, rule: `rim vendor ${rimVendor} ($${r}); the hub vendor ${hubVendor} has no rate in the builder` };
    return { fee: table.default, rule: `neither ${hubVendor} nor ${rimVendor} has a rate in the builder, so the default $${table.default}` };
}

/**
 * @param {object} p { frontRim, rearRim, frontHub, rearHub, spokes, nipples (prices, per wheel for spokes and nipples), hubVendor, rimVendor, override|null }
 * @returns {{assembly:{perWheel:number, rule:string}, listTotal:number, builderPrice:number, price:number, overridden:boolean}}
 */
function variantPrice(p) {
    const a = assemblyPerWheel(p.hubVendor, p.rimVendor, p.table);
    const parts = Number(p.frontRim) + Number(p.rearRim) + Number(p.frontHub) + Number(p.rearHub) + 2 * Number(p.spokes) + 2 * Number(p.nipples);
    const listTotal = round2(parts + 2 * a.fee);
    const builderPrice = round2(listTotal * (1 - DISCOUNT));
    const overridden = typeof p.override === 'number' && p.override > 0;
    return { assembly: { perWheel: a.fee, rule: a.rule }, listTotal, builderPrice, price: overridden ? round2(p.override) : builderPrice, overridden };
}

module.exports = { assemblyPerWheel, variantPrice, round2 };
