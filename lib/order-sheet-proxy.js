// lib/order-sheet-proxy.js
// Server side of the dashboard's Order sheet: calls Backend 1's read-only endpoints (loamlabs-spoke-automation /api/order-sheet and /api/order-sheet-image) with the shared
// secret. The secret and the host come from the environment (ORDER_SHEET_SECRET, ORDER_SHEET_BASE_URL) and are NEVER put into a response. fetch is injected for tests.
const { normalizeOrderNumber, findForbiddenKeys, messageFor } = require('./order-sheet-view');

const WHEELS = ['front', 'rear'], VIEWS = ['all', 'high', 'low'];
const fail = (status, error, upstream) => ({ status, body: { ok: false, error, message: messageFor(status, { error }) }, upstreamStatus: upstream });

/** the request is from the dashboard when the header equals DASHBOARD_PASSWORD (the same check as the other routes) */
function isDashboardAuthorized(headers, env = process.env) {
    const given = headers && headers['x-dashboard-auth']; const want = env.DASHBOARD_PASSWORD;
    return typeof given === 'string' && typeof want === 'string' && want.trim() !== '' && given.trim() === want.trim();
}
function setupOf(env = process.env) {
    const secret = env.ORDER_SHEET_SECRET && String(env.ORDER_SHEET_SECRET).trim(); let base = env.ORDER_SHEET_BASE_URL && String(env.ORDER_SHEET_BASE_URL).trim().replace(/\/+$/, '');
    if (!secret || !base || !/^https?:\/\//i.test(base)) return null;
    return { secret, base };
}

async function callUpstream({ url, secret, fetchFn, timeoutMs }) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetchFn(url, { method: 'GET', headers: { 'x-order-sheet-secret': secret, Accept: '*/*' }, signal: ctl.signal, cache: 'no-store' }); }
    finally { clearTimeout(timer); }
}
const readJson = async (res) => { try { return await res.json(); } catch (e) { return null; } };

async function getSheet({ order, env = process.env, fetchFn = fetch, timeoutMs = 15000 }) {
    const n = normalizeOrderNumber(order); if (!n) return fail(400, 'BAD_ORDER_NUMBER');
    const su = setupOf(env); if (!su) return fail(503, 'SETUP_MISSING');
    let res; try { res = await callUpstream({ url: `${su.base}/api/order-sheet?order=${n}`, secret: su.secret, fetchFn, timeoutMs }); } catch (e) { return fail(502, 'UNREACHABLE'); }
    const body = await readJson(res);
    if (!res.ok || !body || body.ok !== true || !body.sheet) {
        const code = body && body.error; const status = [400, 401, 404, 422, 502].includes(res.status) ? res.status : (res.status >= 500 ? 502 : 502);
        return { status, body: { ok: false, error: code || 'UPSTREAM', message: messageFor(res.status, body) }, upstreamStatus: res.status };
    }
    if (findForbiddenKeys(body.sheet).length) return fail(502, 'PRIVACY_BLOCK');
    return { status: 200, body: { ok: true, sheet: body.sheet } };
}

async function getImage({ order, wheel, view = 'all', width = 600, env = process.env, fetchFn = fetch, timeoutMs = 20000 }) {
    const n = normalizeOrderNumber(order); if (!n) return fail(400, 'BAD_ORDER_NUMBER');
    if (!WHEELS.includes(wheel) || !VIEWS.includes(view)) return fail(404, 'NO_SUCH_IMAGE');
    const w = Math.min(1200, Math.max(200, Math.round(Number(width) || 600)));
    const su = setupOf(env); if (!su) return fail(503, 'SETUP_MISSING');
    let res; try { res = await callUpstream({ url: `${su.base}/api/order-sheet-image?order=${n}&wheel=${wheel}&view=${view}&width=${w}`, secret: su.secret, fetchFn, timeoutMs }); } catch (e) { return fail(502, 'UNREACHABLE'); }
    const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (res.ok && /image\/png/i.test(type)) return { status: 200, contentType: 'image/png', buffer: Buffer.from(await res.arrayBuffer()) };
    const body = await readJson(res); const code = body && body.error;
    return { status: [400, 401, 404, 422, 502].includes(res.status) ? res.status : 502, body: { ok: false, error: code || 'UPSTREAM', message: messageFor(res.status, body) }, upstreamStatus: res.status };
}

module.exports = { WHEELS, VIEWS, isDashboardAuthorized, setupOf, getSheet, getImage };
