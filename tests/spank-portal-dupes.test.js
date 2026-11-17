const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePortalCsv, plan, formatReport, indexItems } = require('../lib/spank-portal');

const HEAD = 'product_handle,portal_category,part_number,portal_item_name,size_spec,color,msrp,mpn,ean,dealer_price,qty_available,status_text,portal_url';
const row = (part, name, msrp, qty, dealer = 'DEALER_9.99') => `h,hubs,${part},"${name}",x,GREEN,${msrp},MPN,EAN,${dealer},${qty},,https://portal/${part}`;
const pad = Array.from({ length: 20 }, (_, i) => row('PAD' + i, 'pad ' + i, '10.00', '1'));
const file = (...rows) => [HEAD, ...rows, ...pad].join('\n') + '\n';
const V = (over) => ({ id: '1', productId: 'gid://shopify/Product/9', title: 'Green hub', price: 249.99, compareAt: null, policy: 'DENY', qty: 0, monitoringFlag: 'false', variantMonitoringFlag: null, btiNumber: null, ...over });
const run = (csv, parts, v = V()) => plan({ variants: [v], map: new Map([['1', parts]]), items: parsePortalCsv(csv).items, today: '2026-12-20' });

const DNU = row('HUB2408', 'DO NOT USE', '249.99', '4'), REAL = row('HUB2408', 'SPANK HEX J-TYPE BOOST 148 32H REAR HUB XD / GREEN', '249.99', '4'), OTHER = row('HUB2402', 'SPANK HEX HG / GREEN', '249.99', '12');

test('a repeated part number is counted once, never added: HUB2408 listed twice (DO NOT USE row and the real row) gives 12 + 4 = 16, in either order', () => {
  for (const order of [[DNU, REAL, OTHER], [REAL, DNU, OTHER], [OTHER, REAL, DNU]]) {
    const l = run(file(...order), ['HUB2402', 'HUB2408']).lines[0];
    assert.equal(l.portal.qty, 16);
    assert.equal(l.portal.msrp, 249.99);
  }
});
test('a DO NOT USE row is ignored: a part that exists only as a DO NOT USE row is "not in the file"; it is not listed as a new item; the report names it', () => {
  const pl = run(file(DNU, OTHER), ['HUB2408']);
  assert.equal(pl.lines[0].status, 'not_in_portal'); assert.equal(pl.lines[0].changes.length, 0);
  assert.ok(!pl.newPortalItems.some((n) => n.part === 'HUB2408'));
  assert.deepEqual(pl.ignoredRows.map((x) => x.part), ['HUB2408']);
  assert.match(formatReport(pl), /ignored rows \(DO NOT USE\): HUB2408/);
});
test('two identical real rows are merged (not added); the same part twice in one mapping cell counts once', () => {
  const twice = file(REAL, REAL); const l = run(twice, ['HUB2408']).lines[0]; assert.equal(l.portal.qty, 4);
  const cell = run(file(REAL), ['HUB2408', 'HUB2408']).lines[0]; assert.equal(cell.portal.qty, 4); assert.deepEqual(cell.parts, ['HUB2408']);
  const pl = run(twice, ['HUB2408']); assert.deepEqual(pl.duplicateParts, [{ part: 'HUB2408', rows: 2, agree: true }]);
});
test('two real rows of one part that disagree are not guessed at: no price and no stock change, a note, reported as DISAGREE', () => {
  const bad = file(row('HUB2408', 'XD GREEN', '249.99', '4'), row('HUB2408', 'XD GREEN copy', '249.99', '9'));
  const pl = run(bad, ['HUB2408'], V({ price: 260, policy: 'CONTINUE' })); const l = pl.lines[0];
  assert.equal(l.portal.qty, null); assert.equal(l.changes.length, 0);
  assert.ok(l.notes.some((n) => /several rows of the file with different values/.test(n)));
  assert.match(formatReport(pl), /HUB2408 x2 DISAGREE/);
});
test('existing behaviour unchanged: normal parts, new-item list and stock rule give the same answers', () => {
  const csv = file(row('HUB2402', 'SPANK HEX HG / GREEN', '249.99', '12'), row('NEW1', 'SPANK NEW', '50.00', '2'));
  const pl = run(csv, ['HUB2402']); const l = pl.lines[0];
  assert.equal(l.portal.qty, 12); assert.ok(l.changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));
  assert.ok(pl.newPortalItems.some((n) => n.part === 'NEW1')); assert.deepEqual(pl.ignoredRows, []); assert.deepEqual(pl.duplicateParts, []);
  assert.equal(indexItems([]).byPart.size, 0);
});
test('no dealer price in the new output lines', () => {
  const pl = run(file(DNU, REAL, OTHER), ['HUB2402', 'HUB2408']);
  assert.ok(!(JSON.stringify(pl) + formatReport(pl)).includes('DEALER_9.99'));
});
