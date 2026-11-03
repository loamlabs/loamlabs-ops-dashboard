// lib/signature-build/auth.js
// Two secrets are required on every call: the dashboard password (x-dashboard-auth) AND the separate SIGNATURE_TOOL_KEY (x-signature-tool-key).
// Without SIGNATURE_TOOL_KEY on the server the tool refuses everything (it never falls back to the dashboard password alone).
// 5 wrong tries from one address lock that address for 15 minutes.
const crypto = require('crypto');
const { ToolError } = require('./util');

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function same(a, b) {
    const x = crypto.createHash('sha256').update(String(a ?? '')).digest();
    const y = crypto.createHash('sha256').update(String(b ?? '')).digest();
    return crypto.timingSafeEqual(x, y) && String(a ?? '') !== '' && String(b ?? '') !== '';
}

const clientKey = (headers) => String((headers['x-forwarded-for'] || '')).split(',')[0].trim() || 'unknown';

/** @param {object} p { headers, env, db, now? } -> resolves when allowed, throws ToolError otherwise */
async function checkAccess({ headers, env, db, now = Date.now() }) {
    if (!env.SIGNATURE_TOOL_KEY || !env.DASHBOARD_PASSWORD) throw new ToolError('NOT_CONFIGURED', 'The Signature Build tool is not switched on yet (the tool key has not been added).', 503);
    const key = clientKey(headers);
    if ((await db.countFailures(key, now - WINDOW_MS)) >= MAX_FAILURES) throw new ToolError('LOCKED_OUT', 'Too many wrong passwords. Try again in 15 minutes.', 429);
    const okDash = same((headers['x-dashboard-auth'] || '').trim(), (env.DASHBOARD_PASSWORD || '').trim());
    const okKey = same((headers['x-signature-tool-key'] || '').trim(), (env.SIGNATURE_TOOL_KEY || '').trim());
    if (!(okDash && okKey)) {
        await db.recordFailure(key, now);
        throw new ToolError('UNAUTHORIZED', 'Not signed in to the dashboard.', 401);
    }
}

module.exports = { checkAccess, MAX_FAILURES, WINDOW_MS };
