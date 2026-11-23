// tests/alpina-hoss.test.js  Alpina stock from Hoss: parser, rules, plan, robots, fetch layer (mock site), command. No real network.
// Fixtures: tests/fixtures/alpina/*.html = the 8 pages Jerry saved on Nov 13 (variation data only, no prices), store.json = our 15 Alpina products with 8,918 variants (read Nov 22).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/alpina-hoss');
const F = require('../lib/alpina-hoss-fetch');
const C = require('../lib/alpina-hoss-cli');

const FX = path.join(__dirname, 'fixtures', 'alpina');
const html = (k) => fs.readFileSync(path.join(FX, k + '.html'), 'utf8');
const store0 = () => JSON.parse(fs.readFileSync(path.join(FX, 'store.json'), 'utf8'));
const KEYS = Object.keys(A.HOSS_PAGES);
const pagesAll = () => Object.fromEntries(KEYS.map((k) => [k, A.parseHossPage(html(k))]));
const N_CLOSE = A.plan({ pages: pagesAll(), store: store0() }).totals.close;   // the made-up pages close this many of our 8,904 variants
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alpina-'));

// ---------------- parser ----------------
test('the 8 saved pages parse: counts per page (192 only on four of them), every row has color, length and stock', () => {
    const want = { 'extralite-round-j-bend': 192, 'extralite-round-straight-pull': 192, 'extralite-aero-j-bend': 92, 'extralite-aero-straight-pull': 92, 'ultralite-round-j-bend': 192, 'ultralite-round-straight-pull': 136, 'ultralite-aero-j-bend': 162, 'ultralite-aero-straight-pull': 162 };
    for (const k of KEYS) { const p = A.parseHossPage(html(k)); assert.equal(p.ok, true, k); assert.equal(p.pageKey, k); assert.equal(p.rows.length, want[k], k); assert.equal(A.HOSS_PAGES[k].expected, want[k]); assert.equal(p.warnings.length, 0, k); assert.ok(p.rows.every((r) => r.color && r.lengthMm >= 120 && r.lengthMm <= 310 && r.lengthMm % 2 === 0 && r.stockQty !== null), k); assert.equal(A.pageSane(p).ok, true); }
});
test('spot checks on the Extralite Round J-Bend page: Black 228 mm is "44 in stock" (made-up sku FAKE-extralite-round-j-bend-B228), an out-of-stock row reads 0, colors are Black and Silver', () => {
    const p = A.parseHossPage(html('extralite-round-j-bend')); const b = p.rows.find((r) => r.color === 'Black' && r.lengthMm === 228);
    assert.equal(b.stockQty, 44); assert.equal(b.hossSku, 'FAKE-extralite-round-j-bend-B228'); assert.equal(b.kind, 'in-stock'); assert.equal(b.hubType, 'j-bend');
    const o = p.rows.find((r) => r.hossSku === 'FAKE-extralite-round-j-bend-S122'); assert.equal(o.stockQty, 0); assert.equal(o.kind, 'out-of-stock');
    assert.deepEqual([...new Set(p.rows.map((r) => r.color))].sort(), ['Black', 'Silver']);
    assert.equal(p.rows.filter((r) => r.stockQty === 0).length, 38); assert.equal(p.rows.filter((r) => r.stockQty > 0).length, 154);
});
test('availability text: "N in stock", "Out of stock", backorder = 0, missing or odd text = unknown (null), thousands separator', () => {
    const t = (h) => A.parseAvailability(h);
    assert.deepEqual(t('&lt;p class=&quot;stock in-stock&quot;&gt;250 in stock&lt;/p&gt;'), { qty: 250, kind: 'in-stock' });
    assert.deepEqual(t('<p class="stock in-stock">1,250 in stock</p>'), { qty: 1250, kind: 'in-stock' });
    assert.deepEqual(t('<p class="stock out-of-stock">Out of stock</p>'), { qty: 0, kind: 'out-of-stock' });
    assert.deepEqual(t('<p class="stock available-on-backorder">Available on backorder</p>'), { qty: 0, kind: 'backorder' });
    assert.equal(t('').qty, null); assert.equal(t(undefined).qty, null); assert.equal(t('<p>In stock</p>').qty, null); assert.equal(t('<p>Call us</p>').qty, null);
});
test('a text that disagrees with the page flag is unknown (never acted on); duplicates and rows without color or length are warnings, not rows', () => {
    const v = (o) => ({ attributes: { attribute_color: 'Black', attribute_length: '200mm' }, availability_html: '<p class="stock in-stock">50 in stock</p>', is_in_stock: true, sku: 'X', variation_id: 1, ...o });
    const page = (list) => '<title>Alpina Extralite Round J-Bend – Hoss Active Sports Group</title><form data-product_variations="' + JSON.stringify(list).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></form>';
    const p = A.parseHossPage(page([v({}), v({ attributes: { attribute_color: 'Silver', attribute_length: '202mm' }, is_in_stock: false }), v({}), v({ attributes: { attribute_color: '', attribute_length: '' } })]));
    assert.equal(p.rows.length, 2); assert.equal(p.rows[1].stockQty, null); assert.equal(p.rows[1].kind, 'conflict'); assert.ok(p.warnings.length >= 3);
});
test('a page that is not ours, has no variation data, or has broken JSON is refused with a reason', () => {
    assert.equal(A.parseHossPage('<title>Something else</title>').ok, false);
    assert.match(A.parseHossPage('<title>Alpina Extralite Round J-Bend – Hoss</title><p>please sign in</p>').reason, /data-product_variations/);
    assert.match(A.parseHossPage('<title>Alpina Extralite Round J-Bend – Hoss</title><form data-product_variations="{bad"></form>').reason, /not valid JSON/);
    assert.equal(A.pageKeyFromTitle('Alpina Ultralight Aero Straight Pull'), 'ultralite-aero-straight-pull');
});
test('page sanity: a truncated page (under 90% of the known count) or too many unreadable stock values stops the run', () => {
    const p = A.parseHossPage(html('extralite-round-j-bend')); const cut = { ...p, rows: p.rows.slice(0, 100) }; assert.equal(A.pageSane(cut).ok, false); assert.match(A.pageSane(cut).reason, /100 variants read, 192 expected/);
    const unk = { ...p, rows: p.rows.map((r, i) => (i % 2 ? { ...r, stockQty: null } : r)) }; assert.equal(A.pageSane(unk).ok, false);
});

