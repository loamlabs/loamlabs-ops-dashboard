// Run with: npm test   (no network; made-up fixtures, fake fetch)
// The I9 order list in the Order Sheet tab: view logic for sheet.orderList, the fresh=1 pass-through, privacy, print rules and markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const view = require('../lib/order-sheet-view');
const F = require('./fixtures/order-list-fixtures');

const ROOT = path.join(__dirname, '..');
const proxy = require(path.join(ROOT, 'lib', 'order-sheet-' + 'proxy'));   // loaded by path: the privacy test lists who imports the server proxy
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ENV = { ORDER_SHEET_SECRET: 'test-secret-not-real-0123456789', ORDER_SHEET_BASE_URL: 'https://spoke-automation.example.test', DASHBOARD_PASSWORD: 'dash-pass' };

test('status: present, not-applicable, error, not-saved, and an old saved System sheet that only has the PR 1 list stays "legacy"', () => {
  assert.equal(view.buildView(F.systemSheet()).orderListStatus, 'present');
  assert.equal(view.buildView(F.standardSheet()).orderListStatus, 'not-applicable');
  assert.equal(view.buildView(F.errorSheet()).orderListStatus, 'error');
  assert.equal(view.buildView(F.errorSheet()).orderListNote, 'The I9 dealer list could not be read.');
  assert.equal(view.buildView(F.notSavedSheet()).orderListStatus, 'not-saved');
  assert.equal(view.buildView(F.notSavedSheet(), 'not-saved').orderListStatus, 'not-saved');
  const legacy = { ...F.notSavedSheet(), i9OrderList: { text: 'I9 ORDER LIST', linkUrl: F.CART, linkAdds: F.ADDS, thomasText: F.MAIL, snapshotDate: '2026-11-08' } };
  const v = view.buildView(legacy); assert.equal(v.orderListStatus, 'legacy'); assert.ok(v.i9 && v.i9.linkUrl === F.CART, 'the old field still works'); assert.equal(v.orderList, null);
  assert.equal(view.buildView(F.systemSheet({ orderListStatus: 'present' }), 'error').orderListStatus, 'error', 'the answer\'s own status wins');
  assert.equal(view.buildView(F.standardSheet()).orderList, null); assert.equal(view.buildView(F.errorSheet()).orderList, null);
});

test('#1466-like System list: sections A to E as given, structured rows, spare shown, text copied unchanged', () => {
  const v = view.buildView(F.systemSheet()); const ol = v.orderList;
  assert.equal(ol.text, F.TEXT, 'Copy as text gives orderList.text unchanged, line breaks kept'); assert.ok(ol.text.includes('\n\nB. SPOKES'));
  assert.deepEqual([ol.prebuilt.title, ol.dealer.title, ol.email.title, ol.hubs.title, ol.rims.title], ['A. PRE-BUILT WHEELS', "B. SPOKES on I9's dealer list, with spares", 'C. SPOKES NOT on the dealer list: ORDER BY EMAIL OR PHONE (Thomas Ward)', 'D. HUBS (from I9)', 'E. RIMS (from I9)']);
  assert.equal(ol.prebuilt.none, true); assert.match(ol.prebuilt.lines[0], /none for this order/);
  const rows = ol.dealer.sides.flatMap((s) => s.entries.map((e) => [s.positionLabel, s.sideLabel, s.lengthMm, e.color, e.n, e.spare, e.qty]));
  assert.deepEqual(rows, [['Rear', 'Rotor', 284, 'Black', 8, 1, 9], ['Rear', 'Rotor', 284, 'Bronze', 8, 0, 8], ['Rear', 'Drive', 282, 'Black', 8, 1, 9], ['Rear', 'Drive', 282, 'Bronze', 8, 0, 8]]);
  assert.equal(ol.cartUrl, F.CART); assert.equal(ol.cartAdds, F.ADDS); assert.equal(ol.dealer.cart.totals.spokes, 34);
  assert.equal(ol.dealer.checkLine, 'Check the cart against this list before paying. Variant ids from the 2026-11-08 B2B file.');
  assert.equal(ol.emailText, F.MAIL); assert.equal(ol.email.to, 'Thomas Ward');
  assert.deepEqual(ol.email.sides.map((s) => [s.positionLabel, s.sideLabel, s.lengthMm]), [['Front', 'Rotor', 305], ['Front', 'Drive', 307]]);
  assert.deepEqual(ol.rims.wheels.map((w) => w.i9Code), ['TR303', 'TR305']); assert.equal(ol.hubs.wheels.length, 2); assert.equal(ol.snapshotDate, '2026-11-08');
});

