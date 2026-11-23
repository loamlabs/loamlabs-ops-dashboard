// tools/alpina-chrome-helper/core.js
// The logic of the Alpina Chrome helper, with no browser and no network in it (the extension's service worker and the tests both use this file).
// The helper runs in JERRY'S OWN Chrome, signed in to Hoss by Jerry. It only loads the 8 Alpina product pages with the session Jerry already has, reads the stock data that is in each page,
// and sends it to the NAS job. It never logs in, never touches a login form, never solves or works around a human check (Cloudflare), never reads cookies or passwords.
// STOP RULE: if Chrome is logged out, shows a login page, a challenge / captcha ("Just a moment", "verify you are human"), a 403 or a 429, or the page has no stock data: stop at once, retry nothing,
// send nothing but "stopped", and stay stopped until Jerry logs in himself and clicks Resume.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.AlpinaHelperCore = factory(); })(typeof self !== 'undefined' ? self : this, function () {
    const HOST = 'https://hasgllc.com';
    // the same 8 addresses as lib/alpina-hoss.js (HOSS_PAGES); nothing else is ever opened
    const PAGES = [
        ['extralite-round-j-bend', '/product/alpina-extralite-round-j-bend/'], ['extralite-round-straight-pull', '/product/alpina-extralite-round-straight-pull/'],
        ['extralite-aero-j-bend', '/product/alpina-extralite-aero-j-bend/'], ['extralite-aero-straight-pull', '/product/alpina-extralite-aero-straight-pull/'],
        ['ultralite-round-j-bend', '/product/alpina-ultralite-round-j-bend/'], ['ultralite-round-straight-pull', '/product/alpina-ultralite-round-straight-pull/'],
        ['ultralite-aero-j-bend', '/product/alpina-ultralite-aero-j-bend/'], ['ultralite-aero-straight-pull', '/product/alpina-ultralite-aero-straight-pull/'],
    ].map(([key, path]) => ({ key, path, url: HOST + path }));
    const MIN_WAIT_MS = 5000, MAX_WAIT_MS = 10000;     // between two pages
    const BLOCK_TEXT = /verify (that )?you are (a )?human|are you a robot|captcha|cf-challenge|just a moment\.\.\.|attention required|access denied|unusual traffic/i;
    const KEEP = ['attributes', 'availability_html', 'is_in_stock', 'max_qty', 'sku', 'variation_id'];   // nothing else leaves the browser (no prices)

    /** What a page snapshot (taken in the tab) says. snap = { url, title, status (HTTP status of the page or null), hasPassword (bool), hasVariations (bool), bodyText (first 3000 chars) } */
    function classify(snap, expectedUrl) {
        const s = snap || {}; const status = Number(s.status) || null; const text = String(s.bodyText || ''); const title = String(s.title || '');
        if (status === 403) return { ok: false, kind: '403', reason: 'the site answered 403 (blocked)', status };
        if (status === 429) return { ok: false, kind: '429', reason: 'the site answered 429 (too many requests)', status };
        if (BLOCK_TEXT.test(title) || (!s.hasVariations && BLOCK_TEXT.test(text))) return { ok: false, kind: 'challenge', reason: 'Chrome shows a human check / challenge page (open hasgllc.com in Chrome and pass it yourself)' };
        let path = ''; try { path = new URL(s.url).pathname; } catch (e) { path = ''; }
        if (/\/(my-account|login|wp-login)/i.test(path) || (s.hasPassword && !s.hasVariations)) return { ok: false, kind: 'logged-out', reason: 'Chrome is logged out of hasgllc.com (the login page is showing): log in yourself in Chrome' };
        if (expectedUrl && s.url && !String(s.url).startsWith(expectedUrl.replace(/\/$/, ''))) return { ok: false, kind: 'wrong-page', reason: 'the tab ended on another address (' + String(s.url).slice(0, 80) + ') than the product page' };
        if (status && status >= 300) return { ok: false, kind: 'http-' + status, reason: 'the site answered ' + status };
        if (!s.hasVariations) return { ok: false, kind: 'no-data', reason: 'the page has no stock data (variation list): not fully loaded, or the page layout changed' };
        return { ok: true };
    }

    /** The variation list as the page holds it (an array, or the attribute text) -> only the safe fields (prices, images, dimensions are dropped). */
    function stripVariations(v) {
        let list = v; if (typeof v === 'string') { list = JSON.parse(v); }
        if (!Array.isArray(list)) throw new Error('the variation data is not a list');
        return list.map((x) => { const o = {}; for (const k of KEEP) if (x && x[k] !== undefined) o[k] = x[k]; return o; });
    }

    /** Is a run due? lastRunAt = ms or null. The helper never runs more often than intervalDays (2 or 3; default 3), with a small tolerance so the daily wake-ups do not slip a day. */
    function runDue(now, lastRunAt, intervalDays) {
        const d = Math.min(3, Math.max(2, Number(intervalDays) || 3)); if (!lastRunAt) return true; return now - lastRunAt >= (d * 24 - 1) * 3600e3;
    }
    const randomWait = (rnd = Math.random) => MIN_WAIT_MS + Math.floor(rnd() * (MAX_WAIT_MS - MIN_WAIT_MS));

    /**
     * One run. Everything outside is injected: openAndRead(page) -> snapshot + variations (a fresh tab each time), post(path, body) -> { ok, status }, sleep(ms), now().
     * @returns {{ ok: boolean, delivered?: number, stopped?: {kind, reason, url, status} }}
     * Pages are loaded one at a time; the first problem stops everything: no retry, nothing sent except the stop notice; a failed delivery is not retried either.
     */
    async function runOnce(deps) {
        const pagesOut = [];
        for (let i = 0; i < PAGES.length; i++) {
            const p = PAGES[i];
            if (i > 0) await deps.sleep(randomWait(deps.random));
            let r; try { r = await deps.openAndRead(p); } catch (e) { r = { snap: null, error: String(e && e.message || e) }; }
            if (r.error) return stop(deps, { kind: 'browser', reason: 'Chrome could not load the page (' + r.error.slice(0, 100) + ')', url: p.url });
            const c = classify(r.snap, p.url); if (!c.ok) return stop(deps, { kind: c.kind, reason: c.reason, url: p.url, status: c.status });
            let variations; try { variations = stripVariations(r.variations); } catch (e) { return stop(deps, { kind: 'no-data', reason: 'the variation data could not be read (' + e.message + ')', url: p.url }); }
            pagesOut.push({ key: p.key, url: p.url, title: r.snap.title, variations: JSON.stringify(variations) });
        }
        const res = await deps.post('/pages', { sentAt: deps.now(), pages: pagesOut });
        if (!res || !res.ok) return { ok: false, stopped: { kind: 'delivery', reason: 'the NAS did not accept the pages (HTTP ' + (res && res.status) + (res && res.text ? ': ' + String(res.text).slice(0, 120) : '') + ')', url: null } };
        return { ok: true, delivered: pagesOut.length };
    }
    async function stop(deps, info) { try { await deps.post('/stopped', { at: deps.now(), kind: info.kind, reason: info.reason, url: info.url || null, status: info.status || null }); } catch (e) { /* the NAS may be unreachable: the helper still stops */ } return { ok: false, stopped: info }; }

    return { HOST, PAGES, MIN_WAIT_MS, MAX_WAIT_MS, BLOCK_TEXT, KEEP, classify, stripVariations, runDue, randomWait, runOnce };
});