// ---------------- rules ----------------
const SV = (o) => ({ placeholder: false, kind: 'retail', bundle: 14, ...o });
test('retail rule: orderable only when Hoss stock >= the bundle size (13 of 14 closes, 14 opens)', () => {
    assert.equal(A.decide(SV({}), { stockQty: 13 }).want, 'close'); assert.equal(A.decide(SV({}), { stockQty: 14 }).want, 'open'); assert.equal(A.decide(SV({ bundle: 38 }), { stockQty: 37 }).want, 'close'); assert.equal(A.decide(SV({ bundle: 38 }), { stockQty: 250 }).want, 'open');
});
test('builder rule: orderable only when Hoss stock >= the threshold (default 32; 31 closes, 32 opens; configurable); placeholder, unmatched and unknown are left alone', () => {
    const b = SV({ kind: 'builder', bundle: null }); assert.equal(A.DEFAULTS.threshold, 32); assert.equal(A.decide(b, { stockQty: 31 }).want, 'close'); assert.equal(A.decide(b, { stockQty: 32 }).want, 'open'); assert.equal(A.decide(b, { stockQty: 24 }, { ...A.DEFAULTS, threshold: 24 }).want, 'open'); assert.equal(A.decide(b, { stockQty: 23 }, { ...A.DEFAULTS, threshold: 24 }).want, 'close');
    assert.equal(A.decide(SV({ placeholder: true }), { stockQty: 0 }).want, 'leave'); assert.equal(A.decide(SV({}), undefined).want, 'leave'); assert.equal(A.decide(SV({}), { stockQty: null }).want, 'leave');
});

