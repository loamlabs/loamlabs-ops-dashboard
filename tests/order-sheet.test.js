// Run with: npm test   (no network: fake fetch)
// Order sheet (dashboard): view logic, the two API routes through a fake fetch, privacy, and "the secret never reaches the browser".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const view = require('../lib/order-sheet-view');
const proxy = require('../lib/order-sheet-proxy');

const ROOT = path.join(__dirname, '..');
const SECRET = 'test-secret-0123456789abcdef-NOT-REAL', BASE = 'https://spoke-automation.example.test', PASS = 'dash-pass';
const ENV = { ORDER_SHEET_SECRET: SECRET, ORDER_SHEET_BASE_URL: BASE + '/', DASHBOARD_PASSWORD: PASS };

// ---- fixtures built from the example in AGENT_BACKEND1_ORDER_SHEET_PR1_REPORT.md (fake order number 12345) ----
const rearWheel = {
  position: 'rear', label: 'Rear', hubModel: 'Hydra2', hubTitle: 'Industry Nine Hydra2 SYSTEM Rear Hub - 6-Bolt', hubVariantTitle: '32h / Bronze / 12x148mm', hubColor: 'Bronze', freehub: 'XD',
  rimTitle: 'We Are One TRIAD Carbon Rim (Enduro) - 27.5"', spokeCountLabel: '32h (16 drive / 16 rotor)', total: 32, ratio: '1:1', highSide: 'drive', lowSide: 'rotor',
  sides: { drive: { count: 16, lengthMm: 282, counts: [{ color: 'Black', n: 8 }, { color: 'Bronze', n: 8 }] }, rotor: { count: 16, lengthMm: 284, counts: [{ color: 'Black', n: 8 }, { color: 'Bronze', n: 8 }] } },
  lengths: { status: 'calculated', rotorMm: 284, driveMm: 282, text: 'Spoke lengths (System): Left/Rotor 284 mm, Right/Drive 282 mm', sourceText: 'source: I9 System chart 2026, row Triad 27.5" 32h TR305', caveat: null },
  spokes: [{ number: 1, text: '1', side: 'rotor', k: 4, color: 'Bronze', high: false }, { number: 2, text: '2', side: 'drive', k: 11, color: 'Bronze', high: true }, { number: 3, text: '3', side: 'rotor', k: 9, color: 'Black', high: false }, { number: 4, text: '4', side: 'drive', k: 6, color: 'Black', high: true }],
  lists: { drive: [{ number: 2, text: '2', color: 'Bronze' }, { number: 4, text: '4', color: 'Black' }], rotor: [{ number: 1, text: '1', color: 'Bronze' }, { number: 3, text: '3', color: 'Black' }] },
  images: [{ wheel: 'rear', view: 'all', caption: 'Rear wheel, all spokes (drive side view)' }, { wheel: 'rear', view: 'high', caption: 'Rear wheel, drive side spokes only' }, { wheel: 'rear', view: 'low', caption: 'Rear wheel, rotor side spokes only' }],
  supplied: null, warnings: [],
};
const oneColorFront = {   // a one-color wheel: only the "all" picture, no high/low views
  position: 'front', label: 'Front', hubModel: 'Hydra2', hubTitle: 'Industry Nine Hydra2 SYSTEM Front Hub - 6-Bolt', hubVariantTitle: '28h / Black / 15x110mm', hubColor: 'Black', freehub: null, rimTitle: 'We Are One TRIAD Carbon Rim (Enduro) - 29"',
  spokeCountLabel: '28h (14 drive / 14 rotor)', total: 28, ratio: '1:1', highSide: 'rotor', lowSide: 'drive',
  sides: { drive: { count: 14, lengthMm: 307, counts: [{ color: 'Black', n: 14 }] }, rotor: { count: 14, lengthMm: 305, counts: [{ color: 'Black', n: 14 }] } },
  lengths: { status: 'calculated', rotorMm: 305, driveMm: 307, text: 'Spoke lengths (System): Left/Rotor 305 mm, Right/Drive 307 mm', sourceText: 'source: I9 System chart 2026, row Triad 29" 28h TR303', caveat: null },
  spokes: [{ number: 1, text: '1', side: 'drive', color: 'Black', high: false }, { number: 2, text: '2', side: 'rotor', color: 'Black', high: true }],
  lists: { drive: [{ number: 1, text: '1', color: 'Black' }], rotor: [{ number: 2, text: '2', color: 'Black' }] },
  images: [{ wheel: 'front', view: 'all', caption: 'Front wheel, all spokes (rotor side view)' }], supplied: null, warnings: [],
};
const solix24 = {   // 2:1 wheel: 16 drive / 8 rotor, no high/low split; numbers per side "Drive 3"
  position: 'rear', label: 'Rear', hubModel: 'Solix', hubTitle: 'Industry Nine Solix SYSTEM Rear Hub - Centerlock', hubVariantTitle: '24h / Red / 12x148mm', hubColor: 'Red', freehub: 'XD', rimTitle: 'We Are One WHISP Carbon Rim (XC) - 29"',
  spokeCountLabel: '24h (16 drive / 8 rotor)', total: 24, ratio: '2:1', highSide: null, lowSide: null,
  sides: { drive: { count: 16, lengthMm: 296, counts: [{ color: 'Gold', n: 16 }] }, rotor: { count: 8, lengthMm: 300, counts: [{ color: 'Gold', n: 8 }] } },
  lengths: { status: 'not-calculated', rotorMm: null, driveMm: null, text: 'Spoke lengths for System hubs: NOT CALCULATED. This rim is not in I9\'s spoke length chart, so check the lengths with I9 before ordering spokes.', sourceText: null, caveat: 'check ERD with I9' },
  spokes: [{ number: 3, text: 'Drive 3', side: 'drive', color: 'Gold', high: false }, { number: 3, text: 'Rotor 3', side: 'rotor', color: 'Gold', high: false }],
  lists: { drive: [{ number: 3, text: 'Drive 3', color: 'Gold' }], rotor: [{ number: 3, text: 'Rotor 3', color: 'Gold' }] },
  images: [{ wheel: 'rear', view: 'all', caption: 'Rear wheel, all spokes' }], supplied: 'You supply the rim; it must arrive before the build.', warnings: ['Rim is not in the chart'],
};
const sheet = (over = {}) => ({
  sheetVersion: 1, kind: 'system', studio: true, orderNumber: '12345', orderName: '#12345', orderCreatedAt: '2026-11-12T15:04:05-05:00', orderCancelled: false, buildId: '777152',
  calculation: { mode: 'recalculated', at: '2026-11-13T09:30:00.000Z', text: 'recalculated on 2026-11-13, may differ from what was sent' },
  numbering: { version: 1, status: 'provisional', label: 'numbering version 1, provisional', rule: 'High-tension side: even numbers 2, 4, 6 ...' },
  wheels: [oneColorFront, rearWheel], warnings: [], orderChecks: [], customerSupplied: null,
  i9OrderList: { text: 'I9 ORDER LIST  -  order #12345\nB. SPOKES on I9\'s dealer list', linkUrl: 'https://b2b.industrynine.com/cart/43663812755591:9', linkAdds: '9 x 282 mm Black', thomasText: 'Hi Thomas, for LoamLabs order #12345 please add...', snapshotDate: '2026-11-08' },
  ...over,
});

