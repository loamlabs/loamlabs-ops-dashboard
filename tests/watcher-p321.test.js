// Run with: npm test   (no network)
// Project321 in the Vendor Watcher: fetching (timeout, polite, no retry on 429), reading the real page shapes, price from the highest color, flip cap, two-run confirmation,
// time budget, page breaker, grouped lines. The page shapes below are what project321.com showed on Nov 6 2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/watcher-fetch');
const P = require('../lib/watcher-project321');
const S = require('../lib/watcher-safety');

const v = (public_title, price, available, extra = {}) => ({ public_title, price, available, compare_at_price: null, ...extra });
// 6-Bolt rear: Hole Count / Color (status in the text) / Model (driver); pre-order colors available:false
const rear = [];
for (const h of ['32', '28']) for (const [c, p, a] of [['Black (Available Now)', 40750, true], ['Silver (Available Now)', 42250, true], ['Maple (Pre-Order: December)', 42250, false], ['Ultra Violet (Pre-Order: December)', 42250, false]])
    for (const d of ['XDR', 'HGR', 'MicroSpline']) rear.push(v(`${h} / ${c} / ${d}`, p, a));
// 6-Bolt front: pre-order colors available:TRUE
const front = [v('32 / Black (Available Now)', 19250, true), v('32 / Silver (Available Now)', 20250, true), v('32 / Maple (Pre-Order: December)', 20250, true), v('28 / Black (Available Now)', 19250, true)];
// G3Ti rear: the 28h hole count carries the pre-order text, color plain
const ti = [v('32 / Black / XDR', 45750, true), v('32 / Silver / XDR', 47250, true), v('28 (Pre-Order: December) / Black / XDR', 45750, true), v('28 (Pre-Order: December) / Silver / XDR', 47250, true)];
// 6-Lock front: Color first, spelling "Ultraviolet"
const lock = [v('Black / 32', 21000, true), v('Ultraviolet / 32', 22000, true), v('Ultraviolet / 28', 22000, true), v('Navy / 32', 22000, false)];
const rule = (opts, tags = []) => ({ option_values: opts, tags });

// ---------------------------------------------------------------- fetch
test('polite vendor: honest agent, one attempt, 429 and 403 are final (blocked), no sleep, no retry', async () => {
    for (const status of [429, 403]) {
        let calls = 0, slept = 0; let ua = null;
        await assert.rejects(F.fetchVendorText({ url: 'u', polite: true, sleep: async () => { slept++; }, fetchFn: async (u, o) => { calls++; ua = o.headers['User-Agent']; return { ok: false, status }; } }), (e) => e.blocked === true && e.status === status);
        assert.equal(calls, 1); assert.equal(slept, 0); assert.equal(ua, F.HONEST_UA); assert.match(ua, /^LoamLabsVendorWatcher\/1\.0 \(\+https:\/\/loamlabsusa\.com\)$/);
    }
});

test('other vendors keep three tries on 429/503 with the browser-like agent, now with a timeout signal', async () => {
    let calls = 0, slept = 0, sawSignal = false;
    await assert.rejects(F.fetchVendorText({ url: 'u', randomUA: 'Mozilla/5.0 X', sleep: async () => { slept++; }, fetchFn: async (u, o) => { calls++; sawSignal = !!o.signal; return { ok: false, status: 429 }; } }), /after retries/);
    assert.equal(calls, 3); assert.equal(slept, 2); assert.ok(sawSignal);
    let n = 0; const ok = await F.fetchVendorText({ url: 'u', sleep: async () => { }, fetchFn: async () => (++n < 2 ? { ok: false, status: 503 } : { ok: true, text: async () => '{"a":1}' }) });
    assert.equal(ok, '{"a":1}');
    await assert.rejects(F.fetchVendorText({ url: 'u', fetchFn: async () => ({ ok: false, status: 404 }) }), (e) => e.status === 404);
});

