// Run with: npm test
// A fake GitHub (contents + blobs + PUT with sha check) drives lib/components-store.js. No network, no real files.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFile, saveFiles, diffRows, commitMessage, validateRows } = require('../lib/components-store');

const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');
function fakeGithub(files, opts = {}) {
  const store = {}; const commits = [];
  for (const [name, rows] of Object.entries(files)) { const text = JSON.stringify(rows, null, 2); store[name] = { text, sha: sha(text) }; }
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push((init.method || 'GET') + ' ' + url.replace('https://api.github.com/repos/o/r', '').split('?')[0]);
    if (opts.down) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
    const m = /contents\/component-data\/([\w-]+)\.json/.exec(url);
    if (m && (init.method || 'GET') === 'GET') { const f = store[m[1]]; if (!f) return { ok: false, status: 404, json: async () => ({}), text: async () => '' }; return { ok: true, status: 200, json: async () => ({ sha: f.sha }) }; }
    const b = /git\/blobs\/(\w+)/.exec(url);
    if (b) { const f = Object.values(store).find((x) => x.sha === b[1]); if (!f) return { ok: false, status: 404, text: async () => '' }; return { ok: true, status: 200, text: async () => (opts.corrupt ? '<html>oops' : f.text) }; }
    if (m && init.method === 'PUT') {
      const body = JSON.parse(init.body); const f = store[m[1]];
      if (!f && !body.sha) { /* creating a new file */ } else if (!f || body.sha !== f.sha) return { ok: false, status: 409, json: async () => ({}) };
      const text = Buffer.from(body.content, 'base64').toString('utf8'); store[m[1]] = { text, sha: sha(text) }; commits.push({ file: m[1], message: body.message });
      return { ok: true, status: 200, json: async () => ({ content: { sha: store[m[1]].sha } }) };
    }
    throw new Error('unexpected ' + url);
  };
  return { fetchFn, store, commits, calls };
}
const rim = (n, erd = 600, extra = {}) => ({ shopify_variant_id: String(1000 + n), Title: `Rim ${n}`, Vendor: 'Acme', 'Option1 Value': '29"', 'Option2 Value': '28h', 'Variant Metafield: custom.rim_erd [number_decimal]': erd, _rid: `rid_${n}`, ...extra });
const rows = (n) => Array.from({ length: n }, (_, i) => rim(i + 1));
const ctx = (g) => ({ fetchFn: g.fetchFn, repo: 'o/r', pat: 'x' });
const allActive = async (ids) => Object.fromEntries(ids.map((i) => [i, 'ACTIVE']));
const del = (g) => ({ ...ctx(g), confirmDelete: true, statusLookup: allActive });

test('read: returns the rows and the version it read (content is read by that same version)', async () => {
  const g = fakeGithub({ rims: rows(3) });
  const r = await readFile({ ...ctx(g), name: 'rims' });
  assert.equal(r.ok, true); assert.equal(r.data.length, 3); assert.equal(r.sha, g.store.rims.sha);
});

test('read: a failing GitHub, a missing file, bad JSON or a non-list is an ERROR, never an empty list', async () => {
  assert.equal((await readFile({ ...ctx(fakeGithub({ rims: rows(3) }, { down: true })), name: 'rims' })).ok, false);
  assert.equal((await readFile({ ...ctx(fakeGithub({ hubs: rows(3) })), name: 'rims' })).ok, false);          // 404
  const bad = await readFile({ ...ctx(fakeGithub({ rims: rows(3) }, { corrupt: true })), name: 'rims' });
  assert.equal(bad.ok, false); assert.match(bad.error, /not valid JSON/);
  const notList = fakeGithub({ rims: { a: 1 } });
  assert.equal((await readFile({ ...ctx(notList), name: 'rims' })).ok, false);
});

