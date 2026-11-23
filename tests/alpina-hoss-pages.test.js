// tests/alpina-hoss-pages.test.js  The NAS job reads the 8 Hoss pages that Jerry saves by hand into a folder: fresh, stale, missing, half-saved, duplicates, the scheduled gates, the command. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/alpina-hoss');
const P = require('../lib/alpina-hoss-pages');
const C = require('../lib/alpina-hoss-cli');

const FX = path.join(__dirname, 'fixtures', 'alpina');
const KEYS = P.KEYS;
const NOW = new Date('2026-11-25T10:40:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 864e5);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alpina-pages-'));
// a pages folder: the 8 fake pages, each with its file date (days ago); opts.name(key) can give the file a Chrome-style name
function folder(ageDays = 0.5, opts = {}) {
    const d = tmp();
    for (const k of KEYS) { if (opts.skip && opts.skip.includes(k)) continue; const name = opts.name ? opts.name(k) : k + '.html'; const f = path.join(d, name); fs.writeFileSync(f, fs.readFileSync(path.join(FX, k + '.html'))); const when = daysAgo(opts.ages && opts.ages[k] !== undefined ? opts.ages[k] : ageDays); fs.utimesSync(f, when, when); }
    return d;
}
const setAge = (dir, file, days) => { const when = daysAgo(days); fs.utimesSync(path.join(dir, file), when, when); };
const store0 = () => JSON.parse(fs.readFileSync(path.join(FX, 'store.json'), 'utf8'));
const storeFile = () => { const f = path.join(tmp(), 'store.json'); fs.writeFileSync(f, JSON.stringify(store0())); return f; };
const pagesAll = () => Object.fromEntries(KEYS.map((k) => [k, A.parseHossPage(fs.readFileSync(path.join(FX, k + '.html'), 'utf8'))]));
const N_CLOSE = A.plan({ pages: pagesAll(), store: store0() }).totals.close;