test('a hung server is cut off by the timeout (no more waiting for Vercel to kill the run)', async () => {
    const hang = (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
    const t0 = Date.now();
    await assert.rejects(F.fetchVendorText({ url: 'u', polite: true, timeoutMs: 30, fetchFn: hang }), (e) => e.timeout === true && /timed out/.test(e.message));
    await assert.rejects(F.fetchVendorText({ url: 'u', timeoutMs: 30, fetchFn: hang }), (e) => e.timeout === true);
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(F.FETCH_TIMEOUT_MS, 10000);
});

test('polite means the tag or Project321; gap 5 s for polite, 1 s for the rest', () => {
    assert.equal(F.isPoliteRule({ vendor_name: 'Project321', tags: [] }), true); assert.equal(F.isPoliteRule({ vendor_name: 'x', tags: ['polite'] }), true);
    assert.equal(F.isPoliteRule({ vendor_name: 'Sapim', tags: ['spokes'] }), false); assert.equal(F.isPoliteRule(null), false);
    assert.equal(F.gapMs(true), 5000); assert.equal(F.gapMs(false), 1000);
});

// ---------------------------------------------------------------- reading the real page shapes
test('color and holes match through the driver, the status text, the "Ultra Violet"/"Ultraviolet" spelling and either option order', () => {
    assert.equal(P.matchColourHoles(rear, { 'Spoke Count': '32h', Color: 'Black' }).length, 3);
    assert.equal(P.matchColourHoles(rear, { 'Spoke Count': '28h', Color: 'Ultra Violet' }).length, 3);
    assert.equal(P.matchColourHoles(lock, { 'Spoke Count': '28h', Color: 'Ultra Violet' }).length, 1);
    assert.equal(P.matchColourHoles(lock, { 'Spoke Count': '32h', Color: 'Navy' }).length, 1);
    assert.equal(P.matchColourHoles(ti, { 'Spoke Count': '28h', Color: 'Black' }).length, 1);
    assert.equal(P.matchColourHoles(rear, { 'Spoke Count': '24h', Color: 'Black' }).length, 0);
    assert.equal(P.matchColourHoles(rear, { 'Spoke Count': '32h' }).length, 0);                   // no color in the rule: no guess
    assert.equal(P.holeOf('28 (Pre-Order: December) / Black / XDR'), '28'); assert.equal(P.holeOf('Black / 32'), '32');
});

test('price: the highest color price at that hole count (price-max-color), so Black is priced like the other colors; without the tag the color\'s own price', () => {
    const black = P.matchColourHoles(rear, { 'Spoke Count': '32h', Color: 'Black' });
    const withTag = P.readProject321({ candidates: black, variants: rear, rule: rule({ 'Spoke Count': '32h', Color: 'Black' }, ['price-max-color']) });
    assert.equal(withTag.price, 42250); assert.equal(withTag.available, true);
    const noTag = P.readProject321({ candidates: black, variants: rear, rule: rule({ 'Spoke Count': '32h', Color: 'Black' }) });
    assert.equal(noTag.price, 40750);
    // today's prices are reproduced: x1.00 of the highest color (rear $422.50, front $202.50, G3Ti $472.50, 6-Lock front $220)
    const f = P.readProject321({ candidates: P.matchColourHoles(front, { 'Spoke Count': '32h', Color: 'Black' }), variants: front, rule: rule({ 'Spoke Count': '32h', Color: 'Black' }, ['price-max-color']) });
    assert.equal(f.price, 20250);
    const t = P.readProject321({ candidates: P.matchColourHoles(ti, { 'Spoke Count': '32h', Color: 'Black' }), variants: ti, rule: rule({ 'Spoke Count': '32h', Color: 'Black' }, ['price-max-color']) });
    assert.equal(t.price, 47250);
    const l = P.readProject321({ candidates: P.matchColourHoles(lock, { 'Spoke Count': '32h', Color: 'Black' }), variants: lock, rule: rule({ 'Spoke Count': '32h', Color: 'Black' }, ['price-max-color']) });
    assert.equal(l.price, 22000);
});

test('pre-order: found by the text in ANY option, even when available is true; stock left alone unless the rule has preorder-closes; never guessed', () => {
    const cases = [
        [rear, { 'Spoke Count': '32h', Color: 'Maple' }, true],          // available:false + label
        [front, { 'Spoke Count': '32h', Color: 'Maple' }, true],         // available:TRUE + label (the trap)
        [ti, { 'Spoke Count': '28h', Color: 'Black' }, true],            // label in the hole count option
        [rear, { 'Spoke Count': '32h', Color: 'Black' }, false],
        [front, { 'Spoke Count': '32h', Color: 'Silver' }, false],
    ];
    for (const [vars, opts, want] of cases) {
        const r = P.readProject321({ candidates: P.matchColourHoles(vars, opts), variants: vars, rule: rule(opts, ['price-max-color']) });
        assert.equal(r.preorder, want, JSON.stringify(opts)); assert.equal(r.holdStock, want);
    }
    const open = P.readProject321({ candidates: P.matchColourHoles(front, { 'Spoke Count': '32h', Color: 'Maple' }), variants: front, rule: rule({ 'Spoke Count': '32h', Color: 'Maple' }, ['price-max-color']) });
    assert.equal(open.available, true); assert.match(open.note, /left alone/);                 // the JSON says available: we do NOT act on it
    const closed = P.readProject321({ candidates: P.matchColourHoles(front, { 'Spoke Count': '32h', Color: 'Maple' }), variants: front, rule: rule({ 'Spoke Count': '32h', Color: 'Maple' }, ['price-max-color', 'preorder-closes']) });
    assert.equal(closed.available, false); assert.equal(closed.holdStock, false);
    assert.equal(P.readProject321({ candidates: [], variants: rear, rule: rule({}) }), null);
});

// ---------------------------------------------------------------- safety nets
test('flip cap per vendor covers both directions and reports once', () => {
    const lim = S.createFlipLimiter(3);
    assert.deepEqual([1, 2, 3, 4, 5].map(() => lim.tryFlip('Project321')), [true, true, true, false, false]);
    assert.equal(lim.tryFlip('Sapim'), true);                                                  // other vendors count separately
    assert.equal(lim.lines().length, 1); assert.match(lim.lines()[0], /Project321: 2 stock changes NOT written this run \(limit of 3/); assert.equal(S.FLIP_CAP, 40);
    assert.equal(S.flipCapFor(400), 40); assert.equal(S.flipCapFor(5440), 272); assert.equal(S.flipCapFor(0), 40);
    const byVendor = S.createFlipLimiter((vendor) => S.flipCapFor(vendor === 'Sapim' ? 5440 : 400)); let ok = 0; for (let i = 0; i < 100; i++) if (byVendor.tryFlip('Sapim')) ok++; assert.equal(ok, 100);   // the big vendor is not stopped at 40
});

test('two-run confirmation: a flip is written only when the previous run showed the same state', () => {
    assert.equal(S.confirmedTwice({ last_availability: false }, false), true);
    assert.equal(S.confirmedTwice({ last_availability: true }, false), false);                 // first sighting of a change: wait
    assert.equal(S.confirmedTwice({ last_availability: null }, true), false); assert.equal(S.confirmedTwice({}, true), false);
});

test('time budget stops at 270 s; page breaker needs 3 live unmatched and more than half of the page', () => {
    assert.equal(S.timeBudgetExceeded(0, 269999), false); assert.equal(S.timeBudgetExceeded(0, 270001), true);
    assert.equal(S.urlBreakerTripped({ live: 10, noMatch: 2 }), false); assert.equal(S.urlBreakerTripped({ live: 10, noMatch: 3 }), false);
    assert.equal(S.urlBreakerTripped({ live: 10, noMatch: 6 }), true); assert.equal(S.urlBreakerTripped({ live: 20, noMatch: 20 }), true); assert.equal(S.urlBreakerTripped(undefined), false);
});

test('grouped lines: one line per product; product name from a rule title', () => {
    const t = (c) => `Project321 G3 6-Bolt Front Hub - 15x110mm (32h / ${c})`;
    const lines = S.groupLines([{ product: S.productOfTitle(t('Maple')), action: 'closed' }, { product: S.productOfTitle(t('Ruby')), action: 'closed' }, { product: 'G3 Rear', action: 'opened' }]);
    assert.deepEqual(lines, ['Project321 G3 6-Bolt Front Hub - 15x110mm: 2 colors closed', 'G3 Rear: 1 color opened']);
    assert.equal(S.productOfTitle(t('Black')), 'Project321 G3 6-Bolt Front Hub - 15x110mm');
    assert.equal(S.hasTag({ tags: ['baseline'] }, 'baseline'), true); assert.equal(S.hasTag({}, 'baseline'), false);
});

test('baseline mode and auto-approve-oos: a close asks for no approval; a normal row still does; opens never did', () => {
    const base = { needsStockUpdate: true, stockAction: 'deny' };
    assert.equal(S.closeNeedsApproval({ ...base, rule: { tags: [] } }), true);
    assert.equal(S.closeNeedsApproval({ ...base, rule: { tags: ['baseline'] } }), false);
    assert.equal(S.closeNeedsApproval({ ...base, rule: { tags: ['auto-approve-oos'] } }), false);
    assert.equal(S.closeNeedsApproval({ needsStockUpdate: true, stockAction: 'continue', rule: { tags: [] } }), false);
    assert.equal(S.closeNeedsApproval({ needsStockUpdate: false, stockAction: 'deny', rule: { tags: [] } }), false);
});
