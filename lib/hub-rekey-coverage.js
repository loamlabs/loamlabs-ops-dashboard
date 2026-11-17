// lib/hub-rekey-coverage.js
// PURE. Proves that every library row that links to a product on a "retiring" list is handled by the re-key (moved to the master, or retired), and lists the places in the
// other library files (rims, nipples, spokes, accessories) that mention a retiring hub product.
//   retiring list = redirect_map.csv ("Redirect from" handles) + every master's folded products / folded handles / old handle of the grown product, from the sheets.
const { handleOfUrl } = require('./hub-rekey');
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const vid = (r) => str(r.shopify_variant_id), pid = (r) => str(r.shopify_product_id);

/** redirect_map.csv rows [{from,to}] (paths like /products/handle) + notes rows [{redirect_from_handle, model_id, status_in_plan}] -> Map(handle -> {to, model, status}) */
function redirectIndex(map, notes = []) {
    const m = new Map(); const noteBy = new Map(notes.map((n) => [str(n.redirect_from_handle), n]));
    for (const r of map) { const h = str(r.from).replace(/^\/products\//, ''); if (!h) continue; const n = noteBy.get(h) || {}; m.set(h, { to: str(r.to), model: str(n.model_id), status: str(n.status_in_plan), decision: str(n.decision_flag) }); }
    for (const n of notes) { const h = str(n.redirect_from_handle); if (h && !m.has(h)) m.set(h, { to: str(n.redirect_to_handle), model: str(n.model_id), status: str(n.status_in_plan), decision: str(n.decision_flag) }); }
    return m;
}

/**
 * @param rowsBefore the library hub rows the whole run started from
 * @param vendors    [{ name, masters, logs: [log of rekey()] }] in run order
 * @param redirect   Map from redirectIndex
 */
function hubCoverage({ rowsBefore, vendors, redirect }) {
    const foldedIds = new Set(), grownIds = new Set(), foldedHandles = new Set(), grownHandles = new Set(), masterOfProduct = new Map();
    for (const v of vendors) for (const m of v.masters) {
        if (m.productId) { grownIds.add(m.productId); masterOfProduct.set(m.productId, m.title); }
        (m.foldedProductIds || []).concat(m.oldProductIds || []).forEach((i) => { foldedIds.add(i); masterOfProduct.set(i, m.title); });
        (m.foldedHandles || []).forEach((h) => foldedHandles.add(h)); (m.grownOldHandles || []).forEach((h) => grownHandles.add(h));
    }
    const byId = new Map(), unmatched = [];
    for (const v of vendors) for (const log of v.logs) {
        for (const u of log.updated) byId.set(u.variantId, { how: 'moved in place to the master', detail: u.label });
        for (const r of log.retired) byId.set(r.variantId, { how: r.replacedBy ? 'retired, replaced by a new master row' : 'retired (no master variant exists)', detail: r.replacedBy || r.reason });
        for (const u of log.unmatched) unmatched.push(u);
    }
    const linked = [];
    rowsBefore.forEach((r, i) => {
        const h = handleOfUrl(r.ProductURL);
        const reasons = [];
        if (foldedIds.has(pid(r))) reasons.push('product id is a folded product');
        if (grownIds.has(pid(r))) reasons.push('product id is a master (grown) product');
        if (h && foldedHandles.has(h)) reasons.push('URL is a folded product');
        if (h && grownHandles.has(h)) reasons.push('URL is the old URL of a grown product');
        if (h && redirect.has(h)) reasons.push('URL is on redirect_map.csv');
        if (!reasons.length) return;
        let disp = vid(r) ? byId.get(vid(r)) : null;
        if (!disp) { const um = unmatched.find((u) => u.title === str(r.Title) && u.url === str(r.ProductURL) && u.spoke === str(r['Option1 Value']) && u.variantId === vid(r)); if (um) disp = { how: 'UNMATCHED (listed, nothing changed)', detail: um.reason }; }
        if (!disp) { const rd = h && redirect.get(h); disp = { how: 'NOT HANDLED in this run', detail: rd ? `its product is on redirect_map.csv (${rd.model || 'no model id'}, plan status "${rd.status || 'n/a'}"${rd.decision ? ', decision ' + rd.decision : ''}) but no sheet line moves or retires this row` : 'no sheet line moves or retires this row' }; }
        linked.push({ index: i, vendor: str(r.Vendor), title: str(r.Title), spoke: str(r['Option1 Value']), variantId: vid(r), productId: pid(r), url: str(r.ProductURL), reasons, how: disp.how, detail: disp.detail, master: masterOfProduct.get(pid(r)) || '' });
    });
    const tally = {}; linked.forEach((l) => { tally[l.how] = (tally[l.how] || 0) + 1; });
    return { linked, tally, handled: linked.filter((l) => !/^NOT HANDLED|^UNMATCHED/.test(l.how)).length, notHandled: linked.filter((l) => /^NOT HANDLED|^UNMATCHED/.test(l.how)) };
}

/** other library files: any row that mentions a retiring hub product id, handle or dying variant id (as a whole value, or inside a /products/ URL) */
function otherFileLinks(files, vendors, redirect) {
    const ids = new Set(), handles = new Set(redirect.keys());
    for (const v of vendors) for (const m of v.masters) {
        [m.productId].concat(m.oldProductIds || [], m.foldedProductIds || []).filter(Boolean).forEach((i) => ids.add(i));
        (m.foldedHandles || []).concat(m.grownOldHandles || []).forEach((h) => handles.add(h));
        for (const x of m.variants) (x.replacesIds || []).concat(x.existingId ? [x.existingId] : []).forEach((i) => ids.add(i));
    }
    const out = [];
    for (const [file, rows] of Object.entries(files)) rows.forEach((r, i) => { for (const [k, val] of Object.entries(r)) { const s = str(val); if (!s) continue; const h = handleOfUrl(s); if (ids.has(s) || (h && handles.has(h))) { out.push({ file, row: i, title: str(r.Title), column: k, value: s }); break; } } });
    return out;
}

function formatCoverage(cov, other, label) {
    const o = [`LIBRARY COVERAGE OF RETIRING / FOLDED HUB PRODUCTS ${label || ''}`];
    o.push(`library hub rows linked to a master, a folded product or a redirect_map URL: ${cov.linked.length}; handled ${cov.handled}; not handled or unmatched ${cov.notHandled.length}`);
    o.push('by outcome: ' + Object.entries(cov.tally).map(([k, v]) => `${k} ${v}`).join('; '));
    o.push(''); o.push('NOT HANDLED / UNMATCHED (nothing changed for these):'); for (const l of cov.notHandled) o.push(`  ${l.vendor} | ${l.title} ${l.spoke} [${l.variantId || 'no id'}] ${l.url || 'no url'} | ${l.reasons.join(', ')} | ${l.detail}`); if (!cov.notHandled.length) o.push('  none');
    o.push(''); o.push('EVERY LINKED ROW:'); for (const l of cov.linked) o.push(`  ${l.vendor} | ${l.title} ${l.spoke} [${l.variantId || 'no id'}] ${l.url || 'no url'} | ${l.how}${l.detail ? ' (' + l.detail + ')' : ''}`);
    o.push(''); o.push('OTHER LIBRARY FILES (rims, nipples, spokes, accessories) that mention a retiring hub product id, handle or dying variant id:'); for (const x of other) o.push(`  ${x.file} row ${x.row} ${x.title} | ${x.column} = ${x.value}`); if (!other.length) o.push('  none');
    return o.join('\n') + '\n';
}

module.exports = { redirectIndex, hubCoverage, otherFileLinks, formatCoverage };