// ---------- order number and messages ----------
test('order number: digits only, # allowed, 1 to 9 digits', () => {
  assert.equal(view.normalizeOrderNumber('1466'), '1466'); assert.equal(view.normalizeOrderNumber(' #1466 '), '1466'); assert.equal(view.normalizeOrderNumber(1377), '1377');
  for (const bad of ['', 'abc', '14 66', '1466a', '1234567890', '-5', '12.5', null, undefined, '#']) assert.equal(view.normalizeOrderNumber(bad), null, String(bad));
});
test('messages: every failure case gets a readable sentence', () => {
  assert.match(view.messageFor(401, { error: 'UNAUTHORIZED' }), /secret/i); assert.match(view.messageFor(404, { error: 'ORDER_NOT_FOUND' }), /No order/);
  assert.match(view.messageFor(422, { error: 'NOT_A_BUILDER_ORDER' }), /no wheel build/); assert.match(view.messageFor(502, { error: 'SHOPIFY_ERROR' }), /Try again/);
  assert.match(view.messageFor(503, { error: 'SETUP_MISSING' }), /ORDER_SHEET_SECRET/); assert.match(view.messageFor(400, { error: 'BAD_ORDER_NUMBER' }), /digits/);
  assert.match(view.messageFor(401, { error: 'DASHBOARD_UNAUTHORIZED' }), /sign/i); assert.match(view.messageFor(502, { error: 'PRIVACY_BLOCK' }), /customer data/);
  assert.match(view.messageFor(500, null), /problem/); assert.ok(view.messageFor(418, null).length > 10);
});