test('save: current version + a new valid row -> committed, descriptive message, other rows kept', async () => {
  const g = fakeGithub({ rims: rows(20) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const next = rows(20).concat([rim(21, 601, { Title: 'Flux Pro 54' })]);
  const res = await saveFiles({ ...ctx(g), changes: { rims: next }, baseShas: { rims: cur.sha } });
  assert.equal(res.status, 200); assert.equal(g.commits.length, 1);
  assert.match(g.commits[0].message, /^Dashboard: rims\.json added 1 \(Flux Pro 54\)$/);
  assert.equal(JSON.parse(g.store.rims.text).length, 21); assert.equal(res.body.written.rims.added, 1);
});

test('save: an older tab (stale version) is refused with 409 and nothing is written', async () => {
  const g = fakeGithub({ rims: rows(20) }); const stale = (await readFile({ ...ctx(g), name: 'rims' })).sha;
  // someone else saves first
  const cur = await readFile({ ...ctx(g), name: 'rims' });
  await saveFiles({ ...ctx(g), changes: { rims: rows(20).concat([rim(30)]) }, baseShas: { rims: cur.sha } });
  const res = await saveFiles({ ...ctx(g), changes: { rims: rows(20).concat([rim(40)]) }, baseShas: { rims: stale } });
  assert.equal(res.status, 409); assert.equal(res.body.code, 'CONFLICT'); assert.equal(g.commits.length, 1);
  assert.equal(JSON.parse(g.store.rims.text).some((r) => r.Title === 'Rim 40'), false);
});

test('save: a request without the loaded version is refused', async () => {
  const g = fakeGithub({ rims: rows(5) });
  const res = await saveFiles({ ...ctx(g), changes: { rims: rows(5) }, baseShas: {} });
  assert.equal(res.status, 400); assert.equal(res.body.code, 'NO_BASE'); assert.equal(g.commits.length, 0);
});

test('save: the empty-list disaster is stopped (shrink guard), and an informed override works', async () => {
  const g = fakeGithub({ rims: rows(100) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const wipe = await saveFiles({ ...ctx(g), changes: { rims: [] }, baseShas: { rims: cur.sha } });
  assert.equal(wipe.status, 422); assert.equal(wipe.body.code, 'SHRINK'); assert.equal(wipe.body.removing, 100); assert.equal(g.commits.length, 0);
  const small = await saveFiles({ ...del(g), changes: { rims: rows(98) }, baseShas: { rims: cur.sha } });   // 2 removed: below the limit
  assert.equal(small.status, 200);
  const cur2 = await readFile({ ...ctx(g), name: 'rims' });
  const ten = await saveFiles({ ...del(g), changes: { rims: rows(88) }, baseShas: { rims: cur2.sha } });      // 10 removed: needs confirmation
  assert.equal(ten.status, 422);
  const okTen = await saveFiles({ ...del(g), changes: { rims: rows(88) }, baseShas: { rims: cur2.sha }, allowRemove: { rims: 10 } });
  assert.equal(okTen.status, 200); assert.match(g.commits.at(-1).message, /removed 10 \(/);
});

test('validation: only NEW or CHANGED rows are checked (old bad rows never block), ERD missing / out of range / duplicate variant id are refused', async () => {
  const old = rows(10).concat([rim(99, 0, { Title: 'Old rim without ERD' })]);       // already in the file: allowed to stay
  const g = fakeGithub({ rims: old }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const keep = await saveFiles({ ...ctx(g), changes: { rims: old.concat([rim(50)]) }, baseShas: { rims: cur.sha } });
  assert.equal(keep.status, 200);
  const cur2 = await readFile({ ...ctx(g), name: 'rims' });
  const noErd = await saveFiles({ ...ctx(g), changes: { rims: JSON.parse(g.store.rims.text).concat([rim(60, 0)]) }, baseShas: { rims: cur2.sha } });
  assert.equal(noErd.status, 422); assert.match(noErd.body.error, /ERD is missing/);
  const wild = await saveFiles({ ...ctx(g), changes: { rims: JSON.parse(g.store.rims.text).concat([rim(61, 900)]) }, baseShas: { rims: cur2.sha } });
  assert.match(wild.body.error, /outside 400 to 680/);
  const dup = await saveFiles({ ...ctx(g), changes: { rims: JSON.parse(g.store.rims.text).concat([rim(1, 600, { Title: 'Copy of Rim 1', 'Option1 Value': '27.5"' })]) }, baseShas: { rims: cur2.sha } });
  assert.match(dup.body.error, /variant id 1001 is used by more than one row/);
  assert.equal(g.commits.length, 1);
});

test('save: all files are validated before any is written (one bad file blocks the rest)', async () => {
  const g = fakeGithub({ rims: rows(10), hubs: rows(10), spokes: [{ Title: 'S', Vendor: 'V' }] });
  const c = { rims: (await readFile({ ...ctx(g), name: 'rims' })).sha, hubs: (await readFile({ ...ctx(g), name: 'hubs' })).sha };
  const res = await saveFiles({ ...ctx(g), changes: { hubs: rows(10).concat([{ shopify_variant_id: '5', Title: 'Hub', Vendor: 'V' }]), rims: rows(10).concat([rim(70, 0)]) }, baseShas: c });
  assert.equal(res.status, 422); assert.equal(g.commits.length, 0);   // hubs would have been fine, but rims is not: nothing written
});

test('save: nothing changed -> no commit', async () => {
  const g = fakeGithub({ rims: rows(8) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const res = await saveFiles({ ...ctx(g), changes: { rims: rows(8).map((r) => ({ ...r, _isNew: false })) }, baseShas: { rims: cur.sha } });
  assert.equal(res.status, 200); assert.equal(res.body.written.rims.unchanged, true); assert.equal(g.commits.length, 0);
});

test('save: GitHub going down while reading blocks the save with the real reason', async () => {
  const g = fakeGithub({ rims: rows(8) }, { down: true });
  const res = await saveFiles({ ...ctx(g), changes: { rims: [] }, baseShas: { rims: 'abc' } });
  assert.equal(res.status, 503); assert.equal(res.body.code, 'READ_FAILED'); assert.equal(g.commits.length, 0);
});

test('diff and commit message', () => {
  const d = diffRows(rows(5), rows(5).slice(1).concat([rim(9, 600, { Title: 'New A' })]).map((r) => (r.Title === 'Rim 2' ? { ...r, Vendor: 'Other' } : r)));
  assert.equal(d.added.length, 1); assert.equal(d.removed.length, 1); assert.equal(d.edited.length, 1);
  assert.match(commitMessage('rims', d), /added 1 \(New A\); edited 1 \(Rim 2\); removed 1 \(Rim 1\)/);
  assert.deepEqual(validateRows('hubs', [{ Title: 'H', Vendor: 'V' }], []), []);   // hubs: only title, vendor and duplicate ids are enforced
});

test('a file that ALREADY has duplicate variant ids can still be saved (no-change save, edit of another row); making a duplicate worse is refused', async () => {
  const live = rows(10).concat([rim(2, 600, { Title: 'Rim 2 twin', 'Option1 Value': '27.5"' })]);   // variant id 1002 exists twice already
  const g = fakeGithub({ rims: live }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  assert.equal((await saveFiles({ ...ctx(g), changes: { rims: live }, baseShas: { rims: cur.sha } })).body.written.rims.unchanged, true);
  const edited = live.map((r) => (r.Title === 'Rim 5' ? { ...r, Vendor: 'Other' } : r));
  assert.equal((await saveFiles({ ...ctx(g), changes: { rims: edited }, baseShas: { rims: cur.sha } })).status, 200);
  const cur2 = await readFile({ ...ctx(g), name: 'rims' });
  const worse = JSON.parse(g.store.rims.text).concat([rim(2, 600, { Title: 'Rim 2 third', 'Option1 Value': '26"' })]);
  const res = await saveFiles({ ...ctx(g), changes: { rims: worse }, baseShas: { rims: cur2.sha } });
  assert.equal(res.status, 422); assert.match(res.body.error, /variant id 1002/);
});

test("Jerry's rule: a row whose Shopify variant is draft, archived or missing can never be deleted (retire instead); nothing is written", async () => {
  const g = fakeGithub({ rims: rows(10) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const lookup = async (ids) => Object.fromEntries(ids.map((i) => [i, i === '1003' ? 'DRAFT' : i === '1004' ? 'MISSING' : 'ACTIVE']));
  const res = await saveFiles({ ...ctx(g), confirmDelete: true, statusLookup: lookup, changes: { rims: rows(10).filter((r, i) => i !== 2) }, baseShas: { rims: cur.sha } });
  assert.equal(res.status, 422); assert.equal(res.body.code, 'RETIRE_INSTEAD'); assert.deepEqual(res.body.rows, ['Rim 3']); assert.equal(g.commits.length, 0);
  const res2 = await saveFiles({ ...ctx(g), confirmDelete: true, statusLookup: lookup, changes: { rims: rows(10).filter((r, i) => i !== 3) }, baseShas: { rims: cur.sha } });
  assert.equal(res2.body.code, 'RETIRE_INSTEAD');   // missing in Shopify counts the same as draft
});

test('delete needs the typed confirmation, checks Shopify, and archives a copy first', async () => {
  const g = fakeGithub({ rims: rows(10) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const next = rows(10).filter((r, i) => i !== 5);
  assert.equal((await saveFiles({ ...ctx(g), statusLookup: allActive, changes: { rims: next }, baseShas: { rims: cur.sha } })).body.code, 'CONFIRM_DELETE');
  assert.equal((await saveFiles({ ...ctx(g), confirmDelete: true, changes: { rims: next }, baseShas: { rims: cur.sha } })).body.code, 'STATUS_UNKNOWN');     // cannot check -> no delete
  const ok = await saveFiles({ ...del(g), changes: { rims: next }, baseShas: { rims: cur.sha }, now: () => '2026-11-10T00:00:00Z' });
  assert.equal(ok.status, 200);
  const archive = JSON.parse(g.store['deleted-archive'].text); assert.equal(archive.length, 1); assert.equal(archive[0].row.Title, 'Rim 6'); assert.equal(archive[0].file, 'rims'); assert.equal(archive[0].deletedAt, '2026-11-10T00:00:00Z');
  assert.equal(JSON.parse(g.store.rims.text).length, 9);
  assert.ok(g.commits[0].file === 'deleted-archive' && g.commits[1].file === 'rims');   // archive written BEFORE the rows are removed
});

test('Status column: active or retired only; a retired row is saved as is and stays in the file', async () => {
  const g = fakeGithub({ rims: rows(5) }); const cur = await readFile({ ...ctx(g), name: 'rims' });
  const bad = await saveFiles({ ...ctx(g), changes: { rims: rows(5).map((r, i) => (i === 0 ? { ...r, Status: 'gone' } : r)) }, baseShas: { rims: cur.sha } });
  assert.match(bad.body.error, /Status must be active or retired/);
  const ok = await saveFiles({ ...ctx(g), changes: { rims: rows(5).map((r, i) => (i === 0 ? { ...r, Status: 'retired' } : r)) }, baseShas: { rims: cur.sha } });
  assert.equal(ok.status, 200); assert.equal(JSON.parse(g.store.rims.text)[0].Status, 'retired'); assert.equal(JSON.parse(g.store.rims.text).length, 5);
});
