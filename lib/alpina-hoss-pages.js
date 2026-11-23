// lib/alpina-hoss-pages.js
// The NAS job's way of getting the Hoss readings: it reads the 8 Alpina product pages that JERRY SAVES BY HAND (while he is signed in to Hoss in his own browser) into a NAS folder.
// This module touches no network and no Hoss site. It only reads files from a folder. (The live fetch code in alpina-hoss-fetch.js stays in the repo, untouched and unused by the NAS.)
// Rules:
//   * every page is identified by its own title (not its file name), parsed with the same parser as before; the whole run is all-or-nothing:
//     a missing page, a page that does not parse, a half-saved page (no variation data) or a page of another product stops the run with a plain reason;
//   * a page's age is the date of its file; if ANY of the 8 pages is older than MAX_AGE_DAYS (default 4) the job writes nothing and says "pages too old: save them again";
//   * for the scheduled 5:40 am check: it runs only when ALL 8 pages are newer than the last read and the pages differ from the last read (a re-upload of old pages does not count);
//     otherwise it skips quietly; once the pages have grown older than MAX_AGE_DAYS it sends ONE alert email (per set of pages).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HOSS_PAGES, parseHossPage, pageSane } = require('./alpina-hoss');

const MAX_AGE_DAYS = 4;
const DAY = 864e5;
const KEYS = Object.keys(HOSS_PAGES);

/** Scan a folder: every .html file, parsed. Returns { entries: [{ file, mtimeMs, parsed }], ignored: [file] } (a file that is not an Alpina page is "ignored", never an error). */
function scanPagesDir(dir, fsImpl = fs) {
    let names; try { names = fsImpl.readdirSync(dir); } catch (e) { return { entries: [], ignored: [], error: `the pages folder ${dir} cannot be read (${e.code || e.message})` }; }
    const entries = [], ignored = [];
    for (const f of names.filter((n) => /\.html?$/i.test(n)).sort()) {
        const full = path.join(dir, f);
        let st; try { st = fsImpl.statSync(full); } catch (e) { continue; } if (!st.isFile()) continue;
        let html; try { html = fsImpl.readFileSync(full, 'utf8'); } catch (e) { ignored.push(f + ' (cannot be read)'); continue; }
        const parsed = parseHossPage(html);
        if (!parsed.pageKey) { ignored.push(f + ' (not one of the 8 Alpina pages)'); continue; }
        entries.push({ file: f, mtimeMs: st.mtimeMs, parsed });
    }
    return { entries, ignored };
}

/** One page per key: the NEWEST file of that key wins (an older copy of the same page is ignored). */
function pickPages(entries) {
    const by = {}; for (const e of entries) { const k = e.parsed.pageKey; if (!by[k] || e.mtimeMs > by[k].mtimeMs) by[k] = e; }
    return by;
}

/** A fingerprint of what the pages SAY (the stock numbers), not of the files: the same pages uploaded again give the same fingerprint. */
function fingerprint(by) {
    const h = crypto.createHash('sha256');
    for (const k of KEYS) { const e = by[k]; if (!e) continue; h.update(k + ':' + e.parsed.rows.map((r) => `${r.color}${r.lengthMm}=${r.stockQty === null ? 'x' : r.stockQty}`).join(',') + ';'); }
    return h.digest('hex').slice(0, 16);
}

const fmtAge = (ms, now) => ((now - ms) / DAY).toFixed(1) + ' days';

/**
 * The decision for one read of the folder.
 * @param {object} o { dir, now (Date), maxAgeDays, scheduled (bool), force (bool), state { lastPagesReadAt, lastPagesFingerprint, staleAlertedFor }, fsImpl, cfg }
 * @returns {{ status: 'ok'|'skip'|'stopped', reason?: string, kind?: 'stale'|'missing'|'unparseable'|'folder'|'no-new'|'waiting'|'same', alert?: boolean, pages?: object, rows?: object[], fingerprint?: string, newestMs?, oldestMs?, log: string[] }}
 *   ok = use these pages; skip = quiet (scheduled only, nothing to do); stopped = writes nothing, say why (the caller sends the alert email when alert is true).
 */
