// lib/fsa-file.js
// FSA price and stock from the dealer files (price list xlsx/csv + instock csv). PURE: no network, no disk, no Shopify.
// Builds on lib/dealer-file.js (reader) and lib/dealer-file-match.js (matcher).
//
// Rules (Jerry, Nov 17 2026):
//   price      = the price list's MAP exactly (lowered when above, raised when below), compare-at cleared. No discount of any kind.
//   stock      = Available above 0: CONTINUE; Available 0 or an empty cell on a listed row (the reader's blankQtyIsZero): DENY.
//                A reference missing from the instock list has no stock information: stock unchanged. FSA wheels are NOT special-order.
//   references = store variant SKU = the FSA part number, matched on letters and digits only (case, spaces, dashes do not matter).
//   no price   = a reference not in the price list gets no price change (stock still follows the instock list when it is there).
//   unmatched  = store variants whose SKU is in neither file (for example the short stem and headset codes) are listed and left alone.
//   tag        = a product tagged "watcher-ignore" is listed as "ignored by tag" and is NOT written on --apply.
// PRIVACY: the price file has a Wholesale column. This module never copies it: rows are rebuilt from reference, description, map and quantity only;
//          nothing downstream (plan, report, undo payload) can contain a wholesale value or a margin.
const { matchDealerFile, refKey } = require('./dealer-file-match');

const MAX_CHANGES = 40;          // more changes than this in one apply need --force
const MIN_FILE_ROWS = 20;        // a price or instock file shorter than this is treated as truncated
const MIN_FOUND_SHARE = 0.5;     // fewer than half of the store's FSA references found in the files = wrong or partial files
const FSA_REF = /^\d{3}-\d/;     // FSA wheel part numbers look like 720-0063186030
const IGNORE_TAG = 'watcher-ignore';

/** one entry per reference from one file; identical repeats merge, repeats that disagree are dropped and listed */
function collapse(rows, field) {
    const by = new Map(); const conflicts = [];
    for (const r of rows) {
        const k = refKey(r.reference); if (!k) continue;
        if (!by.has(k)) { by.set(k, { row: r, bad: false }); continue; }
        const cur = by.get(k); if (cur.row[field] !== r[field]) cur.bad = true;
    }
    const out = new Map();
    for (const [k, v] of by) { if (v.bad) conflicts.push(v.row.reference); else out.set(k, v.row); }
    return { map: out, conflicts };
}

/**
 * @param {object} p
 * @param {Array} p.priceRows  rows from readDealerFile (price list): { reference, description, map, raw }   (dealerCost, if present, is ignored and never copied)
 * @param {Array} p.stockRows  rows from readDealerFile (instock list, read with blankQtyIsZero): { reference, qty }
 * @param {Array} p.variants   store variants: { variantId, productId, productTitle, title, sku, price, compareAt, policy:'CONTINUE'|'DENY', qty, tags:[...], status }
 */
