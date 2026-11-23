#!/usr/bin/env node
// lib/alpina-hoss-receiver.js   A tiny receiver inside the Alpina NAS container. It takes the 8 Hoss pages that the Alpina Chrome helper (running in Jerry's own signed-in Chrome) sends,
// checks them, and writes them as the 8 page files the saved-pages mode already reads (/data/pages/<key>.html, dated now), so stale-page protection keeps working.
//   node lib/alpina-hoss-receiver.js --data /data --port 8765
// Safety: every request needs the long random token (made once, kept in /data/helper_token.txt, shown in the container Log when made or on request); the 8 pages arrive in ONE request and are all
// checked before anything is written (a bad or missing page = nothing written); only the 8 known Hoss product addresses are accepted; every price is removed (only stock fields are kept);
// the body is limited to 3 MB. It never talks to Hoss and never sees a password or a cookie.
// When the helper reports "stopped" (logged out, challenge, 403, 429 ...) the receiver emails ONE alert ("Hoss pages need you: log in to hasgllc.com in Chrome") and keeps the reason for status.txt.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const A = require('./alpina-hoss');

const KEEP = ['attributes', 'availability_html', 'is_in_stock', 'max_qty', 'sku', 'variation_id'];
const MAX_BODY = 3 * 1024 * 1024;
const EXPECT = Object.fromEntries(Object.entries(A.HOSS_PAGES).map(([key, p]) => [A.HOSS_HOST + p.path, key]));
const enc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const tokenOk = (given, token) => !!token && !!given && crypto.timingSafeEqual(sha(given), sha(token));

/** The token: made once (48 hex characters), kept in <data>/helper_token.txt. Returns { token, created }. */
function loadOrCreateToken(dataDir, fsImpl = fs) {
    const f = path.join(dataDir, 'helper_token.txt');
    try { const t = fsImpl.readFileSync(f, 'utf8').trim(); if (t.length >= 32) return { token: t, created: false }; } catch (e) { /* not there yet */ }
    const token = crypto.randomBytes(24).toString('hex'); fsImpl.writeFileSync(f, token + '\n', { mode: 0o600 }); return { token, created: true };
}

/** The page file the saved-pages mode reads (same shape as a saved page, with the variation data only). */
const renderPage = (title, variations) => '<!doctype html><html><head><title>' + enc(String(title)) + '</title></head><body><form class="variations_form cart" data-product_variations="' + enc(JSON.stringify(variations)) + '"></form></body></html>';

/** Check a delivery. @returns {{ ok: true, files: [{key, html}] } | { ok: false, status, reason }} */
function checkDelivery(body) {
    if (!body || !Array.isArray(body.pages)) return { ok: false, status: 400, reason: 'no pages in the request' };
    if (body.pages.length !== 8) return { ok: false, status: 400, reason: 'all 8 pages must arrive together (got ' + body.pages.length + ')' };
    const files = []; const seen = new Set();
    for (const p of body.pages) {
        const key = EXPECT[String(p && p.url)]; if (!key) return { ok: false, status: 400, reason: 'not one of the 8 Alpina product addresses: ' + String(p && p.url).slice(0, 80) };
        if (seen.has(key)) return { ok: false, status: 400, reason: 'page sent twice: ' + key }; seen.add(key);
        if (A.pageKeyFromTitle(p.title) !== key) return { ok: false, status: 400, reason: 'the title does not match the address for ' + key };
        let list; try { list = typeof p.variations === 'string' ? JSON.parse(p.variations) : p.variations; } catch (e) { return { ok: false, status: 422, reason: key + ': the variation data is not valid JSON' }; }
        if (!Array.isArray(list)) return { ok: false, status: 422, reason: key + ': the variation data is not a list' };
        const clean = list.map((x) => { const o = {}; for (const k of KEEP) if (x && x[k] !== undefined) o[k] = x[k]; return o; });
        const html = renderPage(p.title, clean); const parsed = A.parseHossPage(html); const sane = A.pageSane(parsed);
        if (!parsed.ok || parsed.pageKey !== key) return { ok: false, status: 422, reason: key + ': ' + (parsed.reason || 'the page does not parse') };
        if (!sane.ok) return { ok: false, status: 422, reason: sane.reason };
        files.push({ key, html });
    }
    return { ok: true, files };
}

function readStatus(dataDir, fsImpl = fs) { try { return JSON.parse(fsImpl.readFileSync(path.join(dataDir, 'helper_status.json'), 'utf8')); } catch (e) { return { state: 'never' }; } }
function writeStatus(dataDir, st, fsImpl = fs) { fsImpl.writeFileSync(path.join(dataDir, 'helper_status.json'), JSON.stringify(st, null, 1)); }

