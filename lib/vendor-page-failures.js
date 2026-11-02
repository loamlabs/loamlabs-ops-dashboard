// lib/vendor-page-failures.js
// Counts vendor pages that could not be read during a Watcher run, and how many rules were therefore NOT checked, so the email can say so
// (before this the rules were skipped silently: for months 728 Sapim CX-Ray and 25 Berd HAWK27 rules were never checked and nobody was told). PURE.

const MAX_LINES = 8;

function hostPath(url) {
    return String(url || '').replace(/^https?:\/\//, '').replace(/\.js$/, '');
}

function createFailureTracker() {
    const pages = new Map();   // url -> { message, firstRule, skipped }
    return {
        // the first rule that hit the unreadable page (it is skipped too)
        fail(url, message) {
            const p = pages.get(url) || { message, rules: 0 };
            p.rules += 1;
            if (!pages.has(url)) p.message = message;
            pages.set(url, p);
        },
        // every later rule that points at the same page
        skip(url) {
            const p = pages.get(url) || { message: 'page could not be read', rules: 0 };
            p.rules += 1;
            pages.set(url, p);
        },
        size() { return pages.size; },
        /** @returns {{title:string, reason:string}[]} attention lines, biggest first, capped */
        lines() {
            const all = [...pages.entries()].sort((a, b) => b[1].rules - a[1].rules);
            const out = all.slice(0, MAX_LINES).map(([url, p]) => ({
                title: `Vendor page not read: ${hostPath(url)}`,
                reason: `${p.message}. ${p.rules} rule${p.rules === 1 ? '' : 's'} not checked this run (their price and stock were left unchanged). The vendor page may have moved or been removed: check the vendor link on these rules.`,
            }));
            if (all.length > MAX_LINES) {
                const rest = all.slice(MAX_LINES);
                out.push({ title: `Vendor pages not read: ${rest.length} more`, reason: `${rest.reduce((n, [, p]) => n + p.rules, 0)} more rules were not checked.` });
            }
            return out;
        },
    };
}

module.exports = { createFailureTracker, MAX_LINES, hostPath };
