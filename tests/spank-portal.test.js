const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsePortalCsv, parseMapCsv, splitParts, plan, formatReport, inSaleWindow } = require('../lib/spank-portal');

const SENT = ['DEALER_71.99', 'DEALER_187.49', 'DEALER_0.01'];   // distinct sentinels in the dealer_price column
const HEAD = 'product_handle,portal_category,part_number,portal_item_name,size_spec,color,msrp,mpn,ean,dealer_price,qty_available,status_text,portal_url';
const row = (part, name, msrp, dealer, qty, status = '') => `h,rims,${part},"${name}",x,BLACK,${msrp},MPN${part},EAN${part},${dealer},${qty},${status},https://portal/${part}`;
const FILE = [HEAD, row('RIM1', 'SPANK A RIM', '114.99', SENT[0], '24.0'), row('RIM2', 'SPANK B RIM', '169.99', SENT[1], '0'), row('HUB1', 'SPANK HUB X', '249.99', SENT[2], '5.0', 'DISCONTINUED'),
  ...Array.from({ length: 20 }, (_, i) => row('PAD' + i, 'pad ' + i, '10.00', 'DEALER_PAD' + i, '1'))].join('\n') + '\n';

const V = (over) => ({ id: '1', productId: 'gid://shopify/Product/9', title: 'A / 29"', price: 113.84, compareAt: 114.99, policy: 'DENY', qty: 0, monitoringFlag: 'false', variantMonitoringFlag: null, btiNumber: 'SP8115', ...over });
const run = (variants, map, today = '2026-12-20') => plan({ variants, map: new Map(Object.entries(map)), items: parsePortalCsv(FILE).items, today });

test('dealer price column is never read: not in the parsed items, the plan, or the report', () => {
  const p = parsePortalCsv(FILE);
  assert.ok(p.items.length >= 23);
  for (const it of p.items) assert.deepEqual(Object.keys(it).sort(), ['msrp', 'name', 'part', 'qty', 'status']);
  const pl = run([V({ id: '1' }), V({ id: '2' }), V({ id: '3' })], { 1: ['RIM1'], 2: ['RIM2'], 3: ['HUB1'] });
  const all = JSON.stringify(p) + JSON.stringify(pl) + formatReport(pl) + p.warnings.join(' ');
  for (const s of SENT) assert.ok(!all.includes(s), s);
  assert.ok(!/dealer/i.test(formatReport(pl)));
});
test('the module only looks up the five named columns (no dealer, cost, ean, mpn or url lookup in the source)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'spank-portal.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/indexOf\('(dealer|cost|ean|mpn|portal_url)/i.test(code));
  assert.deepEqual(require('../lib/spank-portal').USED_COLUMNS, ['part_number', 'msrp', 'qty_available', 'portal_item_name', 'status_text']);
});