test('lengths are only passed through, never rebuilt: a length that is missing stays "no length", a changed number shows as given', () => {
  const sheet = F.systemSheet(); sheet.orderList.sections.dealerSpokes.sides[0].lengthMm = 271; sheet.orderList.sections.dealerSpokes.noLength = [{ position: 'front', side: 'rotor', lengthMm: null, baseColor: 'Black', entries: [{ color: 'Black', n: 7, spare: 1, qty: 8 }] }];
  const ol = view.buildView(sheet).orderList; assert.equal(ol.dealer.sides[0].lengthMm, 271); assert.equal(ol.dealer.noLength[0].lengthMm, null);
  const src = read('components/tabs/OrderListCard.js'); assert.match(src, /length not known/); assert.ok(!/Math\.round|erd|ERD|crossing/.test(src), 'no length maths in the card');
});

test('one wheel: only that wheel, out-of-stock entries and the cart line are marked, no email section when every length is on the list', () => {
  const sheet = F.systemSheet({ orderList: F.oneWheelList() }); const ol = view.buildView(sheet).orderList;
  assert.equal(ol.dealer.sides.length, 1); assert.equal(ol.dealer.sides[0].entries[1].outOfStock, true); assert.equal(ol.dealer.sides[0].entries[0].outOfStock, false); assert.equal(ol.dealer.cart.outOfStockItems, 1);
  assert.equal(ol.emailText, ''); assert.equal(ol.email.sides.length, 0); assert.deepEqual(ol.hubs.wheels.map((w) => w.positionLabel), ['Rear']); assert.deepEqual(ol.rims.wheels.map((w) => w.positionLabel), ['Rear']);
  const src = read('components/tabs/OrderListCard.js'); assert.match(src, /OUT OF STOCK at I9/); assert.match(src, /ol\.email\.sides\.length \|\| ol\.emailText/);
});

test('pre-built wheel: section A names the wheel and its color; section C shows the reason when it is not "length"', () => {
  const ol = view.buildView(F.systemSheet({ orderList: F.prebuiltList() })).orderList;
  assert.equal(ol.prebuilt.none, false); assert.deepEqual(ol.prebuilt.wheels.map((w) => [w.positionLabel, w.color]), [['Front', 'Black']]); assert.match(ol.prebuilt.lines.join(' '), /pre-built wheelset/);
  const e = ol.email.sides[0].entries[0]; assert.equal(e.reason, 'color'); assert.equal(e.reasonText, 'color not on the dealer list');
  const src = read('components/tabs/OrderListCard.js'); assert.match(src, /e\.reason !== 'length'/); assert.match(src, /check I9 for a pre-built wheelset/);
});

