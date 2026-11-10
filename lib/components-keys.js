// lib/components-keys.js
// Row identity for the tab (PURE, safe in the browser). The edit drawer used to remember a row by its position in the list; after any other save the
// positions shift and the wrong row could be overwritten. Now a row is found by its stable _rid first, then by its Shopify variant id, then by title + options.
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const variantId = (r) => str(r && (r.shopify_variant_id || r['Variant ID']));

/** index of the row in the list, or -1. Never uses a remembered position. */
function findRowIndex(rows, row) {
    if (!row) return -1;
    if (row._rid) { const i = rows.findIndex((r) => r && r._rid === row._rid); if (i >= 0) return i; }
    const v = variantId(row);
    if (v) {
        const hits = rows.map((r, i) => (variantId(r) === v ? i : -1)).filter((i) => i >= 0);
        if (hits.length === 1) return hits[0];
        if (hits.length > 1) { const t = hits.find((i) => str(rows[i].Title) === str(row.Title) && str(rows[i]['Option1 Value']) === str(row['Option1 Value']) && str(rows[i]['Option2 Value']) === str(row['Option2 Value'])); return t === undefined ? -1 : t; }
    }
    return rows.findIndex((r) => r && str(r.Title) === str(row.Title) && str(r.Vendor) === str(row.Vendor) && str(r['Option1 Value']) === str(row['Option1 Value']) && str(r['Option2 Value']) === str(row['Option2 Value']));
}

/** old/legacy keys that a save used to delete silently */
const LEGACY_KEYS = ['Wheel Spec Position', 'wheel_spec_position', 'Rim Size', 'Rim size', 'rim_size', 'Weight G', 'Weight g', 'weight_g', 'Weight G (p)', 'Weight G (v)', 'Weight G (P)', 'Weight G (V)', 'Rim ERD', 'Rim Erd', 'rim_erd', 'Name', 'name'];
/** { key: number of rows that have a value in it } */
function findLegacyKeys(rows) {
    const out = {};
    for (const r of rows || []) { if (!r) continue; for (const k of LEGACY_KEYS) if (k in r && str(r[k]) !== '') out[k] = (out[k] || 0) + 1; }
    return out;
}
/** remove the legacy keys (only when the person has said yes) */
function stripLegacyKeys(rows) { return rows.map((r) => { if (!r) return r; const c = { ...r }; LEGACY_KEYS.forEach((k) => delete c[k]); return c; }); }

module.exports = { findRowIndex, findLegacyKeys, stripLegacyKeys, LEGACY_KEYS };
