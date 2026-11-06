// lib/signature-build/hub/catalogue.js
// Turns Agent C's hub choice catalogue (data/hub_choice_catalogue.json) into the tool's setup objects (recipe v2), one per product.
// ASSUMED SHAPE (the file did not exist when this was built; see the build report, CONTRACT CHANGE REQUESTS). The tool reads every price, colour,
// stock and freehub value live from the store, so the catalogue only has to name ids:
// {
//   "products": [ { "name": "Reserve 30|DH Mullet", "lengthsKey": "Reserve 30|DH Mullet (29 F / 27.5 R)", "ridingStyle": "mtb",
//                   "frontWheelSize": "29\"", "rearWheelSize": "27.5\"", "spokeCount": "32", "rims": { "front": "<variant id>", "rear": "<variant id>" } } ],
//   "spokes":  { "builderVariantId": "<Sapim Race Black / - variant id>" },
//   "nipples": { "variantId": "<black brass nipple variant id>" },
//   "hubs": [ { "model": "Industry Nine Hydra2", "lengthsName": "Industry Nine Hydra2", "defaultColor": "Black",
//               "frontProducts": { "15x110": "<product id>", "20x110": "<product id>" }, "rearProducts": { "12x148": "<product id>", "12x157": "<product id>" } } ]   // in button order
// }
const { validateHubConfig } = require('./plan');

/** @returns {{configs: object[], problems: string[]}} */
function configsFromCatalogue(cat) {
    const problems = [];
    if (!cat || typeof cat !== 'object') return { configs: [], problems: ['the catalogue is empty or not JSON'] };
    if (!Array.isArray(cat.products) || !cat.products.length) problems.push('the catalogue lists no products');
    if (!cat.spokes || !cat.spokes.builderVariantId) problems.push('the catalogue has no spokes.builderVariantId');
    if (!cat.nipples || !cat.nipples.variantId) problems.push('the catalogue has no nipples.variantId');
    if (!Array.isArray(cat.hubs) || !cat.hubs.length) problems.push('the catalogue lists no hubs');
    if (problems.length) return { configs: [], problems };
    const configs = cat.products.map((p) => ({
        v: 2, kind: 'hub-choice', name: p.name, lengthsKey: p.lengthsKey, ridingStyle: p.ridingStyle || 'mtb',
        specs: { frontWheelSize: p.frontWheelSize, rearWheelSize: p.rearWheelSize, spokeCount: String(p.spokeCount) },
        rims: { front: String(p.rims && p.rims.front), rear: String(p.rims && p.rims.rear) }, spokes: String(cat.spokes.builderVariantId), nipples: String(cat.nipples.variantId),
        ...(p.useSentence ? { useSentence: p.useSentence } : {}),
        hubs: cat.hubs.map((h) => ({ model: h.model, lengthsName: h.lengthsName || h.model, ...(h.defaultColor ? { defaultColor: h.defaultColor } : {}), frontProducts: h.frontProducts, rearProducts: h.rearProducts })),
    }));
    configs.forEach((c) => validateHubConfig(c).forEach((m) => problems.push(`${c.name || '(unnamed product)'}: ${m}`)));
    return { configs, problems };
}

module.exports = { configsFromCatalogue };
