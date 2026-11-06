// lib/signature-build/hub/lengths.js
// Imports Backend 1's spoke length table (data/hub_choice_spoke_lengths.csv). Re-runnable: the plan reads the CSV text it is given every time,
// nothing is hard-coded, so a regenerated file simply gives new lengths. Pure, no I/O.
//
// Columns used: product, hub, spacing (A/B/C), side (front/rear), wheel_size, rim_variant, hub_variant, status, cross, erd, washer_policy, washer_mm,
// final_erd, left_mm, right_mm, left_variant, left_policy, left_stock, right_variant, right_policy, right_stock.
// A "variant" cell looks like  51801275334963 | Black / 290mm  (id, then the title).

/** Minimal CSV parser: quotes, doubled quotes, CRLF, and a BOM at the start. */
function parseCsv(text) {
    const t = String(text || '').replace(/^﻿/, '');
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) {
            if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(f); f = ''; }
        else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
        else f += c;
    }
    if (f !== '' || row.length) { row.push(f.replace(/\r$/, '')); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim());
    return rows.slice(1).filter((r) => r.length > 1 || (r[0] || '').trim() !== '').map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}

const idOf = (cell) => { const m = String(cell || '').match(/^\s*(\d{6,20})/); return m ? m[1] : null; };
const titleOf = (cell) => String(cell || '').replace(/^\s*\d+\s*\|\s*/, '').trim();
const numOrNull = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const keyOf = (product, hub, spacing, side) => `${product}|${hub}|${spacing}|${side}`;

/** @returns {{index: Map, problems: string[], count: number}} */
function importLengths(csvText) {
    const rows = parseCsv(csvText);
    const index = new Map();
    const problems = [];
    if (!rows.length) problems.push('The spoke length table is empty.');
    for (const r of rows) {
        const need = ['product', 'hub', 'spacing', 'side', 'status', 'left_mm', 'right_mm', 'left_variant', 'right_variant'].filter((c) => r[c] === undefined);
        if (need.length) { problems.push(`The spoke length table is missing column(s): ${need.join(', ')}.`); break; }
        const k = keyOf(r.product, r.hub, r.spacing, r.side);
        if (index.has(k)) problems.push(`Duplicate row in the spoke length table: ${k}.`);
        index.set(k, {
            product: r.product, hub: r.hub, spacing: r.spacing, side: r.side, wheelSize: r.wheel_size, status: String(r.status || '').trim().toLowerCase(),
            leftMm: numOrNull(r.left_mm), rightMm: numOrNull(r.right_mm), leftVariantId: idOf(r.left_variant), rightVariantId: idOf(r.right_variant),
            leftTitle: titleOf(r.left_variant), rightTitle: titleOf(r.right_variant),
            leftPolicy: r.left_policy, rightPolicy: r.right_policy, rimVariantId: idOf(r.rim_variant), hubVariantId: idOf(r.hub_variant),
            erd: numOrNull(r.erd), washerPolicy: r.washer_policy || null, washerMm: numOrNull(r.washer_mm), finalErd: numOrNull(r.final_erd),
        });
    }
    return { index, problems, count: index.size };
}

/**
 * Lengths for one variant (hub x spacing) of one product.
 * @returns {{ok:boolean, reason?:string, front?:object, rear?:object}}
 */
function lookupLengths(index, { product, hub, spacingKey }) {
    const front = index.get(keyOf(product, hub, spacingKey, 'front'));
    const rear = index.get(keyOf(product, hub, spacingKey, 'rear'));
    if (!front || !rear) return { ok: false, reason: `no spoke lengths in the table for ${product} / ${hub} / ${spacingKey}` };
    for (const [side, r] of [['front', front], ['rear', rear]]) {
        if (r.status !== 'ok') return { ok: false, reason: `the ${side} spoke lengths did not calculate (status "${r.status}")` };
        if (!r.leftVariantId || !r.rightVariantId || r.leftMm === null || r.rightMm === null) return { ok: false, reason: `the ${side} spoke lengths are incomplete in the table` };
    }
    return { ok: true, front, rear };
}

module.exports = { parseCsv, importLengths, lookupLengths, keyOf, idOf };