/** One request handled (pure apart from the files and the mail). Returns { status, json }. */
async function handle({ method, url, headers, body }, ctx) {
    const { dataDir, token, mail, now, log } = ctx; const fsImpl = ctx.fs || fs; const when = (now ? now() : new Date()).toISOString();
    const auth = String((headers && (headers.authorization || headers.Authorization)) || '').replace(/^Bearer\s+/i, '');
    if (!tokenOk(auth, token)) return { status: 401, json: { ok: false, error: 'token missing or wrong' } };
    const route = String(url).split('?')[0];
    if (method === 'GET' && route === '/ping') return { status: 200, json: { ok: true, helperStatus: readStatus(dataDir, fsImpl), pagesFolder: path.join(dataDir, 'pages') } };
    if (method !== 'POST') return { status: 405, json: { ok: false, error: 'method not allowed' } };
    let data; try { data = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return { status: 400, json: { ok: false, error: 'the body is not JSON' } }; }
    if (route === '/pages') {
        const c = checkDelivery(data);
        if (!c.ok) { log && log(`helper delivery REFUSED (${c.status}): ${c.reason}`); const st = readStatus(dataDir, fsImpl); writeStatus(dataDir, { ...st, lastRefusedAt: when, lastRefusedReason: c.reason }, fsImpl); return { status: c.status, json: { ok: false, error: c.reason } }; }
        const dir = path.join(dataDir, 'pages'); fsImpl.mkdirSync(dir, { recursive: true }); const stamp = new Date(when);
        for (const f of c.files) { const tmp = path.join(dir, '.' + f.key + '.tmp'); fsImpl.writeFileSync(tmp, f.html); fsImpl.utimesSync(tmp, stamp, stamp); fsImpl.renameSync(tmp, path.join(dir, f.key + '.html')); }
        writeStatus(dataDir, { state: 'ok', lastDeliveryAt: when, lastDeliveryPages: c.files.length }, fsImpl);
        log && log(`helper delivery accepted: ${c.files.length} pages written to ${dir}`);
        return { status: 200, json: { ok: true, pages: c.files.length } };
    }
    if (route === '/stopped') {
        const st = readStatus(dataDir, fsImpl); const kind = String(data && data.kind || 'unknown').slice(0, 40), reason = String(data && data.reason || 'no reason given').slice(0, 300);
        const first = st.state !== 'stopped'; const next = { ...st, state: 'stopped', stoppedAt: first ? when : st.stoppedAt, kind, reason, url: data && data.url ? String(data.url).slice(0, 120) : null, httpStatus: data && data.status || null, lastStopReportAt: when };
        log && log(`helper STOPPED: ${kind}: ${reason}`);
        if (first && mail) { try { await mail({ subject: 'Hoss pages need you: log in to hasgllc.com in Chrome', text: 'The Alpina Chrome helper stopped and sent nothing; no stock was changed.\nReason: ' + reason + (next.url ? '\nPage: ' + next.url : '') + '\n\nWhat to do: open Chrome (the profile with the helper), go to hasgllc.com, log in yourself and pass the check if one shows, then open the helper\'s options page and click Resume. Until then the Alpina stock job uses the pages it already has (and refuses them when they are over 4 days old).' }); next.alertedAt = when; } catch (e) { log && log('alert email failed: ' + e.message); } }
        writeStatus(dataDir, next, fsImpl); return { status: 200, json: { ok: true, alerted: first } };
    }
    if (route === '/resumed') { const st = readStatus(dataDir, fsImpl); writeStatus(dataDir, { ...st, state: st.lastDeliveryAt ? 'ok' : 'never', resumedAt: when }, fsImpl); log && log('helper resumed by Jerry'); return { status: 200, json: { ok: true } }; }
    return { status: 404, json: { ok: false, error: 'unknown route' } };
}

/** The line shown in status.txt and the Log. */
function describeHelper(dataDir, now = new Date(), fsImpl = fs) {
    const s = readStatus(dataDir, fsImpl); const ago = (iso) => (iso ? ((now - new Date(iso)) / 864e5).toFixed(1) + ' days ago' : 'never');
    if (s.state === 'stopped') return `HELPER STOPPED (${s.kind}): ${s.reason}  (stopped ${ago(s.stoppedAt)}; last good delivery ${ago(s.lastDeliveryAt)}; Jerry: log in to hasgllc.com in Chrome, then Resume in the helper options)`;
    if (s.state === 'ok') return `helper: last delivery ${ago(s.lastDeliveryAt)}, ${s.lastDeliveryPages} pages${s.lastRefusedAt ? '; last refused delivery ' + ago(s.lastRefusedAt) + ': ' + s.lastRefusedReason : ''}`;
    return 'helper: no delivery yet' + (s.lastRefusedAt ? '; last refused delivery: ' + s.lastRefusedReason : '');
}

function createServer(ctx) {
    return http.createServer((req, res) => {
        const chunks = []; let size = 0, dead = false;
        req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { dead = true; res.writeHead(413, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"too large"}'); req.destroy(); return; } chunks.push(c); });
        req.on('end', async () => { if (dead) return; try { const r = await handle({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') || null }, ctx); res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.json)); } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'receiver error' })); ctx.log && ctx.log('receiver error: ' + e.message); } });
    });
}

if (require.main === module) {
    const args = process.argv.slice(2); const val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
    const dataDir = val('data', '/data'); const port = Number(val('port', process.env.ALPINA_HELPER_PORT || 8765)); fs.mkdirSync(dataDir, { recursive: true });
    const log = (m) => console.log(new Date().toLocaleString('sv-SE', { timeZone: process.env.TZ || 'America/New_York' }).replace(',', '') + ' [helper receiver] ' + m);
    if (args.includes('--describe')) { console.log(describeHelper(dataDir)); process.exit(0); }
    const { token, created } = loadOrCreateToken(dataDir);
    if (args.includes('--print-token')) { console.log('HELPER TOKEN: ' + token); process.exit(0); }
    if (created || args.includes('--show-token')) log('HELPER TOKEN (copy it into the Chrome helper options; it is also in the NAS file data/helper_token.txt): ' + token);
    const mail = async ({ subject, text }) => { if (!process.env.RESEND_API_KEY || !process.env.REPORT_EMAIL || /^TYPE_/.test(process.env.RESEND_API_KEY)) { log('(no email settings: alert email not sent)'); return; } const { Resend } = require('resend'); await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL, subject, text }); };
    createServer({ dataDir, token, mail, log }).listen(port, '0.0.0.0', () => log('listening on port ' + port + ' (needs the token; port must be published by the project to be reachable)'));
}

module.exports = { KEEP, MAX_BODY, EXPECT, tokenOk, loadOrCreateToken, renderPage, checkDelivery, readStatus, writeStatus, handle, describeHelper, createServer };
