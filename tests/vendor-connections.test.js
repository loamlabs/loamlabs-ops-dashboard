const test = require('node:test');
const assert = require('node:assert/strict');
const { countConnections } = require('../lib/vendor-connections');

let n = 0;
const row = (vendor, o = {}) => ({ shopify_product_id: o.p || 'P1', shopify_variant_id: String(++n), vendor_name: vendor, vendor_url: null, auto_update: false, bti_part_number: null, bti_monitoring_enabled: false, ...o });
const ACTIVE = new Set(['P1', 'P2']);

test('full: every item has a vendor URL and auto update on -> watcher full, BTI none', () => {
  const c = countConnections([row('A', { vendor_url: 'https://a.com/x', auto_update: true }), row('A', { vendor_url: 'https://a.com/y', auto_update: true })], ACTIVE);
  assert.deepEqual(c.A, { total: 2, watcher: 2, bti: 0, watcherState: 'full', btiState: 'none' });
});

test('partial: some but not all items connected', () => {
  const c = countConnections([row('A', { vendor_url: 'https://a.com/x', auto_update: true }), row('A'), row('A')], ACTIVE);
  assert.equal(c.A.watcher, 1); assert.equal(c.A.watcherState, 'partial'); assert.equal(c.A.total, 3);
});

test('none: no rules connected -> both none (no dot)', () => {
  const c = countConnections([row('B'), row('B')], ACTIVE);
  assert.equal(c.B.watcherState, 'none'); assert.equal(c.B.btiState, 'none');
});

test('vendor with only BTI: BTI full, Watcher none', () => {
  const c = countConnections([row('D', { bti_part_number: 'DT1234', bti_monitoring_enabled: true }), row('D', { bti_part_number: 'DT1235', bti_monitoring_enabled: true })], ACTIVE);
  assert.equal(c.D.btiState, 'full'); assert.equal(c.D.watcherState, 'none');
});

test('vendor with both: each kind counted on its own, a variant may be in both', () => {
  const c = countConnections([
    row('E', { vendor_url: 'https://e.com/x', auto_update: true, bti_part_number: 'E1', bti_monitoring_enabled: true }),
    row('E', { vendor_url: 'https://e.com/y', auto_update: true }),
    row('E', { bti_part_number: 'E3', bti_monitoring_enabled: true }),
  ], ACTIVE);
  assert.deepEqual([c.E.total, c.E.watcher, c.E.bti, c.E.watcherState, c.E.btiState], [3, 2, 2, 'partial', 'partial']);
});

test('a rule with no vendor URL is NOT a Watcher connection (blank, spaces, null); auto update off does not count either', () => {
  const c = countConnections([row('F', { vendor_url: '', auto_update: true }), row('F', { vendor_url: '   ', auto_update: true }), row('F', { vendor_url: null, auto_update: true }), row('F', { vendor_url: 'https://f.com/x', auto_update: false })], ACTIVE);
  assert.equal(c.F.watcher, 0); assert.equal(c.F.watcherState, 'none'); assert.equal(c.F.total, 4);
});

test('BTI needs a REAL part number (not blank, not IGNORE) and monitoring on', () => {
  const c = countConnections([
    row('G', { bti_part_number: 'IGNORE', bti_monitoring_enabled: true }), row('G', { bti_part_number: ' ignore ', bti_monitoring_enabled: true }), row('G', { bti_part_number: '', bti_monitoring_enabled: true }),
    row('G', { bti_part_number: 'G9', bti_monitoring_enabled: false }), row('G', { bti_part_number: 'G10', bti_monitoring_enabled: 'true' }),
  ], ACTIVE);
  assert.equal(c.G.bti, 1); assert.equal(c.G.btiState, 'partial');
});

test('drafted / archived / missing products are ignored: they change neither the total nor the counts', () => {
  const rows = [row('H', { p: 'P1', vendor_url: 'https://h.com/a', auto_update: true }), row('H', { p: 'DRAFT1' }), row('H', { p: 'ARCH1' }), row('H', { p: 'DRAFT1', vendor_url: 'https://h.com/b', auto_update: true })];
  const c = countConnections(rows, ACTIVE);
  assert.deepEqual([c.H.total, c.H.watcher, c.H.watcherState], [1, 1, 'full']);
});

test('a vendor whose items are all drafted has no entry at all (the page shows no dot and "No active items")', () => {
  assert.equal(countConnections([row('I', { p: 'DRAFT1' })], ACTIVE).I, undefined);
});

test('one registry row per variant: a repeated variant id is counted once', () => {
  const r = row('J', { vendor_url: 'https://j.com/a', auto_update: true });
  assert.equal(countConnections([r, { ...r }], ACTIVE).J.total, 1);
});

test('rows without a vendor name are skipped; no active list (null) counts every row; empty input is fine', () => {
  assert.deepEqual(countConnections([row(null), row('')], ACTIVE), {});
  assert.equal(countConnections([row('K', { p: 'X' })], null).K.total, 1);
  assert.deepEqual(countConnections([], ACTIVE), {}); assert.deepEqual(countConnections(undefined, ACTIVE), {});
});

test('accepts the active ids as an array of numbers or strings', () => {
  assert.equal(countConnections([row('L', { p: 77 })], [77]).L.total, 1);
  assert.equal(countConnections([row('L', { p: '77' })], [77]).L.total, 1);
});
