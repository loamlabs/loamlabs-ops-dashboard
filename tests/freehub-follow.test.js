// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { spacingOf, driverOf, driverStates, planFreehubList } = require('../lib/freehub-follow');

const V = (t, available) => ({ public_title: t, available });
// shapes taken from the live e*thirteen pages (Nov 2026)
const grPage = [
  V('148x12mm Boost / XD Driver / 28 Hole', false), V('148x12mm Boost / XD Driver / 32 Hole', false),
  V('148x12mm Boost / HG Driver / 28 Hole', true), V('148x12mm Boost / HG Driver / 32 Hole', false),
  V('148x12mm Boost / Microspline Driver / 28 Hole', true), V('148x12mm Boost / Microspline Driver / 32 Hole', false),
  V('148x12mm Boost / DM 7spd Cassette / 32 Hole', false), V('148x12mm Boost / Mini HG / 32 Hole', false),
  V('157x12mm Super Boost/DH / XD Driver / 28 Hole', true), V('157x12mm Super Boost/DH / HG Driver / 28 Hole', true), V('157x12mm Super Boost/DH / Microspline Driver / 28 Hole', true),
];
const proPage = [V('148x12mm Boost / XD Driver / 28 Hole', true), V('148x12mm Boost / Microspline Driver / 32 Hole', true), V('157x12mm Super Boost / XD Driver / 28 Hole', false), V('157x12mm Super Boost / XD Driver / 32 Hole', true), V('157x12mm Super Boost / Microspline Driver / 32 Hole', true)];

test('spacing and driver parsing', () => {
  assert.equal(spacingOf('e*thirteen Sidekick GR Rear Hub - 6-Bolt - 12x148mm (28h / Black)'), '148');
  assert.equal(spacingOf('e*thirteen Sidekick Pro Rear Hub - 6-Bolt - 12x157mm Superboost'), '157');
  assert.equal(spacingOf('no spacing here'), null);
  assert.equal(driverOf('148x12mm Boost / XD Driver / 28 Hole'), 'XD');
  assert.equal(driverOf('148x12mm Boost / Microspline Driver / 28 Hole'), 'MS');
  assert.equal(driverOf('148x12mm Boost / HG Driver / 28 Hole'), 'HG');
  assert.equal(driverOf('148x12mm Boost / Mini HG / 32 Hole'), null);
  assert.equal(driverOf('148x12mm Boost / DM 7spd Cassette / 32 Hole'), null);
});

test('driver states: any hole count in stock counts, per spacing', () => {
  const s = driverStates(grPage, '148');
  assert.deepEqual(s.XD, { listed: true, inStock: false }); assert.deepEqual(s.HG, { listed: true, inStock: true }); assert.deepEqual(s.MS, { listed: true, inStock: true });
  assert.deepEqual(driverStates(grPage, '157').XD, { listed: true, inStock: true });
  const p = driverStates(proPage, '157');   // Pro Rear 12x157: XD out at 28h but in at 32h, Microspline in at 32h
  assert.equal(p.XD.inStock, true); assert.equal(p.MS.inStock, true); assert.equal(p.HG.listed, false);
});

test('first run out: only recorded, nothing removed (two-run rule)', () => {
  const r = planFreehubList({ list: ['XD', 'HG', 'MS'], watch: null, states: driverStates(grPage, '148') });
  assert.deepEqual(r.removed, []); assert.deepEqual(r.newList, ['XD', 'HG', 'MS']); assert.equal(r.newWatch.obs.XD, 'out'); assert.equal(r.changed, false);
});

test('second run out: XD is removed, order kept, observation stored', () => {
  const first = planFreehubList({ list: ['XD', 'HG', 'MS'], watch: null, states: driverStates(grPage, '148') });
  const second = planFreehubList({ list: first.newList, watch: first.newWatch, states: driverStates(grPage, '148') });
  assert.deepEqual(second.removed, ['XD']); assert.deepEqual(second.newList, ['HG', 'MS']); assert.deepEqual(second.newWatch.removed, ['XD']); assert.equal(second.changed, true);
});

test('comes back: added only if the Watcher removed it, on two runs in stock, in the old position', () => {
  let w = { obs: { XD: 'out', HG: 'in', MS: 'in' }, removed: ['XD'], order: ['XD', 'HG', 'MS'] };
  const inStock = driverStates([V('148x12mm Boost / XD Driver / 28 Hole', true), V('148x12mm Boost / HG Driver / 28 Hole', true), V('148x12mm Boost / Microspline Driver / 28 Hole', true)], '148');
  const a = planFreehubList({ list: ['HG', 'MS'], watch: w, states: inStock });
  assert.deepEqual(a.added, []); assert.equal(a.newWatch.obs.XD, 'in');           // first run in stock: wait
  const b = planFreehubList({ list: ['HG', 'MS'], watch: a.newWatch, states: inStock });
  assert.deepEqual(b.added, ['XD']); assert.deepEqual(b.newList, ['XD', 'HG', 'MS']); assert.deepEqual(b.newWatch.removed, []);
});

test('a value Jerry never had is never added; a value the page does not list is never removed', () => {
  const r = planFreehubList({ list: ['XD', 'HG', 'MS'], watch: { obs: { XD: 'in', HG: 'out', MS: 'in' }, removed: [], order: ['XD', 'HG', 'MS'] }, states: driverStates(proPage, '148') });   // Pro 148 page has no HG
  assert.deepEqual(r.removed, []); assert.deepEqual(r.newList, ['XD', 'HG', 'MS']); assert.ok(r.notes.some((n) => /^HG: not listed/.test(n)));
  const r2 = planFreehubList({ list: ['XD', 'MS'], watch: null, states: { XD: { listed: true, inStock: true }, HG: { listed: true, inStock: true }, MS: { listed: true, inStock: true } } });
  assert.deepEqual(r2.added, []); assert.deepEqual(r2.newList, ['XD', 'MS']);
});

test('XD-R, HG-R and other values are never touched', () => {
  const out = { XD: { listed: true, inStock: false }, HG: { listed: true, inStock: false }, MS: { listed: true, inStock: true } };
  const r = planFreehubList({ list: ['XD-R', 'HG-R', 'XD', 'MS', 'N3W'], watch: { obs: { XD: 'out' }, removed: [], order: ['XD-R', 'HG-R', 'XD', 'MS', 'N3W'] }, states: out });
  assert.deepEqual(r.removed, ['XD']); assert.deepEqual(r.newList, ['XD-R', 'HG-R', 'MS', 'N3W']);
});

test('minimum one: if every freehub is out the list is left as it is and a note says so', () => {
  const allOut = { XD: { listed: true, inStock: false }, HG: { listed: true, inStock: false }, MS: { listed: true, inStock: false } };
  const r = planFreehubList({ list: ['XD', 'MS'], watch: { obs: { XD: 'out', MS: 'out' }, removed: [], order: ['XD', 'MS'] }, states: allOut });
  assert.deepEqual(r.removed, []); assert.deepEqual(r.newList, ['XD', 'MS']); assert.equal(r.changed, false); assert.ok(r.notes.some((n) => /all freehubs are out/.test(n)));
});
