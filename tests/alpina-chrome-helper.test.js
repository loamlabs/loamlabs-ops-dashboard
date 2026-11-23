// tests/alpina-chrome-helper.test.js  The Chrome helper's logic (core.js), the NAS receiver, and the whole chain helper -> receiver -> pages folder -> job. No Hoss, no real browser: a fake browser and local servers only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const H = require('../tools/alpina-chrome-helper/core');
const R = require('../lib/alpina-hoss-receiver');
const A = require('../lib/alpina-hoss');
const C = require('../lib/alpina-hoss-cli');

const FX = path.join(__dirname, 'fixtures', 'alpina');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alpina-helper-'));
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// what a real tab would hold for a page: the variation list WITH the extras Hoss puts in it (dealer prices, images ...), and a title
const titleOf = (key) => /<title>([^<]*)<\/title>/.exec(fs.readFileSync(path.join(FX, key + '.html'), 'utf8'))[1];
const listOf = (key) => JSON.parse(dec(/data-product_variations="([^"]*)"/.exec(fs.readFileSync(path.join(FX, key + '.html'), 'utf8'))[1])).map((v) => ({ ...v, display_price: 0.53, display_regular_price: 1.06, price_html: '<span>$0.53</span>', image: { src: 'https://x/y.png' }, dimensions: { length: '33' } }));
const goodSnap = (p) => ({ snap: { url: p.url, title: titleOf(p.key), status: 200, hasPassword: false, hasVariations: true, bodyText: 'Alpina' }, variations: JSON.stringify(listOf(p.key)) });
const NOW_ISO = '2026-11-25T10:40:00.000Z';

function deps(over = {}) {
    const d = { opened: [], posts: [], sleeps: [], openAndRead: async (p) => { d.opened.push(p.key); return goodSnap(p); }, post: async (pth, body) => { d.posts.push({ path: pth, body }); return { ok: true, status: 200 }; }, sleep: async (ms) => { d.sleeps.push(ms); }, now: () => NOW_ISO, random: () => 0.5, ...over };
    return d;
}

