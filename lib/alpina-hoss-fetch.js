// lib/alpina-hoss-fetch.js
// The thin fetch layer of the Alpina stock reader. IT IS RUN ONLY BY JERRY'S OWN SCHEDULER (never by an assistant): it signs in once and reads 8 product pages.
// Every network call goes through `fetchImpl` and every wait through `sleep`, so the tests run it against a local mock server and the saved pages (no real site is touched in tests).
// Politeness and stop rules (Jerry's rules):
//   * honest user agent (name + info@loamlabsusa.com); the site's robots.txt is fetched at run time and the run stops if a path we need is disallowed for us (the "*" rules apply to us);
//   * about 8 page requests, one at a time, 5 to 10 seconds apart; never touches the cart; submits no form except the login form; clicks nothing;
//   * STOPS at the first 403, 429, captcha / "verify you are human" / challenge page, login redirect loop, or a page that does not parse; at most ONE retry (network error or 5xx only);
//   * a stopped run returns { ok:false, stopped:{ reason, url, status } } and NOTHING must be changed from it.
// Credentials come from env HOSS_LOGIN_USER and HOSS_LOGIN_PASSWORD; they are never logged and never put in a message.
const { HOSS_PAGES, HOSS_HOST, parseHossPage, pageSane, robotsAllows } = require('./alpina-hoss');

const UA = 'LoamLabsStockReader/1.0 (+info@loamlabsusa.com)';
const UA_TOKEN = 'loamlabsstockreader';
const LOGIN_PATH_DEFAULT = '/my-account/';

