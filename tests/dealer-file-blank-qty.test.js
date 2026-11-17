const test = require('node:test');
const assert = require('node:assert/strict');
const { readDealerFile } = require('../lib/dealer-file');

const CSV = 'Part Number,Display Name,Available,On Order\n710-AAA,Wheel A,5,\n710-BBB,Wheel B,,50\n710-CCC,Wheel C,0,\n710-DDD,Wheel D,N/A,\n';
const map = { reference: 'Part Number', description: 'Display Name', qty: 'Available' };

test('default unchanged: an empty quantity cell stays "no value" (null)', () => {
  const r = readDealerFile(Buffer.from(CSV), { mapping: map });
  assert.deepEqual(r.rows.map((x) => x.qty), [5, null, 0, null]);
});
test('blankQtyIsZero true: an empty cell on a listed row is 0; real numbers and N/A are unchanged', () => {
  const r = readDealerFile(Buffer.from(CSV), { mapping: map, blankQtyIsZero: true });
  assert.deepEqual(r.rows.map((x) => x.qty), [5, 0, 0, null]);   // N/A is not empty: still no value
});
test('the option does not touch price columns, and a file without a quantity column still has no quantity', () => {
  const r = readDealerFile(Buffer.from('Part Number,MAP\n710-A,100\n710-B,\n'), { mapping: { reference: 'Part Number', map: 'MAP' }, blankQtyIsZero: true });
  assert.deepEqual(r.rows.map((x) => [x.map, x.qty]), [[100, null], [null, null]]);
});
test('only the exact value true switches it on', () => {
  for (const v of [undefined, false, 'true', 1]) assert.deepEqual(readDealerFile(Buffer.from(CSV), { mapping: map, blankQtyIsZero: v }).rows.map((x) => x.qty), [5, null, 0, null]);
});
