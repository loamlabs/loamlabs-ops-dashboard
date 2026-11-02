// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseComponents, isComponentAvailable, planMaster, runBuildGuard } = require('../lib/build-guard');

const comps = (extra) => JSON.stringify({ v: 1, components: [
  { role: 'front_rim', variants: ['gid://shopify/ProductVariant/1'] },
  { role: 'rear_hub', variants: ['2'] },
  { role: 'spokes_front', variants: ['3', '4'], mode: 'any' },
  { role: 'freehub', variants: ['5'] }, ...(extra || []) ] });
const ok = { found: true, quantity: 5, policy: 'DENY' };
const out = { found: true, quantity: 0, policy: 'DENY', label: 'x' };
const cont = { found: true, quantity: 0, policy: 'CONTINUE' };
const mk = (over) => ({ variantId: 'M1', title: 'Gravel Build', quantity: 3, policy: 'DENY', tracked: true, guardOff: false, guardState: null, componentsRaw: comps(), ...over });
const st = (o) => new Map(Object.entries({ 1: ok, 2: ok, 3: ok, 4: ok, 5: ok, ...o }));

test('component availability: qty > 0 or CONTINUE; zero + DENY or missing is unavailable', () => {
  assert.equal(isComponentAvailable(ok), true);
  assert.equal(isComponentAvailable(cont), true);
  assert.equal(isComponentAvailable(out), false);
  assert.equal(isComponentAvailable({ found: true, quantity: -2, policy: 'DENY' }), false);
  assert.equal(isComponentAvailable({ found: false }), false);
  assert.equal(isComponentAvailable(undefined), false);
});

test('parseComponents: gid ids are normalised, bad input is refused, none is silent', () => {
  const p = parseComponents(comps());
  assert.equal(p.ok, true); assert.deepEqual(p.groups[0].variants, ['1']); assert.equal(p.groups[2].mode, 'any');
  assert.equal(parseComponents(null).reason, 'none');
  assert.equal(parseComponents('{oops').ok, false);
  assert.equal(parseComponents('{"components":[]}').ok, false);
  assert.equal(parseComponents('{"components":[{"role":"x","variants":[]}]}').ok, false);
});

test('all components available: nothing to do', () => {
  assert.equal(planMaster({ master: mk(), states: st(), sellable: { type: 'continue' } }).action, 'none');
});

test('one component sold out: master goes to qty 0 + DENY with a reason', () => {
  const p = planMaster({ master: mk(), states: st({ 2: out }), sellable: { type: 'continue' } });
  assert.equal(p.action, 'sell_out');
  assert.deepEqual(p.write, { quantity: 0, policy: 'DENY', state: 'sold_out_by_guard', trackInventory: true });
  assert.match(p.line, /rear_hub/);
});

test('alternatives (mode any): one spoke length out is fine, both out sells the master out', () => {
  assert.equal(planMaster({ master: mk(), states: st({ 3: out }), sellable: { type: 'continue' } }).action, 'none');
  assert.equal(planMaster({ master: mk(), states: st({ 3: out, 4: out }), sellable: { type: 'continue' } }).action, 'sell_out');
});

test('a component that sells while out of stock (CONTINUE) counts as available', () => {
  assert.equal(planMaster({ master: mk(), states: st({ 2: cont }), sellable: { type: 'continue' } }).action, 'none');
});

test('deleted component or changed variant id: fail safe, master sold out, line says missing', () => {
  const s = st(); s.set('5', { found: false });
  const p = planMaster({ master: mk(), states: s, sellable: { type: 'continue' } });
  assert.equal(p.action, 'sell_out'); assert.match(p.line, /5 \(missing\)/);
});

test('already sold out by the guard: stays quiet; sold out by hand: not claimed', () => {
  const sold = { quantity: 0, policy: 'DENY' };
  assert.equal(planMaster({ master: mk({ ...sold, guardState: 'sold_out_by_guard' }), states: st({ 2: out }), sellable: { type: 'continue' } }).action, 'none');
  const hand = planMaster({ master: mk({ ...sold }), states: st({ 2: out }), sellable: { type: 'continue' } });
  assert.equal(hand.action, 'skip'); assert.equal(hand.write, null);
});

