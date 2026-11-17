// Adapters, end caps, conversion kits and decal kits are ordinary mapped parts: one map row each, price = MSRP, CONTINUE or DENY by portal stock.
// No code change was needed for them; these tests pin that down so a later change cannot break it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePortalCsv, parseMapCsv, plan, formatReport } = require('../lib/spank-portal');

const HEAD = 'product_handle,portal_category,part_number,portal_item_name,size_spec,color,msrp,mpn,ean,dealer_price,qty_available,status_text,portal_url';
const row = (part, name, msrp, qty) => `h,wheel-hub-parts-and-accessories,${part},"${name}",x,BLACK,${msrp},MPN,EAN,DEALER_44.44,${qty},,https://portal/${part}`;
const pad = Array.from({ length: 20 }, (_, i) => row('PAD' + i, 'pad ' + i, '10.00', '1'));
const PORTAL = [HEAD,
  row('HUB2200', 'SPANK HEX REAR HUB 12x142/148/157 ADAPTER', '22.99', '0'),
  row('HUB2201', 'SPANK HEX REAR HUB 12x135/150 ADAPTER', '22.99', '233'),
  row('HUB2214', 'SPANK HEX 32H FRONT HUB BOOST 15x110 CONVERSION KIT', '39.99', '96'),
  row('HUB2305', 'SPANK RIM DECAL KIT - Silver', '19.99', '0'),
  row('HUB2306', 'SPANK RIM DECAL KIT - Yellow', '19.99', '4'),
  ...pad].join('\n') + '\n';
const MAP = 'store_variant_id,portal_part_numbers,note\n101,HUB2200,Adapter Kit 12x142 / 12x157\n102,HUB2201,Adapter Kit 12x135 / 12x150\n103,HUB2214,Conversion kit 15x110\n104,HUB2305,Decal kit Silver\n105,HUB2306,Decal kit Yellow\n106,HUB2299,Adapter not in the file\n';
const V = (id, price, policy, over = {}) => ({ id, productId: 'gid://shopify/Product/' + id, title: 'Adapter ' + id, price, compareAt: null, policy, qty: 0, monitoringFlag: 'false', variantMonitoringFlag: null, btiNumber: null, ...over });
const run = (variants, map = MAP, portal = PORTAL, today = '2026-12-20') => plan({ variants, map: parseMapCsv(map).map, items: parsePortalCsv(portal).items, today });
const by = (pl, id) => pl.lines.find((l) => l.id === id);
const fields = (l) => l.changes.map((c) => c.field + ':' + c.to);

test('stock 0 at the portal closes the add-on variant (CONTINUE to DENY); stock above 0 opens it; right already means no change', () => {
  const pl = run([V('101', 22.99, 'CONTINUE'), V('102', 22.99, 'DENY'), V('103', 39.99, 'CONTINUE'), V('104', 19.99, 'CONTINUE'), V('105', 19.99, 'DENY')]);
  assert.deepEqual(fields(by(pl, '101')), ['policy:DENY']);
  assert.deepEqual(fields(by(pl, '102')), ['policy:CONTINUE']);
  assert.deepEqual(fields(by(pl, '103')), []);
  assert.deepEqual(fields(by(pl, '104')), ['policy:DENY']);      // decal kit Silver, portal 0
  assert.deepEqual(fields(by(pl, '105')), ['policy:CONTINUE']);  // decal kit Yellow, portal 4
});
test('price is the portal MSRP, compare-at is cleared, outside the sale window a low or high price is put back to MSRP', () => {
  const pl = run([V('101', 20, 'DENY'), V('103', 45, 'CONTINUE', { compareAt: 49.99 })]);
  assert.ok(by(pl, '101').changes.some((c) => c.field === 'price' && c.to === 22.99));
  assert.ok(by(pl, '103').changes.some((c) => c.field === 'price' && c.to === 39.99)); assert.ok(by(pl, '103').changes.some((c) => c.field === 'compareAt' && c.to === null));
});
test('we hold stock of the adapter: policy is not changed even when the portal shows 0', () => {
  const l = by(run([V('101', 22.99, 'CONTINUE', { qty: 6 })]), '101');
  assert.equal(l.changes.length, 0); assert.ok(l.notes.some((n) => /we hold 6/.test(n)));
});
test('a part missing from the portal file: the variant is left alone (not closed, not changed), reported', () => {
  const pl = run([V('106', 22.99, 'CONTINUE')]);
  assert.equal(by(pl, '106').status, 'not_in_portal'); assert.equal(by(pl, '106').changes.length, 0);
  assert.match(formatReport(pl), /not_in_portal/);
});
test('a new adapter variant needs only a new map row: no code change', () => {
  const map2 = MAP + '107,HUB2201,A later adapter variant on the same part\n';
  const pl = run([V('101', 22.99, 'DENY'), V('107', 22.99, 'DENY')], map2);
  assert.ok(by(pl, '107').changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));   // follows HUB2201 stock (233)
  assert.equal(by(pl, '107').parts[0], 'HUB2201');
});
test('the one-owner guard applies to add-ons too: a variant whose BTI scan is not off is blocked, nothing proposed', () => {
  const l = by(run([V('101', 22.99, 'CONTINUE', { monitoringFlag: null })]), '101');
  assert.equal(l.status, 'blocked_bti'); assert.equal(l.changes.length, 0); assert.ok(l.blockedChanges.length > 0);
});
test('known gap, pinned: a hub variant is not linked to its required add-on; it follows its own part only (kit at 0 does not close the hub variant)', () => {
  const portal = [HEAD, row('HUB2100', 'SPANK HEX HG', '249.99', '5'), row('HUB2200', 'SPANK HEX REAR HUB ADAPTER', '22.99', '0'), ...pad].join('\n') + '\n';
  const pl = run([V('201', 249.99, 'DENY', { title: 'Hub needing the kit' }), V('101', 22.99, 'CONTINUE')], 'store_variant_id,portal_part_numbers\n201,HUB2100\n101,HUB2200\n', portal);
  assert.deepEqual(fields(by(pl, '201')), ['policy:CONTINUE']);   // opens on its own stock, whatever the kit's stock is
  assert.deepEqual(fields(by(pl, '101')), ['policy:DENY']);       // the kit itself closes
});
test('no dealer price in an adapter report', () => {
  const pl = run([V('101', 22.99, 'CONTINUE')]);
  assert.ok(!(JSON.stringify(pl) + formatReport(pl)).includes('DEALER_44.44'));
});
