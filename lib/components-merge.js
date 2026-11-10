// lib/components-merge.js
// Three-way merge of component rows by row key (PURE). base = the version the tab loaded, mine = what the tab wants to save, theirs = what is on GitHub now.
// Changes that touch DIFFERENT rows are combined. The same row changed (or removed) on both sides with different results is a conflict and nothing is merged.
const { keyList, same } = require('./components-store');

function indexByKey(rows) { const k = keyList(rows); return { keys: k, map: new Map(rows.map((r, i) => [k[i], r])) }; }
const titleOf = (r) => String((r && (r.Title || r.title || r.Name)) || '(no title)');

/** @returns {{ok:true, rows:object[], summary:{fromMe:number}}|{ok:false, conflicts:string[]}} */
function mergeRows(base, mine, theirs) {
    const B = indexByKey(base), M = indexByKey(mine), T = indexByKey(theirs);
    const conflicts = [];
    const myAdded = [], myEdited = new Map(), myRemoved = new Set();
    M.keys.forEach((k, i) => { if (!B.map.has(k)) myAdded.push([k, mine[i]]); else if (!same(B.map.get(k), mine[i])) myEdited.set(k, mine[i]); });
    for (const k of B.map.keys()) if (!M.map.has(k)) myRemoved.add(k);

    const added = [];
    for (const [k, r] of myAdded) { if (T.map.has(k)) { if (!same(T.map.get(k), r)) conflicts.push(titleOf(r)); } else added.push(r); }

    const result = [];
    for (let i = 0; i < theirs.length; i++) {
        const k = T.keys[i], t = theirs[i];
        const theirsChanged = B.map.has(k) && !same(B.map.get(k), t);
        if (myEdited.has(k)) {
            if (theirsChanged && !same(t, myEdited.get(k))) { conflicts.push(titleOf(t)); result.push(t); } else result.push(myEdited.get(k));
        } else if (myRemoved.has(k)) {
            if (theirsChanged) { conflicts.push(titleOf(t)); result.push(t); }   // else: removed by me, untouched by others -> dropped
        } else result.push(t);
    }
    for (const k of myEdited.keys()) if (!T.map.has(k)) conflicts.push(titleOf(myEdited.get(k)));   // I edited a row someone else removed
    if (conflicts.length) return { ok: false, conflicts: [...new Set(conflicts)] };
    return { ok: true, rows: added.concat(result), summary: { fromMe: myAdded.length + myEdited.size + myRemoved.size } };
}

module.exports = { mergeRows };
