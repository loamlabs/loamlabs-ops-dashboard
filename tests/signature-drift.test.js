// Run with: npm test   (no network)
// Hub-choice build, step 4: the price drift report. Alert only; it never changes a price.
const test = require('node:test');
const assert = require('node:assert/strict');
const { driftReport, snapshotMaster, acceptRows, pricedParts, colourSpread } = require('../lib/signature-build/drift');
const { runBuildGuard } = require('../lib/build-guard');
const { basisMethods } = require('../lib/signature-build/drift-db');
const { handle } = require('../lib/signature-build/handler');
const { makeDb } = require('./helpers/signature-fakes');

const comps = JSON.stringify({ v: 1, components: [
    { role: 'front_rim', variants: ['1'] }, { role: 'rear_rim', variants: ['1'] },
    { role: 'front_hub', variants: ['10', '11'], mode: 'any' }, { role: 'rear_hub', variants: ['20', '21'], mode: 'any' },
    { role: 'freehub', variants: ['30'] }, { role: 'nipples', variants: ['40'] }, { role: 'spokes_front', variants: ['50', '51'], mode: 'all' }, { role: 'spokes_rear', variants: ['52'] },
] });
const P = (price, title) => ({ found: true, quantity: 0, policy: 'CONTINUE', price, label: `${title} (32h / Black)` });
const states = (o = {}) => new Map(Object.entries({ 1: P(649, 'Reserve Rim'), 10: P(240, 'Hydra2 Front Hub'), 11: P(240, 'Hydra2 Front Hub'), 20: P(510, 'Hydra2 Rear Hub'), 21: P(510, 'Hydra2 Rear Hub'), 30: P(0, 'Freehub'), 40: P(19.99, 'Brass Nipples'), 50: P(0, 'Spoke 290'), 51: P(0, 'Spoke 292'), 52: P(0, 'Spoke 270'), ...o }));
const master = (i, o = {}) => ({ variantId: String(100 + i), productId: 'P1', productTitle: 'Hub choice', title: `Hub choice (Hydra2 ${i})`, quantity: 0, policy: 'CONTINUE', tracked: true, price: 2000 + i, componentsRaw: comps, guardOff: false, guardState: null, ...o });

test('basis snapshot: priced roles only (rims, hubs, nipples); spoke length variants and freehubs carry no builder price', () => {
    const p = pricedParts(master(0), states());
    assert.deepEqual(Object.keys(p).sort(), ['1', '10', '11', '20', '21', '40'].sort());
    assert.equal(p['40'].role, 'nipples'); assert.equal(p['10'].price, 240);
    const row = snapshotMaster(master(0), states(), new Date('2026-11-05T12:00:00Z'));
    assert.equal(row.variant_id, '100'); assert.equal(row.master_price, 2000); assert.equal(row.reported_sig, null); assert.equal(row.taken_at, '2026-11-05T12:00:00.000Z');
});

test('first sight of a master takes a basis quietly: no alert', () => {
    const r = driftReport([master(0), master(1)], states(), new Map());
    assert.equal(r.newBasis.length, 2); assert.deepEqual(r.lines, []); assert.deepEqual(r.rows, []);
});

test('no change: no alert, no rows', () => {
    const basis = new Map([master(0), master(1)].map((m) => [m.variantId, snapshotMaster(m, states())]));
    const r = driftReport([master(0), master(1)], states(), basis);
    assert.deepEqual([r.newBasis.length, r.lines.length, r.rows.length], [0, 0, 0]);
});

test('a hub price change: one grouped line for all builds that use it, with the 90% estimate; each build lists its change', () => {
    const ms = Array.from({ length: 12 }, (_, i) => master(i));
    const basis = new Map(ms.map((m) => [m.variantId, snapshotMaster(m, states())]));
    const r = driftReport(ms, states({ 10: P(250, 'Hydra2 Front Hub'), 11: P(250, 'Hydra2 Front Hub') }), basis);
    assert.equal(r.lines.length, 1);
    assert.match(r.lines[0], /Hydra2 Front Hub rose from \$240\.00 to \$250\.00: 12 builds should move about \$\+9\.00 each/);
    assert.equal(r.rows.length, 12); assert.equal(r.rows[0].changes[0].move, 9); assert.equal(r.rows[0].changes.length, 2);          // two colour variants changed together
});