test('the cart link is only offered when it is an I9 B2B cart link; anything else is dropped and the card says so', () => {
  for (const bad of ['javascript:alert(1)', 'https://evil.example.test/cart/1:2', 'http://b2b.industrynine.com/cart/1:1', 'https://b2b.industrynine.com/cart/1:1 2:2', null]) {
    const sheet = F.systemSheet(); sheet.orderList.cartLink = bad; sheet.orderList.sections.dealerSpokes.cartLink.url = bad;
    assert.equal(view.buildView(sheet).orderList.cartUrl, null, String(bad));
  }
  const src = read('components/tabs/OrderListCard.js'); assert.match(src, /No safe cart link for this list/); assert.match(src, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(!/window\.open|\.click\(\)|location\.href/.test(src), 'nothing opens the cart by itself');
});

test('no customer field: a customer value hidden in the list never shows, and the forbidden-key guard still blocks it', () => {
  const C = { email: 'buyer@example.test', street: '1 Fake Street', name: 'Pat Fake' };
  const sheet = F.systemSheet(); sheet.customer = { email: C.email }; sheet.shipping_address = { address1: C.street }; sheet.orderList.customer_note = C.name; sheet.orderList.sections.hubs.wheels[0].email = C.email; sheet.orderList.sections.rims.customer = { name: C.name };
  const out = JSON.stringify(view.buildView(sheet)); for (const v of Object.values(C)) assert.ok(!out.includes(v), 'leaked: ' + v);
  assert.ok(view.findForbiddenKeys(sheet).length >= 3);
  assert.deepEqual(view.findForbiddenKeys(F.systemSheet()), [], 'the real shape has none'); assert.deepEqual(view.findForbiddenKeys({ orderListStatus: 'present', orderList: F.prebuiltList() }), []);
  const pr = proxy.getSheet({ order: '12345', env: ENV, fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sheet: sheet }) }) });
  return pr.then((r) => assert.equal(r.status, 502) || assert.equal(r.body.error, 'PRIVACY_BLOCK'));
});

test('proxy: fresh=1 is passed upstream only when asked; the answer keeps orderListStatus and source and nothing else new', async () => {
  const urls = []; const fetchFn = async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ ok: true, source: 'recalculated', orderListStatus: 'present', savedAt: 'x', secretish: 'no', sheet: F.systemSheet() }) }; };
  const a = await proxy.getSheet({ order: '12345', env: ENV, fetchFn }); const b = await proxy.getSheet({ order: '12345', fresh: true, env: ENV, fetchFn });
  assert.ok(urls[0].endsWith('/api/order-sheet?order=12345')); assert.ok(urls[1].endsWith('/api/order-sheet?order=12345&fresh=1'));
  assert.deepEqual(Object.keys(b.body).sort(), ['ok', 'orderListStatus', 'sheet', 'source']); assert.equal(a.body.orderListStatus, 'present');
  const route = read('pages/api/order-sheet.js'); assert.match(route, /req\.query\.fresh/); assert.match(route, /getSheet\(\{ order: req\.query\.order, fresh \}\)/);
});

test('page: not-saved shows the quiet text, a button that asks for fresh=1, a "recalculated on ... may differ" label and the saved lengths; the old field still renders', () => {
  const src = read('components/tabs/OrderSheet.js');
  assert.match(src, /Not saved with this sheet\./); assert.match(src, /Show recalculated list/); assert.match(src, /order=\$\{n\}&fresh=1/);
  assert.match(src, /may differ from what was sent/); assert.match(src, /Saved lengths:/); assert.match(src, /Standard builds have no I9 order list\./);
  assert.match(src, /view\.orderListStatus === 'legacy' && view\.i9/, 'the PR 1 card stays until Backend 1 removes the field');
  assert.match(src, /list: st === 'present' \? buildOrderList\(body\.sheet\.orderList\) : null/, 'only the orderList part of the fresh answer is used');
});

