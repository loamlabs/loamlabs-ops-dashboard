const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { componentType, planCopy, planClear, formatCopy, undoCopy, undoClear } = require('../lib/weight-to-variants');

const P = (over) => ({ id: 'gid://shopify/Product/1', handle: 'hub-a', title: 'Hub A', vendor: 'Acme', type: 'hub', productWeight: '315', variants: [{ id: 'v1', title: '32h / Black', weight: null }, { id: 'v2', title: '32h / Blue', weight: null }], ...over });
const row = (pl, h) => pl.rows.find((r) => r.handle === h);

test('type comes from the component tag, then the accessory tag, then the product type', () => {
  assert.equal(componentType(['x', 'component:hub'], ''), 'hub'); assert.equal(componentType(['component:valvestem'], ''), 'valvestem');
  assert.equal(componentType(['accessory'], 'Greases'), 'accessory'); assert.equal(componentType([], 'Hand Built Wheelsets'), 'wheelset'); assert.equal(componentType([], 'Tires'), 'other');
});
test('copy: a product weight goes to every variant that has none; the value is the product text exactly', () => {
  const r = row(planCopy([P()]), 'hub-a'); assert.equal(r.status, 'copy'); assert.deepEqual(r.copyTo.map((v) => v.id), ['v1', 'v2']);
  const pl = planCopy([P({ productWeight: '315.5' })]); assert.equal(undoCopy(pl, 'n').variants[0].written, '315.5');
});
test('copy never overwrites an existing variant weight: a variant that already has the same value is left, only the empty ones are written', () => {
  const r = row(planCopy([P({ variants: [{ id: 'v1', title: 'a', weight: '315' }, { id: 'v2', title: 'b', weight: '' }, { id: 'v3', title: 'c', weight: null }] })]), 'hub-a');
  assert.equal(r.status, 'copy'); assert.deepEqual(r.copyTo.map((v) => v.id), ['v2', 'v3']);
});
test('a conflict (a variant weight that differs from the product weight) holds the WHOLE product and lists the variant; nothing is copied for it', () => {
  const pl = planCopy([P({ variants: [{ id: 'v1', title: '28h', weight: '290' }, { id: 'v2', title: '32h', weight: null }] })]); const r = row(pl, 'hub-a');
  assert.equal(r.status, 'held_conflict'); assert.deepEqual(r.copyTo, []); assert.deepEqual(r.conflicts.map((c) => c.id), ['v1']);
  assert.equal(undoCopy(pl, 'n').variants.length, 0); assert.match(formatCopy(pl, 'x'), /conflict: variant "28h" has 290/);
  assert.equal(row(planCopy([P({ variants: [{ id: 'v1', title: 'x', weight: 'abc' }] })]), 'hub-a').status, 'held_conflict');
});
test('nothing_to_do, no variants, invalid and missing product weights are all listed with a reason (nothing skipped silently)', () => {
  const pl = planCopy([P({ handle: 'a', variants: [{ id: 'v1', title: 'x', weight: '315.0' }] }), P({ handle: 'b', variants: [] }), P({ handle: 'c', productWeight: 'heavy' }), P({ handle: 'd', productWeight: null }), P({ handle: 'e', productWeight: '0' })]);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((h) => row(pl, h).status), ['nothing_to_do', 'no_variants', 'invalid_weight', 'no_product_weight', 'invalid_weight']);
  for (const r of pl.rows) assert.ok(r.reason);
});
test('spokes are held (the product weight is a 260 mm base weight, not a per-variant weight), in both steps', () => {
  const sp = P({ handle: 'sapim', type: 'spoke', productWeight: '5.95' });
  assert.equal(row(planCopy([sp]), 'sapim').status, 'held_type'); assert.equal(row(planClear([sp]), 'sapim').status, 'held_type');
  assert.match(row(planCopy([sp]), 'sapim').reason, /260 mm/);
});
test('limits: --type, --vendor, --handle narrow the scope (case-insensitive) and the scope count is reported', () => {
  const ps = [P({ handle: 'h1' }), P({ handle: 'r1', type: 'rim', vendor: 'Reserve' }), P({ handle: 'h2', vendor: 'Hope' })];
  assert.equal(planCopy(ps, { types: ['rim'] }).scoped, 1); assert.equal(planCopy(ps, { vendors: ['HOPE'] }).scoped, 1); assert.equal(planCopy(ps, { handles: ['h1', 'h2'] }).scoped, 2); assert.equal(planCopy(ps, { types: ['hub'], vendors: ['acme'] }).scoped, 1);
});
test('more than 40 products to change in one run is refused unless --force (the plan says so)', () => {
  const many = Array.from({ length: 41 }, (_, i) => P({ handle: 'h' + i, id: 'p' + i }));
  assert.equal(planCopy(many).toChange, 41); assert.ok(planCopy(many).refuse[0].includes('--force'));
  assert.equal(planCopy(many.slice(0, 40)).refuse.length, 0);
});
test('clear: only where every variant has a weight equal to the product weight', () => {
  const ok = P({ handle: 'ok', variants: [{ id: 'a', title: 'a', weight: '315' }, { id: 'b', title: 'b', weight: '315.0' }] });
  const missing = P({ handle: 'missing', variants: [{ id: 'a', title: 'a', weight: '315' }, { id: 'b', title: 'b', weight: null }] });
  const differs = P({ handle: 'differs', variants: [{ id: 'a', title: 'a', weight: '315' }, { id: 'b', title: 'b', weight: '300' }] });
  const none = P({ handle: 'none', productWeight: null });
  const pl = planClear([ok, missing, differs, none]);
  assert.deepEqual(['ok', 'missing', 'differs', 'none'].map((h) => row(pl, h).status), ['clear', 'held_variants_missing', 'held_differs', 'no_product_weight']);
  assert.match(row(pl, 'differs').reason, /on Jerry's word/); assert.equal(pl.toChange, 1);
});
test('undo payloads: copy lists the variants written, clear keeps the old product value', () => {
  const c = undoCopy(planCopy([P()]), 'now'); assert.equal(c.action, 'copy'); assert.deepEqual(c.variants.map((v) => v.variantId), ['v1', 'v2']);
  const k = undoClear(planClear([P({ variants: [{ id: 'a', title: 'a', weight: '315' }] })]), 'now'); assert.deepEqual(k.products, [{ productId: 'gid://shopify/Product/1', handle: 'hub-a', value: '315' }]);
});
test('the command: dry run by default, undo file written before the first write, refuses repo paths and --apply with a saved read, never touches the metafield definition', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'weight-to-variants-cli.js'), 'utf8');
  assert.match(src, /inside the repository/); assert.match(src, /--apply cannot be used with --from-raw/); assert.match(src, /flag\('apply'\)/);
  assert.ok(src.indexOf('fs.writeFileSync(undoFile') < src.indexOf('mutation($m:[MetafieldsSetInput!]!)'));
  assert.ok(src.indexOf('fs.writeFileSync(undoFile') < src.indexOf('metafieldsDelete(metafields'));
  assert.ok(!/metafieldDefinitionDelete/.test(src));
  assert.match(src, /flag\('clear-product'\)/); assert.match(src, /read back/);
});
