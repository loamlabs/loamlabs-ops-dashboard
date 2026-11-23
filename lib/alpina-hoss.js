// lib/alpina-hoss.js
// Alpina stock from Hoss Active Sports Group (the distributor) -> which of OUR Alpina variants may be sold. Pure functions: no network, no Shopify, no files.
// Jerry's decision (Nov 20 and 22): an Alpina spoke that Hoss does not have in stock must NOT be orderable at LoamLabs.
//   retail bundle variants (products "alpina-<model>-<hub>-spokes", options Color / Length / Spoke Count "14 Spokes" ...): orderable only when Hoss stock for that
//     model + hub type + color + length is >= the bundle size;
//   builder-part length variants (hidden products "alpina-<extralight|ultralight>-<round|aero>-<hub>", options Color / Length "256mm"): orderable only when Hoss stock is >= THRESHOLD
//     (config, default 32); the "-" placeholder variant (it carries the price) is never touched.
// The page data comes from the product page itself: WooCommerce puts every variation in the attribute data-product_variations (one request per product page is enough).
// No wholesale figure leaves this module: the Hoss price is parsed only as a plain number for the report ("informational"); nothing here writes a price.

const DEFAULTS = {
    threshold: 32,               // builder length variants: Hoss stock needed to stay orderable (Jerry, Nov 22: 32 = the most spokes one build can need of one length: a 32h rim)
    intervalDays: 3,             // the reader runs once every 3 days (Jerry, Nov 22)
    flipCapPct: 0.05,            // at most 5% of the matched variants may change state in one run (and never fewer than flipCapMin)
    flipCapMin: 40,
    minOrderableShare: 0.03,     // a product whose reading would leave under 3% of its matched variants orderable is held (bad parse), unless nothing is orderable at Hoss at all
    maxShareDrop: 0.30,          // vs the last accepted reading (state): more than 30 points less orderable in one run holds that product
    minPageRatio: 0.9,           // a page must parse to at least 90% of its known variant count
};

// the 8 Hoss pages: key -> our two product handles and the known variant count of the Nov 13 save (checked against every new read)
const HOSS_PAGES = {
    'extralite-round-j-bend':      { model: 'extralite-round', hub: 'j-bend',        path: '/product/alpina-extralite-round-j-bend/',      retail: 'alpina-extralite-round-j-bend-spokes',      builder: 'alpina-extralight-round-j-bend',      expected: 192 },
    'extralite-round-straight-pull': { model: 'extralite-round', hub: 'straight-pull', path: '/product/alpina-extralite-round-straight-pull/', retail: 'alpina-extralite-round-straight-pull-spokes', builder: null,                                  expected: 192 },
    'extralite-aero-j-bend':       { model: 'extralite-aero',  hub: 'j-bend',        path: '/product/alpina-extralite-aero-j-bend/',       retail: 'alpina-extralite-aero-j-bend-spokes',       builder: 'alpina-extralight-aero-j-bend',       expected: 92 },
    'extralite-aero-straight-pull': { model: 'extralite-aero',  hub: 'straight-pull', path: '/product/alpina-extralite-aero-straight-pull/', retail: 'alpina-extralite-aero-straight-pull-spokes', builder: 'alpina-extralight-aero-straight-pull', expected: 92 },
    'ultralite-round-j-bend':      { model: 'ultralite-round', hub: 'j-bend',        path: '/product/alpina-ultralite-round-j-bend/',      retail: 'alpina-ultralite-round-j-bend-spokes',      builder: 'alpina-ultralight-round-j-bend',      expected: 192 },
    'ultralite-round-straight-pull': { model: 'ultralite-round', hub: 'straight-pull', path: '/product/alpina-ultralite-round-straight-pull/', retail: 'alpina-ultralite-round-straight-pull-spokes', builder: 'alpina-ultralight-round-straight-pull', expected: 136 },
    'ultralite-aero-j-bend':       { model: 'ultralite-aero',  hub: 'j-bend',        path: '/product/alpina-ultralite-aero-j-bend/',       retail: 'alpina-ultralite-aero-j-bend-spokes',       builder: 'alpina-ultralight-aero-j-bend',       expected: 162 },
    'ultralite-aero-straight-pull': { model: 'ultralite-aero',  hub: 'straight-pull', path: '/product/alpina-ultralite-aero-straight-pull/', retail: 'alpina-ultralite-aero-straight-pull-spokes', builder: 'alpina-ultralight-aero-straight-pull', expected: 162 },
};
const HOSS_HOST = 'https://hasgllc.com';

