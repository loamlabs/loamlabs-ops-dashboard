// lib/build-guard.js
// Keeps preconfigured-build "master" variants in step with their components' stock. PURE planning + a runner that talks to an injected store
// (so it can be unit tested and run against a fake store; no network here).
//
// A master variant lists its exact components in the variant metafield custom.build_components (JSON, see parseComponents).
// Rules (Jerry, 2 Nov):
//   - a component is AVAILABLE if inventory > 0 OR policy is CONTINUE; UNAVAILABLE if inventory <= 0 AND policy is DENY (or the variant is gone)
//   - a master is available only if EVERY component group is available; otherwise it is set to quantity 0 + policy DENY ("sold out by the guard")
//   - when everything is available again the guard puts the master back to the sellable state Jerry chose, but ONLY if the guard itself sold it out
//     (custom.build_guard_state says so). A master someone sold out by hand is never reopened by the guard.
//   - the guard is the only writer of a master's stock/policy; masters carry no BTI part number and no watcher rule, so BTI and the Watcher skip them.
//   - custom.build_guard_off = "true" on the master variant: the guard leaves it alone (human override) and only reports it.
// A master with no custom.build_components is never touched.

const MAX_EMAIL_LINES = 6;

const norm = (id) => String(id == null ? '' : id).split('/').pop();

/**
 * custom.build_components JSON:
 * { "v": 1, "components": [ { "role": "rear_hub", "variants": ["5170..."], "mode": "any" }, ... ] }
 *   mode "any" (default): the group is available if at least one listed variant is available (alternatives, e.g. spoke lengths that both work)
 *   mode "all": every listed variant must be available
 * @returns {{ok:true, groups:object[]}|{ok:false, reason:string}}
 */
function parseComponents(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: false, reason: 'none' };
    let j;
    try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { ok: false, reason: 'build_components is not valid JSON' }; }
    const list = j && Array.isArray(j.components) ? j.components : null;
    if (!list || list.length === 0) return { ok: false, reason: 'build_components has no components' };
    const groups = [];
    for (const c of list) {
        const variants = (Array.isArray(c && c.variants) ? c.variants : []).map(norm).filter(Boolean);
        if (variants.length === 0) return { ok: false, reason: `component "${c && c.role}" lists no variants` };
        groups.push({ role: String((c && c.role) || 'component'), variants, mode: c.mode === 'all' ? 'all' : 'any' });
    }
    return { ok: true, groups };
}

function isComponentAvailable(state) {
    if (!state || !state.found) return false;                       // deleted / id changed: fail safe, master is sold out
    return Number(state.quantity) > 0 || String(state.policy).toUpperCase() === 'CONTINUE';
}

/** @returns {{available:boolean, reasons:string[]}} reasons name what is unavailable */
function evaluateGroups(groups, states) {
    const reasons = [];
    for (const g of groups) {
        const av = g.variants.map((id) => ({ id, ok: isComponentAvailable(states.get(id)), st: states.get(id) }));
        const groupOk = g.mode === 'all' ? av.every((a) => a.ok) : av.some((a) => a.ok);
        if (!groupOk) {
            const bad = av.filter((a) => !a.ok).map((a) => (a.st && a.st.found ? (a.st.label || a.id) : `${a.id} (missing)`));
            reasons.push(`${g.role}: ${bad.join(', ')}`);
        }
    }
    return { available: reasons.length === 0, reasons };
}

/**
 * @param {object} p
 * @param {object} p.master  { variantId, title, quantity, policy, tracked, guardOff:boolean, guardState:'sold_out_by_guard'|'on_sale_by_guard'|null, componentsRaw }
 * @param {Map<string,object>} p.states  component states keyed by numeric variant id: { found, quantity, policy, label }
 * @param {{type:'continue'}|{type:'stock', quantity:number}} p.sellable  what a sellable master looks like (Jerry decides)
 * @returns {{action:'none'|'sell_out'|'restore'|'skip', write:null|{quantity?:number, policy:string, state:string}, line:string|null, note:string|null}}
 */