function evaluatePages(o) {
    const now = o.now || new Date(); const maxAge = o.maxAgeDays === undefined ? MAX_AGE_DAYS : o.maxAgeDays; const state = o.state || {}; const log = [];
    const scan = scanPagesDir(o.dir, o.fsImpl || fs);
    if (scan.error) return { status: 'stopped', kind: 'folder', reason: scan.error, alert: true, log };
    const by = pickPages(scan.entries); const have = KEYS.filter((k) => by[k]); const missing = KEYS.filter((k) => !by[k]);
    const lastRead = state.lastPagesReadAt ? new Date(state.lastPagesReadAt).getTime() : 0;
    const files = KEYS.map((k) => (by[k] ? { key: k, file: by[k].file, ageDays: +((now - by[k].mtimeMs) / DAY).toFixed(2), newerThanLastRead: by[k].mtimeMs > lastRead, rows: by[k].parsed.rows.length, ok: by[k].parsed.ok } : { key: k, file: null }));
    const ages = have.map((k) => by[k].mtimeMs); const newestMs = ages.length ? Math.max(...ages) : null, oldestMs = ages.length ? Math.min(...ages) : null;
    const base = { files, newestMs, oldestMs, log, ignored: scan.ignored };
    if (o.scheduled && !o.force) {   // the quiet gates of the 5:40 am check
        const fresh = have.filter((k) => by[k].mtimeMs > lastRead).length;
        const tooOld = have.length === KEYS.length && (now - oldestMs) / DAY > maxAge;
        if (fresh < KEYS.length) {
            if (tooOld) { const marker = String(oldestMs); if (state.staleAlertedFor !== marker) return { ...base, status: 'skip', kind: 'stale', alert: true, alertMarker: marker, reason: `pages too old: save them again (the oldest saved page is ${fmtAge(oldestMs, now)} old, the limit is ${maxAge} days)` }; return { ...base, status: 'skip', kind: 'stale', reason: `pages still too old (${fmtAge(oldestMs, now)}); the alert was already sent` }; }
            return { ...base, status: 'skip', kind: fresh === 0 ? 'no-new' : 'waiting', reason: fresh === 0 ? `no new pages since the last read (${state.lastPagesReadAt || 'never read'}); save the 8 pages again` : `waiting for all 8 pages: ${fresh} of 8 are newer than the last read` };
        }
    }
    if (missing.length) return { ...base, status: 'stopped', kind: 'missing', alert: true, reason: `missing page${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} (found ${have.length} of 8 in the pages folder)` };
    for (const k of KEYS) { const s = pageSane(by[k].parsed); if (!s.ok) return { ...base, status: 'stopped', kind: 'unparseable', alert: true, reason: `${by[k].file}: ${s.reason}${/data-product_variations|variation data/.test(s.reason) ? ' (the page was probably saved before it finished loading: open it again, wait, and save it again)' : ''}` }; }
    if ((now - oldestMs) / DAY > maxAge) return { ...base, status: 'stopped', kind: 'stale', alert: true, reason: `pages too old: save them again (the oldest saved page is ${fmtAge(oldestMs, now)} old, the limit is ${maxAge} days)` };
    const fp = fingerprint(by);
    if (o.scheduled && !o.force && state.lastPagesFingerprint && state.lastPagesFingerprint === fp) return { ...base, status: 'skip', kind: 'same', reason: 'the pages say exactly what they said at the last read (they were uploaded again, not saved again): save fresh pages' };
    return { ...base, status: 'ok', pages: Object.fromEntries(KEYS.map((k) => [k, by[k].parsed])), fingerprint: fp };
}

/** A readable table of the folder (the "status" answer). */
function pagesStatusText(o) {
    const now = o.now || new Date(); const maxAge = o.maxAgeDays === undefined ? MAX_AGE_DAYS : o.maxAgeDays; const scan = scanPagesDir(o.dir, o.fsImpl || fs);
    if (scan.error) return scan.error;
    const by = pickPages(scan.entries); const lastRead = o.state && o.state.lastPagesReadAt ? new Date(o.state.lastPagesReadAt).getTime() : 0; const L = [`pages folder ${o.dir}: ${KEYS.filter((k) => by[k]).length} of 8 pages found (age limit ${maxAge} days)`];
    for (const k of KEYS) { const e = by[k]; if (!e) { L.push(`  MISSING  ${k}`); continue; } const age = (now - e.mtimeMs) / DAY; const s = pageSane(e.parsed); L.push(`  ${s.ok ? (age > maxAge ? 'TOO OLD' : e.mtimeMs > lastRead ? 'new     ' : 'read    ') : 'BAD PAGE'}  ${k}: ${e.file} (${age.toFixed(1)} days old, ${e.parsed.rows.length} variants${s.ok ? '' : ': ' + s.reason})`); }
    if (scan.ignored.length) L.push('  ignored files: ' + scan.ignored.join('; '));
    return L.join('\n');
}

module.exports = { MAX_AGE_DAYS, KEYS, scanPagesDir, pickPages, fingerprint, evaluatePages, pagesStatusText };
