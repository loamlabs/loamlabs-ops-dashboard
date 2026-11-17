const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readDealerFile } = require('../lib/dealer-file');
const { plan, formatReport, undoPayload, MAX_CHANGES } = require('../lib/fsa-file');

const WH = ['WH_SENTINEL_811.37', 'WH_SENTINEL_222.22', 'WH_SENTINEL_333.33'];
const priceCsv = (rows) => ['Part Number,Category,Display Name,MAP,Wholesale,Family,Brand,UPC', ...rows,
  ...Array.from({ length: 20 }, (_, i) => `999-PAD${i},Stems,pad ${i},10.00,WH_PAD${i},x,FSA,0`)].join('\n') + '\n';
const stockCsv = (rows) => ['Part Number,Brand,Display Name,Available,On Order', ...rows, ...Array.from({ length: 20 }, (_, i) => `999-PAD${i},FSA,pad ${i},1,`)].join('\n') + '\n';
const readP = (csv) => readDealerFile(Buffer.from(csv), { mapping: { reference: 'Part Number', description: 'Display Name', map: 'MAP' } }).rows;
const readS = (csv) => readDealerFile(Buffer.from(csv), { mapping: { reference: 'Part Number', description: 'Display Name', qty: 'Available' }, blankQtyIsZero: true }).rows;

const PRICES = priceCsv(['720-0001,Wheelsets,Wheel A,380.00,' + WH[0] + ',Gradient,FSA,1', '720-0002,Wheelsets,Wheel B,436.00,' + WH[1] + ',Gradient,FSA,2', '720-0003,Wheelsets,Wheel C,1044.00,' + WH[2] + ',Gradient,FSA,3', '720-0004,Wheelsets,Wheel D,500.00,WH_4,Metron,FSA,4', '720-0005,Wheelsets,Wheel E,380.00,WH_5,x,FSA,5', '720-0006,Wheelsets,Wheel F,380.00,WH_6,x,FSA,6']);
const STOCK = stockCsv(['720-0001,FSA,Wheel A,9,', '720-0002,FSA,Wheel B,,5', '720-0003,FSA,Wheel C,0,', '720-0005,FSA,Wheel E,9,', '720-0006,FSA,Wheel F,9,', '710-0010,FSA,Short SC45,2,']);
const V = (over) => ({ variantId: '1', productId: 'gid://shopify/Product/9', productTitle: 'FSA Wheels', title: 'Front', sku: '720-0001', price: 9999, compareAt: null, policy: 'CONTINUE', qty: 0, tags: [], status: 'DRAFT', ...over });
const run = (variants, p = PRICES, s = STOCK) => plan({ priceRows: readP(p), stockRows: readS(s), variants });
const changes = (l) => l.changes.map((c) => `${c.field}:${c.to}`);