const decodeEntities = (s) => String(s == null ? '' : s).replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripTags = (s) => decodeEntities(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** "Alpina Extralite Round J-Bend – Hoss Active Sports Group" -> page key 'extralite-round-j-bend' (null when the title is not one of ours). */
function pageKeyFromTitle(title) {
    const t = stripTags(title).toLowerCase();
    const m = /alpina\s+(extralite|extralight|ultralite|ultralight)\s+(round|aero)\s+(j-?bend|straight-?\s*pull)/.exec(t);
    if (!m) return null;
    const line = m[1].startsWith('extra') ? 'extralite' : 'ultralite';
    return `${line}-${m[2]}-${m[3].startsWith('j') ? 'j-bend' : 'straight-pull'}`;
}

/** "250 in stock" -> 250; "Out of stock" -> 0; "Available on backorder" / "On backorder" -> 0 (Hoss does not have it); anything else -> null (unknown: change nothing). */
function parseAvailability(html) {
    const t = stripTags(html).toLowerCase();
    if (!t) return { qty: null, kind: 'unknown' };
    const m = /(\d[\d,]*)\s+in stock/.exec(t);
    if (m) return { qty: Number(m[1].replace(/,/g, '')), kind: 'in-stock' };
    if (/out of stock/.test(t)) return { qty: 0, kind: 'out-of-stock' };
    if (/backorder/.test(t)) return { qty: 0, kind: 'backorder' };
    if (/\bin stock\b/.test(t)) return { qty: null, kind: 'in-stock-no-number' };   // "In stock" without a number: unknown amount, never counted
    return { qty: null, kind: 'unknown' };
}

/**
 * Parse one Hoss product page.
 * @returns {{ ok: boolean, pageKey: string|null, rows: object[], warnings: string[], reason?: string }}
 * rows: { hossSku, productName, hubType, color, lengthMm, stockQty (number or null = unknown), kind, price (informational only), variationId }
 */
function parseHossPage(html) {
    const warnings = [];
    const src = String(html || '');
    const titleM = /<title[^>]*>([^<]*)<\/title>/i.exec(src);
    const pageKey = titleM ? pageKeyFromTitle(titleM[1]) : null;
    if (!pageKey) return { ok: false, pageKey: null, rows: [], warnings, reason: 'page title is not one of the 8 Alpina spoke pages' };
    const m = /data-product_variations="([^"]*)"/.exec(src);
    if (!m) return { ok: false, pageKey, rows: [], warnings, reason: 'no data-product_variations on the page (login missing, or the page layout changed)' };
    let list;
    try { list = JSON.parse(decodeEntities(m[1])); } catch (e) { return { ok: false, pageKey, rows: [], warnings, reason: 'data-product_variations is not valid JSON' }; }
    if (!Array.isArray(list) || !list.length) return { ok: false, pageKey, rows: [], warnings, reason: 'data-product_variations is empty' };
    const info = HOSS_PAGES[pageKey]; const seen = new Set(); const rows = [];
    for (const v of list) {
        const a = (v && v.attributes) || {};
        const color = String(a.attribute_color || '').trim();
        const lm = /(\d{2,3})\s*mm/i.exec(String(a.attribute_length || ''));
        if (!color || !lm) { warnings.push(`variation ${v && v.variation_id}: no color or length`); continue; }
        const lengthMm = Number(lm[1]); const key = `${color.toLowerCase()}|${lengthMm}`;
        if (seen.has(key)) { warnings.push(`duplicate ${key}`); continue; } seen.add(key);
        const av = parseAvailability(v.availability_html);
        // cross-check with the page's own flags: "N in stock" must agree with is_in_stock; if they disagree the reading for this variant is unknown
        let qty = av.qty, kind = av.kind;
        if (qty !== null && typeof v.is_in_stock === 'boolean' && ((qty > 0) !== v.is_in_stock)) { warnings.push(`${v.sku}: text says ${qty} but is_in_stock is ${v.is_in_stock}: unknown`); qty = null; kind = 'conflict'; }
        const price = Number(v.display_price); rows.push({ hossSku: String(v.sku || ''), productName: info ? `${info.model} ${info.hub}` : pageKey, hubType: pageKey.endsWith('j-bend') ? 'j-bend' : 'straight-pull', color: color[0].toUpperCase() + color.slice(1).toLowerCase(), lengthMm, stockQty: qty, kind, price: isFinite(price) ? price : null, variationId: v.variation_id || null });
    }
    if (!rows.length) return { ok: false, pageKey, rows: [], warnings, reason: 'no variation could be read' };
    return { ok: true, pageKey, rows, warnings };
}