test('a fall reads as a fall; nipples are counted for two wheels; spoke lengths never produce an alert', () => {
    const m = master(0); const basis = new Map([[m.variantId, snapshotMaster(m, states())]]);
    const fall = driftReport([m], states({ 20: P(500, 'Hydra2 Rear Hub'), 21: P(500, 'Hydra2 Rear Hub') }), basis);
    assert.match(fall.lines[0], /fell from \$510\.00 to \$500\.00.*\$-9\.00 each/);
    const nip = driftReport([m], states({ 40: P(24.99, 'Brass Nipples') }), basis);
    assert.match(nip.lines[0], /\$\+9\.00 each .*two wheels/);                              // 5.00 x 2 wheels x 0.9
    assert.equal(driftReport([m], states({ 50: P(9, 'Spoke 290') }), basis).lines.length, 0);
});

test('hub colours that stop costing the same are flagged (Jerry\'s rule: all colours of one model are one price)', () => {
    const m = master(0);
    const s = states({ 11: P(260, 'Hydra2 Front Hub') });
    assert.deepEqual(colourSpread(m, s), [{ role: 'front_hub', label: 'Hydra2 Front Hub', prices: [240, 260] }]);
    const r = driftReport([m], s, new Map([[m.variantId, snapshotMaster(m, states())]]));
    assert.ok(r.lines.some((l) => /colours of Hydra2 Front Hub \(front hub\) no longer cost the same \(\$240\.00 \/ \$260\.00\)/.test(l)));
});

test('masters with the guard switched off or no component list are left out', () => {
    const r = driftReport([master(0, { guardOff: true }), master(1, { componentsRaw: null })], states(), new Map());
    assert.equal(r.newBasis.length, 0);
});

test('accept: rows for every master (or the chosen ones) at today\'s prices', () => {
    const rows = acceptRows([master(0), master(1)], states({ 10: P(250, 'x'), 11: P(250, 'x') }));
    assert.equal(rows.length, 2); assert.equal(rows[0].parts['10'].price, 250);
});

// ---------------------------------------------------------------- inside the guard run
const fakeStore = (masters, st) => ({ listMasters: async () => masters, readComponents: async () => st, writeMaster: async () => { throw new Error('the drift report must never write a master'); } });
const drift = (basis, log = []) => ({ readBasis: async (ids) => new Map(ids.filter((i) => basis[i]).map((i) => [i, basis[i]])), saveBasis: async (rows) => { log.push(rows.length); rows.forEach((r) => { basis[r.variant_id] = r; }); } });

test('guard run: day 1 takes the basis quietly; day 2 after a price change alerts once; day 3 with the same drift stays quiet', async () => {
    const ms = [master(0), master(1)]; const basis = {}; const log = [];
    let r = await runBuildGuard(fakeStore(ms, states()), { drift: drift(basis, log) });
    assert.deepEqual(r.driftLines, []); assert.equal(Object.keys(basis).length, 2); assert.deepEqual(r.changed, []);
    const up = states({ 10: P(250, 'Hydra2 Front Hub'), 11: P(250, 'Hydra2 Front Hub') });
    r = await runBuildGuard(fakeStore(ms, up), { drift: drift(basis, log) });
    assert.equal(r.driftLines.length, 1); assert.equal(r.driftRows.length, 2); assert.equal(r.changed.length, 0); assert.equal(r.emailLines.length, 0);
    r = await runBuildGuard(fakeStore(ms, up), { drift: drift(basis, log) });
    assert.equal(r.driftLines.length, 0); assert.equal(r.driftRows.length, 2);              // already e-mailed, but still in the list for the page
    const gone = states({ 10: P(260, 'Hydra2 Front Hub'), 11: P(260, 'Hydra2 Front Hub') });
    assert.equal((await runBuildGuard(fakeStore(ms, gone), { drift: drift(basis, log) })).driftLines.length, 1);   // a NEW change is reported again
});