test('Wholesale is never in the plan, the report or the undo payload (distinctive wholesale values planted in the price file)', () => {
  const pl = run([V({ sku: '720-0001' }), V({ variantId: '2', sku: '720-0002' }), V({ variantId: '3', sku: '720-0003' })]);
  const all = JSON.stringify(pl) + formatReport(pl, '2026-11-17') + JSON.stringify(undoPayload(pl, 'now'));
  for (const w of [...WH, 'WH_4', 'WH_PAD']) assert.ok(!all.includes(w), w);
  assert.ok(!/wholesale|margin|cost/i.test(formatReport(pl, '2026-11-17')));
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fsa-file.js'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/dealerCost\s*[^:=\n]*\b(map|price|to)\b/.test(src.replace(/dealerCost: null/g, '')));
});
test('price = MAP exactly: above MAP lowered, below MAP raised, already right unchanged; compare-at cleared', () => {
  const pl = run([V({ price: 9999, compareAt: 450 }), V({ variantId: '2', sku: '720-0005', price: 380, compareAt: null }), V({ variantId: '3', sku: '720-0006', price: 100, compareAt: null })]);
  assert.deepEqual(changes(pl.lines[0]).filter((c) => c.startsWith('price')), ['price:380']); assert.ok(changes(pl.lines[0]).includes('compareAt:null'));
  assert.deepEqual(pl.lines[1].changes.filter((c) => c.field !== 'policy'), []);
  assert.deepEqual(changes(pl.lines[2]).filter((c) => c.startsWith('price')), ['price:380']);
  for (const l of pl.lines) for (const c of l.changes) if (c.field === 'price') assert.equal(c.to, 380);
});
test('stock: Available above 0 opens, 0 or an empty cell closes (no special-order exception), a reference missing from the instock list changes nothing', () => {
  assert.ok(run([V({ sku: '720-0001', policy: 'DENY' })]).lines[0].changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));
  assert.ok(run([V({ sku: '720-0001', policy: 'CONTINUE' })]).lines[0].changes.every((c) => c.field !== 'policy'));
  assert.ok(run([V({ sku: '720-0003' })]).lines[0].changes.some((c) => c.field === 'policy' && c.to === 'DENY'));   // Available 0
  assert.ok(run([V({ sku: '720-0002' })]).lines[0].changes.some((c) => c.field === 'policy' && c.to === 'DENY'));   // empty Available cell
  const noList = run([V({ sku: '720-0004' })]).lines[0]; assert.ok(noList.changes.every((c) => c.field !== 'policy')); assert.equal(noList.instock, null);
  assert.ok(run([V({ sku: '720-0003', tags: ['special-order'] })]).lines[0].changes.some((c) => c.to === 'DENY'));   // the special-order tag is not an exception here
});
test('a reference not in the price list gets no price change; stock still follows the instock list', () => {
  const l = run([V({ sku: '710-0010', policy: 'DENY' })]).lines[0];
  assert.equal(l.inPriceList, false); assert.ok(!l.changes.some((c) => c.field === 'price' || c.field === 'compareAt'));
  assert.ok(l.changes.some((c) => c.field === 'policy' && c.to === 'CONTINUE'));
  const neither = run([V({ sku: '710-9999' })]).lines[0]; assert.equal(neither.state, 'unmatched'); assert.equal(neither.changes.length, 0);
});
test('short stem and headset SKUs are left alone and listed as unmatched', () => {
  const pl = run([V({ sku: 'FS4161', status: 'ACTIVE', price: 111.3 }), V({ variantId: '2', sku: '' })]);
  assert.deepEqual(pl.lines.map((l) => l.state), ['unmatched', 'unmatched']); assert.equal(pl.changeCount, 0);
  assert.match(formatReport(pl, 'x'), /unmatched/);
});
test('products tagged watcher-ignore are listed as "ignored by tag" and are not counted, written or in the undo file', () => {
  const pl = run([V({ tags: ['watcher-ignore'] }), V({ variantId: '2', sku: '720-0002', tags: ['fsawheels'] })]);
  assert.equal(pl.lines[0].ignoredByTag, true); assert.ok(pl.lines[0].changes.length > 0); assert.ok(pl.ignoredChangeCount > 0);
  assert.equal(pl.changeCount, pl.lines[1].changes.length);
  assert.deepEqual(undoPayload(pl, 'n').variants.map((v) => v.id), ['2']);
  assert.match(formatReport(pl, 'x'), /ignored by tag/);
});
test('undo payload: old price, compare-at and policy of each written variant, first, and nothing else', () => {
  const pl = run([V({ price: 9999, compareAt: 450, policy: 'CONTINUE' })]); const u = undoPayload(pl, '2026-11-17T00:00:00Z');
  assert.deepEqual(u.variants[0], { id: '1', productId: 'gid://shopify/Product/9', title: 'Front', price: 9999, compareAt: 450, inventoryPolicy: 'CONTINUE' });
  assert.deepEqual(Object.keys(u).sort(), ['made', 'note', 'variants']);
});
test('refuses short files and a bad match: under 20 rows in either file, or under half of the store FSA references in the files', () => {
  const small = plan({ priceRows: readP('Part Number,MAP\n720-0001,380\n'), stockRows: readS(STOCK), variants: [V()] });
  assert.ok(small.refuse.some((r) => /price file has only/.test(r)));
  const small2 = plan({ priceRows: readP(PRICES), stockRows: readS('Part Number,Available\n720-0001,3\n'), variants: [V()] });
  assert.ok(small2.refuse.some((r) => /instock file has only/.test(r)));
  const half = run([V({ sku: '720-0001' }), V({ variantId: '2', sku: '720-7771' }), V({ variantId: '3', sku: '720-7772' })]);
  assert.ok(half.refuse.some((r) => /under half/.test(r)));
  assert.equal(run([V()]).refuse.length, 0);
});
test('more than 40 changes (not counting ignored-by-tag products) needs --force', () => {
  const rows = Array.from({ length: 25 }, (_, i) => `720-${String(1000 + i)},Wheelsets,W${i},500.00,WH,x,FSA,0`);
  const vs = rows.map((_, i) => V({ variantId: String(100 + i), sku: `720-${1000 + i}`, compareAt: 600 }));
  const pl = plan({ priceRows: readP(priceCsv(rows)), stockRows: readS(stockCsv([])), variants: vs });
  assert.ok(pl.changeCount > MAX_CHANGES); assert.equal(pl.needsForce, true);
  const tagged = plan({ priceRows: readP(priceCsv(rows)), stockRows: readS(stockCsv([])), variants: vs.map((v) => ({ ...v, tags: ['watcher-ignore'] })) });
  assert.equal(tagged.changeCount, 0); assert.equal(tagged.needsForce, false);
});
test('repeated references: identical rows merge, rows that disagree are dropped and named', () => {
  const dup = priceCsv(['720-0001,W,A,380.00,WH,x,F,1', '720-0001,W,A,380.00,WH,x,F,1', '720-0002,W,B,436.00,WH,x,F,2', '720-0002,W,B,999.00,WH,x,F,2']);
  const pl = run([V({ sku: '720-0001' }), V({ variantId: '2', sku: '720-0002' })], dup);
  assert.ok(pl.lines[0].changes.some((c) => c.field === 'price' && c.to === 380)); assert.ok(!pl.lines[1].changes.some((c) => c.field === 'price'));
  assert.deepEqual(pl.conflicts.price, ['720-0002']);
});
test('the command: dry run by default, undo file written before any write, refuses repo paths, skips ignored products on apply, blank = 0 on', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fsa-file-cli.js'), 'utf8');
  assert.match(src, /inside the repository/); assert.match(src, /flag\('apply'\)/); assert.match(src, /blankQtyIsZero: true/); assert.match(src, /!x\.ignoredByTag/);
  assert.ok(src.indexOf('undoFile, JSON.stringify') < src.indexOf('productVariantsBulkUpdate($pid') || src.indexOf('fs.writeFileSync(undoFile') < src.indexOf('gql(`mutation'));
  assert.ok(!/wholesale/i.test(src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/Wholesale Pricelist/g, '')));
});
