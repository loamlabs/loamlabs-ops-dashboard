// lib/components-csv.js
// CSV import for the component library (PURE). Accepts Agent C's two header formats:
//   Block A: ID, Title (with the trailing word Rim), Vendor, Tags, Variant ID, Option1 ...      (format of ll-component-database.json)
//   Block B: shopify_product_id, shopify_variant_id, ProductURL, Title, Vendor, Option1 ...      (format of component-data/rims.json, what the library stores)
// Both are converted to Block B rows. Lines starting with # are comments. Numbers in [number_...] columns become numbers (blank = null), ids become numbers.
const { keyOf, validateRows } = require('./components-store');

function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
        else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === '') && !(r[0] || '').trim().startsWith('#'));
}

const isNumCol = (h) => /\[number_(decimal|integer)\]/.test(h);
function convert(header, cells, isA) {
    const o = {}; header.forEach((h, i) => { o[h] = cells[i] === undefined ? '' : cells[i]; });
    const out = {};
    const idP = isA ? o['ID'] : o['shopify_product_id'], idV = isA ? o['Variant ID'] : o['shopify_variant_id'];
    out.shopify_product_id = /^\d+$/.test(String(idP).trim()) ? Number(idP) : String(idP).trim();
    out.shopify_variant_id = /^\d+$/.test(String(idV).trim()) ? Number(idV) : String(idV).trim();
    out.ProductURL = isA ? '' : o['ProductURL'];
    out.Title = isA ? String(o['Title']).replace(/\s+Rim$/, '') : o['Title'];
    for (const h of header) {
        if (['ID', 'Tags', 'Variant ID', 'shopify_product_id', 'shopify_variant_id', 'ProductURL', 'Title'].includes(h)) continue;
        const v = o[h]; out[h] = isNumCol(h) ? (String(v).trim() === '' ? null : Number(v)) : v;
    }
    return out;
}

/** @returns {{ format:'A'|'B'|null, rows:object[], errors:string[] }} */
function rowsFromCsv(text) {
    const all = parseCsv(text); const errors = []; const blocks = [];
    for (let i = 0; i < all.length;) {
        const h = all[i].map((x) => x.trim());
        const isA = h[0] === 'ID' && h.includes('Variant ID'), isB = h[0] === 'shopify_product_id' && h.includes('shopify_variant_id');
        if (!isA && !isB) { errors.push(`Line ${i + 1}: not a known header (expected Block A "ID,Title,..." or Block B "shopify_product_id,...")`); i++; continue; }
        const rows = []; let j = i + 1; while (j < all.length && !(all[j][0] === 'ID' || all[j][0] === 'shopify_product_id')) { if (all[j].length !== h.length) errors.push(`Row ${j + 1}: ${all[j].length} columns, header has ${h.length}`); else rows.push(convert(h, all[j], isA)); j++; }
        blocks.push({ format: isA ? 'A' : 'B', rows }); i = j;
    }
    const b = blocks.find((x) => x.format === 'B') || blocks[0];   // a file with both blocks holds the same rows twice: use B
    return { format: b ? b.format : null, rows: b ? b.rows : [], errors };
}

/** what importing would do, with the same validation as a save. existing = rows now in the library */
function previewImport(tab, existing, incoming) {
    const have = new Map(existing.map((r) => [keyOf(r), r]));
    const isNew = [], already = [];
    for (const r of incoming) (have.has(keyOf(r)) ? already : isNew).push(r);
    const problems = validateRows(tab, isNew, existing.concat(isNew), existing);
    return { toAdd: isNew, alreadyThere: already, problems, countBefore: existing.length, countAfter: existing.length + (problems.length ? 0 : isNew.length) };
}

module.exports = { parseCsv, rowsFromCsv, previewImport };
