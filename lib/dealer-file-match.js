// lib/dealer-file-match.js
// Matches rows of a dealer price/stock file (lib/dealer-file.js) to store variants by the dealer's reference code and produces Watcher-style PROPOSALS.
// Pure: it never writes anything and never calls a network. The caller decides what to do with the proposals.
// BASELINE: proposals start as "would" lines (settings.baseline defaults to true, and a variant tagged 'baseline' is always baseline), exactly like the Vendor Watcher rules.
//
// Variant shape the caller gives (read from the store, not by this module):
//   { variantId, productId, title, productTitle, sku, price (dollars), inventoryPolicy: 'continue' | 'deny', inventoryQuantity, metafields: { 'custom.fsa_reference': '...' }, tags: [...] }
// Settings:
//   vendor            'FSA'                         name used in the lines and for the per-run flip cap
//   referenceField    'sku' | 'metafield:<key>'     where the dealer reference lives on the variant (default 'sku')
//   priceSource       'map' | 'msrp'                our price = the file's MAP, or its MSRP (default 'map')
//   specialOrderTag   'special-order'               a variant with this tag is never closed because the file shows no stock
//   baseline          true                          proposals only
//   flipCap           number                        stock changes per run (default: the Watcher's own cap rule)
const { createFlipLimiter, flipCapFor, groupLines, priceLines } = require('./watcher-safety');

const DEFAULTS = { vendor: 'FSA', referenceField: 'sku', priceSource: 'map', specialOrderTag: 'special-order', baseline: true };
const hasTag = (v, t) => Array.isArray(v && v.tags) && v.tags.map((x) => String(x).toLowerCase()).includes(String(t).toLowerCase());
/** "720-0066186050", " 720 0066186050 ", "720-0066186050 " -> "7200066186050" (case, spaces, dashes, dots and slashes do not matter) */
const refKey = (s) => String(s === null || s === undefined ? '' : s).toUpperCase().replace(/[\s\-._/\\]+/g, '');
const money = (n) => Math.round(Number(n) * 100) / 100;

function variantReference(variant, settings) {
    const f = settings.referenceField || 'sku';
    if (f === 'sku') return variant.sku;
    if (f.startsWith('metafield:')) { const k = f.slice(10); return variant.metafields ? variant.metafields[k] : undefined; }
    return variant[f];
}
const isOpen = (variant) => String(variant.inventoryPolicy || '').toLowerCase() === 'continue';

/** one price per reference when the file repeats it: identical rows merge; different values make it a conflict (nothing is proposed for it) */
function collapseRows(rows, warnings) {
    const by = new Map(); const conflicts = []; const dupes = new Set();
    for (const r of rows || []) {
        const k = refKey(r.reference); if (!k) { warnings.push(`line ${r.line || '?'}: empty reference, skipped`); continue; }
        if (!by.has(k)) { by.set(k, { row: r, lines: [r.line] }); continue; }
        const cur = by.get(k); cur.lines.push(r.line); dupes.add(k);
        const same = ['msrp', 'map', 'dealerCost', 'qty'].every((f) => cur.row[f] === r[f]);
        if (!same) { cur.conflict = true; }
    }
    const out = new Map();
    for (const [k, v] of by) {
        if (v.conflict) { conflicts.push({ reference: v.row.reference, lines: v.lines, reason: 'the file lists this reference more than once with different values' }); continue; }
        if (v.lines.length > 1) warnings.push(`reference ${v.row.reference} is on ${v.lines.length} lines with the same values (lines ${v.lines.join(', ')}); used once`);
        out.set(k, v.row);
    }
    return { rows: out, conflicts };
}