/** The page parsed to enough variants? (a half-loaded or changed page must stop the run, never partly change stock) */
function pageSane(parsed, cfg = DEFAULTS) {
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    const info = HOSS_PAGES[parsed.pageKey]; const n = parsed.rows.length;
    if (n < Math.ceil(info.expected * cfg.minPageRatio)) return { ok: false, reason: `${parsed.pageKey}: ${n} variants read, ${info.expected} expected (at least ${Math.ceil(info.expected * cfg.minPageRatio)} needed)` };
    const unknown = parsed.rows.filter((r) => r.stockQty === null).length;
    if (unknown / n > 0.2) return { ok: false, reason: `${parsed.pageKey}: ${unknown} of ${n} stock values could not be read` };
    return { ok: true };
}

// ---------- our store side ----------
const COLORS = ['Black', 'Silver'];
/** store products -> { retailByKey, builderByKey } index. product: { handle, status, variants: [{ id, policy, opts: { Color, Length, 'Spoke Count' } }] } */
function storeVariantsFor(product, kind) {
    const out = [];
    for (const v of product.variants || []) {
        const o = v.opts || {}; const lm = /(\d{2,3})\s*mm/i.exec(String(o.Length || ''));
        if (!lm) { out.push({ id: v.id, policy: v.policy, handle: product.handle, kind, placeholder: true }); continue; }   // the "-" placeholder (builder) or a malformed length: never touched
        const bm = /(\d+)/.exec(String(o['Spoke Count'] || ''));
        out.push({ id: v.id, policy: v.policy, handle: product.handle, kind, color: String(o.Color || ''), lengthMm: Number(lm[1]), bundle: kind === 'retail' ? (bm ? Number(bm[1]) : null) : null, placeholder: false });
    }
    return out;
}

/**
 * The decision for one store variant.
 * @returns {{ want: 'open'|'close'|'leave', why: string }}
 */
function decide(sv, hossRow, cfg = DEFAULTS) {
    if (sv.placeholder) return { want: 'leave', why: 'placeholder variant (carries the price): never touched' };
    if (!hossRow) return { want: 'leave', why: 'unmatched: no Hoss row for this model, hub type, color and length' };
    if (hossRow.stockQty === null) return { want: 'leave', why: 'Hoss stock unknown' };
    const need = sv.kind === 'retail' ? sv.bundle : cfg.threshold;
    if (!(need > 0)) return { want: 'leave', why: 'no bundle size on the variant' };
    return hossRow.stockQty >= need ? { want: 'open', why: `Hoss ${hossRow.stockQty} >= ${need}` } : { want: 'close', why: `Hoss ${hossRow.stockQty} < ${need}` };
}

