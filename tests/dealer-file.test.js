// Run with: npm test   (no network, no disk: made-up sample files built in memory, no real FSA data)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readDealerFile, parseMoney, parseQty, parseCsv } = require('../lib/dealer-file');
const { matchDealerFile, refKey } = require('../lib/dealer-file-match');
const { makeXlsx } = require('./helpers/xlsx-writer');

// ---- three plausible file shapes (all made up) ----
// A: CSV with MSRP + MAP + cost + qty; trailing spaces, currency symbols, thousands separators, quoted comma, a duplicate (same), a duplicate (different), bad rows
const CSV_A = [
  '﻿Item,Description,MSRP,MAP,Dealer Price,Qty,Color',
  ' 720-1000001 ,"Test Wheelset, Alloy 29"" ", "$1,489.00", $1489.00 ,$967.85,12,Black',
  '720-1000002,Test Wheelset Carbon,"$1,799.00","$1,799.00","$1,169.35",0,Black',
  '720-1000003,Test Wheelset Gravel,$1 602.90,$1 602.90,$1 041.89,"1,200",Grey',
  '720-1000004,Test Wheelset Road,$899.00,$899.00,abc,n/a,Red',
  '720-1000005,Test Wheelset Trail,"$1,000.00","$1,000.00",$650.00,5,Black',
  '720-1000005,Test Wheelset Trail,"$1,000.00","$1,000.00",$650.00,5,Black',
  '720-1000006,Test Wheelset Conflict,$100.00,$100.00,$65.00,1,Black',
  '720-1000006,Test Wheelset Conflict,$110.00,$110.00,$70.00,2,Black',
  '',
  ',No reference row,$1.00,$1.00,$1.00,1,Black',
  '720-1000007,Test Wheelset Negative,-$5.00,$300.00,$195.00,-3,Black',
  '720-1000099,Test Wheelset Not In Store,$500.00,$500.00,$325.00,4,Black',
].join('\r\n');
// B: XLSX, a notes sheet first, two title lines above the table, different headers, numbers as numbers
const XLSX_B = makeXlsx([
  ['Test Dealer Price List'], ['Effective 2026-01-01'],
  ['Part No.', 'Product Name', 'Retail', 'Minimum Advertised Price', 'Net', 'Available'],
  ['7200001001', 'Alpha Wheelset', 1489, 1489, 967.85, 7],
  [{ inline: 'AB-2002' }, 'Beta Wheelset & Co', 1799, 1799, 1169.35, 0],
  ['7200003003', 'Gamma Wheelset', 999.5, '', 650, 3],
]);
// C: no quantity column, semicolon delimiter, comma decimals
const CSV_C = ['Reference;Description;List Price;MAP;Cost', '720-2000001;Delta;1.489,00;1.489,00;967,85', '720-2000002;Epsilon;899,00;;584,35'].join('\n');

const v = (id, sku, price, extra = {}) => ({ variantId: id, productId: id * 10, title: 'Wheel ' + id, productTitle: 'Wheel ' + id, sku, price, inventoryPolicy: 'continue', inventoryQuantity: 0, metafields: {}, tags: [], ...extra });

test('numbers: currency symbols, spaces, thousands separators, both decimal styles, negatives and junk', () => {
  assert.equal(parseMoney('$1,489.00'), 1489); assert.equal(parseMoney(' $ 1 489.00 '), 1489); assert.equal(parseMoney('1.489,00'), 1489); assert.equal(parseMoney('12,50'), 12.5); assert.equal(parseMoney('USD 12.5'), 12.5);
  assert.equal(parseMoney('1,489'), 1489); assert.equal(parseMoney('1,489,000'), 1489000); assert.equal(parseMoney('(5.00)'), -5); assert.equal(parseMoney(967.85), 967.85);
  for (const e of ['', '  ', '-', 'N/A', 'n/a', 'TBD']) assert.equal(parseMoney(e), null, e);
  for (const e of ['abc', '$', '1.2.3x']) assert.ok(Number.isNaN(parseMoney(e)), e);
  assert.equal(parseQty('12'), 12); assert.equal(parseQty('1,200'), 1200); assert.equal(parseQty('12.0'), 12); assert.equal(parseQty('10+'), 10); assert.equal(parseQty('>5'), 5); assert.equal(parseQty(' 7 '), 7); assert.equal(parseQty(''), null); assert.ok(Number.isNaN(parseQty('in stock')));
});