// ---------------- core ----------------
test('the helper only knows the 8 Alpina addresses, the same as the NAS job', () => {
    assert.equal(H.PAGES.length, 8); assert.deepEqual(H.PAGES.map((p) => p.url).sort(), Object.values(A.HOSS_PAGES).map((p) => A.HOSS_HOST + p.path).sort()); assert.deepEqual(H.PAGES.map((p) => p.key).sort(), Object.keys(A.HOSS_PAGES).sort());
});
test('classify: a good page is ok; logged out, login page, challenge, 403, 429, no stock data, another address, a redirect are all stops with a plain kind', () => {
    const base = { url: 'https://hasgllc.com/product/alpina-extralite-round-j-bend/', title: 'Alpina Extralite Round J-Bend – Hoss', status: 200, hasPassword: false, hasVariations: true, bodyText: '' }; const exp = base.url;
    assert.equal(H.classify(base, exp).ok, true);
    const bad = (o) => H.classify({ ...base, ...o }, exp);
    assert.equal(bad({ url: 'https://hasgllc.com/my-account/', hasVariations: false, hasPassword: true }).kind, 'logged-out'); assert.equal(bad({ hasPassword: true, hasVariations: false }).kind, 'logged-out'); assert.equal(bad({ url: 'https://hasgllc.com/wp-login.php?redirect_to=x', hasVariations: false }).kind, 'logged-out');
    assert.equal(bad({ title: 'Just a moment...', hasVariations: false }).kind, 'challenge'); assert.equal(bad({ hasVariations: false, bodyText: 'Please verify you are human to continue' }).kind, 'challenge'); assert.equal(bad({ bodyText: 'cf-challenge captcha', hasVariations: false }).kind, 'challenge');
    assert.equal(bad({ status: 403 }).kind, '403'); assert.equal(bad({ status: 429 }).kind, '429'); assert.equal(bad({ status: 503, hasVariations: true }).kind, 'http-503');
    assert.equal(bad({ hasVariations: false }).kind, 'no-data'); assert.equal(bad({ url: 'https://hasgllc.com/shop/' }).kind, 'wrong-page'); assert.equal(H.classify(null, exp).ok, false);
    assert.match(bad({ status: 403 }).reason, /403/); assert.match(bad({ hasPassword: true, hasVariations: false }).reason, /log in yourself/);
});
test('prices never leave the browser: only attributes, availability, is_in_stock, max_qty, sku and variation_id are kept (text or list in)', () => {
    const raw = listOf('extralite-round-j-bend'); assert.ok(raw[0].display_price); for (const input of [raw, JSON.stringify(raw)]) { const s = H.stripVariations(input); assert.equal(s.length, 192); assert.ok(s.every((v) => Object.keys(v).every((k) => H.KEEP.includes(k)))); assert.ok(!JSON.stringify(s).includes('display_price') && !JSON.stringify(s).includes('price_html')); assert.ok(s[0].attributes && s[0].availability_html && s[0].sku); }
    assert.throws(() => H.stripVariations('{"a":1}'), /not a list/); assert.throws(() => H.stripVariations('nope'));
});
test('interval: never more often than every 3 days (2 allowed, never below 2, never above 3); first run is due; waits are 5 to 10 seconds', () => {
    const t = Date.parse(NOW_ISO); const d = (x) => t - x * 864e5;
    assert.equal(H.runDue(t, null, 3), true); assert.equal(H.runDue(t, d(1), 3), false); assert.equal(H.runDue(t, d(2.9), 3), false); assert.equal(H.runDue(t, d(2.99), 3), true); assert.equal(H.runDue(t, d(3.1), 3), true);
    assert.equal(H.runDue(t, d(1.5), 2), false); assert.equal(H.runDue(t, d(2), 2), true); assert.equal(H.runDue(t, d(1.5), 1), false); assert.equal(H.runDue(t, d(2.5), 9), false); assert.equal(H.runDue(t, d(2.5), 'x'), false);
    for (const r of [0, 0.25, 0.5, 0.999999]) { const w = H.randomWait(() => r); assert.ok(w >= 5000 && w < 10000, String(w)); }
});
test('a good run: the 8 pages in order, one at a time, 7 waits of 5 to 10 s, ONE delivery with all 8 pages and no price in it, no stop notice', async () => {
    const d = deps(); const r = await H.runOnce(d); assert.deepEqual(r, { ok: true, delivered: 8 }); assert.deepEqual(d.opened, H.PAGES.map((p) => p.key)); assert.equal(d.sleeps.length, 7); assert.ok(d.sleeps.every((ms) => ms >= 5000 && ms < 10000));
    assert.deepEqual(d.posts.map((p) => p.path), ['/pages']); const body = d.posts[0].body; assert.equal(body.pages.length, 8); assert.equal(body.sentAt, NOW_ISO); assert.ok(!JSON.stringify(body).includes('display_price')); assert.ok(body.pages.every((p) => H.PAGES.some((x) => x.url === p.url)));
});
const stopCases = {
    'logged out': { snap: { url: 'https://hasgllc.com/my-account/', title: 'My account', status: 200, hasPassword: true, hasVariations: false, bodyText: 'Login' }, variations: null, kind: 'logged-out' },
    'challenge page': { snap: { url: 'https://hasgllc.com/product/x/', title: 'Just a moment...', status: 200, hasPassword: false, hasVariations: false, bodyText: 'Verify you are human' }, variations: null, kind: 'challenge' },
    '403': { snap: { url: 'https://hasgllc.com/product/x/', title: 'Forbidden', status: 403, hasPassword: false, hasVariations: false, bodyText: '' }, variations: null, kind: '403' },
    '429': { snap: { url: 'https://hasgllc.com/product/x/', title: 'Too many', status: 429, hasPassword: false, hasVariations: false, bodyText: '' }, variations: null, kind: '429' },
    'no stock data': { snap: { url: 'https://hasgllc.com/product/x/', title: 'Alpina', status: 200, hasPassword: false, hasVariations: false, bodyText: 'hello' }, variations: null, kind: 'no-data' },
};
for (const [name, c] of Object.entries(stopCases)) {
    test(`stop: ${name} on page 3 stops at once, retries nothing, opens no further page, tells the NAS ONCE and delivers nothing`, async () => {
        const d = deps(); d.openAndRead = async (p) => { d.opened.push(p.key); if (d.opened.length === 3) return { snap: { ...c.snap, url: c.snap.url.includes('product/x') ? p.url : c.snap.url }, variations: c.variations }; return goodSnap(p); };
        const r = await H.runOnce(d); assert.equal(r.ok, false); assert.equal(r.stopped.kind, c.kind); assert.equal(d.opened.length, 3); assert.deepEqual(d.posts.map((p) => p.path), ['/stopped']); assert.equal(d.posts[0].body.kind, c.kind); assert.ok(d.posts[0].body.reason); assert.equal(d.sleeps.length, 2);
    });
}
test('stop: Chrome fails to load a page, or the variation data cannot be read: stop at once, no retry; a refused delivery is not retried either; an unreachable NAS does not crash the stop', async () => {
    let d = deps(); d.openAndRead = async (p) => { d.opened.push(p.key); if (d.opened.length === 2) throw new Error('net::ERR_TIMED_OUT'); return goodSnap(p); }; let r = await H.runOnce(d); assert.equal(r.stopped.kind, 'browser'); assert.equal(d.opened.length, 2); assert.deepEqual(d.posts.map((p) => p.path), ['/stopped']);
    d = deps(); d.openAndRead = async (p) => { d.opened.push(p.key); const g = goodSnap(p); if (d.opened.length === 4) g.variations = '{"not":"a list"}'; return g; }; r = await H.runOnce(d); assert.equal(r.stopped.kind, 'no-data'); assert.equal(d.opened.length, 4);
    d = deps(); d.post = async (pth, body) => { d.posts.push({ path: pth, body }); return { ok: false, status: 500, text: 'boom' }; }; r = await H.runOnce(d); assert.equal(r.ok, false); assert.equal(r.stopped.kind, 'delivery'); assert.equal(d.posts.length, 1);
    d = deps(); d.openAndRead = async () => ({ snap: { url: 'x', title: 'Just a moment...', hasVariations: false, bodyText: '' }, variations: null }); d.post = async () => { throw new Error('unreachable'); }; r = await H.runOnce(d); assert.equal(r.stopped.kind, 'challenge');
});