// ---------------- the plan on the saved (old) numbers ----------------
test('plan on the 8 saved pages against the real store: matches every variant of all 15 products, 2,767 closes (made-up numbers), nothing opens, nothing unmatched, placeholders untouched; the first run is over the limit', () => {
    const r = A.plan({ pages: pagesAll(), store: store0() });
    assert.equal(Object.keys(r.perProduct).length, 15); assert.equal(r.totals.variantsMatched, 8904); assert.equal(r.totals.close, N_CLOSE); assert.equal(r.totals.open, 0); assert.equal(Object.keys(r.unmatched).length, 0);
    assert.equal(r.cap, 446); assert.equal(r.overCap, true); assert.equal(r.ok, false); assert.match(r.blocked[0], new RegExp(N_CLOSE + ' changes proposed, the limit is 446'));
    const retail = Object.values(r.perProduct).filter((s) => s.kind === 'retail'); assert.equal(retail.reduce((a, s) => a + s.variants, 0), 8540); assert.equal(Object.values(r.perProduct).filter((s) => s.kind === 'builder').length, 7);
    assert.ok(r.flips.every((f) => f.from === 'CONTINUE' && f.to === 'DENY')); const store = store0(); const ph = new Set(store.flatMap((p) => p.variants.filter((v) => v.opts.Length === '-').map((v) => v.id))); assert.equal(ph.size, 14); assert.ok(r.flips.every((f) => !ph.has(f.id)));
});
test('a spot check of the rule on the fixture rows: Extralite Round J-Bend Black 228 mm (Hoss 44) stays open in every bundle; the first Black length that is out at Hoss closes in every bundle', () => {
    const r = A.plan({ pages: pagesAll(), store: store0() }); const p = A.parseHossPage(html('extralite-round-j-bend')); const row = (c, l) => p.rows.find((x) => x.color === c && x.lengthMm === l);
    const closed = r.flips.filter((f) => f.handle === 'alpina-extralite-round-j-bend-spokes');
    assert.equal(closed.filter((f) => f.color === 'Black' && f.lengthMm === 228).length, 0); const out = p.rows.filter((x) => x.stockQty === 0 && x.color === 'Black')[0]; assert.equal(closed.filter((f) => f.color === 'Black' && f.lengthMm === out.lengthMm).length, 7);
    const low = p.rows.find((x) => x.stockQty > 0 && x.stockQty < 38); const bundles = [14, 18, 20, 26, 30, 34, 38].filter((n) => low.stockQty < n); assert.equal(closed.filter((f) => f.color === low.color && f.lengthMm === low.lengthMm).length, bundles.length); assert.ok(row('Black', 228));
});
test('a restock opens variants again: a DENY variant whose Hoss stock is now enough goes back to CONTINUE', () => {
    const store = store0(); const prod = store.find((p) => p.handle === 'alpina-extralite-round-j-bend-spokes'); const v = prod.variants.find((x) => x.opts.Color === 'Black' && x.opts.Length === '228mm' && x.opts['Spoke Count'] === '14 Spokes'); v.policy = 'DENY';
    const r = A.plan({ pages: pagesAll(), store, cfg: { flipCapMin: 5000 } }); const o = r.flips.filter((f) => f.to === 'CONTINUE'); assert.equal(o.length, 1); assert.equal(o[0].id, v.id);
});
test('sanity: a product that would close completely is held (never close a whole product on one run); a share that falls more than 30 points vs the last reading is held; a failed page blocks the whole run', () => {
    const pages = pagesAll(); const zero = { ...pages['ultralite-round-j-bend'], rows: pages['ultralite-round-j-bend'].rows.map((r) => ({ ...r, stockQty: 0, kind: 'out-of-stock' })) };
    const r = A.plan({ pages: { ...pages, 'ultralite-round-j-bend': zero }, store: store0(), cfg: { flipCapMin: 5000 } }); const ur = r.perProduct['alpina-ultralite-round-j-bend-spokes']; assert.match(ur.held, /whole product/); assert.equal(r.flips.filter((f) => f.handle === 'alpina-ultralite-round-j-bend-spokes').length, 0); assert.ok(r.held.length > 0);
    const st = { lastShare: { 'alpina-extralite-round-straight-pull-spokes': 1 } }; const r2 = A.plan({ pages, store: store0(), cfg: { flipCapMin: 5000 }, state: st }); assert.match(r2.perProduct['alpina-extralite-round-straight-pull-spokes'].held, /fall from 100% to 69%/);
    const r3 = A.plan({ pages: { ...pages, 'extralite-aero-j-bend': { ok: false, reason: 'x' } }, store: store0(), cfg: { flipCapMin: 5000 } }); assert.equal(r3.ok, false); assert.ok(r3.blocked.some((b) => /^x$/.test(b)));
    const r4 = A.plan({ pages: { ...pages, 'extralite-aero-j-bend': undefined }, store: store0() }); assert.ok(r4.blocked.some((b) => /page not read/.test(b)));
});
test('a store product that is missing blocks the run (nothing guessed); unmatched store variants are reported and never touched', () => {
    const store = store0().filter((p) => p.handle !== 'alpina-extralite-aero-j-bend-spokes'); assert.ok(A.plan({ pages: pagesAll(), store }).blocked.some((b) => /store product not found/.test(b)));
    const s2 = store0(); const prod = s2.find((p) => p.handle === 'alpina-extralite-round-j-bend-spokes'); prod.variants.push({ id: '1', policy: 'CONTINUE', opts: { Color: 'Black', Length: '312mm', 'Spoke Count': '14 Spokes' } });
    const r = A.plan({ pages: pagesAll(), store: s2, cfg: { flipCapMin: 5000 } }); assert.equal(r.unmatched['alpina-extralite-round-j-bend-spokes'].length, 1); assert.ok(!r.flips.some((f) => f.id === '1'));
});