// ---------- view model ----------
test('view: header shows order, date (12-hour Eastern), build id, the calculation line and the numbering label', () => {
  const v = view.buildView(sheet());
  assert.equal(v.header.orderName, '#12345'); assert.equal(v.header.buildId, '777152'); assert.equal(v.header.kind, 'Industry Nine System');
  assert.match(v.header.date, /Nov 12, 2026, 3:04 PM EST/); assert.equal(v.header.calcText, 'recalculated on 2026-11-13, may differ from what was sent'); assert.equal(v.header.numberingLabel, 'numbering version 1, provisional');
});
test('calculation tone: amber while recalculated, neutral for a saved copy ("as sent")', () => {
  assert.equal(view.buildView(sheet()).header.calcTone, 'amber');
  assert.equal(view.buildView(sheet({ calculation: { mode: 'saved', at: 'x', text: 'as sent on 2026-11-12' } })).header.calcTone, 'neutral');
  assert.equal(view.buildView(sheet({ calculation: { mode: 'saved', at: 'x', text: 'as sent on 2026-11-12' } })).header.calcText, 'as sent on 2026-11-12');
});
test('view, a two-color rear wheel: facts, lengths per side with source, high side first in the lists, images as listed', () => {
  const w = view.buildView(sheet()).wheels.find((x) => x.position === 'rear');
  assert.ok(w.facts.some(([k, v]) => k === 'High-tension side' && v === 'Drive')); assert.ok(w.facts.some(([k, v]) => k === 'Spokes' && /32h/.test(v)));
  const rotor = w.sides.find((s) => s.side === 'rotor'), drive = w.sides.find((s) => s.side === 'drive');
  assert.equal(rotor.lengthMm, 284); assert.equal(drive.lengthMm, 282); assert.equal(drive.high, true); assert.equal(rotor.low, true); assert.match(drive.colors, /8 Black, 8 Bronze/);
  assert.match(w.sourceText, /TR305/); assert.deepEqual(w.lists.map((l) => l.side), ['drive', 'rotor']); assert.match(w.lists[0].label, /high tension/);
  assert.deepEqual(w.images.map((i) => i.view), ['all', 'high', 'low']); assert.equal(w.spokes[1].number, 2); assert.equal(w.spokes[1].high, true);
});
test('view, a one-color wheel: only the all-spokes picture', () => {
  const w = view.buildView(sheet()).wheels.find((x) => x.position === 'front');
  assert.deepEqual(w.images.map((i) => i.view), ['all']); assert.equal(w.sides.find((s) => s.side === 'rotor').lengthMm, 305);
});
test('view, a 2:1 wheel (Solix 24h, 16 drive / 8 rotor): no high/low split, each side numbered on its own ("Drive 3"), NOT CALCULATED is flagged, supplied parts shown', () => {
  const w = view.buildView(sheet({ wheels: [solix24] })).wheels[0];
  assert.ok(w.facts.some(([k, v]) => k === 'High-tension side' && /n\/a/.test(v))); assert.deepEqual(w.lists.map((l) => l.side), ['rotor', 'drive']); assert.ok(!/tension/.test(w.lists[0].label));
  assert.equal(w.sides.find((s) => s.side === 'drive').count, 16); assert.equal(w.sides.find((s) => s.side === 'rotor').count, 8);
  assert.deepEqual(w.spokes.map((s) => s.text), ['Drive 3', 'Rotor 3']); assert.equal(w.notCalculated, true); assert.match(w.lengthsText, /NOT CALCULATED/); assert.match(w.supplied, /You supply the rim/); assert.deepEqual(w.warnings, ['Rim is not in the chart']);
});
test('view: warnings, order checks, customer-supplied parts and the I9 order list', () => {
  const v = view.buildView(sheet({ warnings: ['W1'], orderChecks: ['Second build line is not calculated'], customerSupplied: { text: 'Customer supplies the hubs', reminder: 'Parts must arrive first' } }));
  assert.deepEqual(v.warnings, ['W1']); assert.deepEqual(v.orderChecks, ['Second build line is not calculated']); assert.equal(v.supplied.text, 'Customer supplies the hubs');
  assert.match(v.i9.text, /I9 ORDER LIST/); assert.equal(v.i9.linkUrl, 'https://b2b.industrynine.com/cart/43663812755591:9'); assert.equal(v.i9.snapshotDate, '2026-11-08');
  assert.equal(view.buildView(sheet({ i9OrderList: undefined, kind: 'standard' })).i9, null);
});
test('the I9 cart link is only offered for an I9 B2B cart address', () => {
  assert.equal(view.safeCartLink('https://b2b.industrynine.com/cart/1:2,3:4'), 'https://b2b.industrynine.com/cart/1:2,3:4');
  for (const bad of ['https://evil.example.com/cart/1:2', 'javascript:alert(1)', 'http://b2b.industrynine.com/cart/1:2', 'https://b2b.industrynine.com/cart/1:2 onclick=x', null, 42]) assert.equal(view.safeCartLink(bad), null, String(bad));
});
test('copy as text: header, numbering label, lengths and the per-spoke list', () => {
  const t = view.sheetToText(sheet());
  assert.match(t, /ORDER SHEET #12345/); assert.match(t, /numbering version 1, provisional/); assert.match(t, /Spoke lengths \(System\): Left\/Rotor 284 mm/); assert.match(t, /Drive side \(high tension\)|Drive \(high\)/); assert.match(t, /^2\s+Drive\s+Bronze/m);
});
test('image paths ask the dashboard route (the secret is added on the server)', () => {
  assert.equal(view.imagePath(1466, { wheel: 'front', view: 'high' }, 600), '/api/order-sheet-image?order=1466&wheel=front&view=high&width=600');
});

// ---------- privacy: no customer field rendered or returned ----------
const CUSTOMER = { name: 'Pat Q. Customer', email: 'pat.customer@example.com', phone: '+1 555 0100', street: '12 Elm Street Apt 4', city: 'Springfield' };
const dirty = () => {
  const s = sheet();
  s.customer = { first_name: 'Pat', last_name: 'Customer', email: CUSTOMER.email, phone: CUSTOMER.phone };
  s.shipping_address = { address1: CUSTOMER.street, city: CUSTOMER.city, name: CUSTOMER.name }; s.email = CUSTOMER.email; s.note = 'leave at ' + CUSTOMER.street; s.wheels[1].customer_note = CUSTOMER.name;
  s.orderCustomerName = CUSTOMER.name; s.buyerEmail = CUSTOMER.email;   // unknown field names: the whitelist must not show them either
  return s;
};
test('privacy: the view model and the copied text never contain customer values, even when the data wrongly carries them', () => {
  const s = dirty(); const text = JSON.stringify(view.buildView(s)) + view.sheetToText(s);
  for (const v of Object.values(CUSTOMER)) assert.ok(!text.includes(v), 'leaked: ' + v);
  assert.ok(!/pat\.customer|555 0100|Elm Street|Springfield/i.test(text));
});
test('privacy: findForbiddenKeys names the paths of customer-looking keys (second guard)', () => {
  const p = view.findForbiddenKeys(dirty()); assert.ok(p.includes('$.customer') && p.includes('$.shipping_address') && p.includes('$.email') && p.includes('$.note') && p.includes('$.customer.first_name'));
  assert.deepEqual(view.findForbiddenKeys(sheet()), [], 'a normal sheet has none');
});
test('privacy: the sheet route refuses (502 PRIVACY_BLOCK) a sheet that carries a customer key, and returns no part of it', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true, sheet: dirty() }) });
  const out = await proxy.getSheet({ order: '12345', env: ENV, fetchFn });
  assert.equal(out.status, 502); assert.equal(out.body.error, 'PRIVACY_BLOCK'); assert.ok(!JSON.stringify(out.body).includes(CUSTOMER.email) && !out.body.sheet);
});

