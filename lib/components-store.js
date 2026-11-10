// lib/components-store.js
// Safe read / save of the component library files (rims.json, hubs.json, spokes.json, nipples.json) in the GitHub repo that feeds the customer calculator.
// Plain CommonJS; the network is injected (fetchFn) so tests can use a fake GitHub.
//
// Why: before, a failed read looked like an EMPTY library and the next save published it; a save replaced whatever was on GitHub even if it had changed since
// the tab loaded; invalid rows were saved; every commit said "Update rims.json".
//   - read: any failure (HTTP error, 404, unparsable, not a list) is an ERROR, never []. The content is read by the file's blob sha, so data and sha always match.
//   - save: needs the sha the tab loaded (baseSha). If GitHub's file has a different sha the save is refused (409), nothing is written.
//   - shrink guard: a save that removes more than 5% of the rows (and more than 3) is refused (422) unless the caller says how many removals it accepts.
//   - validation of NEW or CHANGED rows only (rows that are already in the file are never blocked by old problems).
//   - all files of one save are validated before any is written; a no-change save writes nothing; the commit message says what changed.

const FILES = ['rims', 'hubs', 'spokes', 'nipples'];
let mergeRows = null;   // required lazily (lib/components-merge.js requires this file)
const EXTRA = ['deleted-archive', 'excluded'];   // also in component-data/, never served to customers by the calculator API (it reads only the four files above)
const STATUSES = ['active', 'retired'];
const SHRINK_RATIO = 0.05, SHRINK_MIN = 3;
const ERD_MIN = 400, ERD_MAX = 680;
const ERD_KEYS = ['Variant Metafield: custom.rim_erd [number_decimal]', 'Rim ERD', 'rim_erd', 'ERD'];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const first = (row, keys) => { for (const k of keys) if (row && str(row[k]) !== '') return row[k]; return ''; };
const titleOf = (r) => str(first(r, ['Title', 'title', 'Name', 'name'])) || '(no title)';
const vendorOf = (r) => str(first(r, ['Vendor', 'vendor', 'Brand', 'brand']));
const variantIdOf = (r) => str(first(r, ['shopify_variant_id', 'Variant ID']));
/** identity of a row: its Shopify variant id, otherwise vendor + title + options */
const identOf = (r) => [vendorOf(r), titleOf(r), str(r && r['Option1 Value']), str(r && r['Option2 Value'])].join('|').toLowerCase();
// identity of a row: variant id + vendor/title/options (rows that SHARE a variant id, a known data problem, stay distinct); a row without a link: vendor/title/options
const keyOf = (r) => variantIdOf(r) ? `v:${variantIdOf(r)}|${identOf(r)}` : `t:${identOf(r)}`;
const strip = (r) => { const { _isNew, _rawIdx, _editIdx, ...rest } = r || {}; return rest; };   // browser-only fields; _rid stays (it is stored in the file)
const noRid = (r) => { const { _rid, ...rest } = strip(r); return rest; };
const sorted = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
const same = (a, b) => sorted(noRid(a)) === sorted(noRid(b));   // a changed _rid alone is not an edit

const gh = (repo, pat, accept) => ({ Authorization: `Bearer ${pat}`, Accept: accept, 'User-Agent': 'loamlabs-dashboard' });

/** @returns {Promise<{ok:true, data:object[], sha:string}|{ok:false, status:number, error:string}>} */
async function readFile({ fetchFn = fetch, repo, pat, name, allowMissing = false }) {
    const base = `https://api.github.com/repos/${repo}`;
    try {
        const meta = await fetchFn(`${base}/contents/component-data/${name}.json?cb=${Date.now()}`, { headers: gh(repo, pat, 'application/vnd.github.v3+json') });
        if (meta.status === 404 && allowMissing) return { ok: true, data: [], sha: null, missing: true };
        if (!meta.ok) return { ok: false, status: meta.status || 502, error: `Could not read ${name}.json from GitHub (HTTP ${meta.status}).` };
        const info = await meta.json();
        if (!info || !info.sha) return { ok: false, status: 502, error: `GitHub gave no version (sha) for ${name}.json.` };
        const blob = await fetchFn(`${base}/git/blobs/${info.sha}`, { headers: gh(repo, pat, 'application/vnd.github.raw') });
        if (!blob.ok) return { ok: false, status: blob.status || 502, error: `Could not read the content of ${name}.json (HTTP ${blob.status}).` };
        const text = await blob.text();
        let data; try { data = JSON.parse(text); } catch (e) { return { ok: false, status: 502, error: `${name}.json on GitHub is not valid JSON.` }; }
        if (!Array.isArray(data)) return { ok: false, status: 502, error: `${name}.json on GitHub is not a list.` };
        return { ok: true, data, sha: info.sha };
    } catch (e) { return { ok: false, status: 502, error: `Could not reach GitHub: ${String(e.message).slice(0, 80)}` }; }
}

