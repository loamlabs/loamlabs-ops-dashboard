// lib/broken-links.js
// The "Broken vendor links: fix needed" section at the top of the daily Watcher email. PURE (no network, no database).
//
// One line per broken vendor PAGE (not per rule): vendor, product name(s), rule count, the link, what the Watcher saw, days in a row, "NEW today".
// "Since" is kept inside the rule's own last_log text as " [since YYYY-MM-DD]" (no new table): the first day a page fails the stamp is today, and
// while the same problem continues the old date is carried over, so the text does not change and the rule row is not rewritten every day.
// A good read overwrites last_log ("Synced ..."), which ends the streak. Only active rules count (watcher-ignore rules are skipped before this).

const SINCE_RE = /\s*\[since (\d{4}-\d{2}-\d{2})\]\s*$/;

const stripSince = (log) => String(log || '').replace(SINCE_RE, '');
const parseSince = (log) => { const m = SINCE_RE.exec(String(log || '')); return m ? m[1] : null; };

/** The text to store in last_log: base + " [since DATE]". Keeps the old date when the same problem was already logged. */
function stampSince(baseLog, oldLog, todayIso) {
    const today = String(todayIso).slice(0, 10);
    const old = String(oldLog || '');
    const since = stripSince(old) === baseLog && parseSince(old) ? parseSince(old) : today;
    return `${baseLog} [since ${since}]`;
}

/** What the Watcher saw, in plain words. Order matters: the first match wins. */
function classify(message) {
    const m = String(message || '');
    if (/redirected to/i.test(m)) return 'redirected to another page';
    if (/\((404|410)\)/.test(m)) return 'page not found (404)';
    const st = /Fetch failed \((\d{3})\)/.exec(m);
    if (st) return `page error (HTTP ${st[1]})`;
    if (/timed out/i.test(m)) return 'page timed out';
    if (/did not return readable|JSON Parse/i.test(m)) return 'page could not be read (parse failed)';
    if (/Found 0 matches/i.test(m)) return 'product not found on the page';
    return 'page could not be read';
}

const whole = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cleanUrl = (u) => String(u || '').replace(/\.js$/, '');

function createLinkReport() {
    const pages = new Map();   // url -> { vendor, products:Set, rules, what, since }
    return {
        /** one affected rule. since = the date from the stamped last_log */
        add({ url, vendor, product, what, since }) {
            const k = cleanUrl(url);
            const p = pages.get(k) || { vendor: vendor || 'unknown', products: new Set(), rules: 0, what, since };
            p.rules += 1; if (product) p.products.add(product);
            pages.set(k, p);
        },
        size: () => pages.size,
        /** @returns {{count:number, html:string, lines:string[]}} empty section (count 0, html '') when nothing is broken */
        section(todayIso, { maxLines = 25 } = {}) {
            const today = String(todayIso).slice(0, 10);
            const all = [...pages.entries()].map(([url, p]) => ({ url, ...p, days: Math.max(1, whole(today, p.since || today) + 1) }))
                .sort((a, b) => b.days - a.days || b.rules - a.rules);
            if (!all.length) return { count: 0, html: '', lines: [] };
            const line = (p) => {
                const prods = [...p.products]; const names = prods.slice(0, 2).join('; ') + (prods.length > 2 ? ` (+${prods.length - 2} more)` : '');
                const when = p.days === 1 ? '<b style="color:#b91c1c;">NEW today</b>' : `failing ${p.days} days in a row, since ${p.since}`;
                return { html: `<li style="margin-bottom:8px;"><b>${esc(p.vendor)}</b>: ${esc(names || 'unknown product')} (${p.rules} rule${p.rules === 1 ? '' : 's'} use this page)<br>` +
                    `<a href="${esc(p.url)}">${esc(p.url)}</a><br><small>Saw: ${esc(p.what)}. ${when}.</small></li>`,
                    text: `${p.vendor}: ${names} (${p.rules} rules) ${p.url} | ${p.what} | ${p.days === 1 ? 'NEW today' : `${p.days} days, since ${p.since}`}` };
            };
            const shown = all.slice(0, maxLines).map(line);
            const more = all.length - shown.length;
            const html = `<div style="border:2px solid #b91c1c;border-radius:8px;padding:12px 16px;margin-bottom:20px;background:#fef2f2;">` +
                `<h3 style="margin:0 0 8px;color:#b91c1c;">Broken vendor links: fix needed (${all.length})</h3>` +
                `<ul style="padding-left:18px;margin:0;">${shown.map((s) => s.html).join('')}${more > 0 ? `<li>...and ${more} more broken page${more === 1 ? '' : 's'}</li>` : ''}</ul>` +
                `<p style="margin:10px 0 0;font-size:13px;"><b>How to fix:</b> open the dashboard, search for the product, open its rule(s), paste the vendor's new product link into "Vendor URL" and save. ` +
                `Until it is fixed, those rules are not checked (price and stock stay as they are). If the vendor no longer sells it, tag the rules <code>watcher-ignore</code> and this line goes away.</p></div>`;
            return { count: all.length, html, lines: shown.map((s) => s.text) };
        },
    };
}

/** Same page, different path after following redirects (ignores http/https, case, trailing slash, .js). */
function redirectedAway(requestedUrl, finalUrl) {
    try {
        const norm = (u) => new URL(u).pathname.replace(/\.js$/i, '').replace(/\/+$/, '').toLowerCase();
        return norm(requestedUrl) !== norm(finalUrl);
    } catch (e) { return false; }
}

module.exports = { stampSince, stripSince, parseSince, classify, createLinkReport, redirectedAway };