test('fresh pages: all 8 are found by their TITLE (Chrome-style file names work), parsed, status ok, with a fingerprint', () => {
    const d = folder(0.5, { name: (k) => 'Alpina ' + k.replace(/-/g, ' ') + ' – Hoss Active Sports Group.html' });
    const ev = P.evaluatePages({ dir: d, now: NOW });
    assert.equal(ev.status, 'ok'); assert.equal(Object.keys(ev.pages).length, 8); assert.deepEqual(Object.keys(ev.pages).sort(), [...KEYS].sort()); assert.match(ev.fingerprint, /^[0-9a-f]{16}$/); assert.ok(ev.files.every((f) => f.ageDays < 1 && f.ok));
});
test('stale: if ANY page is older than 4 days the run stops, writes nothing, says "pages too old: save them again" and asks for an alert email', () => {
    const d = folder(1, { ages: { 'ultralite-aero-j-bend': 5 } });
    const ev = P.evaluatePages({ dir: d, now: NOW }); assert.equal(ev.status, 'stopped'); assert.equal(ev.kind, 'stale'); assert.equal(ev.alert, true); assert.match(ev.reason, /pages too old: save them again/); assert.match(ev.reason, /5\.0 days old, the limit is 4 days/);
    assert.equal(P.evaluatePages({ dir: folder(3.9), now: NOW }).status, 'ok'); assert.equal(P.evaluatePages({ dir: folder(4.1), now: NOW }).status, 'stopped'); assert.equal(P.evaluatePages({ dir: folder(8), now: NOW, maxAgeDays: 10 }).status, 'ok');
});
test('missing: a page that is not in the folder stops the whole run and names it; a folder that cannot be read stops too', () => {
    const ev = P.evaluatePages({ dir: folder(0.5, { skip: ['extralite-aero-j-bend', 'ultralite-round-j-bend'] }), now: NOW }); assert.equal(ev.status, 'stopped'); assert.equal(ev.kind, 'missing'); assert.match(ev.reason, /missing pages: extralite-aero-j-bend, ultralite-round-j-bend \(found 6 of 8/);
    const e2 = P.evaluatePages({ dir: path.join(tmp(), 'nope'), now: NOW }); assert.equal(e2.status, 'stopped'); assert.equal(e2.kind, 'folder');
});
test('half-saved: a page saved before it finished loading (no variation data) or with too few variants stops the run with advice', () => {
    const d = folder(0.5); const f = path.join(d, 'extralite-round-j-bend.html'); const txt = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, txt.slice(0, txt.indexOf('data-product_variations')) + '></form></body></html>');
    let ev = P.evaluatePages({ dir: d, now: NOW }); assert.equal(ev.status, 'stopped'); assert.equal(ev.kind, 'unparseable'); assert.match(ev.reason, /extralite-round-j-bend|data-product_variations/);
    const d2 = folder(0.5); const f2 = path.join(d2, 'ultralite-aero-j-bend.html'); fs.writeFileSync(f2, '<title>Alpina Ultralite Aero J-Bend – Hoss</title><form data-product_variations="[]"></form>'); ev = P.evaluatePages({ dir: d2, now: NOW }); assert.equal(ev.status, 'stopped');
    const d3 = folder(0.5); const f3 = path.join(d3, 'extralite-aero-j-bend.html'); const j = fs.readFileSync(f3, 'utf8'); const cut = j.slice(0, j.indexOf('{&quot;attributes')); fs.writeFileSync(f3, cut + '[]"></form>'); ev = P.evaluatePages({ dir: d3, now: NOW }); assert.equal(ev.status, 'stopped');
    const d4 = folder(0.5); fs.writeFileSync(path.join(d4, 'ultralite-round-j-bend.html'), '<title>Alpina Ultralite Round J-Bend – Hoss</title><p>Please log in</p>'); ev = P.evaluatePages({ dir: d4, now: NOW }); assert.equal(ev.status, 'stopped'); assert.match(ev.reason, /saved before it finished loading|data-product_variations/);
});
test('half of the variants in a page (a truncated list) fails the 90% rule; other files in the folder are ignored, not errors; for a repeated page the NEWEST file wins', () => {
    const d = folder(0.5); fs.writeFileSync(path.join(d, 'notes.html'), '<title>Something else</title>'); fs.writeFileSync(path.join(d, 'readme.txt'), 'x'); fs.mkdirSync(path.join(d, 'extralite-round-j-bend_files'));
    // an older copy of one page with 30 variants only, next to the good newer copy
    const f = path.join(d, 'old copy of round j-bend.html'); const good = fs.readFileSync(path.join(FX, 'extralite-round-j-bend.html'), 'utf8'); const m = /data-product_variations="([^"]*)"/.exec(good); const list = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).slice(0, 30);
    fs.writeFileSync(f, good.replace(m[1], JSON.stringify(list).replace(/&/g, '&amp;').replace(/"/g, '&quot;'))); setAge(d, 'old copy of round j-bend.html', 2);
    const ev = P.evaluatePages({ dir: d, now: NOW }); assert.equal(ev.status, 'ok'); assert.equal(ev.pages['extralite-round-j-bend'].rows.length, 192); assert.ok(ev.ignored.some((x) => /notes\.html/.test(x)));
    setAge(d, 'old copy of round j-bend.html', 0.1); assert.equal(P.evaluatePages({ dir: d, now: NOW }).status, 'stopped');   // now the short copy is the newest: refused (all-or-nothing), not silently mixed
});

// ---- the scheduled 5:40 am gates ----
const READ_AT = daysAgo(3.5).toISOString();
test('scheduled: pages that are not newer than the last read are skipped quietly; 5 of 8 new = waiting; all 8 new = go', () => {
    const state = { lastPagesReadAt: READ_AT };
    let ev = P.evaluatePages({ dir: folder(3.9), now: NOW, scheduled: true, state }); assert.equal(ev.status, 'skip'); assert.equal(ev.kind, 'no-new'); assert.match(ev.reason, /no new pages since the last read/); assert.ok(!ev.alert);
    const ages = {}; KEYS.slice(0, 5).forEach((k) => { ages[k] = 0.5; }); KEYS.slice(5).forEach((k) => { ages[k] = 3.8; });
    ev = P.evaluatePages({ dir: folder(0, { ages }), now: NOW, scheduled: true, state }); assert.equal(ev.status, 'skip'); assert.equal(ev.kind, 'waiting'); assert.match(ev.reason, /5 of 8 are newer/);
    ev = P.evaluatePages({ dir: folder(0.5), now: NOW, scheduled: true, state }); assert.equal(ev.status, 'ok');
    assert.equal(P.evaluatePages({ dir: folder(0.5), now: NOW, scheduled: true, state: {} }).status, 'ok');   // first read ever
});
test('scheduled: pages saved again but saying exactly what the last read said (a re-upload of old pages) do not count', () => {
    const d = folder(0.5); const first = P.evaluatePages({ dir: d, now: NOW }); assert.equal(first.status, 'ok');
    const state = { lastPagesReadAt: READ_AT, lastPagesFingerprint: first.fingerprint }; const ev = P.evaluatePages({ dir: d, now: NOW, scheduled: true, state }); assert.equal(ev.status, 'skip'); assert.equal(ev.kind, 'same'); assert.match(ev.reason, /uploaded again, not saved again/);
    assert.equal(P.evaluatePages({ dir: d, now: NOW, scheduled: true, force: true, state }).status, 'ok');   // a manual read (read-now) bypasses the gate
});
test('scheduled: once the unchanged pages grow older than 4 days there is ONE alert (not one a day); force never bypasses the age rule', () => {
    const d = folder(4.5); const state = { lastPagesReadAt: daysAgo(5).toISOString() };   // pages saved 4.5 days ago and already read? they are newer than the last read, so the age rule applies
    let ev = P.evaluatePages({ dir: d, now: NOW, scheduled: true, state: { lastPagesReadAt: daysAgo(4.2).toISOString() } }); assert.equal(ev.status, 'skip'); assert.equal(ev.kind, 'stale'); assert.equal(ev.alert, true); assert.ok(ev.alertMarker);
    ev = P.evaluatePages({ dir: d, now: NOW, scheduled: true, state: { lastPagesReadAt: daysAgo(4.2).toISOString(), staleAlertedFor: ev.alertMarker } }); assert.equal(ev.status, 'skip'); assert.ok(!ev.alert); assert.match(ev.reason, /alert was already sent/);
    ev = P.evaluatePages({ dir: d, now: NOW, scheduled: true, force: true, state }); assert.equal(ev.status, 'stopped'); assert.equal(ev.kind, 'stale');
});

// ---- the command ----
const mk = (over = {}) => { const out = tmp(); const mails = []; const say = []; const deps = { say: (m) => say.push(String(m)), env: { SHOPIFY_SHOP_NAME: 'x', ALPINA_SOURCE: 'pages' }, envFile: path.join(out, 'none.env'), now: () => NOW, fast: true, mail: async (x) => mails.push(x), ...over }; return { out, mails, say, deps }; };
const gqlMock = (store) => { const log = []; const byPid = new Map(store.map((p) => [p.id, p])); const gql = async (q, v) => { if (/productVariantsBulkUpdate/.test(q)) { log.push({ type: 'write', n: v.v.length }); const p = byPid.get(v.pid); for (const x of v.v) { const vv = p.variants.find((y) => 'gid://shopify/ProductVariant/' + y.id === x.id); if (vv) vv.policy = x.inventoryPolicy; } return { productVariantsBulkUpdate: { userErrors: [] } }; } if (/product\(id:\$id\)/.test(q)) { const p = byPid.get(v.id); return { product: { variants: { pageInfo: { hasNextPage: false, endCursor: null }, edges: p.variants.map((y) => ({ node: { id: 'gid://shopify/ProductVariant/' + y.id, inventoryPolicy: y.policy } })) } } }; } throw new Error('unexpected ' + q.slice(0, 30)); }; gql.log = log; return gql; };

test('command: fresh pages read now = a BASELINE (nothing written), the proposal is emailed, state remembers the pages; then the approved run writes with undo and read-back', async () => {
    const { out, mails, say, deps } = mk(); const pages = folder(0.5); const store = store0(); const gql = gqlMock(store); deps.gql = gql;
    const sf = path.join(tmp(), 's.json'); fs.writeFileSync(sf, JSON.stringify(store));
    let r = await C.main(['--pages', pages, '--force', '--apply', '--store', sf, '--out', out], deps);
    assert.equal(r.baseline, true); assert.equal(gql.log.length, 0); assert.equal(mails.length, 1); assert.match(mails[0].subject, /nothing changed|baseline/);
    const st = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8')); assert.equal(st.lastPagesReadAt, NOW.toISOString()); assert.ok(st.lastPagesFingerprint);
    assert.match(say.join('\n'), /SAVED HOSS PAGES in /); assert.doesNotMatch(say.join('\n'), /hasgllc/);
    // approve with the number of closes
    const m2 = mk(); m2.deps.gql = gql; fs.copyFileSync(path.join(out, 'state.json'), path.join(m2.out, 'state.json'));
    r = await C.main(['--pages', pages, '--force', '--apply', '--approve-baseline', '--limit', String(N_CLOSE), '--store', sf, '--out', m2.out], m2.deps);
    assert.equal(r.code, 0); assert.equal(r.written, N_CLOSE); assert.ok(fs.readdirSync(m2.out).some((f) => /^alpina_undo_/.test(f))); assert.equal(store.flatMap((p) => p.variants).filter((v) => v.policy === 'DENY').length, N_CLOSE);
});
test('command: stale pages write NOTHING, print "pages too old: save them again" and send one alert email', async () => {
    const { out, mails, say, deps } = mk(); const gql = gqlMock(store0()); deps.gql = gql; const r = await C.main(['--pages', folder(6), '--force', '--apply', '--approve-baseline', '--limit', '9999', '--store', storeFile(), '--out', out], deps);
    assert.equal(r.code, 2); assert.equal(gql.log.length, 0); assert.equal(mails.length, 1); assert.match(mails[0].text, /pages too old: save them again/); assert.match(mails[0].subject, /too old/); assert.ok(fs.readdirSync(out).some((f) => /^alpina_stopped_/.test(f))); assert.match(say.join('\n'), /pages too old: save them again/);
});
test('command: a missing page or a half-saved page stops all-or-nothing with the plain reason and one email', async () => {
    let m = mk(); let r = await C.main(['--pages', folder(0.5, { skip: ['ultralite-aero-straight-pull'] }), '--force', '--store', storeFile(), '--out', m.out], m.deps); assert.equal(r.code, 2); assert.match(r.text, /missing page: ultralite-aero-straight-pull/); assert.equal(m.mails.length, 1);
    m = mk(); const d = folder(0.5); fs.writeFileSync(path.join(d, 'extralite-round-straight-pull.html'), '<title>Alpina Extralite Round Straight-Pull – Hoss</title><p>half</p>'); r = await C.main(['--pages', d, '--force', '--store', storeFile(), '--out', m.out], m.deps); assert.equal(r.code, 2); assert.match(r.text, /saved before it finished loading|data-product_variations/); assert.equal(m.mails.length, 1);
});
test('command: the scheduled check skips quietly (no email) with no new pages, runs with 8 new pages, and skips again until the next save', async () => {
    const m = mk(); const pages = folder(0.5); const sf = storeFile(); fs.writeFileSync(path.join(m.out, 'state.json'), JSON.stringify({ baselineApproved: false, lastShare: {}, lastAttemptAt: null, lastSuccessAt: null, lastPagesReadAt: daysAgo(3.4).toISOString() }));
    let r = await C.main(['--pages', pages, '--scheduled', '--apply', '--store', sf, '--out', m.out], m.deps); assert.ok(!r.skipped); assert.equal(m.mails.length, 1);   // 8 pages newer than the last read: it read them (baseline, emailed)
    const later = { ...m.deps, now: () => new Date(NOW.getTime() + 3.2 * 864e5), mail: async (x) => m.mails.push(x) }; const before = m.mails.length;
    r = await C.main(['--pages', pages, '--scheduled', '--apply', '--store', sf, '--out', m.out], later); assert.equal(r.skipped, true); assert.equal(m.mails.length, before);   // same pages, 3 days later and still fresh enough? they are 3.7 days old, not new: quiet skip
    assert.match(r.text, /no new pages/);
});
test('command: ALPINA_SOURCE=pages refuses --live-read (no live Hoss login from this job); --pages-status lists each page (new / read / too old / missing)', async () => {
    let m = mk(); let r = await C.main(['--live-read', '--out', m.out, '--store', storeFile()], m.deps); assert.equal(r.code, 1); assert.match(r.text, /ALPINA_SOURCE=pages/); assert.equal(m.mails.length, 0);
    const d = folder(0.5, { ages: { 'ultralite-aero-j-bend': 6 }, skip: ['extralite-aero-j-bend'] }); m = mk(); r = await C.main(['--pages-status', '--pages', d, '--out', m.out], m.deps); assert.equal(r.code, 0);
    assert.match(r.text, /7 of 8 pages found/); assert.match(r.text, /MISSING  extralite-aero-j-bend/); assert.match(r.text, /TOO OLD  ultralite-aero-j-bend/); assert.match(r.text, /new {5}\s*extralite-round-j-bend/);
});
test('the old saved pages as a dry run: through --pages with the age rule switched off they give the same totals as --saved (the Nov 13 case)', async () => {
    const old = folder(14); const m1 = mk(); m1.deps.env.ALPINA_PAGES_MAX_AGE_DAYS = '99999'; const r1 = await C.main(['--pages', old, '--force', '--store', storeFile(), '--out', m1.out], m1.deps);
    const copy = folder(14); const m2 = mk(); const r2 = await C.main(['--saved', copy, '--store', storeFile(), '--out', m2.out], m2.deps);
    assert.equal(r1.result.totals.variantsMatched, r2.result.totals.variantsMatched); assert.equal(r1.result.totals.close, r2.result.totals.close); assert.equal(r1.result.totals.close, N_CLOSE); assert.equal(r1.result.totals.variantsMatched, 8904);
});
test('the live fetch code is untouched and unused by the pages mode (no fetch, no login): the pages module has no network code', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'alpina-hoss-pages.js'), 'utf8'); const code = src.replace(/^\s*\/\/.*$/gm, ''); assert.ok(!/fetch\(|require\('https?'\)|http:\/\/|https:\/\//.test(code)); assert.ok(!/alpina-hoss-fetch/.test(code));
});