function matchDealerFile({ rows, variants }, userSettings = {}) {
    const settings = { ...DEFAULTS, ...userSettings }; const warnings = [];
    const collapsed = collapseRows(rows, warnings); const fileByKey = collapsed.rows;
    const limiter = createFlipLimiter(Number.isFinite(settings.flipCap) ? settings.flipCap : flipCapFor((variants || []).length));
    const out = { settings, matches: [], price: [], stock: [], unmatchedRows: [], missingFromFile: [], conflicts: collapsed.conflicts, noPriceInFile: [], heldByFlipCap: 0, warnings };

    // variants by reference; a reference held by two variants is ambiguous (nothing proposed for either)
    const varByKey = new Map(); const noRef = [];
    for (const v of variants || []) {
        const k = refKey(variantReference(v, settings)); if (!k) { noRef.push(v); continue; }
        if (!varByKey.has(k)) varByKey.set(k, []); varByKey.get(k).push(v);
    }
    const conflictKeys = new Set(collapsed.conflicts.map((c) => refKey(c.reference)));
    const usedKeys = new Set();
    for (const [k, list] of varByKey) {
        const row = fileByKey.get(k);
        if (conflictKeys.has(k)) { for (const v of list) out.missingFromFile.push({ variantId: v.variantId, title: v.title, reference: variantReference(v, settings), why: 'conflicting rows in the file' }); continue; }
        if (!row) { for (const v of list) out.missingFromFile.push({ variantId: v.variantId, title: v.title, reference: variantReference(v, settings), why: 'no row in this file' }); continue; }
        if (list.length > 1) { warnings.push(`reference ${row.reference} is on ${list.length} store variants (${list.map((v) => v.variantId).join(', ')}): not proposed, fix the references`); usedKeys.add(k); continue; }
        usedKeys.add(k); const v = list[0]; out.matches.push({ variantId: v.variantId, title: v.title, reference: row.reference, line: row.line });
        const baseline = settings.baseline !== false || hasTag(v, 'baseline'); const product = v.productTitle || v.title;

        // ---- price: our price = the file's MAP or MSRP, never below MAP, no site discount is ever applied
        const source = settings.priceSource === 'msrp' ? 'msrp' : 'map'; const want = row[source];
        if (!(want > 0)) { out.noPriceInFile.push({ variantId: v.variantId, title: v.title, reference: row.reference, source }); }
        else {
            let to = money(want); if (row.map > 0 && to < row.map) to = money(row.map);
            const from = money(v.price);
            if (!(to > 0)) { /* nothing */ }
            else if (to !== from) {
                const marginPct = row.dealerCost > 0 ? Math.round(((to - row.dealerCost) / to) * 1000) / 10 : null;
                if (row.dealerCost > 0 && to < row.dealerCost) warnings.push(`${row.reference}: the proposed price $${to.toFixed(2)} is below the dealer cost $${row.dealerCost.toFixed(2)}`);
                out.price.push({ variantId: v.variantId, productId: v.productId, product, title: v.title, reference: row.reference, from, to, source, belowMap: row.map > 0 && from < row.map, marginPct, baseline, action: baseline ? 'would change price' : 'change price' });
            }
        }
        // ---- stock: qty above 0 = available; qty 0 = close selling unless special order; no qty column = nothing
        if (row.qty === null || row.qty === undefined) continue;
        const open = isOpen(v); const wantOpen = row.qty > 0;
        if (wantOpen === open) continue;
        if (!wantOpen && hasTag(v, settings.specialOrderTag)) continue;
        if (!limiter.tryFlip(settings.vendor)) { out.heldByFlipCap++; continue; }
        out.stock.push({ variantId: v.variantId, productId: v.productId, product, title: v.title, reference: row.reference, qty: row.qty, action: wantOpen ? (baseline ? 'would open' : 'open') : (baseline ? 'would close' : 'close'), to: wantOpen ? 'continue' : 'deny', baseline });
    }
    for (const v of noRef) out.missingFromFile.push({ variantId: v.variantId, title: v.title, reference: '', why: 'the variant has no dealer reference (' + settings.referenceField + ')' });
    for (const [k, row] of fileByKey) if (!usedKeys.has(k)) out.unmatchedRows.push({ reference: row.reference, description: row.description, line: row.line, qty: row.qty, map: row.map, msrp: row.msrp });
    out.summary = { fileRows: fileByKey.size, storeVariants: (variants || []).length, matched: out.matches.length, priceChanges: out.price.length, stockChanges: out.stock.length, heldByFlipCap: out.heldByFlipCap, unmatchedRows: out.unmatchedRows.length, missingFromFile: out.missingFromFile.length, conflicts: out.conflicts.length, noPriceInFile: out.noPriceInFile.length, stockInFile: (rows || []).some((r) => r.qty !== null && r.qty !== undefined) };
    if (!out.summary.stockInFile) warnings.push('this file has no quantity column (or it is empty): no stock changes are proposed');
    out.lines = proposalLines(out);
    return out;
}

/** the same grouped lines the Watcher email uses ("Baseline (nothing written)" style): one line per product */
function proposalLines(result) {
    const lines = [];
    groupLines(result.stock.map((s) => ({ product: s.product, action: s.action }))).forEach((l) => lines.push(l));
    const verb = result.price.every((p) => p.baseline) ? 'would change price' : 'price changes proposed';
    priceLines(result.price, verb).forEach((l) => lines.push(l));
    if (result.heldByFlipCap) lines.push(`${result.settings.vendor}: ${result.heldByFlipCap} stock change${result.heldByFlipCap === 1 ? '' : 's'} NOT proposed this run (per-run limit reached). Check the file before the next run.`);
    if (result.unmatchedRows.length) lines.push(`${result.unmatchedRows.length} file row${result.unmatchedRows.length === 1 ? '' : 's'} match no store variant`);
    if (result.missingFromFile.length) lines.push(`${result.missingFromFile.length} store variant${result.missingFromFile.length === 1 ? '' : 's'} not in the file (left as they are)`);
    return lines;
}

module.exports = { DEFAULTS, refKey, variantReference, matchDealerFile, proposalLines };