test('guard run: a dry run reports but saves nothing; a failing basis table does not stop the guard; drift off adds nothing', async () => {
    const ms = [master(0)]; const basis = {}; const log = [];
    await runBuildGuard(fakeStore(ms, states()), { drift: drift(basis, log), dryRun: true });
    assert.deepEqual(log, []); assert.equal(Object.keys(basis).length, 0);
    const broken = { readBasis: async () => { throw new Error('relation does not exist'); }, saveBasis: async () => {} };
    const writer = { ...fakeStore(ms, states({ 1: { found: true, quantity: 0, policy: 'DENY', label: 'Rim' } })), writeMaster: async () => {} };
    const r = await runBuildGuard(writer, { drift: broken });
    assert.equal(r.changed.length, 1); assert.match(r.skipped.join(' '), /price drift report unavailable \(relation does not exist\)/);   // the guard still closed the build
    const off = await runBuildGuard(fakeStore(ms, states())); assert.deepEqual(off.driftLines, []); assert.equal(JSON.stringify(off).includes('drift'), false);
});

test('basis table access: select, upsert in batches, list; works through a stub of the Supabase client', async () => {
    const rowsDb = {};
    const client = { from: (t) => {
        assert.equal(t, 'signature_price_basis');
        return {
            select: () => ({ in: async (c, ids) => ({ data: ids.filter((i) => rowsDb[i]).map((i) => rowsDb[i]), error: null }), limit: async () => ({ data: Object.values(rowsDb), error: null }) }),
            upsert: async (rows, o) => { assert.equal(o.onConflict, 'variant_id'); rows.forEach((r) => { rowsDb[r.variant_id] = r; }); return { error: null }; },
        };
    } };
    const m = basisMethods(client);
    await m.saveBasis(Array.from({ length: 450 }, (_, i) => ({ variant_id: String(i), parts: {} })));
    assert.equal((await m.readBasis(['1', '2', '999'])).size, 2); assert.equal((await m.listBasis()).length, 450);
});

// ---------------------------------------------------------------- dashboard route
const ENV = { SIGNATURE_TOOL_KEY: 'tool-key', DASHBOARD_PASSWORD: 'dash-pass', SIGNATURE_DRIFT_REPORT: 'on' };
const HDR = { 'x-dashboard-auth': 'dash-pass', 'x-signature-tool-key': 'tool-key', 'x-forwarded-for': '2.2.2.2' };

test('route: the drift list is read-only and needs both secrets; accept writes only the basis table', async () => {
    const db = makeDb(); const ms = [master(0), master(1)];
    let st = states(); const writes = [];
    const deps = { db, makeGuardStore: async () => ({ listMasters: async () => ms, readComponents: async () => st, writeMaster: async () => writes.push('MASTER WRITE') }), makeStore: async () => { throw new Error('the tool store must not be used'); } };
    const call = (action, method, body, headers) => handle({ action, method, headers: headers || HDR, body, env: ENV, deps });
    assert.equal((await call('drift', 'GET', null, { 'x-dashboard-auth': 'dash-pass' })).status, 401);
    assert.equal((await call('drift', 'POST', {})).status, 405);
    const first = await call('drift', 'GET'); assert.equal(first.status, 200); assert.deepEqual([first.body.enabled, first.body.masters, first.body.withBasis, first.body.withoutBasis], [true, 2, 0, 2]);
    assert.equal(Object.keys(db.basis).length, 0);                                            // viewing writes nothing
    const acc = await call('drift-accept', 'POST', {}); assert.equal(acc.body.accepted, 2); assert.equal(Object.keys(db.basis).length, 2);
    st = states({ 10: P(250, 'Hydra2 Front Hub'), 11: P(250, 'Hydra2 Front Hub') });
    const after = await call('drift', 'GET'); assert.equal(after.body.rows.length, 2); assert.match(after.body.lines[0], /rose from \$240\.00 to \$250\.00/);
    const one = await call('drift-accept', 'POST', { variantIds: ['100'] }); assert.equal(one.body.accepted, 1);
    assert.deepEqual(writes, []);                                                              // no master, no price, no stock was written
});
