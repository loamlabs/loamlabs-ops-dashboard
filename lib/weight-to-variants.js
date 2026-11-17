// lib/weight-to-variants.js
// Moving component weights from the PRODUCT level (custom.weight_g on the product) to the VARIANT level (custom.weight_g on each variant). PURE: no network, no disk.
//   planCopy   step 1: copy a product's weight to every variant that has NO weight of its own
//   planClear  step 2: clear the product-level weight, only where every variant now has a weight that equals it
// (Deleting the metafield DEFINITION is a manual admin step after every reader is proven; it is not built.)
//
// Rules: never overwrite an existing variant weight; a product that has any variant weight different from its product weight is a CONFLICT and is held whole
// (nothing is copied for it) and listed; spokes are held because their product weight is a BASE weight for a 260 mm spoke that the builder scales by length;
// nothing is skipped silently: every product that has a product-level weight appears in the result with a status and a reason.

const SPOKE_REASON = 'spoke weight is a base weight for a 260 mm spoke (the builder and calculator scale it by length): copying it to every length variant would show wrong weights; needs a separate decision';

const num = (v) => { const s = v === undefined || v === null ? '' : String(v).trim(); if (!s) return null; const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? n : NaN; };   // null = empty, NaN = unreadable or not above 0
const same = (a, b) => Math.abs(a - b) < 1e-9;

/** product type from tags and Shopify product type: component:<x> (hub, rim, spoke, nipple, freehub, valvestem), accessory, wheelset, other */
function componentType(tags, productType) {
    const c = (tags || []).find((t) => /^component:/i.test(t)); if (c) return c.split(':')[1].toLowerCase();
    if ((tags || []).map((t) => String(t).toLowerCase()).includes('accessory')) return 'accessory';
    if (/wheelset/i.test(productType || '')) return 'wheelset';
    return 'other';
}

