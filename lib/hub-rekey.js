// lib/hub-rekey.js
// Re-keys the component library's hub rows for a MASTER hub product (one product with several spacings and colours). PURE: no network, no disk, no Shopify.
// Input: the library hub rows, and the master definitions read from Agent C's build sheet (products.csv + variants.csv). Output: the new rows, a change list and checks.
//
// Rules (Jerry, Nov 2026; plan AGENT_BACKEND2_HUB_LIBRARY_REKEY_PLAN.md):
//   - One library row per master x hub_spacing x spoke count (colours share a row). Its variant id is the representative variant: the Black one, or the first.
//   - A row that already exists for a KEPT variant is UPDATED IN PLACE: master product id, new ProductURL, master title, hub_spacing, riding_style. Its numbers are never changed
//     (a difference from the sheet is only reported as drift).
//   - A spacing x spoke count with no row gets a NEW row cloned from the master's existing row, with the sheet's numbers, and is inserted right after the master's rows.
//   - The rows of variants that LOSE their id (the sheet says "replaces <id>" or "from draft <id>") are marked Status "retired": kept in the file with their id, never deleted.
//     The customer page and the calculator hide retired rows (the API filters Status; that is a separate code change).
//   - Weight is written to the variant column only; the product weight column stays empty for new rows.
//   - hub_spacing must be one of the store's choices (when the list is given). New variant ids come from a map (real ids exist only after Agent C's apply);
//     without one a PLACEHOLDER id is used and the result is marked as a dry run.
const { parseCsv } = require('./components-csv');

const PW = 'Metafield: custom.weight_g [number_decimal]', VW = 'Variant Metafield: custom.weight_g [number_decimal]';
const COL = {
    dl: 'Metafield: custom.hub_flange_diameter_left [number_decimal]', dr: 'Metafield: custom.hub_flange_diameter_right [number_decimal]',
    ol: 'Metafield: custom.hub_flange_offset_left [number_decimal]', or: 'Metafield: custom.hub_flange_offset_right [number_decimal]',
    hole: 'Metafield: custom.hub_spoke_hole_diameter [number_decimal]', pos: 'Variant Metafield: custom.wheel_spec_position [single_line_text_field]',
    spl: 'Variant Metafield: custom.hub_sp_offset_spoke_hole_left [number_decimal]', spr: 'Variant Metafield: custom.hub_sp_offset_spoke_hole_right [number_decimal]',
    mx: 'Variant Metafield: custom.hub_manual_cross_value [number_decimal]', cl: 'Variant Metafield: custom.hub_lacing_cross_left [number_decimal]', cr: 'Variant Metafield: custom.hub_lacing_cross_right [number_decimal]',
};
const SHEET_TO_COL = { hub_flange_diameter_left: 'dl', hub_flange_diameter_right: 'dr', hub_flange_offset_left: 'ol', hub_flange_offset_right: 'or', hub_spoke_hole_diameter: 'hole', hub_sp_offset_spoke_hole_left: 'spl', hub_sp_offset_spoke_hole_right: 'spr', hub_manual_cross_value: 'mx', hub_lacing_cross_left: 'cl', hub_lacing_cross_right: 'cr' };
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const isEmpty = (v) => str(v) === '';
const asNum = (v) => { const s = str(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const SHOP_URL = 'https://loamlabsusa.com/products/';

function table(text) { const t = parseCsv(text); const h = t[0].map((x) => x.trim()); return t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]]))); }

/** the sheet files -> masters [{ title, handle, productId, oldProductIds, foldedProductIds, retireHandles, variants:[{status, existingId, replacesId, replacesIds, foldedFrom, spokeCount, color, spacing, riding, position, sheet:{...numbers}}] }]
 *  Two sheet formats: the Spank files (variants: existing_variant_id, "NEW (replaces <id>)") and the generic vendor sheets of master_apply.mjs
 *  (variants: master_variant_id_if_kept, folded_from_product_id, old_variant_id_that_dies; products: product_id_to_grow, handles_to_retire_and_redirect, product_ids_to_DRAFT_after_overlap). */