test('everything back: guard reopens only what it closed (continue mode and stock mode)', () => {
  const closed = mk({ quantity: 0, policy: 'DENY', guardState: 'sold_out_by_guard' });
  const a = planMaster({ master: closed, states: st(), sellable: { type: 'continue' } });
  assert.equal(a.action, 'restore'); assert.deepEqual(a.write, { policy: 'CONTINUE', state: 'on_sale_by_guard', trackInventory: true });
  const b = planMaster({ master: closed, states: st(), sellable: { type: 'stock', quantity: 2 } });
  assert.deepEqual(b.write, { quantity: 2, policy: 'DENY', state: 'on_sale_by_guard', trackInventory: true });
  const byHand = planMaster({ master: mk({ quantity: 0, policy: 'DENY' }), states: st(), sellable: { type: 'continue' } });
  assert.equal(byHand.action, 'none');
});

test('no component list: never touched; bad list or guard off: left unchanged and reported', () => {
  assert.equal(planMaster({ master: mk({ componentsRaw: null }), states: st({ 2: out }), sellable: { type: 'continue' } }).action, 'none');
  assert.equal(planMaster({ master: mk({ componentsRaw: '{oops' }), states: st(), sellable: { type: 'continue' } }).action, 'skip');
  const off = planMaster({ master: mk({ guardOff: true }), states: st({ 2: out }), sellable: { type: 'continue' } });
  assert.equal(off.action, 'skip'); assert.equal(off.write, null);
});

function fakeStore(masters, comps) {
  const writes = [];
  return { writes, listMasters: async () => masters, readComponents: async (ids) => new Map(ids.map((i) => [i, comps[i] || { found: false }])), writeMaster: async (m, w) => { writes.push([m.variantId, w]); Object.assign(m, { quantity: w.quantity ?? m.quantity, policy: w.policy, guardState: w.state }); } };
}

test('runner: component goes out then comes back; only the guard writes, second run is quiet', async () => {
  const masters = [mk(), mk({ variantId: 'M2', title: 'Other Build', componentsRaw: JSON.stringify({ components: [{ role: 'rim', variants: ['9'] }] }) }), mk({ variantId: 'M3', title: 'Plain', componentsRaw: null })];
  const c = { 1: ok, 2: ok, 3: ok, 4: ok, 5: ok, 9: ok };
  const store = fakeStore(masters, c);
  let r = await runBuildGuard(store); assert.equal(r.changed.length, 0);
  c[2] = out;
  r = await runBuildGuard(store); assert.equal(r.changed.length, 1); assert.equal(store.writes[0][0], 'M1'); assert.match(r.emailLines[0], /sold out/);
  r = await runBuildGuard(store); assert.equal(r.changed.length, 0);                      // idempotent
  c[2] = ok;
  r = await runBuildGuard(store); assert.equal(r.changed.length, 1); assert.match(r.emailLines[0], /back on sale/);
  assert.equal(store.writes.every(([id]) => id === 'M1'), true);                           // M2 and M3 never written
});

test('runner: failed component read changes nothing; one failed write does not stop the others; email is capped', async () => {
  const bad = { listMasters: async () => [mk()], readComponents: async () => { throw new Error('429'); }, writeMaster: async () => { throw new Error('must not write'); } };
  const r1 = await runBuildGuard(bad); assert.equal(r1.changed.length, 0); assert.equal(r1.failed.length, 1);

  const many = Array.from({ length: 10 }, (_, i) => mk({ variantId: 'M' + i, title: 'B' + i }));
  const store = fakeStore(many, { 1: out, 2: ok, 3: ok, 4: ok, 5: ok });
  const w = store.writeMaster; store.writeMaster = async (m, x) => { if (m.variantId === 'M0') throw new Error('boom'); return w(m, x); };
  const r2 = await runBuildGuard(store);
  assert.equal(r2.changed.length, 9); assert.equal(r2.failed.length, 1);
  assert.equal(r2.emailLines.length, 7); assert.match(r2.emailLines[6], /and 4 more/);
  const dry = await runBuildGuard(fakeStore([mk()], { 1: out, 2: ok, 3: ok, 4: ok, 5: ok }), { dryRun: true });
  assert.equal(dry.changed.length, 1);
});
