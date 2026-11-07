// lib/watcher-safety.js
// Safety nets for the Vendor Watcher. Pure.
//   FLIP CAP: one run may change the stock state (close OR open) of at most FLIP_CAP variants per vendor; the rest are held and reported in ONE line.
//     Why 40: real days change 0 to 9 variants (sync_logs); the biggest single event on Project321 is a release or restock of one page, 8 colors x 2 hole counts = 16 on a
//     rear, so 40 allows two or three pages at once. A broken vendor page flips hundreds, so it is stopped.
//   TWO-RUN CONFIRMATION (polite vendors): a flip is written only when the vendor showed the same state on the PREVIOUS run too (watcher_rules.last_availability).
//   TIME BUDGET: stop cleanly at 270 s (the function is killed at 300 s; the guard after the Watcher skips itself above 240 s).
//   URL BREAKER: a single vendor page where most live items suddenly have no match (the page changed) must not deny them all.
//   BASELINE (tag 'baseline'): the rule is evaluated but nothing is written to Shopify; the proposals are collected in one line per product.
//   AUTO-APPROVE (tag 'auto-approve-oos'): a close does not wait for approval; it is logged and emailed as one line per product.
const FLIP_CAP = 40;
const TIME_BUDGET_MS = 270000;
const URL_BREAKER_MIN = 3;       // at least 3 live unmatched on one page
const URL_BREAKER_RATIO = 0.5;   // and more than half of that page's live items

const hasTag = (rule, t) => Array.isArray(rule && rule.tags) && rule.tags.includes(t);

/** Cap per vendor: at least FLIP_CAP, or 5% of that vendor's rules when that is more (Sapim has 5,440 rules; 5% = 272). */
const flipCapFor = (ruleCount) => Math.max(FLIP_CAP, Math.ceil((ruleCount || 0) * 0.05));

function createFlipLimiter(capOrFn = FLIP_CAP) {
    const capOf = (v) => (typeof capOrFn === 'function' ? capOrFn(v) : capOrFn);
    const used = {}, held = {};
    return {
        /** @returns {boolean} true = go ahead and write this flip */
        tryFlip(vendor) { const v = vendor || 'unknown'; if ((used[v] || 0) >= capOf(v)) { held[v] = (held[v] || 0) + 1; return false; } used[v] = (used[v] || 0) + 1; return true; },
        lines() { return Object.entries(held).map(([v, n]) => `${v}: ${n} stock change${n === 1 ? '' : 's'} NOT written this run (limit of ${capOf(v)} per vendor per run reached). Check the vendor's page before the next run.`); },
        held, used,
    };
}

/** Does a close (deny) need a human approval? Not for 'auto-approve-oos' rows, and not in 'baseline' mode (nothing is written there, the proposals are grouped instead). */
const closeNeedsApproval = ({ needsStockUpdate, stockAction, rule }) => !!needsStockUpdate && stockAction === 'deny' && !hasTag(rule, 'auto-approve-oos') && !hasTag(rule, 'baseline');

/** Polite vendors: write a flip only when the vendor showed the same state on the previous run too. */
const confirmedTwice = (rule, available) => rule && typeof rule.last_availability === 'boolean' && rule.last_availability === !!available;

const timeBudgetExceeded = (startedAtMs, now = Date.now(), budgetMs = TIME_BUDGET_MS) => now - startedAtMs > budgetMs;

/** Per-page breaker: stats[url] = { live, noMatch }. */
function urlBreakerTripped(s) { return !!s && s.noMatch >= URL_BREAKER_MIN && s.live > 0 && s.noMatch / s.live > URL_BREAKER_RATIO; }

/** One line per product for grouped changes. items: [{ product, action: 'closed'|'opened'|'would close'|'would open' }] */
function groupLines(items) {
    const by = new Map();
    for (const it of items || []) { const k = it.product || 'unknown'; const m = by.get(k) || {}; m[it.action] = (m[it.action] || 0) + 1; by.set(k, m); }
    return [...by.entries()].map(([product, m]) => `${product}: ${Object.entries(m).map(([a, n]) => `${n} color${n === 1 ? '' : 's'} ${a}`).join(', ')}`);
}

/** "Project321 G3 6-Bolt Rear Hub - 12x148mm (32h / Black)" -> "Project321 G3 6-Bolt Rear Hub - 12x148mm" */
const productOfTitle = (title) => String(title || '').replace(/\s*\([^()]*\)\s*$/, '').trim();

module.exports = { closeNeedsApproval, flipCapFor, FLIP_CAP, TIME_BUDGET_MS, URL_BREAKER_MIN, URL_BREAKER_RATIO, createFlipLimiter, confirmedTwice, timeBudgetExceeded, urlBreakerTripped, groupLines, productOfTitle, hasTag };