/** keys that stay unique even when the file already holds duplicates: the 2nd row with the same identity gets "#2" */
function keyList(rows) { const n = new Map(); return rows.map((r) => { const k = keyOf(r); const c = (n.get(k) || 0) + 1; n.set(k, c); return c === 1 ? k : `${k}#${c}`; }); }

/** what changes between the current rows and the new rows */
function diffRows(current, next) {
    const ck = keyList(current), nk = keyList(next);
    const cur = new Map(current.map((r, i) => [ck[i], r]));
    const seen = new Set(); const added = [], edited = [], removed = [];
    next.forEach((r, i) => { const k = nk[i]; seen.add(k); if (!cur.has(k)) added.push(r); else if (!same(cur.get(k), r)) edited.push(r); });
    for (const [k, r] of cur) if (!seen.has(k)) removed.push(r);
    // a row that was only RE-KEYED is an edit of the same row, not a delete plus an add: same vendor+title+options (its variant id was corrected),
    // or the same variant id (its title or options were edited)
    for (const gone of removed.slice()) {
        let j = added.findIndex((a2) => identOf(a2) === identOf(gone));
        if (j < 0 && variantIdOf(gone)) {
            const sameId = added.filter((a2) => variantIdOf(a2) === variantIdOf(gone)), goneSame = removed.filter((g2) => variantIdOf(g2) === variantIdOf(gone));
            if (sameId.length === 1 && goneSame.length === 1) j = added.indexOf(sameId[0]);
        }
        if (j >= 0) { edited.push(added[j]); added.splice(j, 1); removed.splice(removed.indexOf(gone), 1); }
    }
    return { added, edited, removed };
}

/** problems in NEW or CHANGED rows. A variant id that is ALREADY duplicated in the file does not block a save; making it more duplicated does. Returns [{title, problems}] */
function validateRows(tab, changedRows, allNextRows, currentRows = []) {
    const out = [];
    const count = (rows) => { const m = new Map(); for (const r of rows) { const v = variantIdOf(r); if (v) m.set(v, (m.get(v) || 0) + 1); } return m; };
    const nextCounts = count(allNextRows), curCounts = count(currentRows);
    for (const r of changedRows) {
        const p = [];
        if (!str(first(r, ['Title', 'title', 'Name', 'name']))) p.push('Title is empty');
        if (!vendorOf(r)) p.push('Vendor is empty');
        if (str(r && r.Status) !== '' && !STATUSES.includes(str(r.Status).toLowerCase())) p.push(`Status must be active or retired (not "${str(r.Status)}")`);
        const v = variantIdOf(r); if (v && nextCounts.get(v) > 1 && nextCounts.get(v) > (curCounts.get(v) || 0)) p.push(`Shopify variant id ${v} is used by more than one row`);
        if (tab === 'rims') {
            const erd = Number(first(r, ERD_KEYS));
            if (!(erd > 0)) p.push('ERD is missing'); else if (erd < ERD_MIN || erd > ERD_MAX) p.push(`ERD ${erd} is outside ${ERD_MIN} to ${ERD_MAX}`);
        }
        if (p.length) out.push({ title: titleOf(r), problems: p });
    }
    return out;
}

const names = (rows, n = 3) => rows.slice(0, n).map(titleOf).join(', ') + (rows.length > n ? ` and ${rows.length - n} more` : '');
function commitMessage(name, d) {
    const parts = [];
    if (d.added.length) parts.push(`added ${d.added.length} (${names(d.added)})`);
    if (d.edited.length) parts.push(`edited ${d.edited.length} (${names(d.edited)})`);
    if (d.removed.length) parts.push(`removed ${d.removed.length} (${names(d.removed)})`);
    return `Dashboard: ${name}.json ${parts.join('; ') || 'no row changes'}`.slice(0, 280);
}