function planMaster({ master, states, sellable }) {
    const out = { action: 'none', write: null, line: null, note: null };
    const parsed = parseComponents(master.componentsRaw);
    if (!parsed.ok) {
        if (parsed.reason !== 'none') { out.action = 'skip'; out.note = `${master.title}: ${parsed.reason}; left unchanged`; }
        return out;
    }
    if (master.guardOff) { out.action = 'skip'; out.note = `${master.title}: guard switched off for this build (custom.build_guard_off); left unchanged`; return out; }

    const ev = evaluateGroups(parsed.groups, states);
    const soldOutNow = Number(master.quantity) <= 0 && String(master.policy).toUpperCase() === 'DENY' && master.tracked !== false;

    if (!ev.available) {
        if (soldOutNow && master.guardState === 'sold_out_by_guard') return out;          // already done, stay quiet
        if (soldOutNow) { out.action = 'skip'; out.note = `${master.title}: already sold out by hand; guard marks nothing`; return out; }
        out.action = 'sell_out';
        out.write = { quantity: 0, policy: 'DENY', state: 'sold_out_by_guard', trackInventory: true };
        out.line = `Build "${master.title}" set to sold out: ${ev.reasons.join('; ')}`;
        return out;
    }
    // all components available
    if (master.guardState !== 'sold_out_by_guard') return out;                            // never reopen something the guard did not close
    out.action = 'restore';
    out.write = sellable.type === 'stock'
        ? { quantity: Math.max(1, Number(sellable.quantity) || 1), policy: 'DENY', state: 'on_sale_by_guard', trackInventory: true }
        : { policy: 'CONTINUE', state: 'on_sale_by_guard', trackInventory: true };
    out.line = `Build "${master.title}" back on sale: all components are available`;
    return out;
}

/**
 * Runs the guard against a store. The store must provide:
 *   listMasters(): Promise<master[]>                      variants that have custom.build_components (or any), see planMaster
 *   readComponents(ids): Promise<Map<id, state>>          one entry per numeric variant id (found:false when it does not exist)
 *   writeMaster(master, write): Promise<void>             the ONLY writer of a master's stock / policy / guard state
 * Failures on one master never stop the others; a failed component read leaves every master that uses it unchanged.
 * @returns {{changed:object[], skipped:string[], failed:string[], emailLines:string[]}}
 */
async function runBuildGuard(store, { sellable = { type: 'continue' }, dryRun = false } = {}) {
    const res = { changed: [], skipped: [], failed: [], emailLines: [] };
    const masters = await store.listMasters();
    const ids = new Set();
    for (const m of masters) { const p = parseComponents(m.componentsRaw); if (p.ok) p.groups.forEach((g) => g.variants.forEach((v) => ids.add(v))); }
    let states;
    try { states = await store.readComponents([...ids]); }
    catch (e) { res.failed.push(`could not read component stock (${e.message}); no master was changed`); res.emailLines.push(`Build guard: could not read component stock; no builds changed`); return res; }

    for (const m of masters) {
        const plan = planMaster({ master: m, states, sellable });
        if (plan.note) res.skipped.push(plan.note);
        if (!plan.write) continue;
        try {
            if (!dryRun) await store.writeMaster(m, plan.write);
            res.changed.push({ variantId: m.variantId, action: plan.action, write: plan.write });
            res.emailLines.push(plan.line);
        } catch (e) { res.failed.push(`${m.title}: ${e.message}`); res.emailLines.push(`Build guard: could not update "${m.title}" (${e.message})`); }
    }
    if (res.emailLines.length > MAX_EMAIL_LINES) {
        const more = res.emailLines.length - MAX_EMAIL_LINES;
        res.emailLines = res.emailLines.slice(0, MAX_EMAIL_LINES).concat(`...and ${more} more build change${more === 1 ? '' : 's'}`);
    }
    return res;
}

module.exports = { parseComponents, isComponentAvailable, evaluateGroups, planMaster, runBuildGuard, MAX_EMAIL_LINES };
