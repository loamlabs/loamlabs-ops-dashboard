// lib/freehub-lists.js
// "freehub-follow" for the move from the PRODUCT metafields custom.freehub to the VARIANT versions (same name, type and format).
// PURE (no network). The Watcher reads the product list AND the variant lists of a hub and writes both, so nothing goes stale in either world.
//
//   resolveFreehubLists({ productRaw, variants })  -> what the hub's current list is, and which of its places hold a list
//   planFreehubWrites({ hub, newList, newWatch, curWatch })  -> exactly what to write (nothing for a list that did not change)
//
// Rules (Jerry, Nov 2026):
//   - current list = the product list if there is one, else the variant lists (they must all be equal);
//   - the product list and every variant list that exists must hold the same values (order does not matter), otherwise the hub is SKIPPED with a warning;
//   - a change is written to the product list (while it exists) and to every variant that ALREADY has a list; a variant list is NEVER created on a hub that has none
//     (the hub page treats "this variant has a list" as authoritative, so a half-written hub would be dangerous; creating them is the later data move);
//   - the Watcher's own note custom.freehub_watch stays on the PRODUCT; custom.freehub_variant_map is never touched here.

const KEY = 'freehub';
const LIST_TYPE = 'list.single_line_text_field';

/** a metafield value string -> array of strings, or undefined when it is not a JSON array of strings */
function parseList(raw) {
    if (raw === null || raw === undefined || raw === '') return null;           // no metafield
    try { const v = JSON.parse(raw); return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : undefined; } catch (e) { return undefined; }
}
const sameMembers = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * @param {{ productRaw: string|null, variants: Array<{ id: string|number, raw: string|null }> }} o  raw = the metafield value as Shopify holds it (null = none)
 * @returns {{ status: 'ok'|'none'|'disagree'|'unreadable', reason?: string, list: string[]|null, productHasList: boolean, variantsWithList: Array<{id, raw, list}> }}
 */
function resolveFreehubLists({ productRaw, variants }) {
    const productList = parseList(productRaw);
    const vs = (variants || []).map((v) => ({ id: v.id, raw: v.raw === undefined ? null : v.raw, list: parseList(v.raw) }));
    const variantsWithList = vs.filter((v) => v.raw !== null && v.raw !== '');
    const productHasList = productRaw !== null && productRaw !== undefined && productRaw !== '';
    if (productHasList && productList === undefined) return { status: 'unreadable', reason: 'the product freehub list is not a list of text values', list: null, productHasList, variantsWithList };
    const bad = variantsWithList.find((v) => v.list === undefined);
    if (bad) return { status: 'unreadable', reason: `the freehub list of variant ${bad.id} is not a list of text values`, list: null, productHasList, variantsWithList };
    const vLists = variantsWithList.map((v) => v.list);
    if (productHasList) {
        const off = variantsWithList.filter((v) => !sameMembers(v.list, productList));
        if (off.length) return { status: 'disagree', reason: `the product list ${JSON.stringify(productList)} and ${off.length} variant list(s) differ (for example variant ${off[0].id}: ${JSON.stringify(off[0].list)})`, list: null, productHasList, variantsWithList };
        return { status: 'ok', list: productList, productHasList, variantsWithList };
    }
    if (!vLists.length) return { status: 'none', list: null, productHasList: false, variantsWithList };
    const first = vLists[0];
    if (vLists.some((l) => !sameMembers(l, first))) return { status: 'disagree', reason: 'the variant lists differ from each other and there is no product list', list: null, productHasList: false, variantsWithList };
    return { status: 'ok', list: first, productHasList: false, variantsWithList };
}

/**
 * @param {{ hub: object (resolveFreehubLists, status ok), newList: string[], newWatch: object, curWatch: object|null, listChanged: boolean }} o
 * @returns {{ productEntries: Array<{key,type,value}>, variantIds: Array, variantEntry: {key,type,value}|null, writesAnything: boolean }}
 */
function planFreehubWrites({ hub, newList, newWatch, curWatch, listChanged }) {
    const watchValue = JSON.stringify(newWatch);
    const watchChanged = JSON.stringify(newWatch) !== JSON.stringify(curWatch);
    const productEntries = [];
    let variantIds = [], variantEntry = null;
    if (listChanged) {
        const value = JSON.stringify(newList);
        if (hub.productHasList) productEntries.push({ key: KEY, type: LIST_TYPE, value });
        variantIds = hub.variantsWithList.map((v) => v.id);                       // only variants that ALREADY have a list
        variantEntry = variantIds.length ? { key: KEY, type: LIST_TYPE, value } : null;
        productEntries.push({ key: 'freehub_watch', type: 'json', value: watchValue });   // the note moves with the change, on the product
    } else if (watchChanged) {
        productEntries.push({ key: 'freehub_watch', type: 'json', value: watchValue }); // an observation only: nothing about the list is written
    }
    return { productEntries, variantIds, variantEntry, writesAnything: productEntries.length > 0 || variantIds.length > 0 };
}

module.exports = { KEY, LIST_TYPE, parseList, sameMembers, resolveFreehubLists, planFreehubWrites };
