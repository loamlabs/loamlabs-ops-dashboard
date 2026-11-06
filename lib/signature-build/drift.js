// lib/signature-build/drift.js
// Price drift report for Signature Build masters (hub-choice build, step 4). ALERT ONLY: nothing here ever changes a price in Shopify.
// A master's price is set by hand (builds 1 to 6 equal the builder total on the day they were made; Chris King builds sit under it on purpose),
// so the report does not compare the master with a formula. It compares each component's price today with the price it had when the master's
// basis was taken (first time the guard saw the master, or the last time Jerry accepted the prices), and says how far the master should move.
// Pure: the guard run passes in masters, component states (with price) and the stored basis rows.

const DISCOUNT = 0.1;
// Roles whose component price is a known builder price, and how many times it is counted in a wheel set. Spoke length variants carry no
// builder price (the "Length -" variant does), so spokes are not part of the estimate.
const ROLE_MULT = { front_rim: 1, rear_rim: 1, front_hub: 1, rear_hub: 1, nipples: 2 };

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const { parseComponents } = require('../build-guard');
const stable = (v) => JSON.stringify(v);

/** Every priced component variant of a master: { variantId: { role, price, label } } */
function pricedParts(master, states) {
    const p = parseComponents(master.componentsRaw);
    if (!p.ok) return {};
    const out = {};
    for (const g of p.groups) {
        if (!ROLE_MULT[g.role]) continue;
        for (const id of g.variants) {
            const s = states.get(id);
            if (s && s.found && typeof s.price === 'number') out[id] = { role: g.role, price: s.price, label: s.label || id };
        }
    }
    return out;
}

/** Hub colours of one model must all cost the same (Jerry's rule). Returns one entry per hub group whose colours differ in price. */
function colourSpread(master, states) {
    const p = parseComponents(master.componentsRaw);
    if (!p.ok) return [];
    const out = [];
    for (const g of p.groups) {
        if (g.role !== 'front_hub' && g.role !== 'rear_hub') continue;
        const priced = g.variants.map((id) => ({ id, s: states.get(id) })).filter((x) => x.s && x.s.found && typeof x.s.price === 'number');
        const prices = [...new Set(priced.map((x) => x.s.price))].sort((a, b) => a - b);
        if (prices.length > 1) out.push({ role: g.role, label: String(priced[0].s.label || '').replace(/\s*\([^()]*\)\s*$/, ''), prices });
    }
    return out;
}

/** Basis row to store: what the master and its components cost right now. */
function snapshotMaster(master, states, now = new Date()) {
    return {
        variant_id: String(master.variantId), product_gid: master.productId || null, title: master.title,
        master_price: typeof master.price === 'number' ? master.price : null, parts: pricedParts(master, states), taken_at: now.toISOString(), reported_sig: null,
    };
}

/**
 * Compare the masters with their basis rows.
 * @param {object[]} masters  guard masters (variantId, title, price, componentsRaw, productId)
 * @param {Map} states        component states with price
 * @param {Map<string,object>} basisByVariant
 * @returns {{ newBasis: object[], rows: object[], lines: string[], signature: string }}
 */
function driftReport(masters, states, basisByVariant, now = new Date()) {
    const newBasis = [], rows = [];
    const byComponent = new Map();     // component id -> { label, role, was, now, masters: [] }
    const spreads = new Map();
    for (const m of masters) {
        if (!parseComponents(m.componentsRaw).ok || m.guardOff) continue;
        const basis = basisByVariant.get(String(m.variantId));
        if (!basis) { newBasis.push(snapshotMaster(m, states, now)); continue; }
        const nowParts = pricedParts(m, states);
        const changes = [];
        for (const [id, was] of Object.entries(basis.parts || {})) {
            const cur = nowParts[id];
            if (!cur || cur.price === was.price) continue;
            changes.push({ id, role: was.role, label: cur.label, was: was.price, now: cur.price, move: round2((1 - DISCOUNT) * (cur.price - was.price) * ROLE_MULT[was.role]) });
            // one line per product and price change (the colours of a hub move together), counting each build once
            const base = String(cur.label).replace(/\s*\([^()]*\)\s*$/, '');
            const gk = [base, was.role, was.price, cur.price].join('|');
            const k = byComponent.get(gk) || { id: gk, role: was.role, label: cur.label, was: was.price, now: cur.price, masters: [], moveEach: round2((1 - DISCOUNT) * (cur.price - was.price) * ROLE_MULT[was.role]) };
            if (!k.masters.includes(m.title)) k.masters.push(m.title);
            byComponent.set(gk, k);
        }
        for (const sp of colourSpread(m, states)) { const k = `${sp.label}|${sp.role}|${sp.prices.join('/')}`; const e = spreads.get(k) || { ...sp, masters: [] }; e.masters.push(m.title); spreads.set(k, e); }
        if (changes.length || colourSpread(m, states).length) rows.push({ variantId: String(m.variantId), title: m.title, masterPrice: m.price ?? null, basisMasterPrice: basis.master_price ?? null, changes, colourSpread: colourSpread(m, states), basisAt: basis.taken_at });
    }
    const lines = [];
    for (const k of byComponent.values()) {
        const n = k.masters.length;
        const dir = k.now > k.was ? 'rose' : 'fell';
        lines.push(`Price drift: ${String(k.label).replace(/\s*\([^()]*\)\s*$/, '')} ${dir} from $${k.was.toFixed(2)} to $${k.now.toFixed(2)}: ${n} build${n === 1 ? '' : 's'} should move about $${k.moveEach >= 0 ? '+' : ''}${k.moveEach.toFixed(2)} each (90% of the change${k.role === 'nipples' ? ', two wheels' : ''})`);
    }
    for (const sp of spreads.values()) lines.push(`Price drift: the colours of ${sp.label} (${sp.role.replace('_', ' ')}) no longer cost the same (${sp.prices.map((p) => '$' + p.toFixed(2)).join(' / ')}); ${sp.masters.length} build${sp.masters.length === 1 ? '' : 's'} affected`);
    return { newBasis, rows, lines, signature: stable([...byComponent.values()].map((k) => [k.id, k.was, k.now]).concat([...spreads.keys()])) };
}

/** Rows for "accept the current prices as the new basis" (Jerry presses it after he has moved the master prices, or decided not to). */
function acceptRows(masters, states, now = new Date()) { return masters.filter((m) => parseComponents(m.componentsRaw).ok).map((m) => snapshotMaster(m, states, now)); }

module.exports = { driftReport, snapshotMaster, acceptRows, pricedParts, colourSpread, ROLE_MULT, DISCOUNT };