// ---------------- the NAS receiver ----------------
const delivery = (over = {}) => ({ sentAt: NOW_ISO, pages: H.PAGES.map((p) => ({ key: p.key, url: p.url, title: titleOf(p.key), variations: JSON.stringify(H.stripVariations(listOf(p.key))) })), ...over });
const ctxOf = (dataDir, extra = {}) => { const mails = []; const logs = []; return { dataDir, token: 'tok-' + 'a'.repeat(40), mail: async (m) => mails.push(m), now: () => new Date(), log: (m) => logs.push(m), mails, logs, ...extra }; };
const call = (ctx, method, url, body, token) => R.handle({ method, url, headers: { authorization: 'Bearer ' + (token === undefined ? ctx.token : token) }, body: body === undefined ? null : JSON.stringify(body) }, ctx);

test('receiver: without the right token nothing works (401), whatever the route', async () => {
    const ctx = ctxOf(tmp()); for (const t of ['', 'wrong', ctx.token + 'x', null]) { assert.equal((await call(ctx, 'GET', '/ping', undefined, t)).status, 401); assert.equal((await call(ctx, 'POST', '/pages', delivery(), t)).status, 401); assert.equal((await call(ctx, 'POST', '/stopped', {}, t)).status, 401); }
    assert.equal(fs.existsSync(path.join(ctx.dataDir, 'pages')), false); assert.equal((await call(ctx, 'GET', '/ping')).status, 200); assert.equal((await call(ctx, 'GET', '/nope')).status, 405); assert.equal((await call(ctx, 'POST', '/nope', {})).status, 404);
});
test('receiver: 8 good pages are written as the 8 page files, dated NOW, with no price in them, and the job reads them (same totals as the fixtures)', async () => {
    const ctx = ctxOf(tmp()); const r = await call(ctx, 'POST', '/pages', delivery()); assert.equal(r.status, 200); assert.equal(r.json.pages, 8);
    const dir = path.join(ctx.dataDir, 'pages'); const files = fs.readdirSync(dir).sort(); assert.deepEqual(files, Object.keys(A.HOSS_PAGES).map((k) => k + '.html').sort());
    for (const f of files) { const txt = fs.readFileSync(path.join(dir, f), 'utf8'); assert.ok(!/price/i.test(txt), f + ' holds a price'); assert.ok(Math.abs(Date.now() - fs.statSync(path.join(dir, f)).mtimeMs) < 60000); const p = A.parseHossPage(txt); assert.equal(p.ok, true); assert.equal(A.pageSane(p).ok, true); }
    const st = R.readStatus(ctx.dataDir); assert.equal(st.state, 'ok'); assert.equal(st.lastDeliveryPages, 8); assert.match(R.describeHelper(ctx.dataDir), /helper: last delivery 0\.0 days ago, 8 pages/);
});
test('receiver: a delivery with 7 pages, a wrong address, a title that does not match, bad JSON or a short list is refused as a whole and NOTHING is written', async () => {
    const check = async (body, status, re) => { const ctx = ctxOf(tmp()); const r = await call(ctx, 'POST', '/pages', body); assert.equal(r.status, status, JSON.stringify(r.json)); assert.match(r.json.error, re); const pd = path.join(ctx.dataDir, 'pages'); assert.ok(!fs.existsSync(pd) || fs.readdirSync(pd).length === 0, 'nothing may be written'); return ctx; };
    const d = delivery(); await check({ ...d, pages: d.pages.slice(0, 7) }, 400, /all 8 pages must arrive together \(got 7\)/);
    const d2 = delivery(); d2.pages[2].url = 'https://hasgllc.com/product/alpina-basiclite-j-bend/'; await check(d2, 400, /not one of the 8 Alpina product addresses/);
    const d3 = delivery(); d3.pages[1].title = d3.pages[0].title; await check(d3, 400, /title does not match/);
    const d4 = delivery(); d4.pages[4].variations = '{bad'; await check(d4, 422, /not valid JSON/);
    const d5 = delivery(); d5.pages[5].variations = JSON.stringify(JSON.parse(d5.pages[5].variations).slice(0, 20)); await check(d5, 422, /variants read/);
    const d6 = delivery(); d6.pages[6] = d6.pages[0]; await check(d6, 400, /sent twice|title does not match/);
    await check({ pages: 'x' }, 400, /no pages/);
});
test('receiver: "stopped" emails ONE alert (the first one), keeps the reason for status.txt, a good delivery clears it, a later stop emails again', async () => {
    const ctx = ctxOf(tmp()); let r = await call(ctx, 'POST', '/stopped', { kind: 'logged-out', reason: 'Chrome is logged out of hasgllc.com', url: 'https://hasgllc.com/x' }); assert.equal(r.json.alerted, true); assert.equal(ctx.mails.length, 1); assert.match(ctx.mails[0].subject, /Hoss pages need you: log in to hasgllc.com in Chrome/);
    r = await call(ctx, 'POST', '/stopped', { kind: 'logged-out', reason: 'still' }); assert.equal(r.json.alerted, false); assert.equal(ctx.mails.length, 1);
    assert.match(R.describeHelper(ctx.dataDir), /HELPER STOPPED \(logged-out\)/); assert.equal(R.readStatus(ctx.dataDir).state, 'stopped');
    await call(ctx, 'POST', '/pages', delivery()); assert.equal(R.readStatus(ctx.dataDir).state, 'ok');
    r = await call(ctx, 'POST', '/stopped', { kind: '403', reason: 'blocked' }); assert.equal(r.json.alerted, true); assert.equal(ctx.mails.length, 2);
    await call(ctx, 'POST', '/resumed', {}); assert.equal(R.readStatus(ctx.dataDir).state, 'ok'); assert.doesNotMatch(R.describeHelper(ctx.dataDir), /STOPPED/);
    assert.match(R.describeHelper(tmp()), /no delivery yet/);
});
test('receiver: the token is made once (48 hex characters), kept, and the same one is read back; comparison is constant time and exact', () => {
    const d = tmp(); const a = R.loadOrCreateToken(d); assert.equal(a.created, true); assert.match(a.token, /^[0-9a-f]{48}$/); const b = R.loadOrCreateToken(d); assert.equal(b.created, false); assert.equal(b.token, a.token);
    assert.equal(R.tokenOk(a.token, a.token), true); assert.equal(R.tokenOk(a.token + ' ', a.token), false); assert.equal(R.tokenOk('', a.token), false); assert.equal(R.tokenOk(a.token, ''), false);
});
function listen(ctx) { return new Promise((resolve) => { const s = R.createServer(ctx).listen(0, '127.0.0.1', () => resolve({ s, url: 'http://127.0.0.1:' + s.address().port })); }); }
test('receiver over real HTTP (local): 401 without the token, 413 for a body over 3 MB, a good delivery works', async () => {
    const ctx = ctxOf(tmp()); const { s, url } = await listen(ctx);
    try {
        let r = await fetch(url + '/ping'); assert.equal(r.status, 401);
        r = await fetch(url + '/ping', { headers: { Authorization: 'Bearer ' + ctx.token } }); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
        try { r = await fetch(url + '/pages', { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.token, 'Content-Type': 'application/json' }, body: 'x'.repeat(R.MAX_BODY + 10) }); assert.equal(r.status, 413); } catch (e) { assert.ok(/fetch failed|ECONNRESET|socket/.test(String(e.message) + String(e.cause)), 'the connection may be cut after the 413'); }
        r = await fetch(url + '/pages', { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.token, 'Content-Type': 'application/json' }, body: JSON.stringify(delivery()) }); assert.equal(r.status, 200);
    } finally { s.close(); }
});

