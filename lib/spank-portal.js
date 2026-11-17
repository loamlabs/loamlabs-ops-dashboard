// lib/spank-portal.js
// Keeps Spank price and stock right from the dealer portal CSV that Agent C captures. PURE: no network, no file access, no Shopify, no Supabase.
//
// Rules (Jerry, Nov 16 2026; Gravity Cartel MAP policy: MAP = MSRP):
//   price      = portal MSRP, never above, never below. compare-at is cleared. A vendor sale price is never copied (there is no sale data in the file).
//   sale window (Nov 1 to Dec 7 2026): Spank allows up to 20% off MSRP. In the window a price that is 0 to 20% below MSRP is LEFT ALONE and reported;
//                the code never pushes a price below MSRP, and outside the window it raises such a price back to MSRP.
//   stock      = portal quantity above 0: CONTINUE selling; quantity 0: DENY. Only on a variant where OUR quantity is 0 (we keep selling what we hold).
//   owner      = this file source only. A mapped variant must have the BTI scan off (custom.inventory_monitoring_enabled = false on the product or the variant);
//                otherwise nothing is written for it (BTI would fight the file). BTI part numbers are NOT removed (kept on purpose).
//   missing    = a mapped variant whose part is not in the file is reported and left unchanged; nothing is ever deleted, drafted or denied for being missing.
//
// PRIVACY: the portal file also has a dealer price column. This module reads ONLY the columns named in USED_COLUMNS by header name;
//          every other column (dealer price, cost, EAN, MPN, URL ...) is never indexed, never copied, never printed.

const USED_COLUMNS = ['part_number', 'msrp', 'qty_available', 'portal_item_name', 'status_text'];
const SALE_WINDOW = { start: '2026-11-01', end: '2026-12-07', maxDiscount: 0.20 };
const MAX_CHANGES = 40;          // more changes than this in one run need --force
const MIN_PORTAL_ROWS = 20;      // a capture shorter than this is treated as truncated
const MIN_FOUND_SHARE = 0.5;     // fewer than half of the mapped parts found in the file = treated as a bad capture

function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    const t = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(f); f = ''; }
        else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
        else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null; };

/** @returns {{items: Array<{part:string,name:string,msrp:number|null,qty:number|null,status:string}>, warnings:string[]}} */
function parsePortalCsv(text) {
    const rows = parseCsv(text); const warnings = [];
    if (!rows.length) return { items: [], warnings: ['the portal file is empty'] };
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const idx = {}; for (const name of USED_COLUMNS) idx[name] = header.indexOf(name);   // ONLY these headers are looked up
    for (const must of ['part_number', 'msrp', 'qty_available']) if (idx[must] < 0) warnings.push(`the portal file has no "${must}" column`);
    if (idx.part_number < 0) return { items: [], warnings };
    const items = [];
    rows.slice(1).forEach((r, n) => {
        const part = String(r[idx.part_number] || '').trim(); if (!part) return;
        const msrp = idx.msrp >= 0 ? num(r[idx.msrp]) : null, qty = idx.qty_available >= 0 ? num(r[idx.qty_available]) : null;
        if (idx.msrp >= 0 && msrp === null) warnings.push(`line ${n + 2}: ${part} has no readable MSRP`);
        if (idx.qty_available >= 0 && qty === null) warnings.push(`line ${n + 2}: ${part} has no readable quantity`);
        items.push({ part, name: idx.portal_item_name >= 0 ? String(r[idx.portal_item_name] || '').trim() : '', msrp, qty, status: idx.status_text >= 0 ? String(r[idx.status_text] || '').trim() : '' });
    });
    return { items, warnings };
}