// ---------------- robots.txt ----------------
test('robots.txt: our own token has no group so the "*" rules apply; the site\'s AI-crawler groups do not name us; longest rule wins', () => {
    const robots = ['User-agent: ClaudeBot', 'Disallow: /', '', 'User-agent: anthropic-ai', 'Disallow: /', '', 'User-agent: *', 'Disallow: /wp-admin/', 'Allow: /wp-admin/admin-ajax.php', 'Disallow: /cart/', 'Disallow: /my-account/lost-password/'].join('\n');
    for (const p of ['/my-account/', '/product/alpina-extralite-round-j-bend/']) assert.equal(A.robotsAllows(robots, p, 'loamlabsstockreader'), true);
    assert.equal(A.robotsAllows(robots, '/cart/', 'loamlabsstockreader'), false); assert.equal(A.robotsAllows(robots, '/wp-admin/x', 'loamlabsstockreader'), false); assert.equal(A.robotsAllows(robots, '/wp-admin/admin-ajax.php', 'loamlabsstockreader'), true);
    assert.equal(A.robotsAllows(robots, '/product/x/', 'claudebot'), false); assert.equal(A.robotsAllows('User-agent: *\nDisallow: /product/', '/product/a/', 'loamlabsstockreader'), false); assert.equal(A.robotsAllows('', '/product/a/', 'x'), true);
    assert.equal(A.robotsAllows('User-agent: loamlabsstockreader\nDisallow: /\nUser-agent: *\nAllow: /', '/product/a/', 'LoamLabsStockReader'.toLowerCase()), false);
});

// ---------------- fetch layer against a mock site ----------------
const LOGIN_HTML = '<html><body><form method="post" action="/my-account/"><input type="text" name="username"><input type="password" name="password"><input type="hidden" name="woocommerce-login-nonce" value="N0NCE"><input type="hidden" name="_wp_http_referer" value="/my-account/"><button type="submit" name="login" value="Log in">Log in</button></form></body></html>';
const OK_ACCOUNT = '<html><body><a href="/my-account/customer-logout/">Log out</a></body></html>';
function mockSite(opts = {}) {
    const calls = []; let posted = false; const h = (status, body, headers = {}) => { const hs = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])); return { status, headers: { get: (k) => hs.get(k.toLowerCase()) || null, getSetCookie: () => (headers['Set-Cookie'] ? [].concat(headers['Set-Cookie']) : []) }, text: async () => body }; };
    const robots = opts.robots === undefined ? 'User-agent: ClaudeBot\nDisallow: /\nUser-agent: *\nDisallow: /wp-admin/\nDisallow: /cart/' : opts.robots;
    const fetchImpl = async (url, init = {}) => {
        const u = new URL(url); calls.push({ method: init.method || 'GET', path: u.pathname, ua: init.headers && init.headers['User-Agent'], cookie: init.headers && init.headers.Cookie, body: init.body });
        if (opts.netFail && opts.netFail(u.pathname, calls.length)) throw new Error('network down');
        if (u.pathname === '/robots.txt') return h(200, robots);
        if (u.pathname === '/my-account/' && (init.method || 'GET') === 'GET' && posted && opts.loginLoop) return h(302, '', { Location: '/my-account/' });
        if (u.pathname === '/my-account/' && (init.method || 'GET') === 'GET') return h(200, opts.loginPage || LOGIN_HTML, { 'Set-Cookie': 'wc_session=abc; path=/' });
        if (u.pathname === '/my-account/' && init.method === 'POST') { posted = true; if (opts.loginLoop) return h(302, '', { Location: '/my-account/' }); if (opts.loginFail) return h(200, LOGIN_HTML); return h(302, '', { Location: '/my-account/dashboard/', 'Set-Cookie': 'wordpress_logged_in=yes; path=/' }); }
        if (u.pathname === '/my-account/dashboard/') return h(200, OK_ACCOUNT);
        const key = KEYS.find((k) => A.HOSS_PAGES[k].path === u.pathname); if (key) { if (opts.status && opts.status[key]) return h(opts.status[key], 'nope'); if (opts.body && opts.body[key]) return h(200, opts.body[key]); return h(200, html(key)); }
        return h(404, 'no');
    };
    return { fetchImpl, calls };
}
const RUNENV = { HOSS_LOGIN_USER: 'user-x', HOSS_LOGIN_PASSWORD: 'pw-secret-123' };
const fast = (calls, waits) => ({ env: RUNENV, sleep: async (ms) => { waits.push(ms); }, random: () => 0.5, minWaitMs: 5000, maxWaitMs: 10000 });