test('price: above MSRP is lowered to MSRP, below MSRP is raised outside the sale window, compare-at is cleared', () => {
  const pl = run([V({ id: '1', price: 120, compareAt: 125 }), V({ id: '2', price: 100, compareAt: null, qty: 0 })], { 1: ['RIM1'], 2: ['RIM1'] });
  const c1 = pl.lines[0].changes.map((c) => c.field + ':' + c.to), c2 = pl.lines[1].changes.map((c) => c.field + ':' + c.to);
  assert.deepEqual(c1.filter((x) => x.startsWith('price')), ['price:114.99']); assert.ok(c1.includes('compareAt:null'));
  assert.deepEqual(c2.filter((x) => x.startsWith('price')), ['price:114.99']); assert.ok(!c2.some((x) => x.startsWith('compareAt')));
});
test('the code never proposes a price below MSRP, in or out of the sale window', () => {
  for (const today of ['2026-10-31', '2026-11-01', '2026-11-20', '2026-12-07', '2026-12-08']) for (const price of [50, 91.99, 92, 100, 113.84, 114.99, 130]) {
    const pl = run([V({ price })], { 1: ['RIM1'] }, today);
    for (const c of pl.lines[0].changes) if (c.field === 'price') assert.ok(c.to >= 114.99, `${today} ${price}`);
  }
});
test('sale window Nov 1 to Dec 7: up to 20% below MSRP is kept (reported); more than 20% below is raised; after Dec 7 it is raised', () => {
  assert.equal(inSaleWindow('2026-11-01'), true); assert.equal(inSaleWindow('2026-12-07'), true); assert.equal(inSaleWindow('2026-12-08'), false); assert.equal(inSaleWindow('2026-10-31'), false);
  const kept = run([V({ price: 95, compareAt: 114.99 })], { 1: ['RIM1'] }, '2026-11-20').lines[0];
  assert.ok(!kept.changes.some((c) => c.field === 'price' || c.field === 'compareAt')); assert.ok(kept.notes.some((n) => /sale window/.test(n)));
  const deep = run([V({ price: 80 })], { 1: ['RIM1'] }, '2026-11-20').lines[0]; assert.ok(deep.changes.some((c) => c.field === 'price' && c.to === 114.99));
  const after = run([V({ price: 95 })], { 1: ['RIM1'] }, '2026-12-08').lines[0]; assert.ok(after.changes.some((c) => c.field === 'price' && c.to === 114.99));
});
test('stock: portal qty above 0 and we hold none: CONTINUE; portal 0 and we hold none: DENY; we hold stock: no change', () => {
  assert.ok(run([V({ policy: 'DENY' })], { 1: ['RIM1'] }).lines[0].changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));
  assert.ok(run([V({ policy: 'CONTINUE' })], { 1: ['RIM2'] }).lines[0].changes.some((c) => c.field === 'policy' && c.to === 'DENY'));
  assert.ok(!run([V({ policy: 'CONTINUE', qty: 3 })], { 1: ['RIM2'] }).lines[0].changes.some((c) => c.field === 'policy'));
  assert.ok(!run([V({ policy: 'CONTINUE' })], { 1: ['RIM1'] }).lines[0].changes.some((c) => c.field === 'policy'));   // already right
});
test('several parts for one variant (HG/XD/MS bodies): price from the shared MSRP, stock is the sum', () => {
  const pl = run([V({ policy: 'DENY' })], { 1: ['RIM2', 'RIM1'] }).lines[0];
  assert.equal(pl.portal.qty, 24); assert.ok(pl.changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));
  assert.ok(pl.notes.some((n) => /different MSRPs/.test(n))); assert.ok(!pl.changes.some((c) => c.field === 'price'));
});
test('one owner: a variant whose BTI scan is not off is blocked (nothing proposed); BTI number kept is reported, never removed', () => {
  const b = run([V({ monitoringFlag: null, variantMonitoringFlag: null, price: 120 })], { 1: ['RIM1'] }).lines[0];
  assert.equal(b.status, 'blocked_bti'); assert.equal(b.changes.length, 0); assert.ok(b.blockedChanges.length > 0);
  const okLine = run([V({ monitoringFlag: null, variantMonitoringFlag: 'false' })], { 1: ['RIM1'] }).lines[0]; assert.equal(okLine.owner.btiScanOff, true);
  assert.equal(run([V()], { 1: ['RIM1'] }).lines[0].owner.btiNumberPresent, true);
  assert.ok(!JSON.stringify(run([V()], { 1: ['RIM1'] })).includes('bti_part_number'));
});
test('missing and new items: a part not in the file is left unchanged (never denied or deleted); new portal items and unknown mapped variants are listed', () => {
  const pl = run([V({ id: '1', policy: 'CONTINUE' }), V({ id: '5' })], { 1: ['GONE9'], 5: ['RIM1'], 77: ['RIM2'] });
  assert.equal(pl.lines[0].status, 'not_in_portal'); assert.equal(pl.lines[0].changes.length, 0);
  assert.deepEqual(pl.missingVariants, ['77']); assert.ok(pl.newPortalItems.some((n) => n.part === 'HUB1'));
  assert.ok(!pl.newPortalItems.some((n) => n.part === 'RIM1'));
  const un = run([V({ id: '9' })], { 1: ['RIM1'] }).lines[0]; assert.equal(un.status, 'unmapped'); assert.equal(un.changes.length, 0);
});
test('bad captures are refused: too few rows, or fewer than half of the mapped parts found', () => {
  const small = plan({ variants: [V()], map: new Map([['1', ['RIM1']]]), items: parsePortalCsv(HEAD + '\n' + row('RIM1', 'x', '114.99', 'D', '3')).items, today: '2026-12-20' });
  assert.ok(small.refuse.some((r) => /truncated/.test(r)));
  const half = run([V({ id: '1' }), V({ id: '2' }), V({ id: '3' })], { 1: ['GONE1'], 2: ['GONE2'], 3: ['RIM1'] }); assert.ok(half.refuse.some((r) => /under half/.test(r)));
  assert.equal(run([V()], { 1: ['RIM1'] }).refuse.length, 0);
});
test('more than 40 changes needs --force', () => {
  const vs = Array.from({ length: 25 }, (_, i) => V({ id: String(100 + i), price: 200, compareAt: 210 })); const map = {}; vs.forEach((v) => { map[v.id] = ['RIM1']; });
  const pl = run(vs, map); assert.ok(pl.changeCount > 40); assert.equal(pl.needsForce, true);
});
test('mapping file: columns, shorthand part lists, gid ids, bad lines reported', () => {
  assert.deepEqual(splitParts('HUB2100/2101/2236'), ['HUB2100', 'HUB2101', 'HUB2236']); assert.deepEqual(splitParts('RIM1;HUB2'), ['RIM1', 'HUB2']);
  const m = parseMapCsv('store_variant_id,portal_part_numbers,note\n51703010263347,HUB2100/2101/2236,x\ngid://shopify/ProductVariant/222,RIM1,\nabc,RIM2,\n333,,\n');
  assert.deepEqual([...m.map.keys()], ['51703010263347', '222']); assert.equal(m.warnings.length, 2);
  assert.ok(parseMapCsv('a,b\n1,2').warnings[0].includes('needs the columns'));
});
test('the command line script refuses files inside the repository, is a dry run unless --apply, and writes the undo file before any write', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'spank-portal-cli.js'), 'utf8');
  assert.match(src, /inside the repository/); assert.match(src, /flag\('apply'\)/); assert.ok(src.indexOf('undoFile') < src.indexOf('productVariantsBulkUpdate'));
});
