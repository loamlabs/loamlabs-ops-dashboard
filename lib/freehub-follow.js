// lib/freehub-follow.js
// "freehub-follow": keep a rear hub's product metafield custom.freehub (the freehubs the hub OFFERS) in step with e*thirteen's own hub page. PURE: no network.
//
// Per value in the hub's list (XD, HG, MS only; XD-R, HG-R, N3W and anything else are never touched):
//   - the hub page lists that driver for the hub's spacing and EVERY variant of it (any hole count) is out of stock -> candidate to REMOVE
//   - the page lists it and at least one variant is in stock -> in stock
//   - the page does not list it at all (for example HG on the Pro hubs) -> never removed, only reported as a data note
// A value is removed only when it was out on the PREVIOUS run too (two runs in a row), and added back only when the Watcher removed it earlier and it has been
// in stock on two runs in a row. At least one value always stays in the list (if a removal would empty it, nothing changes and a note says so).
// The previous observation lives in a JSON metafield custom.freehub_watch: { obs: {XD:'in'|'out'}, removed: ['XD'], order: ['XD','HG','MS'] }.

const MANAGED = ['XD', 'HG', 'MS'];
const clean = (t) => String(t || '').replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();

/** 'Sidekick GR Rear Hub - 6-Bolt - 12x148mm (28h / Black)' -> '148'; 157 for Superboost; null when unknown */
function spacingOf(title) {
    const m = /12\s*x\s*(148|157)/i.exec(String(title || ''));
    return m ? m[1] : null;
}

/** driver of a vendor variant title like '148x12mm Boost / XD Driver / 28 Hole'; null for DM 7spd cassette, Mini HG and anything unknown */
function driverOf(publicTitle) {
    const t = clean(publicTitle);
    if (t.includes('7spd') || t.includes('7 spd') || t.includes('cassette') || t.includes('mini')) return null;
    if (/\bxd\b/.test(t) && !/\bms\b|microspline/.test(t)) return 'XD';
    if (t.includes('microspline') || /\bms\b/.test(t)) return 'MS';
    if (/\bhg\b/.test(t)) return 'HG';
    return null;
}

/** @returns {{XD:{listed:boolean,inStock:boolean},HG:{...},MS:{...}}} for the hub's spacing ('148'|'157') */
function driverStates(vendorVariants, spacing) {
    const out = { XD: { listed: false, inStock: false }, HG: { listed: false, inStock: false }, MS: { listed: false, inStock: false } };
    for (const v of Array.isArray(vendorVariants) ? vendorVariants : []) {
        const t = clean(v.public_title);
        if (!spacing || !t.includes(spacing)) continue;
        const d = driverOf(v.public_title);
        if (!d) continue;
        out[d].listed = true;
        if (v.available) out[d].inStock = true;
    }
    return out;
}

const inOrder = (order, values) => order.filter((v) => values.includes(v)).concat(values.filter((v) => !order.includes(v)));

/**
 * @param {object} p { list: string[], watch: {obs,removed,order}|null, states }
 * @returns {{ newList:string[], newWatch:object, removed:string[], added:string[], notes:string[], changed:boolean }}
 */
function planFreehubList({ list, watch, states }) {
    const cur = Array.isArray(list) ? list.slice() : [];
    const prev = (watch && watch.obs) || {};
    const wasRemoved = new Set((watch && watch.removed) || []);
    const order = (watch && watch.order && watch.order.length ? watch.order : cur).slice();
    const obs = {}, notes = [];
    const removeNow = [], addNow = [];

    for (const v of MANAGED) {
        const st = states[v];
        const inList = cur.includes(v), isRemoved = wasRemoved.has(v);
        if (!inList && !isRemoved) continue;                       // not ours to manage
        if (!st.listed) { if (inList) notes.push(`${v}: not listed on the e*thirteen page for this hub (left in the list, please check)`); continue; }
        obs[v] = st.inStock ? 'in' : 'out';
        if (inList && !st.inStock && prev[v] === 'out') removeNow.push(v);
        if (!inList && isRemoved && st.inStock && prev[v] === 'in') addNow.push(v);
    }

    let removed = removeNow;
    if (removed.length > 0 && cur.filter((v) => !removed.includes(v)).length === 0) {
        notes.push(`all freehubs are out on the e*thirteen page; the list was left as it is (the hub closes by its own stock)`);
        removed = [];
    }
    const newList = inOrder(order, cur.filter((v) => !removed.includes(v)).concat(addNow));
    const stillRemoved = [...wasRemoved].filter((v) => !addNow.includes(v)).concat(removed);
    const newWatch = { obs: { ...prev, ...obs }, removed: [...new Set(stillRemoved)], order: inOrder(order, [...new Set(order.concat(cur))]) };
    const changed = removed.length > 0 || addNow.length > 0;
    return { newList, newWatch, removed, added: addNow, notes, changed };
}

module.exports = { MANAGED, spacingOf, driverOf, driverStates, planFreehubList };