// ---------- the routes with a fake fetch ----------
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) }, json: async () => body });
const png = () => ({ ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) }, arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer });
const spy = (reply) => { const calls = []; const fn = async (url, init) => { calls.push({ url, init }); return typeof reply === 'function' ? reply(url, init) : reply; }; fn.calls = calls; return fn; };

test('dashboard auth: only the right x-dashboard-auth header passes (same rule as the other routes)', () => {
  assert.equal(proxy.isDashboardAuthorized({ 'x-dashboard-auth': PASS }, ENV), true); assert.equal(proxy.isDashboardAuthorized({ 'x-dashboard-auth': ' ' + PASS + ' ' }, ENV), true);
  for (const h of [{}, { 'x-dashboard-auth': 'wrong' }, { 'x-dashboard-auth': '' }, { 'x-dashboard-auth': [PASS] }]) assert.equal(proxy.isDashboardAuthorized(h, ENV), false);
  assert.equal(proxy.isDashboardAuthorized({ 'x-dashboard-auth': '' }, { DASHBOARD_PASSWORD: '' }), false, 'an unset password never opens the door');
});
test('sheet: calls Backend 1 with the secret in a header, the order number in the url, and never puts the secret or the host in the answer', async () => {
  const f = spy(json(200, { ok: true, sheet: sheet() }));
  const out = await proxy.getSheet({ order: '#1466', env: ENV, fetchFn: f });
  assert.equal(out.status, 200); assert.equal(out.body.sheet.orderNumber, '12345');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, BASE + '/api/order-sheet?order=1466'); assert.equal(f.calls[0].init.headers['x-order-sheet-secret'], SECRET); assert.equal(f.calls[0].init.method, 'GET');
  const text = JSON.stringify(out); assert.ok(!text.includes(SECRET) && !text.includes(BASE) && !text.includes('example.test'));
});
test('sheet: setup missing (no secret or no host) is 503 and calls nothing; a bad order number is 400 and calls nothing', async () => {
  for (const env of [{}, { ORDER_SHEET_SECRET: SECRET }, { ORDER_SHEET_BASE_URL: BASE }, { ORDER_SHEET_SECRET: SECRET, ORDER_SHEET_BASE_URL: 'not a url' }]) { const f = spy(json(200, {})); const out = await proxy.getSheet({ order: '1', env, fetchFn: f }); assert.equal(out.status, 503); assert.equal(out.body.error, 'SETUP_MISSING'); assert.equal(f.calls.length, 0); }
  const f = spy(json(200, {})); const out = await proxy.getSheet({ order: 'abc', env: ENV, fetchFn: f }); assert.equal(out.status, 400); assert.equal(f.calls.length, 0);
});
test('sheet: Backend 1 error codes become readable messages (401, 404, 422, 502), unknown bodies and network failures too', async () => {
  const cases = [[401, { ok: false, error: 'UNAUTHORIZED' }, 401, /secret/i], [404, { ok: false, error: 'ORDER_NOT_FOUND' }, 404, /No order/], [422, { ok: false, error: 'NOT_A_BUILDER_ORDER' }, 422, /no wheel build/], [502, { ok: false, error: 'SHOPIFY_ERROR', message: 'x' }, 502, /Try again/], [500, null, 502, /problem/]];
  for (const [st, body, want, re] of cases) { const out = await proxy.getSheet({ order: '1', env: ENV, fetchFn: spy(json(st, body)) }); assert.equal(out.status, want); assert.equal(out.body.ok, false); assert.match(out.body.message, re); assert.ok(!JSON.stringify(out.body).includes(SECRET)); }
  const net = await proxy.getSheet({ order: '1', env: ENV, fetchFn: async () => { throw new Error('connect ECONNREFUSED ' + BASE + ' ' + SECRET); } });
  assert.equal(net.status, 502); assert.equal(net.body.error, 'UNREACHABLE'); assert.ok(!JSON.stringify(net).includes(SECRET) && !JSON.stringify(net).includes('ECONNREFUSED'));
  const html = await proxy.getSheet({ order: '1', env: ENV, fetchFn: spy({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => { throw new Error('not json'); } }) }); assert.equal(html.status, 502);
});
test('image: passes the PNG through; checks wheel and view before calling; clamps the width; maps errors', async () => {
  const f = spy(png()); const out = await proxy.getImage({ order: '1466', wheel: 'front', view: 'high', width: 5000, env: ENV, fetchFn: f });
  assert.equal(out.status, 200); assert.equal(out.contentType, 'image/png'); assert.equal(out.buffer.length, 4); assert.equal(f.calls[0].url, BASE + '/api/order-sheet-image?order=1466&wheel=front&view=high&width=1200'); assert.equal(f.calls[0].init.headers['x-order-sheet-secret'], SECRET);
  const lo = spy(png()); await proxy.getImage({ order: '1', wheel: 'rear', width: 10, env: ENV, fetchFn: lo }); assert.match(lo.calls[0].url, /view=all&width=200$/);
  for (const bad of [{ wheel: 'middle' }, { wheel: 'front', view: 'left' }]) { const g = spy(png()); const o = await proxy.getImage({ order: '1', env: ENV, fetchFn: g, ...bad }); assert.equal(o.status, 404); assert.equal(g.calls.length, 0); }
  const nf = await proxy.getImage({ order: '1', wheel: 'rear', env: ENV, fetchFn: spy(json(404, { ok: false, error: 'NO_SUCH_IMAGE' })) }); assert.equal(nf.status, 404); assert.match(nf.body.message, /no such picture/);
  const bad = await proxy.getImage({ order: '1', wheel: 'rear', env: ENV, fetchFn: spy(json(502, { ok: false, error: 'DRAW_FAILED' })) }); assert.equal(bad.status, 502); assert.match(bad.body.message, /could not be drawn/);
  assert.equal((await proxy.getImage({ order: 'x', wheel: 'rear', env: ENV, fetchFn: f })).status, 400); assert.equal((await proxy.getImage({ order: '1', wheel: 'rear', env: {}, fetchFn: f })).status, 503);
});