function filterProducts(products, { types, vendors, handles } = {}) {
    const lc = (a) => (a || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    const T = lc(types), V = lc(vendors), H = lc(handles);
    return products.filter((p) => (!T.length || T.includes(String(p.type).toLowerCase())) && (!V.length || V.includes(String(p.vendor || '').toLowerCase())) && (!H.length || H.includes(String(p.handle).toLowerCase())));
}

/**
 * @param {Array} products { id, handle, title, vendor, type, productWeight, variants: [{ id, title, weight }] }
 * @returns {{rows, counts, toChange, refuse}}
 */
function planCopy(products, opts = {}) {
    const rows = []; const maxProducts = opts.maxProducts || 40;
    const scoped = filterProducts(products, opts);
    for (const p of scoped) {
        const pw = num(p.productWeight);
        const base = { id: p.id, handle: p.handle, type: p.type, vendor: p.vendor, productWeight: p.productWeight, variants: p.variants.length };
        if (pw === null) { rows.push({ ...base, status: 'no_product_weight', reason: 'no product-level weight: nothing to copy', copyTo: [], conflicts: [] }); continue; }
        if (Number.isNaN(pw)) { rows.push({ ...base, status: 'invalid_weight', reason: `product weight "${p.productWeight}" is not a number above 0`, copyTo: [], conflicts: [] }); continue; }
        if (p.type === 'spoke') { rows.push({ ...base, status: 'held_type', reason: SPOKE_REASON, copyTo: [], conflicts: [] }); continue; }
        if (!p.variants.length) { rows.push({ ...base, status: 'no_variants', reason: 'the product has no variants', copyTo: [], conflicts: [] }); continue; }
        const conflicts = [], copyTo = [], unreadable = [];
        for (const v of p.variants) {
            const w = num(v.weight);
            if (w === null) copyTo.push({ id: v.id, title: v.title });
            else if (Number.isNaN(w)) unreadable.push({ id: v.id, title: v.title, weight: v.weight });
            else if (!same(w, pw)) conflicts.push({ id: v.id, title: v.title, weight: v.weight });
        }
        if (conflicts.length || unreadable.length) rows.push({ ...base, status: 'held_conflict', reason: conflicts.length ? `${conflicts.length} variant(s) have a weight that differs from the product weight ${p.productWeight}; nothing copied for this product` : `${unreadable.length} variant weight(s) are not readable numbers`, copyTo: [], conflicts: conflicts.concat(unreadable) });
        else if (!copyTo.length) rows.push({ ...base, status: 'nothing_to_do', reason: 'every variant already has a weight equal to the product weight', copyTo: [], conflicts: [] });
        else rows.push({ ...base, status: 'copy', reason: `${copyTo.length} of ${p.variants.length} variants get ${p.productWeight}`, copyTo, conflicts: [] });
    }
    const counts = {}; rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const toChange = rows.filter((r) => r.status === 'copy').length;
    const refuse = []; if (toChange > maxProducts) refuse.push(`${toChange} products would change (more than ${maxProducts}): --force needed`);
    return { rows, counts, toChange, variantsToWrite: rows.reduce((n, r) => n + r.copyTo.length, 0), refuse, scoped: scoped.length };
}

function planClear(products, opts = {}) {
    const rows = []; const maxProducts = opts.maxProducts || 40; const scoped = filterProducts(products, opts);
    for (const p of scoped) {
        const pw = num(p.productWeight);
        const base = { id: p.id, handle: p.handle, type: p.type, vendor: p.vendor, productWeight: p.productWeight, variants: p.variants.length };
        if (pw === null) { rows.push({ ...base, status: 'no_product_weight', reason: 'no product-level weight: nothing to clear' }); continue; }
        if (Number.isNaN(pw)) { rows.push({ ...base, status: 'invalid_weight', reason: `product weight "${p.productWeight}" is not a number above 0: not touched` }); continue; }
        if (p.type === 'spoke') { rows.push({ ...base, status: 'held_type', reason: SPOKE_REASON }); continue; }
        if (!p.variants.length) { rows.push({ ...base, status: 'no_variants', reason: 'the product has no variants: not cleared' }); continue; }
        const ws = p.variants.map((v) => num(v.weight));
        const missing = ws.filter((w) => w === null || Number.isNaN(w)).length;
        if (missing) { rows.push({ ...base, status: 'held_variants_missing', reason: `${missing} of ${p.variants.length} variants have no readable weight of their own: the product value is still their fallback` }); continue; }
        const differ = ws.filter((w) => !same(w, pw)).length;
        if (differ) { rows.push({ ...base, status: 'held_differs', reason: `every variant has its own weight but ${differ} differ from the product value ${p.productWeight} (nothing depends on the product value; clearing is safe on Jerry's word, not done by this command)` }); continue; }
        rows.push({ ...base, status: 'clear', reason: `all ${p.variants.length} variants hold ${p.productWeight}` });
    }
    const counts = {}; rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const toChange = rows.filter((r) => r.status === 'clear').length;
    const refuse = []; if (toChange > maxProducts) refuse.push(`${toChange} products would change (more than ${maxProducts}): --force needed`);
    return { rows, counts, toChange, refuse, scoped: scoped.length };
}

/**
 * STEP 3 (spokes): clear the OLD product-level weight_g of a spoke product, only when the NEW product-level spoke_base_weight_g exists and is equal.
 * Only spoke products are looked at (the scope is forced to type spoke). Nothing else about the spoke weight changes: the new field stays.
 * @param {Array} products as for planClear, plus spokeBase (text of custom.spoke_base_weight_g or null)
 */
function planClearSpokeOld(products, opts = {}) {
    const rows = []; const maxProducts = opts.maxProducts || 40; const scoped = filterProducts(products, { ...opts, types: ['spoke'] });
    for (const p of scoped) {
        const pw = num(p.productWeight), sb = num(p.spokeBase);
        const base = { id: p.id, handle: p.handle, type: p.type, vendor: p.vendor, productWeight: p.productWeight, spokeBase: p.spokeBase === undefined ? null : p.spokeBase, variants: p.variants.length };
        if (pw === null) { rows.push({ ...base, status: 'no_product_weight', reason: 'no old product-level weight_g: nothing to clear' }); continue; }
        if (Number.isNaN(pw)) { rows.push({ ...base, status: 'invalid_weight', reason: `old product weight "${p.productWeight}" is not a number above 0: not touched` }); continue; }
        if (sb === null) { rows.push({ ...base, status: 'held_no_base', reason: 'spoke_base_weight_g is missing on this product: the old weight_g is still the only base weight, not cleared' }); continue; }
        if (Number.isNaN(sb)) { rows.push({ ...base, status: 'held_no_base', reason: `spoke_base_weight_g "${p.spokeBase}" is not a number above 0: not cleared` }); continue; }
        if (!same(sb, pw)) { rows.push({ ...base, status: 'held_differs', reason: `spoke_base_weight_g ${p.spokeBase} differs from the old weight_g ${p.productWeight}: not cleared (Jerry decides which one is right)` }); continue; }
        rows.push({ ...base, status: 'clear', reason: `spoke_base_weight_g ${p.spokeBase} equals the old weight_g ${p.productWeight}` });
    }
    const counts = {}; rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const toChange = rows.filter((r) => r.status === 'clear').length;
    const refuse = []; if (toChange > maxProducts) refuse.push(`${toChange} products would change (more than ${maxProducts}): --force needed`);
    return { rows, counts, toChange, refuse, scoped: scoped.length, spokeOld: true };
}

function formatCopy(pl, today) {
    const out = [`WEIGHT TO VARIANTS, STEP 1 (copy product weight to variants without one), DRY RUN REPORT ${today || ''}`];
    out.push(`products in scope ${pl.scoped}; ${Object.entries(pl.counts).map(([k, v]) => k + ' ' + v).join(', ')}; would change ${pl.toChange} products, ${pl.variantsToWrite} variants`);
    if (pl.refuse.length) out.push('REFUSED TO WRITE: ' + pl.refuse.join(' | '));
    for (const r of pl.rows.filter((x) => x.status !== 'no_product_weight')) {
        out.push(`${r.status.toUpperCase()} | ${r.type} | ${r.vendor} | ${r.handle} | product weight ${r.productWeight} | ${r.variants} variants | ${r.reason}`);
        for (const c of r.conflicts) out.push(`     conflict: variant "${c.title}" has ${c.weight}`);
    }
    const none = pl.rows.filter((x) => x.status === 'no_product_weight'); if (none.length) { const by = {}; none.forEach((r) => { by[r.type] = (by[r.type] || 0) + 1; }); out.push(`products with no product-level weight (out of scope here): ${Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ')}`); }
    return out.join('\n') + '\n';
}
function formatClear(pl, today) {
    const out = [pl.spokeOld ? `WEIGHT TO VARIANTS, STEP 3 (clear the OLD spoke product weight_g where spoke_base_weight_g is equal), DRY RUN REPORT ${today || ''}` : `WEIGHT TO VARIANTS, STEP 2 (clear the product-level weight), DRY RUN REPORT ${today || ''}`];
    out.push(`products in scope ${pl.scoped}; ${Object.entries(pl.counts).map(([k, v]) => k + ' ' + v).join(', ')}; would clear ${pl.toChange} products`);
    if (pl.refuse.length) out.push('REFUSED TO WRITE: ' + pl.refuse.join(' | '));
    for (const r of pl.rows.filter((x) => x.status !== 'no_product_weight')) out.push(`${r.status.toUpperCase()} | ${r.type} | ${r.vendor} | ${r.handle} | product weight ${r.productWeight}${pl.spokeOld ? " | base " + r.spokeBase : ""} | ${r.variants} variants | ${r.reason}`);
    return out.join('\n') + '\n';
}

/** undo payloads (written BEFORE any write) */
function undoCopy(pl, made) { return { action: 'copy', note: 'Undo: delete custom.weight_g on each variant listed (they had none before).', made, variants: pl.rows.filter((r) => r.status === 'copy').flatMap((r) => r.copyTo.map((v) => ({ variantId: v.id, productId: r.id, handle: r.handle, written: r.productWeight }))) }; }
function undoClear(pl, made) { return { action: 'clear', note: 'Undo: set custom.weight_g (number_decimal) back on each product listed.', made, products: pl.rows.filter((r) => r.status === 'clear').map((r) => ({ productId: r.id, handle: r.handle, value: r.productWeight })) }; }

module.exports = { componentType, filterProducts, planCopy, planClear, planClearSpokeOld, formatCopy, formatClear, undoCopy, undoClear, SPOKE_REASON };