test('CSV parser: quotes, doubled quotes, line breaks inside quotes, BOM, CRLF and LF, delimiter guess', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"line\nbreak",z'), [['a', 'b'], ['x, y', 'say "hi"'], ['line\nbreak', 'z']]);
  assert.deepEqual(parseCsv('﻿a;b\n1;2'), [['a', 'b'], ['1', '2']]); assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('file A (CSV, MSRP + MAP + cost + qty): rows normalized, headers detected, messy values cleaned, bad rows warned, nothing thrown', () => {
  const r = readDealerFile(CSV_A);
  assert.equal(r.ok, true); assert.equal(r.format, 'csv'); assert.deepEqual(r.columns, { reference: 'Item', description: 'Description', msrp: 'MSRP', map: 'MAP', dealerCost: 'Dealer Price', qty: 'Qty' });
  const by = Object.fromEntries(r.rows.map((x) => [x.reference + '@' + x.line, x]));
  const first = r.rows[0]; assert.equal(first.reference, '720-1000001'); assert.equal(first.description, 'Test Wheelset, Alloy 29" '.trim()); assert.equal(first.msrp, 1489); assert.equal(first.map, 1489); assert.equal(first.dealerCost, 967.85); assert.equal(first.qty, 12); assert.deepEqual(first.raw, { Color: 'Black' }); assert.equal(first.line, 2);
  assert.equal(r.rows[2].msrp, 1602.9); assert.equal(r.rows[2].qty, 1200);
  const bad = r.rows.find((x) => x.reference === '720-1000004'); assert.equal(bad.dealerCost, null); assert.equal(bad.qty, null); assert.equal(bad.msrp, 899);
  const neg = r.rows.find((x) => x.reference === '720-1000007'); assert.equal(neg.msrp, null); assert.equal(neg.qty, null); assert.equal(neg.map, 300);
  assert.ok(r.warnings.some((w) => /720-1000004.*cost "abc" is not a number/.test(w))); assert.ok(r.warnings.some((w) => /720-1000004.*qty "n\/a"/.test(w)) === false, 'n/a is simply empty');
  assert.ok(r.warnings.some((w) => /no reference, row skipped/.test(w))); assert.ok(r.warnings.some((w) => /negative msrp/.test(w))); assert.ok(r.warnings.some((w) => /negative qty/.test(w)));
  assert.equal(r.rows.filter((x) => x.reference === '').length, 0); assert.ok(by['720-1000099@13']);
});

test('file B (XLSX, different headers, title lines and a notes sheet in front): found and read', () => {
  const r = readDealerFile(XLSX_B);
  assert.equal(r.ok, true); assert.equal(r.format, 'xlsx'); assert.equal(r.headerRow, 3);
  assert.deepEqual(r.columns, { reference: 'Part No.', description: 'Product Name', msrp: 'Retail', map: 'Minimum Advertised Price', dealerCost: 'Net', qty: 'Available' });
  assert.deepEqual(r.rows.map((x) => [x.reference, x.description, x.msrp, x.map, x.dealerCost, x.qty]), [['7200001001', 'Alpha Wheelset', 1489, 1489, 967.85, 7], ['AB-2002', 'Beta Wheelset & Co', 1799, 1799, 1169.35, 0], ['7200003003', 'Gamma Wheelset', 999.5, null, 650, 3]]);
  assert.ok(r.warnings.some((w) => /read sheet number 2/.test(w)));
  const named = readDealerFile(XLSX_B, { sheet: 'Price list' }); assert.equal(named.rows.length, 3); assert.equal(readDealerFile(XLSX_B, { sheet: 'No such sheet' }).ok, false);
  const inline = readDealerFile(makeXlsx([['SKU', 'Qty'], ['A-1', 3]], { shared: false })); assert.deepEqual(inline.rows.map((x) => [x.reference, x.qty]), [['A-1', 3]]);
});

test('file C (no quantity column, semicolons, comma decimals): rows read, no qty, a warning says so', () => {
  const r = readDealerFile(CSV_C);
  assert.equal(r.ok, true); assert.deepEqual(r.columns, { reference: 'Reference', description: 'Description', msrp: 'List Price', map: 'MAP', dealerCost: 'Cost' });
  assert.deepEqual(r.rows.map((x) => [x.msrp, x.map, x.dealerCost, x.qty]), [[1489, 1489, 967.85, null], [899, null, 584.35, null]]);
  assert.ok(r.warnings.some((w) => /no quantity column/.test(w)));
});

test('column mapping wins over auto-detection; a wrong mapping name is reported; "Price" alone is read as cost with a warning; unknown columns stay in raw', () => {
  const r = readDealerFile('Code,Name,Retail,On hand,Extra\nX1,One,10,4,keep me', { mapping: { reference: 'Code', qty: 'On hand', description: 'Name' } });
  assert.deepEqual([r.rows[0].reference, r.rows[0].qty, r.rows[0].msrp, r.rows[0].raw], ['X1', 4, 10, { Extra: 'keep me' }]);
  const w = readDealerFile('Item,Qty\nX1,1', { mapping: { map: 'Nonexistent' } }); assert.ok(w.warnings.some((x) => /column "Nonexistent" for map was not found/.test(x)));
  const p = readDealerFile('Item,Price,Qty\nX1,$5.00,1'); assert.equal(p.rows[0].dealerCost, 5); assert.ok(p.warnings.some((x) => /read as the dealer cost/.test(x)));
});

test('bad input never throws: empty file, no header, no reference column, garbage bytes, header only', () => {
  for (const input of ['', '   \n  ', 'just one line of text', 'a,b,c\n1,2,3', Buffer.from('PK\u0003\u0004garbage'), 'Item,Qty', null, undefined, 42]) {
    let r; assert.doesNotThrow(() => { r = readDealerFile(input); }, String(input)); assert.equal(typeof r.ok, 'boolean'); assert.ok(Array.isArray(r.rows) && Array.isArray(r.warnings)); if (!r.ok) assert.ok(r.warnings.length > 0);
  }
  assert.equal(readDealerFile('a,b,c\n1,2,3').ok, false);
});

// ---- the matcher ----
const fileA = () => readDealerFile(CSV_A);

test('matcher: price = MAP (or MSRP by setting), never below MAP, unchanged prices make no proposal, baseline by default', () => {
  const rows = [{ reference: '720-1', msrp: 1500, map: 1400, dealerCost: 900, qty: null, line: 2 }, { reference: '720-2', msrp: 1000, map: 1100, dealerCost: 600, qty: null, line: 3 }, { reference: '720-3', msrp: 800, map: 800, dealerCost: 500, qty: null, line: 4 }, { reference: '720-4', msrp: 700, map: null, dealerCost: 400, qty: null, line: 5 }];
  const variants = [v(1, '720-1', 1300), v(2, '720-2', 1000), v(3, '720-3', 800), v(4, '720-4', 650)];
  const m = matchDealerFile({ rows, variants });
  assert.deepEqual(m.price.map((p) => [p.variantId, p.from, p.to, p.source]), [[1, 1300, 1400, 'map'], [2, 1000, 1100, 'map']]);
  assert.deepEqual(m.noPriceInFile.map((x) => x.variantId), [4], 'no MAP in the file: no price proposal, listed');
  assert.ok(m.price.every((p) => p.baseline && /^would/.test(p.action)));
  const ms = matchDealerFile({ rows, variants }, { priceSource: 'msrp' });
  assert.deepEqual(ms.price.map((p) => [p.variantId, p.to]), [[1, 1500], [2, 1100], [4, 700]], 'MSRP is used, but a price below MAP is lifted to MAP (variant 2: MSRP 1000, MAP 1100)');
  assert.ok(ms.price.every((p) => p.to >= (rows.find((r) => r.reference === p.reference).map || 0)));
  assert.equal(m.price[0].marginPct, Math.round(((1400 - 900) / 1400) * 1000) / 10);
  const live = matchDealerFile({ rows, variants }, { baseline: false }); assert.ok(live.price.every((p) => !p.baseline && p.action === 'change price'));
  const tagged = matchDealerFile({ rows, variants: [v(1, '720-1', 1300, { tags: ['baseline'] })] }, { baseline: false }); assert.equal(tagged.price[0].baseline, true, 'a variant tagged baseline stays baseline');
});

test('matcher: a price below the dealer cost is proposed but warned about; no site discount is ever applied (the module only knows the file values)', () => {
  const m = matchDealerFile({ rows: [{ reference: 'Z', msrp: 100, map: 100, dealerCost: 120, qty: null, line: 2 }], variants: [v(1, 'Z', 90)] });
  assert.equal(m.price[0].to, 100); assert.ok(m.warnings.some((w) => /below the dealer cost/.test(w)));
  const src = fs.readFileSync(path.join(__dirname, '../lib/dealer-file-match.js'), 'utf8'); assert.ok(!/discount|percent|\* 0\.\d/.test(src.replace(/no site discount[^\n]*/g, '')), 'no discount maths');
});

test('matcher: stock opens above 0, closes at 0, never closes a special-order variant, nothing without a qty column, and only when the state differs', () => {
  const rows = [{ reference: 'A', qty: 5, map: null, line: 2 }, { reference: 'B', qty: 0, map: null, line: 3 }, { reference: 'C', qty: 0, map: null, line: 4 }, { reference: 'D', qty: 9, map: null, line: 5 }, { reference: 'E', qty: 0, map: null, line: 6 }];
  const variants = [v(1, 'A', 10, { inventoryPolicy: 'deny' }), v(2, 'B', 10), v(3, 'C', 10, { tags: ['special-order'] }), v(4, 'D', 10), v(5, 'E', 10, { inventoryPolicy: 'deny' })];
  const m = matchDealerFile({ rows, variants });
  assert.deepEqual(m.stock.map((s) => [s.variantId, s.action, s.to]), [[1, 'would open', 'continue'], [2, 'would close', 'deny']]);
  const other = matchDealerFile({ rows, variants }, { specialOrderTag: 'made-to-order' }); assert.ok(other.stock.some((s) => s.variantId === 3), 'the special-order tag is a setting');
  const none = matchDealerFile({ rows: rows.map((r) => ({ ...r, qty: null })), variants }); assert.equal(none.stock.length, 0); assert.ok(none.warnings.some((w) => /no quantity column/.test(w))); assert.equal(none.summary.stockInFile, false);
  assert.equal(matchDealerFile({ rows, variants }, { baseline: false }).stock[0].action, 'open');
});

test('matcher: unmatched file rows, store variants missing from the file (left alone), variants with no reference', () => {
  const rows = [{ reference: 'A', qty: 1, map: 10, line: 2 }, { reference: 'GHOST', description: 'not ours', qty: 2, map: 20, msrp: 20, line: 3 }];
  const variants = [v(1, 'A', 10), v(2, 'MISSING', 10), v(3, '', 10), v(4, undefined, 10)];
  const m = matchDealerFile({ rows, variants });
  assert.deepEqual(m.unmatchedRows.map((x) => x.reference), ['GHOST']); assert.deepEqual(m.missingFromFile.map((x) => [x.variantId, x.why.slice(0, 12)]), [[2, 'no row in th'], [3, 'the variant '], [4, 'the variant ']]);
  assert.ok(!m.stock.some((s) => s.variantId === 2) && !m.price.some((p) => p.variantId === 2), 'a variant missing from the file is never changed');
  assert.ok(m.lines.some((l) => /1 file row match no store variant/.test(l)) && m.lines.some((l) => /3 store variants not in the file \(left as they are\)/.test(l)));
});

test('matcher: references compare without case, spaces or dashes; duplicates merge or conflict; two store variants with one reference are not touched', () => {
  assert.equal(refKey(' 720-0066186050 '), '7200066186050'); assert.equal(refKey('ab 20.02'), 'AB2002');
  const m = matchDealerFile({ rows: [{ reference: '720-0066186050', qty: 1, map: 50, line: 2 }], variants: [v(1, '7200066186050', 40)] }); assert.equal(m.matches.length, 1); assert.equal(m.price[0].to, 50);
  const f = fileA(); const vars = [v(1, '720-1000001', 1400), v(5, '720-1000005', 900), v(6, '720-1000006', 90), v(7, '720-1000002', 1799)];
  const r = matchDealerFile({ rows: f.rows, variants: vars }, { priceSource: 'map' });
  assert.deepEqual(r.conflicts.map((c) => c.reference), ['720-1000006']); assert.ok(!r.price.some((p) => p.variantId === 6) && !r.stock.some((s) => s.variantId === 6), 'conflicting rows: nothing proposed');
  assert.ok(r.missingFromFile.some((x) => x.variantId === 6 && /conflicting/.test(x.why))); assert.ok(f.warnings.length >= 0 && r.warnings.some((w) => /720-1000005 is on 2 lines with the same values/.test(w)));
  assert.deepEqual(r.price.map((p) => [p.variantId, p.to]), [[1, 1489], [5, 1000]]); assert.deepEqual(r.stock.map((s) => [s.variantId, s.action]), [[7, 'would close']]);
  const dup = matchDealerFile({ rows: [{ reference: 'A', qty: 1, map: 50, line: 2 }], variants: [v(1, 'A', 40), v(2, 'a', 40)] }); assert.equal(dup.price.length, 0); assert.ok(dup.warnings.some((w) => /is on 2 store variants/.test(w)));
});

test('matcher: the reference field is a setting (SKU or a metafield); the flip cap holds back a flood of stock changes', () => {
  const rows = [{ reference: 'M1', qty: 3, map: null, line: 2 }]; const variants = [v(1, 'something else', 10, { inventoryPolicy: 'deny', metafields: { 'custom.fsa_reference': 'M1' } })];
  assert.equal(matchDealerFile({ rows, variants }).matches.length, 0); assert.equal(matchDealerFile({ rows, variants }, { referenceField: 'metafield:custom.fsa_reference' }).stock.length, 1);
  const many = Array.from({ length: 60 }, (_, i) => v(i + 1, 'R' + i, 10)); const zero = many.map((x, i) => ({ reference: 'R' + i, qty: 0, map: null, line: i + 2 }));
  const capped = matchDealerFile({ rows: zero, variants: many }); assert.equal(capped.stock.length, 40); assert.equal(capped.heldByFlipCap, 20); assert.ok(capped.lines.some((l) => /20 stock changes NOT proposed/.test(l)));
  assert.equal(matchDealerFile({ rows: zero, variants: many }, { flipCap: 5 }).stock.length, 5);
});

test('both modules are pure: no network, no disk, no secrets, no Supabase or Shopify, and nothing in pages/ or the Watcher uses them yet', () => {
  for (const f of ['lib/dealer-file.js', 'lib/dealer-file-match.js']) { const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); assert.ok(!/\bfetch\(|axios|supabase|shopify|process\.env|require\('(fs|http|https|net)'\)/i.test(s.replace(/\/\/.*$/gm, '')), f); }
  const users = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.next', '.git', 'tests'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && /dealer-file/.test(fs.readFileSync(p, 'utf8')) && !/dealer-file(-match)?\.js$/.test(e.name)) users.push(path.relative(path.join(__dirname, '..'), p)); } })(path.join(__dirname, '..'));
  assert.deepEqual(users, [], 'nothing live imports the dealer file modules yet');
});
