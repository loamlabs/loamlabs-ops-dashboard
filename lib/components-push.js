// lib/components-push.js
// Library -> Shopify push for ONE variant at a time. These metafields drive the builder and the spoke lengths on real orders, so:
//   - only the fields in PUSH_FIELDS can ever be written (named list, confirmed with Jerry): rim ERD and weight
//   - one variant per action; a preview shows exactly what changes from what to what
//   - a typed confirmation "PUSH <variantId>" is required, and the server switch COMPONENT_PUSH_ENABLED must be "on" (off = preview only)
//   - the old Shopify values are written to the push log BEFORE the write, so every push can be undone; undo is another one-variant push
//   - nothing calls this from a job. Tests use mocks.
const PUSH_FIELDS = {
    'Variant Metafield: custom.rim_erd [number_decimal]': { key: 'rim_erd', label: 'Rim ERD (mm)' },
    'Variant Metafield: custom.weight_g [number_decimal]': { key: 'weight_g', label: 'Weight (g)' },
};
const MAX_CHANGE_PCT = 0.25;   // a push that moves a value by more than 25% is refused (a typo guard)
const num = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(v));

/** @param row library row; shopify {erd, weight} current values @returns {{variantId, changes:[{field,key,label,from,to}], refused:string[]}} */
function buildPushPlan(row, shopify) {
    const variantId = String((row && (row.shopify_variant_id || row['Variant ID'])) || '');
    const changes = [], refused = [];
    if (!/^\d+$/.test(variantId)) return { variantId, changes, refused: ['This row has no Shopify variant id.'] };
    const current = { rim_erd: shopify && shopify.erd, weight_g: shopify && shopify.weight };
    for (const [field, f] of Object.entries(PUSH_FIELDS)) {
        const to = num(row[field]), from = num(current[f.key]);
        if (!(to > 0)) continue;
        if (from === to) continue;
        if (from > 0 && Math.abs(to - from) / from > MAX_CHANGE_PCT) { refused.push(`${f.label}: ${from} to ${to} is more than ${MAX_CHANGE_PCT * 100}% different; change it in smaller steps or edit it in Shopify.`); continue; }
        changes.push({ field, key: f.key, label: f.label, from, to });
    }
    return { variantId, changes, refused };
}

/**
 * @param {object} p { plan, confirm, enabled, readCurrent(variantId)->{erd,weight}, writeMetafields(variantId, [{key,value}]), appendLog(entry), title, now }
 * @returns {Promise<{ok:boolean, error?:string, logged?:object}>}
 */
async function executePush({ plan, confirm, enabled, readCurrent, writeMetafields, appendLog, title = '', now = () => new Date().toISOString(), kind = 'push' }) {
    if (!enabled) return { ok: false, error: 'Push to Shopify is switched off on the server (COMPONENT_PUSH_ENABLED). Preview only.' };
    if (confirm !== `PUSH ${plan.variantId}`) return { ok: false, error: `Type PUSH ${plan.variantId} to confirm.` };
    if (!plan.changes.length) return { ok: false, error: 'Nothing to push.' };
    const cur = await readCurrent(plan.variantId);
    const keyVal = { rim_erd: cur && cur.erd, weight_g: cur && cur.weight };
    for (const c of plan.changes) if (num(keyVal[c.key]) !== num(c.from)) return { ok: false, error: `${c.label} in Shopify is now ${keyVal[c.key]} (the preview said ${c.from}). Preview again.` };
    const entry = { at: now(), kind, variantId: plan.variantId, title, changes: plan.changes.map((c) => ({ key: c.key, label: c.label, old: num(keyVal[c.key]), new: c.to })) };
    await appendLog(entry);                                    // old values are saved first
    await writeMetafields(plan.variantId, plan.changes.map((c) => ({ key: c.key, value: String(c.to) })));
    return { ok: true, logged: entry };
}

/** undo a logged push = a plan that sets the old values back (still needs the typed confirmation) */
function planUndo(entry, shopify) {
    const changes = entry.changes.filter((c) => c.old > 0).map((c) => ({ key: c.key, label: c.label, from: num(c.key === 'rim_erd' ? shopify.erd : shopify.weight), to: c.old, field: Object.keys(PUSH_FIELDS).find((k) => PUSH_FIELDS[k].key === c.key) }));
    return { variantId: entry.variantId, changes, refused: [] };
}

module.exports = { PUSH_FIELDS, MAX_CHANGE_PCT, buildPushPlan, executePush, planUndo };