/** Mapping CSV: store_variant_id, portal_part_numbers (several parts separated by / ; or |; a short tail such as "HUB2100/2101" inherits the letters of the first). */
function splitParts(s) {
    const parts = String(s || '').split(/[\/;|]/).map((x) => x.trim()).filter(Boolean); const out = []; let prefix = '';
    for (const p of parts) { if (/^\d+$/.test(p) && prefix) out.push(prefix + p); else { out.push(p); const m = /^([A-Za-z]+)\d/.exec(p); if (m) prefix = m[1]; } }
    return out;
}
function parseMapCsv(text) {
    const rows = parseCsv(text); const warnings = []; const map = new Map();
    if (!rows.length) return { map, warnings: ['the mapping file is empty'] };
    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const iv = header.indexOf('store_variant_id'); let ip = header.indexOf('portal_part_numbers'); if (ip < 0) ip = header.indexOf('portal_part_number');
    if (iv < 0 || ip < 0) return { map, warnings: ['the mapping file needs the columns store_variant_id and portal_part_numbers'] };
    rows.slice(1).forEach((r, n) => {
        const id = String(r[iv] || '').trim().replace(/^gid:\/\/shopify\/ProductVariant\//, ''); const parts = splitParts(r[ip]);
        if (!/^\d+$/.test(id)) { warnings.push(`mapping line ${n + 2}: "${id}" is not a variant id`); return; }
        if (!parts.length) { warnings.push(`mapping line ${n + 2}: variant ${id} has no portal part number`); return; }
        if (map.has(id)) warnings.push(`mapping line ${n + 2}: variant ${id} listed twice (the last one is used)`);
        map.set(id, parts);
    });
    return { map, warnings };
}

const inSaleWindow = (today) => today >= SALE_WINDOW.start && today <= SALE_WINDOW.end;
const money = (n) => (n === null || n === undefined ? 'none' : Number(n).toFixed(2));
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {object} p
 * @param {Array} p.variants  store variants: { id, productId, title, price, compareAt, policy:'CONTINUE'|'DENY', qty, monitoringFlag:'true'|'false'|null (product), variantMonitoringFlag, btiNumber }
 * @param {Map}   p.map       variant id -> [part numbers]
 * @param {Array} p.items     parsed portal items
 * @param {string} p.today    'YYYY-MM-DD'
 */
function plan({ variants, map, items, today }) {
    const byPart = new Map(); for (const it of items) byPart.set(it.part.toUpperCase(), it);
    const lines = []; const mappedParts = new Set(); let foundParts = 0, wantedParts = 0;
    for (const v of variants) {
        const parts = map.get(String(v.id));
        const line = { id: String(v.id), productId: v.productId, title: v.title, current: { price: v.price, compareAt: v.compareAt, policy: v.policy, qty: v.qty }, parts: parts || [], portal: null, changes: [], notes: [], status: 'ok' };
        const off = String(v.monitoringFlag).toLowerCase() === 'false' || String(v.variantMonitoringFlag).toLowerCase() === 'false';
        line.owner = { btiScanOff: off, btiNumberPresent: !!(v.btiNumber && String(v.btiNumber).trim() && String(v.btiNumber).toUpperCase() !== 'IGNORE') };
        if (!parts) { line.status = 'unmapped'; line.notes.push('no portal part number in the mapping file: nothing is done'); lines.push(line); continue; }
        parts.forEach((p) => { mappedParts.add(p.toUpperCase()); wantedParts++; });
        const hits = parts.map((p) => byPart.get(p.toUpperCase())).filter(Boolean); foundParts += hits.length;
        if (!hits.length) { line.status = 'not_in_portal'; line.notes.push('the portal file has none of its parts (discontinued or renamed?): left unchanged, nothing deleted or denied'); lines.push(line); continue; }
        const msrps = [...new Set(hits.map((h) => h.msrp).filter((m) => m !== null))];
        const qtys = hits.map((h) => h.qty); const qtyKnown = qtys.every((q) => q !== null);
        line.portal = { parts: hits.map((h) => h.part), msrp: msrps.length === 1 ? msrps[0] : null, qty: qtyKnown ? qtys.reduce((a, b) => a + b, 0) : null, status: [...new Set(hits.map((h) => h.status).filter(Boolean))].join('; ') };
        if (hits.length < parts.length) line.notes.push(`only ${hits.length} of ${parts.length} mapped parts are in the file`);
        if (/discontinu|closeout|obsolete|end of life/i.test(line.portal.status)) line.notes.push(`portal status: ${line.portal.status}`);
        if (!off) { line.status = 'blocked_bti'; line.notes.push('BTI scan is not off for this variant (custom.inventory_monitoring_enabled): nothing is written, one owner only'); }
        // price
        if (msrps.length > 1) { line.notes.push('the mapped parts have different MSRPs: price not changed'); }
        else if (msrps.length === 1) {
            const goal = msrps[0], cur = Number(v.price);
            const lowest = r2(goal * (1 - SALE_WINDOW.maxDiscount));
            if (cur === goal) { /* right already */ }
            else if (cur < goal && inSaleWindow(today) && cur >= lowest) line.notes.push(`price ${money(cur)} is below MSRP ${money(goal)} inside the sale window (to ${SALE_WINDOW.end}, up to 20% off): kept`);
            else line.changes.push({ field: 'price', from: cur, to: goal, why: cur > goal ? 'above MSRP: lowered to MSRP' : (inSaleWindow(today) ? 'more than 20% below MSRP: raised to MSRP' : 'below MSRP outside the sale window: raised to MSRP') });
            const heldSale = cur < goal && inSaleWindow(today) && cur >= lowest;
            if (v.compareAt !== null && v.compareAt !== undefined && !heldSale) line.changes.push({ field: 'compareAt', from: Number(v.compareAt), to: null, why: 'MSRP is the price: no compare-at' });
        } else line.notes.push('no MSRP in the file for this item: price not changed');
        // stock
        if (line.portal.qty === null) line.notes.push('no readable quantity: policy not changed');
        else if (v.qty > 0) line.notes.push(`we hold ${v.qty}: policy not changed (portal ${line.portal.qty})`);
        else { const want = line.portal.qty > 0 ? 'CONTINUE' : 'DENY'; if (v.policy !== want) line.changes.push({ field: 'policy', from: v.policy, to: want, why: line.portal.qty > 0 ? 'Spank has stock and we hold none: keep selling' : 'Spank has none and we hold none: stop selling' }); }
        if (line.status === 'blocked_bti') line.blockedChanges = line.changes.splice(0);
        lines.push(line);
    }
    const mappedIds = new Set(variants.map((v) => String(v.id)));
    const missingVariants = [...map.keys()].filter((id) => !mappedIds.has(id));
    const newPortalItems = items.filter((it) => !mappedParts.has(it.part.toUpperCase())).map((it) => ({ part: it.part, name: it.name, msrp: it.msrp, qty: it.qty, status: it.status }));
    const changeCount = lines.reduce((n, l) => n + l.changes.length, 0);
    const refuse = [];
    if (items.length < MIN_PORTAL_ROWS) refuse.push(`the portal file has only ${items.length} rows (under ${MIN_PORTAL_ROWS}): looks truncated`);
    if (wantedParts && foundParts / wantedParts < MIN_FOUND_SHARE) refuse.push(`only ${foundParts} of ${wantedParts} mapped parts are in the file (under half): wrong or partial capture`);
    return { today, saleWindow: inSaleWindow(today), lines, missingVariants, newPortalItems, changeCount, refuse, needsForce: changeCount > MAX_CHANGES };
}

/** Plain-text report. Contains store prices and portal MSRP and quantity only. */
function formatReport(pl) {
    const out = [];
    out.push(`SPANK PORTAL FILE, DRY RUN REPORT (${pl.today}${pl.saleWindow ? ', inside the sale window to ' + SALE_WINDOW.end : ''})`);
    if (pl.refuse.length) { out.push('REFUSED TO WRITE: ' + pl.refuse.join(' | ')); }
    out.push(`variants checked ${pl.lines.length}; changes proposed ${pl.changeCount}${pl.needsForce ? ' (more than ' + MAX_CHANGES + ': --force needed)' : ''}`);
    out.push('');
    for (const l of pl.lines) {
        out.push(`${l.title} [${l.id}] ${l.status}`);
        out.push(`   now: price ${money(l.current.price)}, compare-at ${money(l.current.compareAt)}, policy ${l.current.policy}, we hold ${l.current.qty}; BTI scan off: ${l.owner.btiScanOff ? 'yes' : 'NO'}; BTI number kept: ${l.owner.btiNumberPresent ? 'yes' : 'no'}`);
        if (l.portal) out.push(`   portal: ${l.portal.parts.join('/')} MSRP ${money(l.portal.msrp)} qty ${l.portal.qty === null ? '?' : l.portal.qty}${l.portal.status ? ' (' + l.portal.status + ')' : ''}`);
        for (const c of l.changes) out.push(`   WOULD CHANGE ${c.field}: ${c.field === 'policy' ? c.from : money(c.from)} -> ${c.field === 'policy' ? c.to : money(c.to)} (${c.why})`);
        for (const c of l.blockedChanges || []) out.push(`   BLOCKED ${c.field}: ${c.from} -> ${c.to}`);
        for (const n of l.notes) out.push(`   note: ${n}`);
    }
    if (pl.missingVariants.length) { out.push(''); out.push('MAPPED BUT NOT FOUND IN THE STORE: ' + pl.missingVariants.join(', ')); }
    out.push(''); out.push(`PORTAL ITEMS WITH NO STORE MAPPING (${pl.newPortalItems.length}; new items, parts or other models):`);
    for (const n of pl.newPortalItems) out.push(`   ${n.part} | ${n.name} | MSRP ${money(n.msrp)} | qty ${n.qty === null ? '?' : n.qty}${n.status ? ' | ' + n.status : ''}`);
    return out.join('\n') + '\n';
}

module.exports = { parsePortalCsv, parseMapCsv, splitParts, plan, formatReport, inSaleWindow, USED_COLUMNS, SALE_WINDOW, MAX_CHANGES };