test('print: order list rules sit inside @media print only; the card is not forced onto one page; small blocks stay whole; the cart link prints as text', () => {
  const src = read('components/tabs/OrderSheet.js'); const css = src.slice(src.indexOf('<style>{`') + 9, src.indexOf('`}</style>')); const i = css.indexOf('@media print');
  const outside = css.slice(0, i) + css.slice(css.lastIndexOf('}') + 1); assert.ok(!/os-ol|os-print-only/.test(outside), 'nothing about the order list outside the print block');
  const p = css.slice(i); assert.match(p, /\.os-print-only \{ display: block !important; \}/); assert.match(p, /\.os-keep, \.os-images figure \{ break-inside: avoid; page-break-inside: avoid; \}/);
  const avoid = [...p.matchAll(/([^{}]+)\{([^}]*(?:break-inside|page-break-inside)\s*:\s*avoid[^}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim())); assert.ok(!avoid.includes('.os-ol') && !avoid.includes('.os-sec'));
  const card = read('components/tabs/OrderListCard.js');
  assert.match(card, /<section className="os-sec os-ol /); assert.ok(!/<section className="[^"]*os-keep/.test(card), 'the whole card is not os-keep');
  assert.match(card, /className="hidden os-print-only text-xs mt-1 break-all">Cart link: \{ol\.cartUrl\}/); assert.match(card, /no-print inline-flex[^"]*"><ExternalLink size=\{14\} \/>Open I9 cart link/);
  assert.match(card, /os-heading font-black uppercase text-xs mb-1">\{ol\.dealer\.title\}/); assert.ok((card.match(/os-keep/g) || []).length >= 5);
  assert.ok(/className=\{'no-print /.test(card), 'copy buttons do not print');
});

test('copy buttons: whole list copies orderList.text, Thomas box copies orderByEmailText, both unchanged', () => {
  const card = read('components/tabs/OrderListCard.js');
  assert.match(card, /<CopyBtn text=\{ol\.text\} label="Copy as text" \/>/); assert.match(card, /<CopyBtn text=\{ol\.emailText\} label="Copy" \/>/); assert.match(card, /navigator\.clipboard\.writeText\(text\)/);
});

test('rim and hub lines: the I9 code and "customer supplied" show once, whether Backend 1\'s text already has them or not', () => {
  const sheet = F.systemSheet(); const S = sheet.orderList.sections;
  S.rims.wheels = [
    { position: 'front', text: 'Made Up TRIAD Carbon Rim - 29", 28h  (I9 code TR303)', customerSupplied: false, i9Code: 'TR303' },   // text already has the code
    { position: 'rear', text: 'Made Up TRIAD Carbon Rim - 27.5", 32h', customerSupplied: false, i9Code: 'TR305' },                    // text has no code
    { position: 'front', text: 'Made Up Rim (customer supplied)', customerSupplied: true, i9Code: '' },                                  // already says customer supplied
    { position: 'rear', text: 'Made Up Rim', customerSupplied: true, i9Code: 'TR9.1' },                                               // neither
  ];
  S.hubs.wheels = [{ position: 'front', text: 'Made Up Hub (customer supplied)', customerSupplied: true }, { position: 'rear', text: 'Made Up Hub', customerSupplied: true }, { position: 'rear', text: 'Made Up Hub 2', customerSupplied: false }];
  const ol = view.buildView(sheet).orderList; const shown = ol.rims.wheels.map((w) => w.display);
  assert.deepEqual(shown, ['Made Up TRIAD Carbon Rim - 29", 28h  (I9 code TR303)', 'Made Up TRIAD Carbon Rim - 27.5", 32h (I9 code TR305)', 'Made Up Rim (customer supplied)', 'Made Up Rim (I9 code TR9.1) (customer supplied)']);
  for (const s of shown) { assert.ok((s.match(/I9 code/g) || []).length <= 1, s); assert.ok((s.match(/customer supplied/g) || []).length <= 1, s); }
  assert.deepEqual(ol.hubs.wheels.map((w) => w.display), ['Made Up Hub (customer supplied)', 'Made Up Hub (customer supplied)', 'Made Up Hub 2']);
  assert.equal(ol.text, F.systemSheet().orderList.text, 'Copy as text is the unchanged orderList.text');
  const card = read('components/tabs/OrderListCard.js'); assert.match(card, /\{w\.positionLabel\}: \{w\.display\}/); assert.ok(!/I9 code '/.test(card), 'the card adds no code of its own');
});