/**
 * The whole plan.
 * @param {object} p { pages: { pageKey: parsedPage }, store: [{ handle, status, variants }], cfg, state: { lastShare: { handle: 0..1 } } | null }
 * @returns {{ ok, blocked: string[], flips: [{ id, handle, kind, color, lengthMm, bundle, from, to, hoss, why }], held: [...], perProduct: {}, unmatched: {}, hossOnly: {}, cap, totals }}
 *   Nothing is changed when blocked is not empty: a failed page, a page that does not parse sanely, or a missing page stops the WHOLE run (a partial run changes nothing).
 */
function plan({ pages, store, cfg = DEFAULTS, state = null }) {
    const c = { ...DEFAULTS, ...cfg }; const blocked = []; const held = []; const flips = [];
    const keys = Object.keys(HOSS_PAGES);
    for (const k of keys) { const pg = pages && pages[k]; if (!pg) { blocked.push(`${k}: page not read`); continue; } const s = pageSane(pg, c); if (!s.ok) blocked.push(s.reason); }
    const perProduct = {}, unmatched = {}, hossOnly = {}; let matchedTotal = 0;
    const byHandle = new Map((store || []).map((p) => [p.handle, p]));
    const candidates = [];
    for (const k of keys) {
        const info = HOSS_PAGES[k]; const pg = pages && pages[k]; if (!pg || !pg.ok) continue;
        const rowBy = new Map(pg.rows.map((r) => [`${r.color.toLowerCase()}|${r.lengthMm}`, r])); const used = new Set();
        for (const [kind, handle] of [['retail', info.retail], ['builder', info.builder]]) {
            if (!handle) continue; const prod = byHandle.get(handle);
            if (!prod) { blocked.push(`${handle}: store product not found`); continue; }
            const stats = { handle, kind, status: prod.status || '', variants: 0, matched: 0, open: 0, close: 0, leave: 0, orderableNow: 0, orderableAfter: 0, unmatched: 0, unknown: 0 };
            for (const sv of storeVariantsFor(prod, kind)) {
                if (sv.placeholder) continue; stats.variants++;
                const row = rowBy.get(`${String(sv.color).toLowerCase()}|${sv.lengthMm}`); if (row) used.add(`${String(sv.color).toLowerCase()}|${sv.lengthMm}`);
                const d = decide(sv, row, c); const nowOpen = sv.policy === 'CONTINUE';
                if (!row) { stats.unmatched++; (unmatched[handle] = unmatched[handle] || []).push(`${sv.color} ${sv.lengthMm}mm${sv.bundle ? ' x' + sv.bundle : ''}`); if (nowOpen) { stats.orderableNow++; stats.orderableAfter++; } continue; }
                stats.matched++; matchedTotal++; if (d.want === 'leave') { stats.unknown++; if (nowOpen) { stats.orderableNow++; stats.orderableAfter++; } continue; }
                if (nowOpen) stats.orderableNow++;
                const afterOpen = d.want === 'open'; if (afterOpen) stats.orderableAfter++;
                if (d.want === 'open' && !nowOpen) { stats.open++; candidates.push({ id: sv.id, handle, kind, color: sv.color, lengthMm: sv.lengthMm, bundle: sv.bundle, from: sv.policy, to: 'CONTINUE', hoss: row.stockQty, why: d.why }); }
                else if (d.want === 'close' && nowOpen) { stats.close++; candidates.push({ id: sv.id, handle, kind, color: sv.color, lengthMm: sv.lengthMm, bundle: sv.bundle, from: sv.policy, to: 'DENY', hoss: row.stockQty, why: d.why }); }
                else stats.leave++;
            }
            perProduct[handle] = stats;
        }
        const total = pg.rows.length; hossOnly[k] = pg.rows.filter((r) => !used.has(`${r.color.toLowerCase()}|${r.lengthMm}`)).length + ' of ' + total + ' Hoss rows have no variant on any of our products for this model (lengths we do not list)';
    }
    // per-product sanity: orderable share
    const heldHandles = new Set();
    for (const st of Object.values(perProduct)) {
        const n = st.matched || 0; if (!n) continue; const afterShare = st.orderableAfter / (st.variants || 1); const lastShare = state && state.lastShare && typeof state.lastShare[st.handle] === 'number' ? state.lastShare[st.handle] : null;
        st.shareAfter = +afterShare.toFixed(3); st.shareNow = +(st.orderableNow / (st.variants || 1)).toFixed(3);
        if (st.orderableAfter === 0 && st.close > 0 && st.matched > 0 && !(candidates.filter((x) => x.handle === st.handle && x.to === 'CONTINUE').length)) { /* everything would close */ }
        if (st.orderableAfter === 0 && st.variants > 0 && st.close > 0) { heldHandles.add(st.handle); st.held = 'would close the whole product (never on one run)'; }
        else if (afterShare < c.minOrderableShare && st.close > 0) { heldHandles.add(st.handle); st.held = `only ${(afterShare * 100).toFixed(1)}% would stay orderable: looks like a bad parse`; }
        else if (lastShare !== null && lastShare - afterShare > c.maxShareDrop) { heldHandles.add(st.handle); st.held = `orderable share would fall from ${(lastShare * 100).toFixed(0)}% to ${(afterShare * 100).toFixed(0)}% in one run`; }
    }
    for (const x of candidates) { if (heldHandles.has(x.handle) && x.to === 'DENY') held.push({ ...x, heldBecause: perProduct[x.handle].held }); else flips.push(x); }
    const cap = Math.max(c.flipCapMin, Math.ceil(matchedTotal * c.flipCapPct));
    const overCap = flips.length > cap;
    const totals = { variantsMatched: matchedTotal, close: flips.filter((f) => f.to === 'DENY').length, open: flips.filter((f) => f.to === 'CONTINUE').length, held: held.length };
    if (overCap) blocked.push(`${flips.length} changes proposed, the limit is ${cap} per run (${(c.flipCapPct * 100).toFixed(0)}% of ${matchedTotal} matched variants, at least ${c.flipCapMin}): nothing is written until Jerry raises the limit for this run`);
    return { ok: !blocked.length, blocked, flips, held, perProduct, unmatched, hossOnly, cap, totals, overCap };
}

