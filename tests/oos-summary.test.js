const test = require('node:test');
const assert = require('node:assert/strict');
const { groupOosReminders, productOf } = require('../lib/oos-summary');

test('productOf strips the variant part', () => {
  assert.equal(productOf('Sapim Race J-Bend Spokes (Black / 184mm / 20 Spokes)'), 'Sapim Race J-Bend Spokes');
  assert.equal(productOf('OneUp Front Hub - 6-Bolt - 15x110mm (28h / Black)'), 'OneUp Front Hub - 6-Bolt - 15x110mm');
  assert.equal(productOf(''), 'Unknown product');
});

test('227 reminders collapse to one line per product with count and longest days', () => {
  const r = [];
  for (let i = 0; i < 100; i++) r.push({ title: `Sapim Race J-Bend Spokes (Black / ${i}mm)`, days: 140 + (i % 3) * 20 });
  for (let i = 0; i < 60; i++) r.push({ title: `Sapim CX-Ray J-Bend Spokes (Black / ${i}mm)`, days: 160 });
  for (let i = 0; i < 67; i++) r.push({ title: `Sapim Laser J-Bend Spokes (Silver / ${i}mm)`, days: 140 });
  const g = groupOosReminders(r);
  assert.equal(g.totalItems, 227);
  assert.equal(g.totalProducts, 3);
  assert.equal(g.lines.length, 3);
  assert.equal(g.more, 0);
  const race = g.lines.find(l => l.product === 'Sapim Race J-Bend Spokes');
  assert.deepEqual([race.count, race.maxDays], [100, 180]);
});

test('cap: at most 10 product lines and the rest counted in "more"; freshest stock-outs listed first', () => {
  const r = [];
  for (let p = 1; p <= 14; p++) r.push({ title: `Product ${p} (A)`, days: p * 20 });
  const g = groupOosReminders(r, 10);
  assert.equal(g.lines.length, 10);
  assert.equal(g.more, 4);
  assert.equal(g.lines[0].product, 'Product 1');
  assert.equal(g.lines[0].maxDays, 20);
});

test('empty and missing input', () => {
  assert.deepEqual(groupOosReminders([]), { lines: [], more: 0, totalItems: 0, totalProducts: 0 });
  assert.deepEqual(groupOosReminders(undefined), { lines: [], more: 0, totalItems: 0, totalProducts: 0 });
});
