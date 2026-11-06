// lib/watcher-fetch.js
// How the Vendor Watcher reads a vendor page. Plain CommonJS, pure apart from the injected fetch and sleep.
//   - every request has a 10 second timeout (before: none, a hung server held the whole run until Vercel killed it at 300 s)
//   - a "polite" vendor (tag 'polite' on the rule, or Project321): an honest user agent, ONE attempt, NO retry after 429 or 403 (a block is a block, we do not press on),
//     and 5 seconds between pages instead of 1
//   - every other vendor keeps today's behaviour (browser-like agent, up to 3 tries on 429/503, 4 s apart), now with the timeout
const HONEST_UA = 'LoamLabsVendorWatcher/1.0 (+https://loamlabsusa.com)';
const FETCH_TIMEOUT_MS = 10000;
const DEFAULT_GAP_MS = 1000;
const POLITE_GAP_MS = 5000;
const POLITE_VENDORS = ['project321'];

const tagsOf = (rule) => (Array.isArray(rule && rule.tags) ? rule.tags : []);
function isPoliteRule(rule) {
    if (!rule) return false;
    return tagsOf(rule).includes('polite') || POLITE_VENDORS.includes(String(rule.vendor_name || '').trim().toLowerCase());
}
const gapMs = (polite) => (polite ? POLITE_GAP_MS : DEFAULT_GAP_MS);

/** One request with a timeout. Throws an Error with .status (number) for a bad HTTP status and .timeout = true for a timeout. */
async function fetchOnce({ url, headers, fetchFn = fetch, timeoutMs = FETCH_TIMEOUT_MS }) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const res = await fetchFn(url, { headers, signal: ctl.signal });
        if (!res.ok) { const e = new Error(`Fetch failed (${res.status})`); e.status = res.status; throw e; }
        return await res.text();
    } catch (err) {
        if (err && (err.name === 'AbortError' || ctl.signal.aborted)) { const e = new Error(`Fetch timed out after ${Math.round(timeoutMs / 1000)} s`); e.timeout = true; throw e; }
        throw err;
    } finally { clearTimeout(timer); }
}

/**
 * @param {object} p { url, polite, fetchFn, sleep(ms), randomUA, timeoutMs, retryWaitMs }
 * @returns {Promise<string>} the response text; throws on failure (the caller marks the URL failed and skips its rules, as before)
 */
async function fetchVendorText({ url, polite = false, fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), randomUA = 'Mozilla/5.0', timeoutMs = FETCH_TIMEOUT_MS, retryWaitMs = 4000 }) {
    if (polite) {
        try { return await fetchOnce({ url, headers: { 'User-Agent': HONEST_UA }, fetchFn, timeoutMs }); }
        catch (e) { if (e.status === 429 || e.status === 403) e.blocked = true; throw e; }
    }
    let retries = 3;
    for (;;) {
        try { return await fetchOnce({ url, headers: { 'User-Agent': randomUA }, fetchFn, timeoutMs }); }
        catch (e) {
            if ((e.status === 503 || e.status === 429) && --retries > 0) { await sleep(retryWaitMs); continue; }
            if (e.status === 503 || e.status === 429) throw new Error(`Fetch failed (${e.status}) after retries`);
            throw e;
        }
    }
}

module.exports = { fetchVendorText, fetchOnce, isPoliteRule, gapMs, HONEST_UA, FETCH_TIMEOUT_MS, DEFAULT_GAP_MS, POLITE_GAP_MS, POLITE_VENDORS };