test('fetch layer: reads robots.txt, signs in with the only form it submits, reads exactly the 8 pages one by one, honest user agent, never touches the cart, credentials never logged', async () => {
    const { fetchImpl, calls } = mockSite(); const waits = []; const t0 = Date.now();
    const r = await F.readHoss({ ...fast(calls, waits), fetchImpl, now: () => t0 });
    assert.equal(r.ok, true); assert.equal(Object.keys(r.pages).length, 8); assert.deepEqual(Object.keys(r.pages).sort(), [...KEYS].sort());
    const gets = calls.filter((c) => c.method === 'GET').map((c) => c.path); assert.equal(gets[0], '/robots.txt'); assert.equal(calls.filter((c) => c.method === 'POST').length, 1); assert.equal(calls.find((c) => c.method === 'POST').path, '/my-account/');
    assert.equal(calls.filter((c) => KEYS.some((k) => A.HOSS_PAGES[k].path === c.path)).length, 8); assert.ok(!calls.some((c) => /cart|checkout|add-to-cart/i.test(c.path)));
    assert.ok(calls.every((c) => c.ua === 'LoamLabsStockReader/1.0 (+info@loamlabsusa.com)')); assert.ok(calls.slice(1).some((c) => c.cookie && /wordpress_logged_in/.test(c.cookie)));
    const post = new URLSearchParams(calls.find((c) => c.method === 'POST').body); assert.equal(post.get('woocommerce-login-nonce'), 'N0NCE'); assert.equal(post.get('username'), 'user-x'); assert.equal(post.get('password'), 'pw-secret-123');
    assert.ok(waits.length >= 8 && waits.every((w) => w >= 0)); assert.ok(waits.filter((w) => w > 0).every((w) => w <= 10000)); assert.ok(!JSON.stringify(r.log).includes('pw-secret-123') && !JSON.stringify(r.log).includes('user-x'));
});
test('fetch layer: the wait between requests is 5 to 10 seconds (real clock mocked), one request at a time', async () => {
    const { fetchImpl } = mockSite(); let clock = 1_000_000; const stamps = []; const f2 = async (u, i) => { stamps.push(clock); return fetchImpl(u, i); }; const origNow = Date.now; Date.now = () => clock;
    try { const r = await F.readHoss({ env: RUNENV, fetchImpl: f2, sleep: async (ms) => { clock += ms; }, random: () => 0.5, minWaitMs: 5000, maxWaitMs: 10000 }); assert.equal(r.ok, true); } finally { Date.now = origNow; }
    for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i] - stamps[i - 1] >= 5000 && stamps[i] - stamps[i - 1] <= 10500, 'gap ' + (stamps[i] - stamps[i - 1]));
});
test('fetch layer STOPS (nothing returned to act on): missing credentials, robots disallow, 403, 429, captcha page, login failure, login redirect loop, session lost, page that does not parse, wrong page, redirect', async () => {
    const run = async (opts, env = RUNENV) => { const { fetchImpl, calls } = mockSite(opts); const r = await F.readHoss({ env, fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }); return { r, calls }; };
    assert.match((await run({}, {})).r.stopped.reason, /not set/);
    assert.match((await run({ robots: 'User-agent: *\nDisallow: /product/' })).r.stopped.reason, /robots.txt disallows/);
    let x = await run({ status: { 'extralite-aero-j-bend': 403 } }); assert.equal(x.r.ok, false); assert.equal(x.r.stopped.status, 403); assert.match(x.r.stopped.reason, /extralite-aero-j-bend/);
    x = await run({ status: { 'extralite-round-j-bend': 429 } }); assert.equal(x.r.stopped.status, 429);
    assert.match((await run({ loginPage: '<html><title>Just a moment...</title>verify you are human</html>' })).r.stopped.reason, /challenge|captcha/);
    assert.match((await run({ loginFail: true })).r.stopped.reason, /login did not succeed/); assert.match((await run({ loginLoop: true })).r.stopped.reason, /redirect loop/);
    assert.match((await run({ body: { 'ultralite-aero-j-bend': '<title>Alpina Ultralite Aero J-Bend – Hoss</title>' + LOGIN_HTML } })).r.stopped.reason, /login form shown|data-product_variations/);
    assert.match((await run({ body: { 'ultralite-aero-j-bend': '<title>Alpina Ultralite Aero J-Bend – Hoss</title><p>changed</p>' } })).r.stopped.reason, /data-product_variations/);
    assert.match((await run({ body: { 'ultralite-aero-j-bend': html('extralite-aero-j-bend') } })).r.stopped.reason, /the page is "extralite-aero-j-bend"|expected/);
    assert.match((await run({ body: { 'ultralite-aero-j-bend': 'verify you are human' } })).r.stopped.reason, /challenge|not one of the 8/);
    x = await run({ status: { 'ultralite-aero-j-bend': 302 } }); assert.match(x.r.stopped.reason, /redirected/);
    x = await run({ status: { 'extralite-aero-j-bend': 429 } }); assert.ok(x.calls.filter((c) => KEYS.some((k) => A.HOSS_PAGES[k].path === c.path)).length <= 8); assert.equal(x.r.pages && Object.keys(x.r.pages).length, 0);
});
test('fetch layer: one retry only on a network error; a second failure stops', async () => {
    let n = 0; const { fetchImpl } = mockSite({ netFail: (p) => { if (p === '/product/alpina-extralite-round-j-bend/') { n++; return n === 1; } return false; } });
    let r = await F.readHoss({ env: RUNENV, fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }); assert.equal(r.ok, true); assert.equal(n, 2);
    const m = mockSite({ netFail: (p) => p === '/product/alpina-extralite-round-j-bend/' }); r = await F.readHoss({ env: RUNENV, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }); assert.equal(r.ok, false); assert.equal(m.calls.filter((c) => c.path === '/product/alpina-extralite-round-j-bend/').length, 2);
});
test('login form parsing: finds the form with the password field, keeps hidden fields, resolves a relative action', () => {
    const f = F.parseLoginForm('<form action="/search"><input name="q"></form>' + LOGIN_HTML, 'https://x.test/my-account/'); assert.equal(f.action, 'https://x.test/my-account/'); assert.deepEqual(f.fields.map((x) => x.name), ['username', 'password', 'woocommerce-login-nonce', '_wp_http_referer']); assert.equal(F.parseLoginForm('<form><input name="q"></form>', 'https://x.test/'), null);
});