const BLOCK_TEXT = /verify (that )?you are (a )?human|are you a robot|captcha|cf-challenge|just a moment\.\.\.|attention required|access denied|unusual traffic/i;
const hasPasswordInput = (html) => /<input[^>]+type=["']password["']/i.test(html);

/** Very small cookie jar over fetch's Set-Cookie headers. */
function makeJar() {
    const c = new Map();
    return {
        absorb(res) { const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []); for (const s of list) { const [kv] = String(s).split(';'); const i = kv.indexOf('='); if (i > 0) { const name = kv.slice(0, i).trim(), val = kv.slice(i + 1).trim(); if (val === '' || /;\s*max-age=0/i.test(s)) c.delete(name); else c.set(name, val); } } },
        header() { return [...c.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
        size() { return c.size; },
    };
}

/** The login form: the form that holds the password input. Returns { action, method, fields: [{name,value,type}] } or null. */
function parseLoginForm(html, baseUrl) {
    const forms = String(html || '').match(/<form[\s\S]*?<\/form>/gi) || [];
    for (const f of forms) {
        if (!hasPasswordInput(f)) continue;
        const head = /<form([^>]*)>/i.exec(f)[1]; const act = /action=["']([^"']*)["']/i.exec(head); const meth = /method=["']([^"']*)["']/i.exec(head);
        const fields = []; const re = /<input([^>]*)>/gi; let m;
        while ((m = re.exec(f))) { const a = m[1]; const name = (/name=["']([^"']*)["']/i.exec(a) || [])[1]; if (!name) continue; const type = ((/type=["']([^"']*)["']/i.exec(a) || [])[1] || 'text').toLowerCase(); const value = (/value=["']([^"']*)["']/i.exec(a) || [])[1] || ''; fields.push({ name, type, value }); }
        return { action: act && act[1] ? new URL(act[1].replace(/&amp;/g, '&'), baseUrl).href : baseUrl, method: (meth ? meth[1] : 'post').toLowerCase(), fields };
    }
    return null;
}

/**
 * @param {object} o { env, fetchImpl, sleep, log, host, minWaitMs, maxWaitMs, random, cfg }
 * @returns {Promise<{ ok: boolean, pages: object, log: string[], stopped?: { reason: string, url?: string, status?: number } }>}
 */
async function readHoss(o) {
    const env = o.env || {}; const host = o.host || HOSS_HOST; const f = o.fetchImpl || fetch; const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const rnd = o.random || Math.random; const minW = o.minWaitMs === undefined ? 5000 : o.minWaitMs, maxW = o.maxWaitMs === undefined ? 10000 : o.maxWaitMs; const log = []; const say = (m) => { log.push(m); if (o.log) o.log(m); };
    const stop = (reason, url, status) => ({ ok: false, pages: {}, log, stopped: { reason, url, status } });
    const user = env.HOSS_LOGIN_USER, pass = env.HOSS_LOGIN_PASSWORD;
    if (!user || !pass) return stop('HOSS_LOGIN_USER / HOSS_LOGIN_PASSWORD are not set in the environment');
    const jar = makeJar(); let lastRequestAt = 0;
    async function get(url, { retry = true, method = 'GET', body = null, headers = {} } = {}) {
        const gap = minW + Math.floor(rnd() * Math.max(0, maxW - minW)); const wait = lastRequestAt ? Math.max(0, lastRequestAt + gap - Date.now()) : 0; if (wait) await sleep(wait);
        let res;
        for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
            try { lastRequestAt = Date.now(); res = await f(url, { method, redirect: 'manual', body, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8', ...(jar.size() ? { Cookie: jar.header() } : {}), ...headers } }); jar.absorb(res); if (res.status >= 500 && attempt === 0 && retry) { await sleep(minW); continue; } break; }
            catch (e) { if (attempt === 0 && retry) { await sleep(minW); continue; } return { err: String(e && e.message || e).slice(0, 120) }; }
        }
        return { res };
    }
    // 1. robots.txt (general rules apply to us)
    const rb = await get(host + '/robots.txt'); if (rb.err) return stop('robots.txt could not be read: ' + rb.err, host + '/robots.txt');
    if (rb.res.status === 403 || rb.res.status === 429) return stop('robots.txt answered ' + rb.res.status, host + '/robots.txt', rb.res.status);
    const robots = rb.res.status === 200 ? await rb.res.text() : '';
    const loginPath = env.HOSS_LOGIN_PATH || LOGIN_PATH_DEFAULT; const needed = [loginPath, ...Object.values(HOSS_PAGES).map((p) => p.path)];
    for (const p of needed) if (!robotsAllows(robots, p, UA_TOKEN)) return stop(`robots.txt disallows ${p} for us`, host + p);
    say('robots.txt allows the login page and the 8 product pages');
    // 2. login: the only form we ever submit
    let r = await get(host + loginPath); if (r.err) return stop('login page could not be read: ' + r.err, host + loginPath);
    let html = r.res.status === 200 ? await r.res.text() : ''; if (r.res.status === 403 || r.res.status === 429) return stop('login page answered ' + r.res.status, host + loginPath, r.res.status);
    if (BLOCK_TEXT.test(html)) return stop('login page shows a challenge / captcha / block page', host + loginPath);
    const form = parseLoginForm(html, host + loginPath); if (!form) return stop('no login form found on the login page (layout changed, or already signed in without cookies)', host + loginPath);
    const pw = form.fields.find((x) => x.type === 'password'); const un = form.fields.find((x) => ['text', 'email'].includes(x.type) && /user|login|log|email/i.test(x.name)) || form.fields.find((x) => ['text', 'email'].includes(x.type));
    if (!pw || !un) return stop('login form has no username or password field', host + loginPath);
    const params = new URLSearchParams(); for (const x of form.fields) { if (x.type === 'checkbox' || x.type === 'radio') continue; if (x.type === 'submit') { params.set(x.name, x.value || 'Log in'); continue; } params.set(x.name, x.name === un.name ? user : x.name === pw.name ? pass : x.value); }
    if (form.method !== 'post') return stop('login form is not a POST form', host + loginPath);
    let hops = 0; r = await get(form.action, { method: 'POST', body: params.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: host + loginPath }, retry: false });
    if (r.err) return stop('login request failed: ' + r.err, form.action);
    while (r.res.status >= 300 && r.res.status < 400 && r.res.headers.get('location')) { if (++hops > 4) return stop('login redirect loop', form.action); const next = new URL(r.res.headers.get('location'), form.action).href; r = await get(next, { retry: false }); if (r.err) return stop('after login: ' + r.err, next); }
    if (r.res.status === 403 || r.res.status === 429) return stop('login answered ' + r.res.status, form.action, r.res.status);
    const after = await r.res.text(); if (BLOCK_TEXT.test(after)) return stop('login ended on a challenge / captcha / block page', form.action);
    if (hasPasswordInput(after) || !/logout|log out|sign out/i.test(after)) return stop('login did not succeed (the password form is still shown, or no logout link): check the credentials by hand', form.action, r.res.status);
    say('signed in');
    // 3. the 8 pages, one at a time
    const pages = {}; let n = 0;
    for (const [key, info] of Object.entries(HOSS_PAGES)) {
        const url = host + info.path; const g = await get(url); n++;
        if (g.err) return stop(`${key}: ${g.err}`, url);
        const status = g.res.status; if (status === 403 || status === 429) return stop(`${key}: the site answered ${status}`, url, status);
        if (status >= 300 && status < 400) return stop(`${key}: redirected (${g.res.headers.get('location') || '?'}): signed out or moved`, url, status);
        if (status !== 200) return stop(`${key}: the site answered ${status}`, url, status);
        const body = await g.res.text(); if (BLOCK_TEXT.test(body) && !/data-product_variations/.test(body)) return stop(`${key}: challenge / captcha / block page`, url, status);
        if (hasPasswordInput(body) && !/data-product_variations/.test(body)) return stop(`${key}: login form shown (session lost)`, url, status);
        const parsed = parseHossPage(body); if (!parsed.ok) return stop(`${key}: ${parsed.reason}`, url, status);
        if (parsed.pageKey !== key) return stop(`${key}: the page is "${parsed.pageKey}"`, url, status);
        const s = pageSane(parsed, o.cfg); if (!s.ok) return stop(s.reason, url, status);
        pages[key] = parsed; say(`${key}: ${parsed.rows.length} variants`);
    }
    return { ok: true, pages, log, requests: n + 3 };
}

module.exports = { UA, UA_TOKEN, makeJar, parseLoginForm, readHoss, BLOCK_TEXT };