function plan({ priceRows, stockRows, variants }) {
    const prices = collapse(priceRows, 'map'), stocks = collapse(stockRows, 'qty');
    const rows = []; const refs = new Set([...prices.map.keys(), ...stocks.map.keys()]);
    for (const k of refs) {
        const p = prices.map.get(k), s = stocks.map.get(k);
        rows.push({ reference: (p || s).reference, description: (p && p.description) || (s && s.description) || '', msrp: null, map: p && p.map > 0 ? p.map : null, dealerCost: null, qty: s ? (s.qty === undefined ? null : s.qty) : null, line: 0 });
    }
    const mv = variants.map((v) => ({ variantId: v.variantId, productId: v.productId, title: v.title, productTitle: v.productTitle, sku: v.sku, price: v.price, inventoryPolicy: String(v.policy).toLowerCase(), inventoryQuantity: v.qty, tags: [] }));
    const res = matchDealerFile({ rows, variants: mv }, { vendor: 'FSA', referenceField: 'sku', priceSource: 'map', specialOrderTag: '__no_special_order__', baseline: false, flipCap: 100000 });

    const lines = []; const byId = new Map(variants.map((v) => [String(v.variantId), v]));
    const priceBy = new Map(res.price.map((c) => [String(c.variantId), c])), stockBy = new Map(res.stock.map((c) => [String(c.variantId), c]));
    const matched = new Set(res.matches.map((m) => String(m.variantId)));
    for (const v of variants) {
        const id = String(v.variantId); const k = refKey(v.sku);
        const p = prices.map.get(k), s = stocks.map.get(k);
        const ignored = Array.isArray(v.tags) && v.tags.map((t) => String(t).toLowerCase()).includes(IGNORE_TAG);
        const line = { id, productId: v.productId, product: v.productTitle, title: v.title, sku: v.sku, status: v.status, current: { price: v.price, compareAt: v.compareAt, policy: v.policy, qty: v.qty }, map: p && p.map > 0 ? p.map : null, instock: s ? s.qty : null, inPriceList: !!p, inInstockList: !!s, ignoredByTag: ignored, changes: [], notes: [] };
        if (!k) { line.state = 'unmatched'; line.notes.push('the variant has no SKU'); lines.push(line); continue; }
        if (!p && !s) { line.state = 'unmatched'; line.notes.push('SKU is in neither file: left alone'); lines.push(line); continue; }
        line.state = 'matched';
        if (!p) line.notes.push('not in the price list: price not changed');
        else if (!(p.map > 0)) line.notes.push('no MAP in the price list: price not changed');
        if (!s) line.notes.push('not in the instock list: stock not changed');
        const pc = priceBy.get(id); if (pc) line.changes.push({ field: 'price', from: pc.from, to: pc.to, why: pc.to > pc.from ? 'raised to MAP' : 'lowered to MAP' });
        if (line.map && v.compareAt !== null && v.compareAt !== undefined) line.changes.push({ field: 'compareAt', from: Number(v.compareAt), to: null, why: 'MAP is the price: no compare-at' });
        const sc = stockBy.get(id); if (sc) line.changes.push({ field: 'policy', from: v.policy, to: sc.to.toUpperCase(), why: sc.to === 'continue' ? `FSA shows ${sc.qty} available: keep selling` : 'FSA shows none available: stop selling' });
        lines.push(line);
    }
    const refVariants = variants.filter((v) => FSA_REF.test(String(v.sku || '').trim()));
    const found = refVariants.filter((v) => prices.map.has(refKey(v.sku)) || stocks.map.has(refKey(v.sku))).length;
    const refuse = [];
    if (priceRows.length < MIN_FILE_ROWS) refuse.push(`the price file has only ${priceRows.length} rows (under ${MIN_FILE_ROWS}): looks truncated`);
    if (stockRows.length < MIN_FILE_ROWS) refuse.push(`the instock file has only ${stockRows.length} rows (under ${MIN_FILE_ROWS}): looks truncated`);
    if (refVariants.length && found / refVariants.length < MIN_FOUND_SHARE) refuse.push(`only ${found} of ${refVariants.length} store FSA references are in the files (under half): wrong or partial files`);
    const count = (pred) => lines.filter(pred).reduce((n, l) => n + l.changes.length, 0);
    const wheelsNoStore = priceRows.filter((r) => r.raw && /wheel/i.test(String(r.raw.Category || r.raw.category || '')) && !variants.some((v) => refKey(v.sku) === refKey(r.reference))).length;
    return { lines, refuse, changeCount: count((l) => !l.ignoredByTag), ignoredChangeCount: count((l) => l.ignoredByTag), needsForce: count((l) => !l.ignoredByTag) > MAX_CHANGES,
        conflicts: { price: prices.conflicts, stock: stocks.conflicts }, wheelRowsWithNoStoreProduct: wheelsNoStore, fileRows: { price: priceRows.length, instock: stockRows.length }, refVariants: refVariants.length, found };
}

const money = (n) => (n === null || n === undefined ? 'none' : Number(n).toFixed(2));
function formatReport(pl, today) {
    const out = [`FSA PRICE AND STOCK FROM THE DEALER FILES, DRY RUN REPORT (${today || ''})`];
    if (pl.refuse.length) out.push('REFUSED TO WRITE: ' + pl.refuse.join(' | '));
    out.push(`variants checked ${pl.lines.length}; changes that would be written ${pl.changeCount}${pl.needsForce ? ' (more than ' + MAX_CHANGES + ': --force needed)' : ''}; changes on products ignored by tag ${pl.ignoredChangeCount} (not written)`);
    out.push(`files: price list ${pl.fileRows.price} rows, instock list ${pl.fileRows.instock} rows; store FSA references found in the files ${pl.found} of ${pl.refVariants}`);
    if (pl.conflicts.price.length || pl.conflicts.stock.length) out.push('references repeated with different values (not used): ' + [...pl.conflicts.price, ...pl.conflicts.stock].join(', '));
    out.push('');
    for (const l of pl.lines) {
        out.push(`${l.product} / ${l.title} [${l.id}] ${l.status || ''} ${l.state}${l.ignoredByTag ? ' (ignored by tag watcher-ignore)' : ''}`);
        out.push(`   SKU ${l.sku || '-'} | now: price ${money(l.current.price)}, compare-at ${money(l.current.compareAt)}, policy ${l.current.policy}, we hold ${l.current.qty} | MAP ${l.map === null ? 'none' : money(l.map)} | FSA available ${l.instock === null ? 'not listed' : l.instock}`);
        for (const c of l.changes) out.push(`   ${l.ignoredByTag ? 'WOULD CHANGE (ignored by tag, not written)' : 'WOULD CHANGE'} ${c.field}: ${c.field === 'policy' ? c.from : money(c.from)} -> ${c.field === 'policy' ? c.to : money(c.to)} (${c.why})`);
        for (const n of l.notes) out.push(`   note: ${n}`);
    }
    out.push(''); out.push(`price-list wheel rows with no store product: ${pl.wheelRowsWithNoStoreProduct} (not touched)`);
    return out.join('\n') + '\n';
}

/** what the undo file holds: old price, compare-at and policy per variant that will be written. Nothing else. */
function undoPayload(pl, made) {
    return { note: 'Undo for fsa-file-cli --apply. Put these values back: price, compareAt (null = none), inventoryPolicy.', made, variants: pl.lines.filter((l) => !l.ignoredByTag && l.changes.length).map((l) => ({ id: l.id, productId: l.productId, title: l.title, price: l.current.price, compareAt: l.current.compareAt, inventoryPolicy: l.current.policy })) };
}

module.exports = { plan, formatReport, undoPayload, MAX_CHANGES, FSA_REF, IGNORE_TAG };