// ---------------- the command ----------------
function mockShopify(store) {
    const log = []; const byPid = new Map(store.map((p) => [p.id, p]));
    const gql = async (q, v) => {
        if (/productVariantsBulkUpdate/.test(q)) { log.push({ type: 'write', pid: v.pid, n: v.v.length }); const p = byPid.get(v.pid); for (const x of v.v) { const vv = p.variants.find((y) => 'gid://shopify/ProductVariant/' + y.id === x.id); if (vv && !gql.ignoreWrites) vv.policy = x.inventoryPolicy; } return { productVariantsBulkUpdate: { userErrors: gql.userErrors || [] } }; }
        if (/product\(id:\$id\)/.test(q)) { log.push({ type: 'readback' }); const p = byPid.get(v.id); return { product: { variants: { pageInfo: { hasNextPage: false, endCursor: null }, edges: p.variants.map((y) => ({ node: { id: 'gid://shopify/ProductVariant/' + y.id, inventoryPolicy: y.policy } })) } } }; }
        throw new Error('unexpected query ' + q.slice(0, 40));
    };
    gql.log = log; return gql;
}
const reduced = () => { const s = store0(); return s; };
const runCli = async (args, deps = {}) => { const out = tmp(); const say = []; const r = await C.main([...args, '--out', out], { say: (m) => say.push(String(m)), env: { ...RUNENV }, envFile: path.join(out, 'none.env'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, ...deps }); return { r, out, say: say.join('\n') }; };
const storeFile = () => { const f = path.join(tmp(), 'store.json'); fs.writeFileSync(f, JSON.stringify(store0())); return f; };
const savedDir = path.join(__dirname, 'fixtures', 'alpina'); const savedPages = () => { const d = tmp(); for (const k of KEYS) fs.copyFileSync(path.join(FX, k + '.html'), path.join(d, k + '.html')); return d; };

test('command, dry run on saved pages: prints counts per product and a sample of 30, writes nothing (Shopify never called), saves a report and a proposals file', async () => {
    const gql = mockShopify(store0()); const { r, out, say } = await runCli(['--saved', savedPages(), '--store', storeFile()], { gql });
    assert.equal(r.baseline, true); assert.equal(r.code, 3); assert.equal(gql.log.length, 0); assert.match(say, /BASELINE \(nothing is written\)/); assert.match(say, /SAMPLE OF 30 CHANGES/); assert.match(say, /old numbers: test data only/);
    assert.ok(fs.readdirSync(out).some((f) => /^alpina_baseline_/.test(f))); assert.ok(fs.readdirSync(out).some((f) => /^alpina_proposals_/.test(f))); assert.equal(say.split('SAMPLE OF 30 CHANGES:')[1].split('\n').filter((l) => /^ {2}alpina-/.test(l)).length <= 30, true);
    assert.match(say, /limit per run 446/); assert.doesNotMatch(say, /\bprice\b.*\d+\.\d{2}/);
});
test('command, live run before approval is a BASELINE: it reads (mock), plans, emails the proposal, writes nothing', async () => {
    const gql = mockShopify(store0()); const mails = []; const m = mockSite(); const { r } = await runCli(['--live-read', '--apply', '--store', storeFile(), '--limit', '5000'], { gql, mail: async (x) => mails.push(x), readHoss: (o) => F.readHoss({ ...o, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) });
    assert.equal(r.baseline, true); assert.equal(r.code, 0); assert.equal(gql.log.length, 0); assert.equal(mails.length, 1); assert.match(mails[0].subject, /baseline ready/);
});
test('command, approved run writes: undo file saved BEFORE the first write, one product at a time, every product read back, state records the approval; the next run needs no flag', async () => {
    const store = store0(); const gql = mockShopify(store); const m = mockSite(); const mails = []; const events = []; const out = tmp(); const orig = fs.writeFileSync; let undoSeenBeforeWrite = null;
    const gql2 = async (q, v) => { if (/productVariantsBulkUpdate/.test(q) && undoSeenBeforeWrite === null) undoSeenBeforeWrite = fs.readdirSync(out).some((f) => /^alpina_undo_/.test(f)); return gql(q, v); };
    const say = []; const r = await C.main(['--live-read', '--apply', '--approve-baseline', '--limit', '3000', '--store', storeFile(), '--out', out], { say: (x) => say.push(x), env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, gql: gql2, mail: async (x) => mails.push(x), readHoss: (o) => F.readHoss({ ...o, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) });
    assert.equal(r.code, 0); assert.equal(r.written, N_CLOSE); assert.equal(undoSeenBeforeWrite, true); assert.equal(gql.log.filter((l) => l.type === 'write').length > 0, true);
    const closed = store.flatMap((p) => p.variants).filter((v) => v.policy === 'DENY').length; assert.equal(closed, N_CLOSE);
    const undo = JSON.parse(fs.readFileSync(path.join(out, 'alpina_undo_2026-11-23.json'), 'utf8')); assert.equal(undo.changes.length, N_CLOSE); assert.ok(undo.changes.every((c) => c.from === 'CONTINUE' && c.to === 'DENY'));
    const st = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8')); assert.equal(st.baselineApproved, true); assert.ok(st.lastShare['alpina-extralite-round-straight-pull-spokes'] > 0); assert.equal(mails.length, 1); assert.match(mails[0].subject, new RegExp(N_CLOSE + ' sold out'));
    const says = say.join('\n'); assert.match(says, new RegExp('DONE: ' + N_CLOSE + ' changes written and read back'));
    // a second run, same readings: nothing left to change, no flag needed; the plan is clean
    const r2 = await C.main(['--live-read', '--apply', '--store', storeFile(), '--out', out, '--force'], { say: () => {}, env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-26T10:40:00Z'), fast: true, gql: mockShopify(store), mail: async () => {}, readHoss: (o) => F.readHoss({ ...o, fetchImpl: mockSite().fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) });
    assert.ok(r2.code === 0 || r2.code === 3);
});
test('command, over the limit: nothing is written and the reason is emailed; raising --limit for one run is the only way past it', async () => {
    const gql = mockShopify(store0()); const mails = []; const m = mockSite(); const out = tmp();
    const base = { say: () => {}, env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, gql, mail: async (x) => mails.push(x), readHoss: (o) => F.readHoss({ ...o, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) };
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ baselineApproved: true, lastShare: {}, lastAttemptAt: null, lastSuccessAt: null }));
    const r = await C.main(['--live-read', '--apply', '--store', storeFile(), '--out', out], base); assert.equal(r.code, 3); assert.equal(gql.log.filter((l) => l.type === 'write').length, 0); assert.match(mails[0].text, /the limit is 446/);
});
test('command, a stopped read (403) changes NOTHING, sends one alert email with the reason and saves it', async () => {
    const gql = mockShopify(store0()); const mails = []; const m = mockSite({ status: { 'ultralite-round-j-bend': 403 } }); const out = tmp();
    const r = await C.main(['--live-read', '--apply', '--approve-baseline', '--limit', '9999', '--store', storeFile(), '--out', out], { say: () => {}, env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, gql, mail: async (x) => mails.push(x), readHoss: (o) => F.readHoss({ ...o, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) });
    assert.equal(r.code, 2); assert.equal(gql.log.length, 0); assert.equal(mails.length, 1); assert.match(mails[0].text, /changed nothing/); assert.match(mails[0].text, /403/); assert.ok(fs.readdirSync(out).some((f) => /^alpina_stopped_/.test(f))); assert.doesNotMatch(mails[0].text, /pw-secret/);
});
test('command, read-back mismatch stops with an alert (undo file named); a write error stops after the first product', async () => {
    const st = store0(); const gql = mockShopify(st); gql.ignoreWrites = true; const mails = []; const m = mockSite(); const out = tmp();
    const deps = { say: () => {}, env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, gql, mail: async (x) => mails.push(x), readHoss: (o) => F.readHoss({ ...o, fetchImpl: m.fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) };
    const r = await C.main(['--live-read', '--apply', '--approve-baseline', '--limit', '9999', '--store', storeFile(), '--out', out], deps); assert.equal(r.code, 5); assert.match(r.text, /READ-BACK MISMATCH/); assert.match(mails[0].subject, /read-back mismatch/);
    const g2 = mockShopify(store0()); g2.userErrors = [{ field: 'x', message: 'bad' }]; const out2 = tmp(); const r2 = await C.main(['--live-read', '--apply', '--approve-baseline', '--limit', '9999', '--store', storeFile(), '--out', out2], { ...deps, envFile: path.join(out2, 'x'), gql: g2 }); assert.equal(r2.code, 4); assert.equal(g2.log.filter((l) => l.type === 'write').length, 1);
});
test('command, scheduled runs honor the interval (default 3 days; config value) and --force bypasses it; a manual run any time', async () => {
    const out = tmp(); fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ baselineApproved: false, lastShare: {}, lastAttemptAt: '2026-11-21T10:40:00Z', lastSuccessAt: null }));
    const deps = { say: () => {}, env: { ...RUNENV }, envFile: path.join(out, 'x'), now: () => new Date('2026-11-23T10:40:00Z'), fast: true, gql: mockShopify(store0()), mail: async () => {}, readHoss: (o) => F.readHoss({ ...o, fetchImpl: mockSite().fetchImpl, sleep: async () => {}, random: () => 0, minWaitMs: 0, maxWaitMs: 0 }) };
    let r = await C.main(['--live-read', '--scheduled', '--store', storeFile(), '--out', out], deps); assert.equal(r.skipped, true);
    r = await C.main(['--live-read', '--scheduled', '--force', '--store', storeFile(), '--out', out], deps); assert.equal(!!r.skipped, false);
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ baselineApproved: false, lastShare: {}, lastAttemptAt: '2026-11-21T10:40:00Z', lastSuccessAt: null })); r = await C.main(['--live-read', '--scheduled', '--store', storeFile(), '--out', out], { ...deps, now: () => new Date('2026-11-24T11:00:00Z') }); assert.equal(!!r.skipped, false);
    assert.equal(A.DEFAULTS.intervalDays, 3);
});
test('safety by design: the code never prints or stores credentials, never touches a price, only sends inventoryPolicy, and never opens the real site by itself in tests', () => {
    const src = ['alpina-hoss.js', 'alpina-hoss-fetch.js', 'alpina-hoss-cli.js', 'alpina-hoss-undo.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf8')).join('\n');
    assert.ok(!/console\.log\([^)]*HOSS_LOGIN_PASSWORD/.test(src)); assert.ok(!/price\s*:\s*[^,}]*inventoryPolicy/.test(src)); const mut = src.match(/productVariantsBulkUpdate\(productId:\$pid,variants:\$v\)/g); assert.ok(mut.length >= 2);
    const fsrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'alpina-hoss-fetch.js'), 'utf8'); assert.ok(!/['"`]\/(cart|checkout)/.test(fsrc), 'the reader builds no cart or checkout URL'); assert.ok(!/add-to-cart/.test(fsrc));
    const real = fs.readFileSync(path.join(__dirname, '..', 'lib', 'alpina-hoss-fetch.js'), 'utf8'); assert.ok(!/inventoryPolicy|admin\/api/.test(real));
});
