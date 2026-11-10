// Run with: npm test  (push to Shopify is mocked: nothing here can touch a store)
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPushPlan, executePush, planUndo, PUSH_FIELDS } = require('../lib/components-push');

const row = { shopify_variant_id: '555', Title: 'Flux Pro 54', 'Variant Metafield: custom.rim_erd [number_decimal]': 601, 'Variant Metafield: custom.weight_g [number_decimal]': 500, 'Variant Metafield: custom.length_adjust_mm [number_decimal]': 3 };

test('the plan lists only the named fields and only real differences', () => {
  assert.deepEqual(Object.values(PUSH_FIELDS).map((f) => f.key), ['rim_erd', 'weight_g']);
  const p = buildPushPlan(row, { erd: 599, weight: 500 });
  assert.deepEqual(p.changes.map((c) => [c.key, c.from, c.to]), [['rim_erd', 599, 601]]);     // weight equal, length_adjust is not a push field
  assert.equal(buildPushPlan(row, { erd: 601, weight: 500 }).changes.length, 0);
  assert.equal(buildPushPlan({ Title: 'x' }, {}).refused.length, 1);                            // no variant id
});

test('a jump of more than 25% is refused (typo guard)', () => {
  const p = buildPushPlan({ ...row, 'Variant Metafield: custom.rim_erd [number_decimal]': 901 }, { erd: 601, weight: 500 });
  assert.equal(p.changes.length, 0); assert.match(p.refused[0], /more than 25%/);
});

function mocks(current) {
  const state = { writes: [], logs: [], current: { ...current } };
  return { state, readCurrent: async () => state.current, writeMetafields: async (v, m) => { state.writes.push([v, m]); }, appendLog: async (e) => { state.logs.push(e); } };
}

test('push: off by default, needs the typed confirmation, logs the OLD values before writing, writes only what the plan says', async () => {
  const plan = buildPushPlan(row, { erd: 599, weight: 500 }); const m = mocks({ erd: 599, weight: 500 });
  assert.equal((await executePush({ plan, confirm: 'PUSH 555', enabled: false, ...m })).ok, false);
  assert.equal((await executePush({ plan, confirm: 'yes', enabled: true, ...m })).ok, false);
  assert.equal(m.state.writes.length, 0);
  const r = await executePush({ plan, confirm: 'PUSH 555', enabled: true, title: 'Flux Pro 54', ...m, now: () => 'T' });
  assert.equal(r.ok, true); assert.deepEqual(m.state.writes, [['555', [{ key: 'rim_erd', value: '601' }]]]);
  assert.deepEqual(m.state.logs[0].changes, [{ key: 'rim_erd', label: 'Rim ERD (mm)', old: 599, new: 601 }]);
});

test('push: if Shopify changed since the preview, nothing is written', async () => {
  const plan = buildPushPlan(row, { erd: 599, weight: 500 }); const m = mocks({ erd: 600, weight: 500 });
  const r = await executePush({ plan, confirm: 'PUSH 555', enabled: true, ...m });
  assert.equal(r.ok, false); assert.match(r.error, /Preview again/); assert.equal(m.state.writes.length, 0); assert.equal(m.state.logs.length, 0);
});

test('undo puts the logged old values back, with the same confirmation', async () => {
  const entry = { variantId: '555', changes: [{ key: 'rim_erd', label: 'Rim ERD (mm)', old: 599, new: 601 }] };
  const plan = planUndo(entry, { erd: 601, weight: 500 }); const m = mocks({ erd: 601, weight: 500 });
  const r = await executePush({ plan, confirm: 'PUSH 555', enabled: true, kind: 'undo', ...m });
  assert.equal(r.ok, true); assert.deepEqual(m.state.writes[0][1], [{ key: 'rim_erd', value: '599' }]);
});