/** Read the "orderable share" per product after a run, for the next run's sanity check. */
const shareState = (perProduct) => Object.fromEntries(Object.values(perProduct).filter((s) => s.variants).map((s) => [s.handle, s.shareAfter !== undefined ? s.shareAfter : +(s.orderableAfter / s.variants).toFixed(3)]));

// ---------- robots.txt (the reader reads it itself at run time and stops when a path is disallowed) ----------
/** Standard group matching: our own token wins; otherwise the "*" group. Longest matching rule wins; Allow beats Disallow on a tie. */
function robotsAllows(robotsTxt, path, uaToken) {
    const groups = []; let cur = null; let lastWasUA = false;
    for (const raw of String(robotsTxt || '').split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim(); if (!line) continue; const i = line.indexOf(':'); if (i < 0) continue; const f = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
        if (f === 'user-agent') { if (!lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
        lastWasUA = false; if (!cur) continue; if (f === 'allow' || f === 'disallow') cur.rules.push({ allow: f === 'allow', path: v });
    }
    const tok = String(uaToken || '').toLowerCase(); let g = groups.find((x) => x.agents.some((a) => a !== '*' && tok.includes(a))); if (!g) g = groups.find((x) => x.agents.includes('*')); if (!g) return true;
    let best = null; for (const r of g.rules) { if (!r.path) continue; const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')); if (re.test(path)) { if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r; } }
    return best ? best.allow : true;
}

module.exports = { DEFAULTS, HOSS_PAGES, HOSS_HOST, COLORS, decodeEntities, stripTags, pageKeyFromTitle, parseAvailability, parseHossPage, pageSane, storeVariantsFor, decide, plan, shareState, robotsAllows };