// ---------------- the whole chain: fake browser -> helper logic -> real HTTP receiver -> pages folder -> the job ----------------
test('whole chain: the helper delivers 8 pages to the receiver over HTTP; the job then reads the folder (scheduled gate: 8 new pages) and plans the same as the saved pages; a later stop reaches the NAS as one email and is shown in status', async () => {
    const dataDir = tmp(); const ctx = ctxOf(dataDir); const { s, url } = await listen(ctx);
    try {
        const post = async (pth, body) => { const r = await fetch(url + pth, { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status, text: await r.text() }; };
        const d = deps({ post }); const r = await H.runOnce(d); assert.deepEqual(r, { ok: true, delivered: 8 });
        const out = tmp(); const mails = []; const store = path.join(tmp(), 's.json'); fs.writeFileSync(store, fs.readFileSync(path.join(FX, 'store.json')));
        const run = await C.main(['--pages', path.join(dataDir, 'pages'), '--scheduled', '--store', store, '--out', out], { say: () => {}, env: { SHOPIFY_SHOP_NAME: 'x', ALPINA_SOURCE: 'pages' }, envFile: path.join(out, 'n'), mail: async (m) => mails.push(m) });
        assert.equal(run.result.totals.variantsMatched, 8904); const expected = A.plan({ pages: Object.fromEntries(H.PAGES.map((p) => [p.key, A.parseHossPage(fs.readFileSync(path.join(FX, p.key + '.html'), 'utf8'))])), store: JSON.parse(fs.readFileSync(path.join(FX, 'store.json'), 'utf8')) }); assert.equal(run.result.totals.close, expected.totals.close);
        // later: Chrome is logged out -> the helper stops, the NAS gets one stop notice and one email
        const d2 = deps({ post, openAndRead: async (p) => ({ snap: { url: 'https://hasgllc.com/my-account/', title: 'My account', status: 200, hasPassword: true, hasVariations: false, bodyText: '' }, variations: null }) }); const r2 = await H.runOnce(d2); assert.equal(r2.stopped.kind, 'logged-out');
        assert.equal(ctx.mails.length, 1); assert.match(R.describeHelper(dataDir), /HELPER STOPPED \(logged-out\)/);
    } finally { s.close(); }
});
test('the extension files are what the rules say: no login code, no cookies, no headers faked, no other Hoss address, only the 8 pages', () => {
    const dir = path.join(__dirname, '..', 'tools', 'alpina-chrome-helper'); const bg = fs.readFileSync(path.join(dir, 'background.js'), 'utf8'); const core = fs.readFileSync(path.join(dir, 'core.js'), 'utf8'); const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const code = (bg + core).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/chrome\.cookies|document\.cookie|userAgent|user-agent|User-Agent|\.submit\(|type=["']?password.*value|setRequestHeader|webRequest|declarativeNetRequest/i.test(code.replace(/input\[type=password\]/g, '')), 'no cookies, no faked headers, no form submission');
    assert.ok(!/\.value\s*=|\.click\(\)|dispatchEvent|requestSubmit/.test(code), 'it never types into or clicks anything on the page');
    assert.ok(!man.permissions.includes('cookies') && !man.permissions.includes('webRequest')); assert.deepEqual(man.host_permissions.filter((h) => /hasgllc/.test(h)), ['https://hasgllc.com/*']);
    assert.deepEqual([...new Set((core.match(/\/product\/[a-z-]+\//g) || []))].sort(), H.PAGES.map((p) => p.path).sort()); assert.ok(!/headless|puppeteer|playwright|stealth/i.test(code));
});
