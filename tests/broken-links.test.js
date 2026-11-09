// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { stampSince, stripSince, parseSince, classify, createLinkReport, redirectedAway } = require('../lib/broken-links');
const { fetchVendorText } = require('../lib/watcher-fetch');

test('stampSince: first failure stamps today; the same problem keeps the old date; a different problem restarts', () => {
  const base = 'Fetch failed for https://x.com/p.js: Fetch failed (404)';
  const first = stampSince(base, 'Synced (In Stock). Link: u', '2026-11-10T08:00:00Z');
  assert.equal(first, base + ' [since 2026-11-10]');
  assert.equal(stampSince(base, first, '2026-11-14T08:00:00Z'), first);          // unchanged text: no daily rewrite
  assert.equal(stampSince(base, base, '2026-11-14T08:00:00Z'), base + ' [since 2026-11-14]');   // old log without a date
  assert.equal(stampSince('JSON Parse failed: u', first, '2026-11-15T00:00:00Z'), 'JSON Parse failed: u [since 2026-11-15]');
  assert.equal(parseSince(first), '2026-11-10'); assert.equal(stripSince(first), base);
});

test('classify', () => {
  assert.equal(classify('Fetch failed (404)'), 'page not found (404)');
  assert.equal(classify('Fetch failed (500)'), 'page error (HTTP 500)');
  assert.equal(classify('Fetch timed out after 10 s'), 'page timed out');
  assert.equal(classify('The page did not return readable data'), 'page could not be read (parse failed)');
  assert.equal(classify('Found 0 matches'), 'product not found on the page');
  assert.equal(classify('redirected to https://a/b'), 'redirected to another page');
});

test('nothing broken: no section at all', () => {
  assert.deepEqual(createLinkReport().section('2026-11-10'), { count: 0, html: '', lines: [] });
});

test('one line per PAGE with rule count, link, days, NEW today and the how-to-fix text', () => {
  const r = createLinkReport();
  for (let i = 0; i < 26; i++) r.add({ url: 'https://berdspokes.com/products/hawk27.js', vendor: 'Berd', product: 'Berd HAWK27 Carbon Wheels', what: 'page not found (404)', since: '2026-07-14' });
  r.add({ url: 'https://www.ethirteen.com/products/optimus.js', vendor: 'e*thirteen', product: 'Optimus Rim', what: 'page not found (404)', since: '2026-11-10' });
  const s = r.section('2026-11-10');
  assert.equal(s.count, 2);
  assert.match(s.html, /Broken vendor links: fix needed \(2\)/);
  assert.match(s.html, /26 rules use this page/); assert.match(s.html, /href="https:\/\/berdspokes\.com\/products\/hawk27"/);
  assert.match(s.html, /failing 120 days in a row, since 2026-07-14/); assert.match(s.html, /NEW today/); assert.match(s.html, /How to fix/);
  assert.ok(s.html.indexOf('Berd') < s.html.indexOf('e*thirteen'));   // longest-broken first
  assert.equal(s.lines.length, 2);
});

test('html is escaped and long lists are capped', () => {
  const r = createLinkReport();
  for (let i = 0; i < 30; i++) r.add({ url: `https://v.example/p${i}`, vendor: 'V<b>', product: 'P"x"', what: 'page not found (404)', since: '2026-11-10' });
  const s = r.section('2026-11-10', { maxLines: 25 });
  assert.equal(s.count, 30); assert.match(s.html, /and 5 more broken pages/); assert.ok(!s.html.includes('V<b>'));
});

test('redirectedAway ignores http/https, case, trailing slash and .js', () => {
  assert.equal(redirectedAway('https://a.com/products/x.js', 'https://a.com/products/X'), false);
  assert.equal(redirectedAway('https://a.com/products/x.js', 'http://a.com/products/x/'), false);
  assert.equal(redirectedAway('https://a.com/products/x.js', 'https://a.com/collections/all'), true);
});

test('fetchVendorText reports a redirect through onInfo and still returns the text', async () => {
  let seen = null;
  const fetchFn = async () => ({ ok: true, redirected: true, url: 'https://a.com/other', text: async () => '{}' });
  const t = await fetchVendorText({ url: 'https://a.com/x.js', fetchFn, onInfo: (i) => { seen = i; } });
  assert.equal(t, '{}'); assert.deepEqual(seen, { redirected: true, finalUrl: 'https://a.com/other' });
});
