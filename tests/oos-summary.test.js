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

// ---- Nov 15: shorter reminders ----
const { reminderDue, unitLabel, oosLine, oosSubject, oosHeader } = require('../lib/oos-summary');

test('cadence: every 20 days up to 60 days out, then every 60', () => {
  const due = []; for (let d = 0; d <= 260; d++) if (reminderDue(d, 20)) due.push(d);
  assert.deepEqual(due, [20, 40, 60, 120, 180, 240]);
  assert.equal(reminderDue(0, 20), false); assert.equal(reminderDue(-5, 20), false); assert.equal(reminderDue(NaN, 20), false);
  assert.equal(reminderDue(140, 20), false, 'OneUp at 140 days is not a reminder day now');
  assert.equal(reminderDue(180, 20), true, 'CX-Ray at 180 days still is');
});
test('cadence: a rule with its own interval keeps it up to 60 days, and never goes more often than every 60 days after that', () => {
  const due = (iv) => { const a = []; for (let d = 1; d <= 250; d++) if (reminderDue(d, iv)) a.push(d); return a; };
  assert.deepEqual(due(15), [15, 30, 45, 60, 120, 180, 240]);
  assert.deepEqual(due(90), [90, 180]);   // a longer own interval wins after 60 days
  assert.deepEqual(due(undefined).slice(0, 3), [20, 40, 60]);
});
test('wording: spoke products say lengths, everything else says items; singular and plural', () => {
  assert.equal(unitLabel('Sapim CX-Ray J-Bend Spokes', 28), '28 lengths'); assert.equal(unitLabel('Sapim CX-Ray J-Bend Spokes', 1), '1 length');
  assert.equal(unitLabel('OneUp Front Hub - 6-Bolt - 15x110mm', 1), '1 item'); assert.equal(unitLabel('OneUp Front Hub', 3), '3 items');
});
test('the Nov 15 email: 29 reminders (1 OneUp hub + 28 CX-Ray lengths) read "+ 2 OOS reminders" in the subject, one short line per product', () => {
  const r = [{ title: 'OneUp Front Hub - 6-Bolt - 15x110mm (28h / Black)', days: 140 }];
  for (let i = 0; i < 28; i++) r.push({ title: `Sapim CX-Ray J-Bend Spokes (Black / ${240 + i * 2}mm / 14 Spokes)`, days: 180 });
  const g = groupOosReminders(r, 10);
  assert.equal(oosSubject(g), ' + 2 OOS reminders'); assert.equal(oosHeader(g), 'Still Out of Stock (2 products)');
  const lines = g.lines.map(oosLine);
  assert.ok(lines.includes('<li><b>Sapim CX-Ray J-Bend Spokes</b> — 28 lengths out, longest <b>180 days</b></li>'));
  assert.ok(lines.includes('<li><b>OneUp Front Hub - 6-Bolt - 15x110mm</b> — 1 item out, longest <b>140 days</b></li>'));
  assert.equal(oosSubject(groupOosReminders([], 10)), ''); assert.equal(oosSubject(groupOosReminders([{ title: 'A (x)', days: 20 }], 10)), ' + 1 OOS reminder');
});
test('wiring: sync.js uses the cadence, the product-count subject and the product lines; nothing else about reminders changed (flag oos_reminder_enabled and the 90-day attention note stay)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'pages', 'api', 'sync.js'), 'utf8');
  assert.match(src, /reminderDue\(daysSinceOOS, reminderInterval\)/); assert.match(src, /oosSubject\(oosGroups\)/); assert.match(src, /oosGroups\.lines\.map\(oosLine\)/); assert.match(src, /oosHeader\(oosGroups\)/);
  assert.match(src, /rule\.oos_reminder_enabled !== false && newOutOfStockSince/); assert.match(src, /Math\.floor\(daysOOS\) === 90/);
  assert.doesNotMatch(src, /OOS Reminders` : ''/);
});