// run the real route files (ES module syntax) with a fake request and response
function loadRoute(file, proxyImpl) {
  let src = fs.readFileSync(path.join(ROOT, 'pages', 'api', file), 'utf8');
  src = src.replace(/import \{([^}]*)\} from '\.\.\/\.\.\/lib\/order-sheet-proxy';/, 'const {$1} = __proxy;').replace(/export const config/, 'const config').replace(/export default async function handler/, 'async function handler') + '\nmodule.exports = handler;';
  const m = { exports: null }; vm.runInNewContext(src, { module: m, __proxy: proxyImpl, Buffer, console }); return m.exports;
}
const fakeRes = () => { const r = { code: null, headers: {}, body: null, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
test('route /api/order-sheet: 401 without the dashboard password (and nothing is called), 405 for POST, 200 with it, no-store', async () => {
  const calls = []; const impl = { isDashboardAuthorized: (h) => proxy.isDashboardAuthorized(h, ENV), getSheet: async (o) => { calls.push(o); return { status: 200, body: { ok: true, sheet: sheet() } }; } };
  const handler = loadRoute('order-sheet.js', impl);
  let res = fakeRes(); await handler({ method: 'GET', headers: {}, query: { order: '1466' } }, res); assert.equal(res.code, 401); assert.equal(res.body.error, 'DASHBOARD_UNAUTHORIZED'); assert.equal(calls.length, 0);
  res = fakeRes(); await handler({ method: 'POST', headers: { 'x-dashboard-auth': PASS }, query: {} }, res); assert.equal(res.code, 405); assert.equal(calls.length, 0);
  res = fakeRes(); await handler({ method: 'GET', headers: { 'x-dashboard-auth': PASS }, query: { order: '1466' } }, res); assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store'); assert.deepEqual(calls.map((c) => c.order), ['1466']);
  assert.ok(!JSON.stringify(res.body).includes(SECRET));
});
test('route /api/order-sheet-image: 401 without the password, PNG with it, error JSON passed through', async () => {
  const calls = []; let mode = 'png'; const impl = { isDashboardAuthorized: (h) => proxy.isDashboardAuthorized(h, ENV), getImage: async (o) => { calls.push(o); return mode === 'png' ? { status: 200, contentType: 'image/png', buffer: Buffer.from([1, 2, 3]) } : { status: 404, body: { ok: false, error: 'NO_SUCH_IMAGE', message: 'This order has no such picture.' } }; } };
  const handler = loadRoute('order-sheet-image.js', impl);
  let res = fakeRes(); await handler({ method: 'GET', headers: {}, query: { order: '1', wheel: 'front' } }, res); assert.equal(res.code, 401); assert.equal(calls.length, 0);
  res = fakeRes(); await handler({ method: 'GET', headers: { 'x-dashboard-auth': PASS }, query: { order: '1466', wheel: 'front', view: 'all', width: '600' } }, res); assert.equal(res.code, 200); assert.equal(res.headers['Content-Type'], 'image/png'); assert.equal(res.body.length, 3);
  mode = 'err'; res = fakeRes(); await handler({ method: 'GET', headers: { 'x-dashboard-auth': PASS }, query: { order: '1466', wheel: 'rear' } }, res); assert.equal(res.code, 404); assert.equal(res.body.error, 'NO_SUCH_IMAGE');
});

// ---------- the secret never reaches the browser ----------
test('the secret and the Backend 1 host are only in server code: not in the page, the tab component, the view library or any client file', () => {
  const clientFiles = ['pages/index.js', 'components/tabs/OrderSheet.js', 'lib/order-sheet-view.js'];
  for (const f of clientFiles) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); assert.ok(!/x-order-sheet-secret|process.env.(NEXT_PUBLIC_)?ORDER_SHEET/.test(s), f + ' touches the secret header or the order sheet variables'); }
  const users = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.next', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) && /order-sheet-proxy/.test(fs.readFileSync(p, 'utf8')) && !p.endsWith('order-sheet.test.js') && !p.endsWith('order-sheet-proxy.js')) users.push(path.relative(ROOT, p).replace(/\\/g, '/')); } })(ROOT);
  assert.deepEqual(users.sort(), ['pages/api/order-sheet-image.js', 'pages/api/order-sheet.js'], 'only the two API routes import the server proxy');
  assert.ok(!/NEXT_PUBLIC_ORDER_SHEET/.test(fs.readFileSync(path.join(ROOT, 'lib/order-sheet-proxy.js'), 'utf8')), 'no NEXT_PUBLIC_ variable carries it');
});
test('the tab loads each picture with fetch + the auth header and shows it from a blob URL, one at a time', () => {
  const s = fs.readFileSync(path.join(ROOT, 'components/tabs/OrderSheet.js'), 'utf8');
  assert.ok(/x-dashboard-auth/.test(s) && /createObjectURL/.test(s) && /revokeObjectURL/.test(s)); assert.ok(/for \(const im of list\)/.test(s) && /await fetch\(imagePath/.test(s));
  assert.ok(!/<img[^>]*src=\{?['"`]\/api/.test(s), 'no plain <img src="/api/...">');
  assert.ok(/@media print/.test(s) && /size: letter/.test(s));
});

// ================= display fixes A to D (Nov 13) =================
// a Standard order without Studio data, as Backend 1 sends #1377: lengths and source, no per-spoke list, no pictures, no side counts, no ratio, no high/low split
const std = (pos, rot, drv) => ({
  position: pos, label: pos === 'front' ? 'Front' : 'Rear', hubModel: null, hubTitle: pos === 'front' ? 'DT Swiss 240 SP Front Hub - Centerlock - 12x100mm' : 'DT Swiss 240 EXP SP Rear Hub - Centerlock - 12x142mm',
  rimTitle: pos === 'front' ? 'Reserve 40 GR 700c Carbon Rim - 700c' : 'Reserve 44 GR 700c Carbon Rim - 700c', highSide: null, lowSide: null,
  sides: { rotor: { lengthMm: rot, counts: [] }, drive: { lengthMm: drv, counts: [] } },
  lengths: { status: 'calculated', text: `Spoke lengths: Left ${rot} mm, Right ${drv} mm`, sourceText: 'Source: spoke calculator (rim, hub and spoke data from the store)' },
  spokes: [], lists: {}, images: [], warnings: ['Hub policy override applied. Using 2-cross.'],
});
const standardSheet = () => sheet({ kind: 'standard', studio: false, orderNumber: '1377', orderName: '#1377', wheels: [std('front', 280, 282), std('rear', 276, 274)], i9OrderList: undefined, warnings: ['Hub policy override applied. Using 2-cross.'] });

test('A: an order without Studio data hides the empty per-spoke table, the empty side lists and the empty picture area, and says so once, in one plain line', () => {
  const v = view.buildView(standardSheet());
  assert.equal(v.noStudioAll, true); assert.ok(v.wheels.every((w) => w.hasDetail === false));
  assert.equal(v.noStudioLine, 'No per-spoke list or pictures for this order: it was not built with the colour tool.');
  assert.match(v.wheels[0].lengthsText, /Left 280 mm, Right 282 mm/); assert.match(v.wheels[0].sourceText, /spoke calculator/); assert.deepEqual(v.wheels[0].warnings, ['Hub policy override applied. Using 2-cross.']);
  const text = view.sheetToText(standardSheet());
  assert.equal(text.split(view.NO_STUDIO_LINE).length - 1, 1, 'the plain line appears once'); assert.ok(!/Spoke\s+Side\s+Color/.test(text)); assert.match(text, /Spoke lengths: Left 280 mm, Right 282 mm/);
  const src = fs.readFileSync(path.join(ROOT, 'components/tabs/OrderSheet.js'), 'utf8');
  assert.ok(/\{w\.hasDetail \? <div className="os-images/.test(src) && /\{w\.hasDetail \? <div className="os-spoke-grid grid md:grid-cols-2 gap-6 mt-6"/.test(src)); assert.ok(/data-testid="no-studio"/.test(src) && /view\.noStudioAll/.test(src));
});
test('A: a System wheel keeps its pictures, table and lists; a mixed order shows the plain line only for the wheel without detail', () => {
  const w1 = view.buildView(sheet()).wheels; assert.ok(w1.every((w) => w.hasDetail === true)); assert.equal(view.buildView(sheet()).noStudioAll, false);
  const mixed = view.buildView(sheet({ wheels: [rearWheel, std('front', 280, 282)] })); assert.equal(mixed.noStudioAll, false); assert.deepEqual(mixed.wheels.map((w) => w.hasDetail), [true, false]);
  const t = view.sheetToText(sheet({ wheels: [rearWheel, std('front', 280, 282)] })); assert.equal(t.split(view.NO_STUDIO_LINE).length - 1, 1); assert.match(t, /Spoke\s+Side\s+Color/);
});
test('B: no high/low split means no High-tension / Low-tension rows and no "n/a"; the real "n/a (unequal sides)" stays only for truly unequal sides (Solix 24h 16/8)', () => {
  const key = (w, k) => w.facts.find(([n]) => n === k);
  for (const w of view.buildView(standardSheet()).wheels) { assert.equal(key(w, 'High-tension side'), undefined); assert.equal(key(w, 'Low-tension side'), undefined); assert.ok(!w.facts.some(([, v]) => /n\/a/.test(v))); }
  const equalNoSplit = { ...oneColorFront, highSide: null, lowSide: null };
  const e = view.buildView(sheet({ wheels: [equalNoSplit] })).wheels[0]; assert.equal(key(e, 'High-tension side'), undefined); assert.ok(!e.facts.some(([, v]) => /n\/a/.test(v)));
  const s = view.buildView(sheet({ wheels: [solix24] })).wheels[0]; assert.deepEqual(key(s, 'High-tension side'), ['High-tension side', 'n/a (unequal sides)']); assert.deepEqual(key(s, 'Low-tension side'), ['Low-tension side', 'n/a (unequal sides)']);
  const sys = view.buildView(sheet()).wheels.find((w) => w.position === 'rear'); assert.deepEqual(key(sys, 'High-tension side'), ['High-tension side', 'Drive']); assert.deepEqual(key(sys, 'Low-tension side'), ['Low-tension side', 'Rotor']);
});
test('C: a side line never prints an empty count; the count comes from Backend 1, or is derived only for a 1:1 wheel (total / 2), otherwise left out', () => {
  const sides = (w) => view.buildView(sheet({ wheels: [w] })).wheels[0].sides;
  const stdSides = sides(std('front', 280, 282)); assert.deepEqual(stdSides.map(view.sideText), ['Rotor side: 280 mm', 'Drive side: 282 mm']);
  const noCount = { ...oneColorFront, sides: { drive: { lengthMm: 307, counts: [{ color: 'Black', n: 14 }] }, rotor: { lengthMm: 305, counts: [{ color: 'Black', n: 14 }] } } };
  assert.deepEqual(sides(noCount).map((s) => s.count), [14, 14]); assert.match(view.sideText(sides(noCount)[0]), /^Rotor side \(high tension\): 14 spokes, 305 mm, 14 Black$/);
  assert.deepEqual(sides(oneColorFront).map((s) => s.count), [14, 14]);
  const twoToOne = { ...solix24, sides: { drive: { lengthMm: 296, counts: [] }, rotor: { lengthMm: 300, counts: [] } } }; assert.deepEqual(sides(twoToOne).map((s) => s.count), [null, null]);
  const odd = { ...noCount, total: 27 }; assert.deepEqual(sides(odd).map((s) => s.count), [null, null]);
  const noRatio = { ...noCount, ratio: undefined }; assert.deepEqual(sides(noRatio).map((s) => s.count), [null, null]);
  const noTotal = { ...noCount, total: undefined }; assert.deepEqual(sides(noTotal).map((s) => s.count), [null, null]);
  for (const w of [std('front', 280, 282), noCount, oneColorFront, twoToOne, solix24, odd, rearWheel]) for (const s of sides(w)) assert.ok(!/undefined|NaN|null|: spokes|^\s*spokes/.test(view.sideText(s)), view.sideText(s));
  assert.match(view.sheetToText(standardSheet()), /Rotor side: 280 mm\nDrive side: 282 mm/);
});
const printCss = () => { const src = fs.readFileSync(path.join(ROOT, 'components/tabs/OrderSheet.js'), 'utf8'); const css = src.slice(src.indexOf('<style>{`') + 9, src.indexOf('`}</style>')); const i = css.indexOf('@media print'); return { src, css, i, outside: css.slice(0, i) + css.slice(css.lastIndexOf('}') + 1), p: css.slice(i) }; };
test('D: print rules make the pictures 3.4 inches, two per row on letter paper, inside @media print only (screen layout unchanged)', () => {
  const { src, i, outside, p } = printCss(); assert.ok(i >= 0);
  assert.ok(!/3.4in|os-images|os-top|os-spoke|os-sec|os-head|os-wheel|thead|table-header-group/.test(outside), 'nothing about print layout outside the print block');
  assert.match(p, /size: letter/); assert.match(p, /.os-top { display: block !important; }/);
  assert.match(p, /.os-images figure { display: block !important; float: left; width: 3.4in !important;/); assert.match(p, /.os-images img { width: 3.4in !important; max-width: none !important; height: auto !important; }/);
  assert.ok(2 * 3.4 + 0.15 <= 7.5, 'two pictures and the gap fit the 7.5 inch printable width of letter paper with 0.5 inch margins');
  assert.ok(/os-top/.test(src) && /className="os-images/.test(src), 'the classes are on the elements');
});
test('print layout: no keep-together on the wheel card or the picture block; small blocks stay whole; header row repeats; rows never split', () => {
  const { p } = printCss();
  const avoid = [...p.matchAll(/([^{}]+)\{([^}]*(?:break-inside|page-break-inside)\s*:\s*avoid[^}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  assert.deepEqual(avoid.sort(), ['.os-images figure', '.os-keep', 'tr'].sort());
  for (const bad of ['.os-wheel', '.os-top', '.os-images', '.os-spoke-grid', '.os-lists', 'section']) assert.ok(!avoid.includes(bad), bad + ' must be allowed to break across pages');
  assert.match(p, /.os-heading { break-after: avoid; page-break-after: avoid; }/); assert.match(p, /thead { display: table-header-group; }/);
  assert.match(p, /.os-spoke-screen { display: none !important; }/); assert.match(p, /.os-spoke-print { display: grid !important; grid-template-columns: 1fr 1fr;/);
  const src = printCss().src;
  for (const [what, re] of [['lengths box', /os-keep mt-4 p-3 rounded-2xl border/], ['header card', /os-keep os-head os-sec/], ['per-side list', /className="os-keep"><h4/], ['wheel heading', /os-heading text-xl/], ['spoke heading', /os-heading font-black uppercase text-xs/]]) assert.ok(re.test(src), what + ' keeps its class');
  assert.ok(!/os-wheel[^"]*os-keep/.test(src), 'the wheel card itself is not os-keep');
});
test('print layout: the on-screen table is untouched and the two-column printed table is hidden on screen', () => {
  const { src, outside } = printCss();
  assert.match(src, /<div className="os-spoke-screen"><table className="os-spoke-table text-sm w-full border-collapse">/);
  assert.match(src, /<div className="hidden os-spoke-print">/); assert.ok(!/os-spoke-print/.test(outside));
  assert.match(src, /className="os-spoke-grid grid md:grid-cols-2 gap-6 mt-6"/);
});
test('print layout: splitForPrint halves the spokes in order, first half gets the odd one, nothing lost or repeated', () => {
  assert.deepEqual(view.splitForPrint([]), []); assert.deepEqual(view.splitForPrint(null), []);
  assert.deepEqual(view.splitForPrint([1]), [[1], []]); assert.deepEqual(view.splitForPrint([1, 2, 3]), [[1, 2], [3]]);
  for (const n of [28, 32]) { const a = Array.from({ length: n }, (_, k) => k + 1), [x, y] = view.splitForPrint(a); assert.equal(x.length, n / 2); assert.deepEqual([...x, ...y], a); }
});
test('no customer field: the display fixes keep the whitelist (a customer value in a Standard sheet still never shows)', () => {
  const s = standardSheet(); s.customer = { email: CUSTOMER.email }; s.shipping_address = { address1: CUSTOMER.street }; s.wheels[0].customer_note = CUSTOMER.name; s.buyerEmail = CUSTOMER.email;
  const text = JSON.stringify(view.buildView(s)) + view.sheetToText(s); for (const v of Object.values(CUSTOMER)) assert.ok(!text.includes(v), 'leaked: ' + v);
  assert.ok(view.findForbiddenKeys(s).length > 0);
});

test('real data: the #1377 sheet as the live service sent it (null counts, no ratio, no split, no spokes): all four fixes show', () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'order-sheet-1377.json'), 'utf8'));
  const v = view.buildView(real); assert.equal(v.noStudioAll, true);
  for (const w of v.wheels) { assert.equal(w.hasDetail, false); assert.ok(!w.facts.some(([k]) => /tension/.test(k))); assert.ok(w.sides.every((s) => s.count === null)); assert.ok(w.sides.map(view.sideText).every((t) => /^(Rotor|Drive) side: \d+ mm$/.test(t))); }
  const t = view.sheetToText(real); assert.match(t, /Rotor side: 280 mm/); assert.match(t, /Drive side: 274 mm/); assert.equal(t.split(view.NO_STUDIO_LINE).length - 1, 1); assert.ok(!/undefined|null|n\/a/.test(t));
  assert.deepEqual(view.findForbiddenKeys(real), []);
});