/**
 * @param {object} p { fetchFn, repo, pat, changes: {rims:[...], ...}, baseShas: {rims:'sha'}, allowRemove: {rims: n} }
 * @returns {Promise<{status:number, body:object}>}
 */
async function saveFiles({ fetchFn = fetch, repo, pat, changes, baseShas = {}, allowRemove = {}, confirmDelete = false, statusLookup = null, now = () => new Date().toISOString(), messageOverride = null, restore = false }) {
    const base = `https://api.github.com/repos/${repo}`;
    const plan = []; const mergedFiles = {};
    for (const name of FILES) {
        if (!Array.isArray(changes[name])) continue;
        if (!baseShas[name]) return { status: 400, body: { error: `This page does not know which version of ${name}.json it loaded. Reload the Component library and try again.`, code: 'NO_BASE' } };
        const cur = await readFile({ fetchFn, repo, pat, name });
        if (!cur.ok) return { status: cur.status, body: { error: cur.error + ' Nothing was saved.', code: 'READ_FAILED' } };
        let incoming = changes[name].filter((r) => r && typeof r === 'object').map(strip);
        if (cur.sha !== baseShas[name]) {
            // the file changed since the tab loaded it: combine the two sets of changes when they touch different rows
            const base = await readBlob({ fetchFn, repo, pat, sha: baseShas[name] });
            const conflict = (rows) => ({ status: 409, body: { error: `${name}.json was changed on GitHub after you loaded it` + (rows && rows.length ? ` and the same row(s) were changed on both sides (${rows.slice(0, 4).join(', ')}).` : '.') + ' Reload the Component library, then repeat your change. Nothing was saved.', code: 'CONFLICT', file: name, rows } });
            if (!base) return conflict(null);
            if (!mergeRows) mergeRows = require('./components-merge').mergeRows;
            const m = mergeRows(base, incoming, cur.data);
            if (!m.ok) return conflict(m.conflicts);
            incoming = m.rows; mergedFiles[name] = m.summary;
        }
        const next = incoming;
        const d = diffRows(cur.data, next);
        const shrinkLimit = Math.max(SHRINK_MIN, Math.floor(cur.data.length * SHRINK_RATIO));
        if (!restore && d.removed.length > shrinkLimit && (allowRemove[name] || 0) < d.removed.length) {
            return { status: 422, body: { error: `This save would remove ${d.removed.length} of ${cur.data.length} rows from ${name}.json (${names(d.removed, 5)}). If that is intended, confirm and save again. Nothing was saved.`, code: 'SHRINK', file: name, removing: d.removed.length, total: cur.data.length } };
        }
        // Jerry's rules: a row stays in the library for ever. A row whose Shopify variant is DRAFT, archived or missing can NOT be deleted ("retire instead"); any other delete needs a typed confirmation and is archived.
        if (d.removed.length) {
            if (!confirmDelete) return { status: 422, body: { error: `Deleting rows needs a typed confirmation (${names(d.removed, 5)}). Nothing was saved.`, code: 'CONFIRM_DELETE', file: name, removing: d.removed.length } };
            const ids = d.removed.map(variantIdOf).filter(Boolean);
            let lookup = {};
            if (ids.length) {
                if (!statusLookup) return { status: 502, body: { error: 'Cannot check the Shopify status of the rows to delete, so nothing was deleted.', code: 'STATUS_UNKNOWN' } };
                try { lookup = await statusLookup(ids); } catch (e) { return { status: 502, body: { error: 'Could not check the Shopify status of the rows to delete (' + String(e.message).slice(0, 60) + '). Nothing was saved.', code: 'STATUS_UNKNOWN' } }; }
            }
            const keepRows = d.removed.filter((r) => { const v = variantIdOf(r); return v && lookup[v] !== 'ACTIVE'; });
            if (keepRows.length) return { status: 422, body: { error: `These rows point at products that are retired, draft or missing in Shopify and must stay in the library: ${names(keepRows, 5)}. Mark them Retired instead of deleting. Nothing was saved.`, code: 'RETIRE_INSTEAD', file: name, rows: keepRows.map(titleOf) } };
            const noId = d.removed.filter((r) => !variantIdOf(r));
            if (noId.length && ids.length === 0 && !statusLookup) { /* rows without a Shopify link have no status to check: allowed after typed confirmation */ }
        }
        const bad = restore ? [] : validateRows(name, d.added.concat(d.edited), next, cur.data);   // a restore brings back a past state as it was
        if (bad.length) return { status: 422, body: { error: `Not saved: ${bad.slice(0, 6).map((b) => `${b.title}: ${b.problems.join(', ')}`).join(' | ')}${bad.length > 6 ? ` | and ${bad.length - 6} more rows` : ''}`, code: 'INVALID', file: name, problems: bad }, };
        plan.push({ name, sha: cur.sha, next, d, count: cur.data.length });
    }
    if (!plan.length) return { status: 400, body: { error: 'Nothing to save.' } };
    const written = {};
    // copy of every deleted row goes to component-data/deleted-archive.json FIRST (never served to customers), so a failed second step cannot lose rows
    const removedAll = plan.flatMap((f) => f.d.removed.map((r) => ({ file: f.name, deletedAt: now(), row: r })));
    if (removedAll.length) {
        const arc = await readFile({ fetchFn, repo, pat, name: 'deleted-archive', allowMissing: true });
        if (!arc.ok) return { status: arc.status, body: { error: arc.error + ' The archive could not be read, so nothing was deleted.', code: 'ARCHIVE_FAILED' } };
        const put = await fetchFn(`${base}/contents/component-data/deleted-archive.json`, {
            method: 'PUT', headers: { ...gh(repo, pat, 'application/vnd.github.v3+json'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Dashboard: archived ${removedAll.length} deleted row(s) (${names(removedAll.map((x) => x.row), 3)})`, content: Buffer.from(JSON.stringify(arc.data.concat(removedAll), null, 2)).toString('base64'), ...(arc.sha ? { sha: arc.sha } : {}) }),
        });
        if (!put.ok) return { status: 502, body: { error: 'Could not write the archive copy, so nothing was deleted.', code: 'ARCHIVE_FAILED' } };
    }
    for (const f of plan) {
        if (!f.d.added.length && !f.d.edited.length && !f.d.removed.length && f.next.length === f.count) { written[f.name] = { unchanged: true, sha: f.sha }; continue; }
        const put = await fetchFn(`${base}/contents/component-data/${f.name}.json`, {
            method: 'PUT', headers: { ...gh(repo, pat, 'application/vnd.github.v3+json'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageOverride || commitMessage(f.name, f.d), content: Buffer.from(JSON.stringify(f.next, null, 2)).toString('base64'), sha: f.sha }),
        });
        if (put.status === 409 || put.status === 422) return { status: 409, body: { error: `${f.name}.json was changed on GitHub while saving. Reload the Component library and repeat your change.`, code: 'CONFLICT', file: f.name, written } };
        if (!put.ok) return { status: 502, body: { error: `GitHub refused the save of ${f.name}.json (HTTP ${put.status}).`, code: 'WRITE_FAILED', written } };
        const res = await put.json(); written[f.name] = { sha: res && res.content && res.content.sha, added: f.d.added.length, edited: f.d.edited.length, removed: f.d.removed.length };
    }
    return { status: 200, body: { success: true, written, ...(Object.keys(mergedFiles).length ? { merged: mergedFiles } : {}) } };
}

/** any version of a file by its blob sha (used to merge a stale save): the rows, or null */
async function readBlob({ fetchFn = fetch, repo, pat, sha: blobSha }) {
    try {
        const b = await fetchFn(`https://api.github.com/repos/${repo}/git/blobs/${blobSha}`, { headers: gh(repo, pat, 'application/vnd.github.raw') });
        if (!b.ok) return null; const data = JSON.parse(await b.text()); return Array.isArray(data) ? data : null;
    } catch (e) { return null; }
}

/** file content at a given commit (or branch): { data, sha } or { error } */
async function readFileAt({ fetchFn = fetch, repo, pat, name, ref }) {
    const base = `https://api.github.com/repos/${repo}`;
    const meta = await fetchFn(`${base}/contents/component-data/${name}.json?ref=${encodeURIComponent(ref)}`, { headers: gh(repo, pat, 'application/vnd.github.v3+json') });
    if (!meta.ok) return { error: `HTTP ${meta.status}` };
    const info = await meta.json();
    const blob = await fetchFn(`${base}/git/blobs/${info.sha}`, { headers: gh(repo, pat, 'application/vnd.github.raw') });
    if (!blob.ok) return { error: `HTTP ${blob.status}` };
    try { const data = JSON.parse(await blob.text()); return Array.isArray(data) ? { data, sha: info.sha } : { error: 'not a list' }; } catch (e) { return { error: 'not valid JSON' }; }
}

/** last commits of a file with what each one changed (added / edited / removed rows against the version before it) */
async function historyWithDiff({ fetchFn = fetch, repo, pat, name, limit = 8, diffFor = 5 }) {
    const r = await fetchFn(`https://api.github.com/repos/${repo}/commits?path=component-data/${name}.json&per_page=${limit + 1}`, { headers: gh(repo, pat, 'application/vnd.github.v3+json') });
    if (!r.ok) return { ok: false, error: `Could not read the history (HTTP ${r.status}).` };
    const commits = await r.json(); const out = [];
    for (let i = 0; i < Math.min(commits.length, limit); i++) {
        const c = commits[i]; const e = { sha: c.sha, message: c.commit.message, author: c.commit.author.name, date: c.commit.author.date, url: c.html_url };
        if (i < diffFor && commits[i + 1]) {
            const [now, before] = await Promise.all([readFileAt({ fetchFn, repo, pat, name, ref: c.sha }), readFileAt({ fetchFn, repo, pat, name, ref: commits[i + 1].sha })]);
            if (now.data && before.data) { const d = diffRows(before.data, now.data); e.changes = { added: d.added.length, edited: d.edited.length, removed: d.removed.length, rowsAfter: now.data.length, examples: [...d.added.slice(0, 2), ...d.edited.slice(0, 2), ...d.removed.slice(0, 2)].map(titleOf) }; }
        }
        out.push(e);
    }
    return { ok: true, history: out };
}

/** restore = write an older version as a NEW commit. Rows that exist now but not then are removed under the same delete rules (archive copy, never rows of retired/draft/missing products). */
async function restoreVersion({ fetchFn = fetch, repo, pat, name, commitSha, baseSha, statusLookup, now }) {
    const old = await readFileAt({ fetchFn, repo, pat, name, ref: commitSha });
    if (old.error) return { status: 502, body: { error: `Could not read that version (${old.error}). Nothing was changed.`, code: 'READ_FAILED' } };
    return saveFiles({ fetchFn, repo, pat, changes: { [name]: old.data }, baseShas: { [name]: baseSha }, confirmDelete: true, statusLookup, now, restore: true, messageOverride: `Dashboard: restored ${name}.json to version ${String(commitSha).slice(0, 7)} (${old.data.length} rows)` });
}

/** read-change-write of a small list file such as excluded.json (created if missing). mutate(list) -> new list. Refuses when the file changed in between. */
async function updateListFile({ fetchFn = fetch, repo, pat, name, mutate, message }) {
    const cur = await readFile({ fetchFn, repo, pat, name, allowMissing: true });
    if (!cur.ok) return { status: cur.status, body: { error: cur.error } };
    const next = mutate(cur.data.slice());
    if (JSON.stringify(next) === JSON.stringify(cur.data)) return { status: 200, body: { success: true, unchanged: true, count: next.length } };
    const put = await fetchFn(`https://api.github.com/repos/${repo}/contents/component-data/${name}.json`, {
        method: 'PUT', headers: { ...gh(repo, pat, 'application/vnd.github.v3+json'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64'), ...(cur.sha ? { sha: cur.sha } : {}) }),
    });
    if (put.status === 409 || put.status === 422) return { status: 409, body: { error: `${name}.json changed while saving; try again.`, code: 'CONFLICT' } };
    if (!put.ok) return { status: 502, body: { error: `GitHub refused the save of ${name}.json (HTTP ${put.status}).` } };
    return { status: 200, body: { success: true, count: next.length } };
}

module.exports = { updateListFile, keyList, same, readBlob, readFileAt, historyWithDiff, restoreVersion, EXTRA, STATUSES, FILES, readFile, saveFiles, diffRows, validateRows, commitMessage, keyOf, SHRINK_RATIO, SHRINK_MIN, ERD_MIN, ERD_MAX };
