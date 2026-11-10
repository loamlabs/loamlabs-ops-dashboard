// lib/components-report.js
// READ-ONLY reports about the component library (PURE: rows in, lists out). Nothing here changes a row; cleanups are only proposed.
//   validationReport(rows)  - missing ERD, ERD outliers by size and vendor, duplicate variant ids, duplicate vendor+title+options
//   coverageReport(...)     - Shopify rim products with no calculator row, rows whose product is draft/archived/missing/no longer tagged, suggestions to mark Retired
//   driftReport(...)        - rows where the library and Shopify now disagree on the fields Jerry named (ERD, weight)
// Rule: a row is NEVER proposed for deletion. A row of a draft/missing product is only proposed as "mark Retired".

const ERD_KEYS = ['Variant Metafield: custom.rim_erd [number_decimal]', 'Rim ERD', 'rim_erd', 'ERD'];
const WEIGHT_KEYS = ['Variant Metafield: custom.weight_g [number_decimal]', 'Metafield: custom.weight_g [number_decimal]', 'weight_g'];
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const firstVal = (r, keys) => { for (const k of keys) if (str(r && r[k]) !== '') return r[k]; return ''; };
const title = (r) => str(r.Title || r.title || r.Name || r.name) || '(no title)';
const vendor = (r) => str(r.Vendor || r.vendor || r.Brand || r.brand);
const vid = (r) => str(r.shopify_variant_id || r['Variant ID']);
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

function validationReport(rows, { outlierPct = 0.06 } = {}) {
    const erdOf = (r) => Number(firstVal(r, ERD_KEYS));
    const missingErd = rows.filter((r) => !(erdOf(r) > 0)).map((r) => ({ title: title(r), vendor: vendor(r), variantId: vid(r) }));
    // outliers: ERD far from the median of rims of the same size (Option1 Value, for example 29" or 27.5") that have an ERD (not for 700c: road rim depths legitimately vary); also anything outside 400 to 680
    const bySize = new Map();
    for (const r of rows) { const e = erdOf(r); if (e > 0) { const k = str(r['Option1 Value']) || '?'; (bySize.get(k) || bySize.set(k, []).get(k)).push(e); } }
    const med = new Map([...bySize.entries()].map(([k, v]) => [k, median(v)]));
    const outliers = rows.filter((r) => { const e = erdOf(r); if (!(e > 0)) return false; const m = med.get(str(r['Option1 Value']) || '?'); return e < 400 || e > 680 || (m > 0 && !/700c|650b|road/i.test(str(r['Option1 Value'])) && Math.abs(e - m) / m > outlierPct); })
        .map((r) => ({ title: title(r), vendor: vendor(r), size: str(r['Option1 Value']), erd: erdOf(r), sizeMedian: med.get(str(r['Option1 Value']) || '?') }));
    const ids = new Map(); rows.forEach((r) => { if (vid(r)) (ids.get(vid(r)) || ids.set(vid(r), []).get(vid(r))).push(title(r)); });
    const duplicateVariantIds = [...ids.entries()].filter(([, t]) => t.length > 1).map(([id, t]) => ({ variantId: id, titles: t }));
    const keys = new Map(); rows.forEach((r) => { const k = [vendor(r), title(r), str(r['Option1 Value']), str(r['Option2 Value'])].join('|').toLowerCase(); (keys.get(k) || keys.set(k, []).get(k)).push(title(r)); });
    const duplicateRows = [...keys.entries()].filter(([, t]) => t.length > 1).map(([k, t]) => ({ key: k, count: t.length }));
    return { rows: rows.length, missingErd, outliers, duplicateVariantIds, duplicateRows, withoutVariantId: rows.filter((r) => !vid(r)).length };
}

/**
 * @param {object} p rows (library rows), products [{id,title,status,variantIds[]}] = Shopify products of this component type (tagged), rowStatus {variantId: 'ACTIVE'|'DRAFT'|'ARCHIVED'|'MISSING'}, excluded [{id,title}]
 */
function coverageReport({ rows, products, rowStatus = {}, excluded = [] }) {
    const have = new Set(rows.map(vid).filter(Boolean)); const haveTitles = new Set(rows.map((r) => norm(title(r))));
    const ex = new Set(excluded.map((e) => String(e.id || e)));
    const missing = [], excl = [];
    for (const p of products) {
        if (p.status !== 'ACTIVE') continue;
        const covered = p.variantIds.some((v) => have.has(String(v))) || haveTitles.has(norm(p.title));
        if (covered) continue;
        (ex.has(String(p.id)) ? excl : missing).push({ id: p.id, title: p.title, vendor: p.vendor, variants: p.variantIds.length });
    }
    const taggedVariants = new Set(products.flatMap((p) => p.variantIds.map(String)));
    const onDraft = [], missingInShopify = [], notTagged = [];
    for (const r of rows) {
        const v = vid(r); if (!v) continue; const st = rowStatus[v];
        const base = { title: title(r), vendor: vendor(r), variantId: v, status: str(r.Status) || 'active' };
        if (st === 'DRAFT' || st === 'ARCHIVED') onDraft.push({ ...base, shopify: st });
        else if (st === 'MISSING') missingInShopify.push(base);
        else if (st === 'ACTIVE' && !taggedVariants.has(v)) notTagged.push(base);
    }
    const suggestRetired = onDraft.concat(missingInShopify).filter((r) => r.status !== 'retired').map((r) => ({ title: r.title, vendor: r.vendor, variantId: r.variantId, why: r.shopify || 'MISSING' }));
    return { missingRows: missing, excluded: excl, onDraft, missingInShopify, notTagged, suggestRetired };
}

/** drift on named fields only; shopify = {variantId: {erd, weight}} (numbers or null) */
function driftReport(rows, shopify, { tolerance = 0.05 } = {}) {
    const out = [];
    for (const r of rows) {
        const s = shopify[vid(r)]; if (!s) continue;
        for (const [field, keys, sv] of [['ERD', ERD_KEYS, s.erd], ['Weight (g)', WEIGHT_KEYS, s.weight]]) {
            const lv = Number(firstVal(r, keys)); if (!(lv > 0) || !(Number(sv) > 0)) continue;
            if (Math.abs(lv - Number(sv)) > tolerance) out.push({ title: title(r), variantId: vid(r), field, library: lv, shopify: Number(sv) });
        }
    }
    return out;
}

module.exports = { validationReport, coverageReport, driftReport, ERD_KEYS, WEIGHT_KEYS };
