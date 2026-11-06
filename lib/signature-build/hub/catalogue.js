// lib/signature-build/hub/catalogue.js
// Turns Agent C's hub choice catalogue (data/hub_choice_catalogue.json, written 2026-11-05) into the tool's setup objects (recipe v2), one per product.
// REAL SHAPE (read from the file):
// { generated, note,
//   hubs: { hydra2|hope|p321|e13|onyx: { model, hubType, rotorMount, defaultColor,
//             spacings: { A|B|C: { exists, frontProduct, rearProduct, colorsBoth[], defaultVariant: {front, rear}, freehubs[], freehubVariantMap{} } } } },
//   hubProducts: { "<product id>": { title, variants: [[color, variantId, price, cost, qty, policy, availableForSale], ...] } },
//   rims: { reserve30dh|fr571: { product, title, v29_32h_black, v27_5_32h_black, ... } },
//   spokes: { product, title, baseVariant_black, ... }, nipples: { product, title, variant_black, ... } }
// The catalogue names ids only; the tool still reads prices, colours, stock, hub data and freehub lists live from the store, so it never trusts the
// catalogue's numbers. The four products, their sizes and the button order are decided here (contract section A), not in the catalogue.
const { validateHubConfig } = require('./plan');

// contract A.1: the four products (rim key and size keys are the catalogue's; lengthsKey is the product name in Backend 1's length table)
const PRODUCTS = [
    { name: 'Reserve 30|DH Mullet', rim: 'reserve30dh', front: 'v29_32h_black', rear: 'v27_5_32h_black', frontWheelSize: '29"', rearWheelSize: '27.5"', lengthsKey: 'Reserve 30|DH Mullet (29 F / 27.5 R)' },
    { name: 'Reserve 30|DH', rim: 'reserve30dh', front: 'v29_32h_black', rear: 'v29_32h_black', frontWheelSize: '29"', rearWheelSize: '29"', lengthsKey: 'Reserve 30|DH 29/29' },
    { name: 'DT Swiss FR 571 Mullet', rim: 'fr571', front: 'v29_32h_black', rear: 'v27_5_32h_black', frontWheelSize: '29"', rearWheelSize: '27.5"', lengthsKey: 'DT Swiss FR 571 Mullet (29 F / 27.5 R)' },
    { name: 'DT Swiss FR 571', rim: 'fr571', front: 'v29_32h_black', rear: 'v29_32h_black', frontWheelSize: '29"', rearWheelSize: '29"', lengthsKey: 'DT Swiss FR 571 29/29' },
];
// contract A.4: button order. [catalogue key, name shown on the page (Option 2 value), name in Backend 1's length table]
const HUB_ORDER = [
    ['hydra2', 'Industry Nine Hydra2', 'Industry Nine Hydra2'],
    ['hope', 'Hope Pro 5', 'Hope Pro 5'],
    ['p321', 'Project321 G3', 'Project321 G3'],
    ['e13', 'e*thirteen', 'e*thirteen Sidekick GR'],
    ['onyx', 'Onyx Vesper', 'Onyx Vesper'],
];

/** Colour name of a variant id inside the catalogue's hubProducts (the default colour is the catalogue's defaultVariant, not a name guess). */
function colourOf(cat, productId, variantId) {
    const p = cat.hubProducts && cat.hubProducts[productId];
    const v = p && p.variants.find((x) => String(x[1]) === String(variantId));
    return v ? v[0] : null;
}

/** @returns {{configs: object[], problems: string[]}} */
function configsFromCatalogue(cat) {
    const problems = [];
    if (!cat || typeof cat !== 'object') return { configs: [], problems: ['the catalogue is empty or not JSON'] };
    if (!cat.hubs || typeof cat.hubs !== 'object') problems.push('the catalogue has no hubs');
    if (!cat.rims) problems.push('the catalogue has no rims');
    if (!cat.spokes || !cat.spokes.baseVariant_black) problems.push('the catalogue has no spokes.baseVariant_black');
    if (!cat.nipples || !cat.nipples.variant_black) problems.push('the catalogue has no nipples.variant_black');
    if (problems.length) return { configs: [], problems };

    const hubs = [];
    for (const [key, shown, lengthsName] of HUB_ORDER) {
        const h = cat.hubs[key];
        if (!h) { problems.push(`the catalogue has no hub "${key}" (${shown})`); continue; }
        const sp = h.spacings || {};
        const A = sp.A, B = sp.B, C = sp.C;
        if (!A || !B || !C) { problems.push(`${shown}: the catalogue lacks spacing A, B or C`); continue; }
        // the same front product must serve A and B (15x110) and the same rear product B and C (12x157); a mismatch is a catalogue error, not a choice
        if (A.exists && B.exists && A.frontProduct !== B.frontProduct) problems.push(`${shown}: spacing A and B name different 15x110 front products`);
        if (B.exists && C.exists && B.rearProduct !== C.rearProduct) problems.push(`${shown}: spacing B and C name different 12x157 rear products`);
        const frontProducts = {}, rearProducts = {};
        if (A.exists) { frontProducts['15x110'] = String(A.frontProduct); rearProducts['12x148'] = String(A.rearProduct); }
        if (B.exists) { frontProducts['15x110'] = String(B.frontProduct); rearProducts['12x157'] = String(B.rearProduct); }
        if (C.exists) { frontProducts['20x110'] = String(C.frontProduct); rearProducts['12x157'] = String(C.rearProduct); }
        const dv = (A.exists ? A : B.exists ? B : C).defaultVariant;
        const dp = (A.exists ? A : B.exists ? B : C).frontProduct;
        const defaultColor = (dv && colourOf(cat, String(dp), dv.front)) || h.defaultColor || 'Black';
        hubs.push({ model: shown, lengthsName, defaultColor, frontProducts, rearProducts });
    }
    if (problems.length) return { configs: [], problems };

    const configs = PRODUCTS.map((p) => {
        const rim = cat.rims[p.rim];
        return {
            v: 2, kind: 'hub-choice', name: p.name, lengthsKey: p.lengthsKey, ridingStyle: 'mtb',
            specs: { frontWheelSize: p.frontWheelSize, rearWheelSize: p.rearWheelSize, spokeCount: '32' },
            rims: { front: String(rim && rim[p.front]), rear: String(rim && rim[p.rear]) }, spokes: String(cat.spokes.baseVariant_black), nipples: String(cat.nipples.variant_black),
            hubs: hubs.map((h) => ({ ...h, frontProducts: { ...h.frontProducts }, rearProducts: { ...h.rearProducts } })),
        };
    });
    configs.forEach((c) => validateHubConfig(c).forEach((m) => problems.push(`${c.name}: ${m}`)));
    return { configs, problems };
}

module.exports = { configsFromCatalogue, PRODUCTS, HUB_ORDER };