const ids = (v) => (String(v || '').match(/\d+/g) || []);
const handlesOf = (v) => String(v || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).map((x) => x.replace(/^\/products\//, '').trim()).filter((x) => /^[a-z0-9][a-z0-9-]*$/.test(x));
function loadMasters(productsCsv, variantsCsv) {
    const prods = table(productsCsv), vars = table(variantsCsv);
    return prods.map((p) => {
        const vs = vars.filter((v) => v.master_title === p.master_title).map((v) => {
            const status = /^NEW/i.test(v.variant_status) ? 'NEW' : 'KEEP';
            const rep = /(?:replaces|from draft)\s+(\d{4,})/i.exec(v.variant_status);
            const replacesIds = ids(v.old_variant_id_that_dies).concat(rep ? [rep[1]] : []);
            const sheet = {}; for (const k of Object.keys(SHEET_TO_COL)) if (!isEmpty(v[k])) sheet[k] = asNum(v[k]);
            if (!isEmpty(v.weight_g)) sheet.weight_g = asNum(v.weight_g);
            return { status, existingId: str(v.existing_variant_id || v.master_variant_id_if_kept), replacesId: replacesIds[0] || '', replacesIds, foldedFrom: ids(v.folded_from_product_id), spokeCount: str(v.spoke_count), color: str(v.color), spacing: str(v.wheel_spec_hub_spacing || v.hub_spacing), riding: str(v.wheel_spec_riding_style), position: str(v.wheel_spec_position), sheet };
        });
        const grow = str(p.product_id_to_grow);
        const retireCol = String(p.handles_to_retire_and_redirect || ''); const grownMarker = /(\S+)\s*\([^)]*grown[^)]*\)/g;
        const grownOldHandles = [...new Set([...retireCol.matchAll(grownMarker)].map((x) => x[1].replace(/^\/products\//, '')).concat(handlesOf(p['old_handle_of_grown_product'] || p['old_handle_of_grown_product (redirect to new handle)'])))].filter((h) => h !== p.new_handle);
        const foldedHandles = [...new Set(handlesOf(retireCol.replace(grownMarker, ' ')))].filter((h) => h !== p.new_handle && !grownOldHandles.includes(h));
        const folded = [...new Set(ids(p.product_ids_to_DRAFT_after_overlap).concat(vs.flatMap((v) => v.foldedFrom)))].filter((x) => x !== grow);
        return { title: p.master_title, handle: p.new_handle, productId: grow, oldProductIds: ids(p.product_ids_to_DRAFT_after_overlap), foldedProductIds: folded, foldedHandles, grownOldHandles, variants: vs };
    });
}

/** CSV master_title,hub_spacing,spoke_count,color,variant_id -> Map("title|spacing|holes|color" -> id) */
function loadNewIds(csv) { const m = new Map(); for (const r of table(csv)) m.set([r.master_title, r.hub_spacing, r.spoke_count, r.color].join('|'), str(r.variant_id)); return m; }

const clone = (r) => JSON.parse(JSON.stringify(r));
const vid = (r) => str(r.shopify_variant_id);
const pid = (r) => str(r.shopify_product_id);
const handleOfUrl = (u) => { const m = /\/products\/([^/?#]+)/.exec(str(u)); return m ? m[1] : ''; };
const typed = (old, v) => (typeof old === 'string' ? String(v) : Number(v));   // keep the type the library file already uses for ids (text in some rows, numbers in others)
const activeKey = (r) => `p:${pid(r)}|${str(r.hub_spacing)}|${str(r['Option1 Value'])}`;

function rekey({ rows, masters, newIds = new Map(), spacings = null, placeholderPrefix = '', noPlaceholders = false }) {
    const out = rows.map(clone); const log = { updated: [], created: [], retired: [], unmatched: [], dyingWithoutRow: [], notCreated: [], warnings: [] }; let placeholders = 0; const originalIds = new Set(rows.map(vid).filter(Boolean));
    const touched = new Set();   // row objects that were updated, retired or are bases of a master (so the unmatched sweep can tell)
    masters.forEach((m, mi) => {
        const folded = new Set(m.foldedProductIds || []), foldedHandles = new Set(m.foldedHandles || []), grownOld = new Set(m.grownOldHandles || []);
        const productSet = new Set([m.productId, ...m.oldProductIds, ...folded].filter(Boolean));
        const combos = []; for (const v of m.variants) { const k = v.spacing + '|' + v.spokeCount; let c = combos.find((x) => x.k === k); if (!c) combos.push(c = { k, spacing: v.spacing, spokeCount: v.spokeCount, variants: [] }); c.variants.push(v); }
        const dying = new Set(m.variants.flatMap((v) => (v.replacesIds && v.replacesIds.length ? v.replacesIds : v.replacesId ? [v.replacesId] : [])));
        const replacedBy = new Map();   // old variant id -> label of the combo that carries its replacement
        for (const c of combos) for (const v of c.variants) for (const id of (v.replacesIds || [])) replacedBy.set(id, `${m.title} | ${c.spacing} | ${c.spokeCount}`);
        const keptIds = new Set(m.variants.filter((v) => v.status === 'KEEP' && v.existingId).map((v) => v.existingId));
        let n = 0;
        for (const c of combos) {
            if (spacings && !spacings.includes(c.spacing)) log.warnings.push(`${m.title}: spacing "${c.spacing}" is not in the store's list of hub spacings`);
            const rep = c.variants.find((v) => /^black$/i.test(v.color)) || c.variants[0];
            const keepIds = c.variants.filter((v) => v.status === 'KEEP' && v.existingId).map((v) => v.existingId);
            let idx = -1; for (const id of keepIds) { idx = out.findIndex((r) => vid(r) === id); if (idx >= 0) break; }
            const label = `${m.title} | ${c.spacing} | ${c.spokeCount}`;
            if (idx >= 0) {   // update in place
                const r = out[idx]; const before = {}; const after = {}; touched.add(r);
                const set = (k, v) => { if (JSON.stringify(r[k]) !== JSON.stringify(v)) { before[k] = r[k]; after[k] = v; r[k] = v; } };
                set('shopify_product_id', typed(r.shopify_product_id, m.productId)); set('ProductURL', SHOP_URL + m.handle); set('Title', m.title); set('hub_spacing', c.spacing); set('riding_style', rep.riding);
                const repKeep = c.variants.find((v) => v.status === 'KEEP' && v.existingId === vid(r)) || null; if (!repKeep) log.warnings.push(`${label}: the existing row's variant id ${vid(r)} is not a kept variant of this spacing`);
                for (const [sk, ck] of Object.entries(SHEET_TO_COL)) { const sv = rep.sheet[sk]; const rv = asNum(r[COL[ck]]); if (sv !== undefined && sv !== null && rv !== null && Math.abs(sv - rv) > 1e-9) log.warnings.push(`${label}: ${sk} sheet ${sv} but library row ${rv} (left as is)`); }
                log.updated.push({ label, variantId: vid(r), before, after });
            } else {   // new row cloned from the master's existing row (its own product or a folded product)
                const live = (r) => productSet.has(pid(r)) && str(r.Status) !== 'retired';
                let baseIdx = out.findIndex(live); if (baseIdx < 0) baseIdx = out.findIndex((r) => productSet.has(pid(r)));
                if (baseIdx < 0) { log.warnings.push(`${label}: no existing library row for this master to clone: row NOT created`); continue; }
                const base = out[baseIdx]; const row = clone(base); delete row.Status;
                const key = [m.title, c.spacing, c.spokeCount, rep.color].join('|'); let id = rep.status === 'KEEP' && rep.existingId ? rep.existingId : (newIds.get(key) || '');
                if (!id && noPlaceholders) { log.warnings.push(`${label}: no real variant id yet (not in new_ids.csv): row NOT created`); log.notCreated.push({ label, color: rep.color }); continue; }
                if (!id) { id = `PLACEHOLDER-${placeholderPrefix ? placeholderPrefix + '-' : ''}${mi + 1}-${++n}`; placeholders++; }
                row.shopify_product_id = typed(base.shopify_product_id, m.productId); row.shopify_variant_id = /^\d+$/.test(id) ? typed(base.shopify_variant_id, id) : id; row.ProductURL = SHOP_URL + m.handle; row.Title = m.title; row['Option1 Value'] = c.spokeCount; row.hub_spacing = c.spacing; row.riding_style = rep.riding;
                for (const [sk, ck] of Object.entries(SHEET_TO_COL)) if (rep.sheet[sk] !== undefined) row[COL[ck]] = rep.sheet[sk];
                if (rep.position) row[COL.pos] = rep.position; if (rep.sheet.weight_g !== undefined) { row[VW] = rep.sheet.weight_g; if (PW in row) row[PW] = ''; }
                let last = baseIdx; out.forEach((r, i) => { if (productSet.has(pid(r))) last = Math.max(last, i); });
                out.splice(last + 1, 0, row); touched.add(row);
                log.created.push({ label, variantId: str(row.shopify_variant_id), placeholder: !/^\d+$/.test(str(row.shopify_variant_id)), clonedFrom: `${str(base.Title)} ${base['Option1 Value']} [${vid(base)}]`, numbers: Object.fromEntries(Object.entries(rep.sheet).map(([k, v]) => [k, v])) });
            }
        }
        // 1) variants that lose their id: retire the library row (kept in the file), say which new row replaces it
        const retire = (r, reason, replacedByLabel) => { if (str(r.Status) === 'retired') return; r.Status = 'retired'; touched.add(r); log.retired.push({ variantId: vid(r), productId: pid(r), title: str(r.Title), spacing: str(r['Option1 Value']), was: str(r.ProductURL), reason, replacedBy: replacedByLabel || '' }); };
        for (const id of dying) {   // (a dying id with no library row is only counted: the library has one row per product and spoke count)
         const r = out.find((x) => vid(x) === id); if (!r) { log.dyingWithoutRow.push({ master: m.title, variantId: id }); continue; } retire(r, 'its variant id dies (the master has a new variant for it)', replacedBy.get(id)); }
        // 2) every other row that still links to a FOLDED product (by product id or by URL): no master variant carries it -> retired, kept in the file
        for (const r of out) {
            if (str(r.Status) === 'retired' || touched.has(r)) continue;
            const h = handleOfUrl(r.ProductURL);
            if (folded.has(pid(r)) || (h && foldedHandles.has(h))) retire(r, 'its product is folded into the master and no master variant carries this id', '');
        }
        // 3) rows on the grown product (id or old URL) that no kept variant matches: listed, nothing changed
        for (const r of out) {
            if (str(r.Status) === 'retired' || touched.has(r)) continue;
            const h = handleOfUrl(r.ProductURL);
            const onGrown = pid(r) === m.productId || (h && (grownOld.has(h) || h === m.handle));
            if (!onGrown) continue;
            log.unmatched.push({ title: str(r.Title), variantId: vid(r), productId: pid(r), url: str(r.ProductURL), spoke: str(r['Option1 Value']), reason: keptIds.has(vid(r)) ? 'a kept variant, but another row already represents this spacing and spoke count' : (vid(r) ? `variant id ${vid(r)} is not in the sheet for ${m.title}` : 'the row has no variant id') });
        }
    });
    // checks
    const nowIds = new Set(out.map(vid).filter(Boolean)); const lostIds = [...originalIds].filter((id) => !nowIds.has(id));
    const keys = new Map(); out.filter((r) => str(r.Status) !== 'retired' && str(r.hub_spacing)).forEach((r) => { const k = activeKey(r); keys.set(k, (keys.get(k) || 0) + 1); });
    const duplicateKeys = [...keys.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const idCount = new Map(); out.forEach((r) => { if (vid(r)) idCount.set(vid(r), (idCount.get(vid(r)) || 0) + 1); }); const duplicateIds = [...idCount.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const checks = { rowsBefore: rows.length, rowsAfter: out.length, rowsDeleted: 0, variantIdsLost: lostIds, duplicateActiveKeys: duplicateKeys, duplicateVariantIds: duplicateIds, placeholders, retiredRows: log.retired.length, unmatchedRows: log.unmatched.length, ok: !lostIds.length && !duplicateKeys.length && !duplicateIds.length && out.length >= rows.length };
    return { rows: out, log, checks };
}

function formatDiff(res, label) {
    const o = [`HUB LIBRARY RE-KEY, DRY RUN ${label || ''}`]; const c = res.checks;
    o.push(`rows ${c.rowsBefore} -> ${c.rowsAfter} (created ${res.log.created.length}, updated in place ${res.log.updated.length}, retired ${res.log.retired.length}, deleted 0); unmatched rows listed ${res.log.unmatched.length}; placeholder ids ${c.placeholders}; checks ${c.ok ? 'OK' : 'PROBLEM'}`);
    if (c.variantIdsLost.length) o.push('VARIANT IDS LOST FROM THE FILE: ' + c.variantIdsLost.join(', '));
    if (c.duplicateActiveKeys.length) o.push('DUPLICATE ACTIVE KEYS: ' + c.duplicateActiveKeys.join(', '));
    if (c.duplicateVariantIds.length) o.push('DUPLICATE VARIANT IDS: ' + c.duplicateVariantIds.join(', '));
    o.push(''); o.push('UPDATED IN PLACE (identity fields only; numbers untouched):');
    for (const u of res.log.updated) { o.push('  ' + u.label + ' [' + u.variantId + ']'); for (const k of Object.keys(u.after)) o.push(`      ${k}: ${JSON.stringify(u.before[k])} -> ${JSON.stringify(u.after[k])}`); }
    o.push(''); o.push('CREATED:'); for (const n of res.log.created) o.push(`  ${n.label} [${n.variantId}${n.placeholder ? ' PLACEHOLDER' : ''}] cloned from ${n.clonedFrom}; sheet numbers ${JSON.stringify(n.numbers)}`);
    o.push(''); o.push('RETIRED (kept in the file, hidden from the customer page):'); for (const r of res.log.retired) o.push(`  ${r.title} ${r.spacing} [${r.variantId}] ${r.was} | ${r.reason}${r.replacedBy ? ' | replaced by ' + r.replacedBy : ''}`);
    o.push(''); o.push('UNMATCHED (row links to this master but no sheet line matches it; NOTHING changed):'); for (const u of res.log.unmatched) o.push(`  ${u.title} ${u.spoke} [${u.variantId || 'no id'}] ${u.url} | ${u.reason}`); if (!res.log.unmatched.length) o.push('  none');
    o.push(''); o.push('WARNINGS:'); for (const w of res.log.warnings) o.push('  ' + w); if (!res.log.warnings.length) o.push('  none');
    return o.join('\n') + '\n';
}

module.exports = { loadMasters, loadNewIds, rekey, formatDiff, COL, handleOfUrl };
