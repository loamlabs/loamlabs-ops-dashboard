const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rowsFromCsv } = require('../lib/components-csv');

const PW = 'Metafield: custom.weight_g [number_decimal]', VW = 'Variant Metafield: custom.weight_g [number_decimal]';
const HEAD = (extra) => ['shopify_product_id', 'shopify_variant_id', 'ProductURL', 'Title', 'Vendor', 'Option1 Name', 'Option1 Value', ...extra].join(',');
const csv = (extra, vals) => [HEAD(extra), ['1', '2', 'u', 'Hub A', 'Acme', 'Spoke Count', '32h', ...vals].join(',')].join('\n') + '\n';

test('CSV import: a product-level weight column is moved to the variant weight when that is empty, and is never kept as a product-level value', () => {
  const r = rowsFromCsv(csv([PW, VW], ['315', '']));
  assert.equal(r.rows[0][VW], 315); assert.ok(!(PW in r.rows[0]));
  assert.equal(r.notes.length, 1); assert.match(r.notes[0], /moved to the variant weight/);
});
test('CSV import: an existing variant weight is never overwritten by the product column; the product column is still dropped; no note then', () => {
  const r = rowsFromCsv(csv([PW, VW], ['315', '300']));
  assert.equal(r.rows[0][VW], 300); assert.ok(!(PW in r.rows[0])); assert.deepEqual(r.notes, []);
});
test('CSV import: a file with only the variant weight column, or no weight, is unchanged; no internal marker leaks into the rows', () => {
  const a = rowsFromCsv(csv([VW], ['290'])); assert.equal(a.rows[0][VW], 290); assert.deepEqual(a.notes, []); assert.ok(!('_weightMoved' in a.rows[0]));
  const b = rowsFromCsv(csv([], [])); assert.ok(!(PW in b.rows[0]) && !(VW in b.rows[0]));
  const c = rowsFromCsv(csv([PW, VW], ['315', ''])); assert.ok(!('_weightMoved' in c.rows[0]));
});
test('CSV import: a blank product column with a blank variant column stays blank (nothing invented)', () => {
  const r = rowsFromCsv(csv([PW, VW], ['', ''])); assert.ok(!(PW in r.rows[0])); assert.ok(r.rows[0][VW] === null || r.rows[0][VW] === '');
});
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('the new-component field list no longer offers a product-level weight (nothing creates it), and the variant weight field stays', () => {
  const s = read('pages/index.js'); assert.ok(!s.includes("key: 'product_weight_g'")); assert.ok(s.includes("key: 'weight_g', label: 'Variant Metafield: custom.weight_g [number_decimal]'"));
});
test('product duplication never copies the product-level weight_g (variant weights are still copied)', () => {
  const s = read('pages/api/duplicate-product.js'); assert.match(s, /!\(node\.namespace === 'custom' && node\.key === 'weight_g'\)/); assert.match(s, /sourceVariant\.metafields\.edges\.forEach/);
});
test('the edit drawer: product-level weight is read-only, never mandatory; the variant weight is mandatory until it has a value; bulk edit never edits the product column', () => {
  const s = read('components/tabs/ComponentLibrary.js');
  assert.match(s, /disabled=\{key === 'Metafield: custom\.weight_g \[number_decimal\]'\}/);
  assert.equal((s.match(/isMandatory = key === 'Metafield: custom\.weight_g \[number_decimal\]' \? false : \(isMandatoryRaw && !hasVariantWeight\)/g) || []).length, 2);
  assert.match(s, /if \(key === 'Metafield: custom\.weight_g \[number_decimal\]'\) return null;/);
  assert.ok(!/hasProductWeight/.test(s));
});
test('the push tool still writes the variant weight only', () => {
  const s = read('lib/components-push.js'); assert.ok(s.includes("'Variant Metafield: custom.weight_g [number_decimal]': { key: 'weight_g'")); assert.ok(!s.includes("'Metafield: custom.weight_g [number_decimal]': {"));
});
test('the import preview returns the notes to the screen', () => {
  assert.match(read('pages/api/components-tools.js'), /notes: parsed\.notes \|\| \[\]/);
});
