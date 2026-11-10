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
const SHRINK_RATIO = 0.05, SHRINK_MIN = 3;
const ERD_MIN = 400, ERD_MAX = 680;
const ERD_KEYS = ['Variant Metafield: custom.rim_erd [number_decimal]', 'Rim ERD', 'rim_erd', 'ERD'];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const first = (row, keys) => { for (const k of keys) if (row && str(row[k]) !== '') return row[k]; return ''; };
const titleOf = (r) => str(first(r, ['Title', 'title', 'Name', 'name'])) || '(no title)';
const vendorOf = (r) => str(first(r, ['Vendor', 'vendor', 'Brand', 'brand']));
const variantIdOf = (r) => str(first(r, ['shopify_variant_id', 'Variant ID']));
/** identity of a row: its Shopify variant id, otherwise vendor + title + options */
const keyOf = (r) => variantIdOf(r) ? `v:${variantIdOf(r)}` : `t:${[vendorOf(r), titleOf(r), str(r && r['Option1 Value']), str(r && r['Option2 Value'])].join('|').toLowerCase()}`;
const strip = (r) => { const { _isNew, _rawIdx, _editIdx, ...rest } = r || {}; return rest; };   // browser-only fields; _rid stays (it is stored in the file)
const noRid = (r) => { const { _rid, ...rest } = strip(r); return rest; };
const sorted = (r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
const same = (a, b) => sorted(noRid(a)) === sorted(noRid(b));   // a changed _rid alone is not an edit

const gh = (repo, pat, accept) => ({ Authorization: `Bearer ${pat}`, Accept: accept, 'User-Agent': 'loamlabs-dashboard' });

/** @returns {Promise<{ok:true, data:object[], sha:string}|{ok:false, status:number, error:string}>} */
async function readFile({ fetchFn = fetch, repo, pat, name }) {
    const base = `https://api.github.com/repos/${repo}`;
    try {
        const meta = await fetchFn(`${base}/contents/component-data/${name}.json?cb=${Date.now()}`, { headers: gh(repo, pat, 'application/vnd.github.v3+json') });
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
async function saveFiles({ fetchFn = fetch, repo, pat, changes, baseShas = {}, allowRemove = {} }) {
    const base = `https://api.github.com/repos/${repo}`;
    const plan = [];
    for (const name of FILES) {
        if (!Array.isArray(changes[name])) continue;
        if (!baseShas[name]) return { status: 400, body: { error: `This page does not know which version of ${name}.json it loaded. Reload the Component library and try again.`, code: 'NO_BASE' } };
        const cur = await readFile({ fetchFn, repo, pat, name });
        if (!cur.ok) return { status: cur.status, body: { error: cur.error + ' Nothing was saved.', code: 'READ_FAILED' } };
        if (cur.sha !== baseShas[name]) return { status: 409, body: { error: `${name}.json was changed on GitHub after you loaded it (another save or a direct commit). Reload the Component library, then repeat your change. Nothing was saved.`, code: 'CONFLICT', file: name } };
        const next = changes[name].filter((r) => r && typeof r === 'object').map(strip);
        const d = diffRows(cur.data, next);
        const shrinkLimit = Math.max(SHRINK_MIN, Math.floor(cur.data.length * SHRINK_RATIO));
        if (d.removed.length > shrinkLimit && (allowRemove[name] || 0) < d.removed.length) {
            return { status: 422, body: { error: `This save would remove ${d.removed.length} of ${cur.data.length} rows from ${name}.json (${names(d.removed, 5)}). If that is intended, confirm and save again. Nothing was saved.`, code: 'SHRINK', file: name, removing: d.removed.length, total: cur.data.length } };
        }
        const bad = validateRows(name, d.added.concat(d.edited), next, cur.data);
        if (bad.length) return { status: 422, body: { error: `Not saved: ${bad.slice(0, 6).map((b) => `${b.title}: ${b.problems.join(', ')}`).join(' | ')}${bad.length > 6 ? ` | and ${bad.length - 6} more rows` : ''}`, code: 'INVALID', file: name, problems: bad }, };
        plan.push({ name, sha: cur.sha, next, d, count: cur.data.length });
    }
    if (!plan.length) return { status: 400, body: { error: 'Nothing to save.' } };
    const written = {};
    for (const f of plan) {
        if (!f.d.added.length && !f.d.edited.length && !f.d.removed.length && f.next.length === f.count) { written[f.name] = { unchanged: true, sha: f.sha }; continue; }
        const put = await fetchFn(`${base}/contents/component-data/${f.name}.json`, {
            method: 'PUT', headers: { ...gh(repo, pat, 'application/vnd.github.v3+json'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: commitMessage(f.name, f.d), content: Buffer.from(JSON.stringify(f.next, null, 2)).toString('base64'), sha: f.sha }),
        });
        if (put.status === 409 || put.status === 422) return { status: 409, body: { error: `${f.name}.json was changed on GitHub while saving. Reload the Component library and repeat your change.`, code: 'CONFLICT', file: f.name, written } };
        if (!put.ok) return { status: 502, body: { error: `GitHub refused the save of ${f.name}.json (HTTP ${put.status}).`, code: 'WRITE_FAILED', written } };
        const res = await put.json(); written[f.name] = { sha: res && res.content && res.content.sha, added: f.d.added.length, edited: f.d.edited.length, removed: f.d.removed.length };
    }
    return { status: 200, body: { success: true, written } };
}

module.exports = { FILES, readFile, saveFiles, diffRows, validateRows, commitMessage, keyOf, SHRINK_RATIO, SHRINK_MIN, ERD_MIN, ERD_MAX };
