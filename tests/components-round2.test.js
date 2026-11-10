// Run with: npm test  (round 2: merge by row key, row lookup by key, legacy keys; fake GitHub that keeps every version)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { saveFiles, readFile, updateListFile } = require('../lib/components-store');
const { mergeRows } = require('../lib/components-merge');
const { findRowIndex, findLegacyKeys, stripLegacyKeys } = require('../lib/components-keys');

const sha = (t) => crypto.createHash('sha1').update(t).digest('hex');
function fakeRepo(initial) {
  const blobs = {}; let cur = null; const commits = [];
  const put = (rows, message) => { const text = JSON.stringify(rows, null, 2); cur = { text, sha: sha(text) }; blobs[cur.sha] = text; if (message) commits.push(message); };
  put(initial);
  const fetchFn = async (url, init = {}) => {
    const u = url.replace('https://api.github.com/repos/o/r', ''); let m;
    if ((m = /^\/contents\/component-data\/([\w-]+)\.json/.exec(u))) {
      if ((init.method || 'GET') === 'GET') return m[1] === 'rims' ? { ok: true, status: 200, json: async () => ({ sha: cur.sha }) } : { ok: false, status: 404 };
      const b = JSON.parse(init.body); if (m[1] !== 'rims') return { ok: true, status: 200, json: async () => ({ content: { sha: 'x' } }) };
      if (b.sha !== cur.sha) return { ok: false, status: 409 };
      put(JSON.parse(Buffer.from(b.content, 'base64').toString('utf8')), b.message); return { ok: true, status: 200, json: async () => ({ content: { sha: cur.sha } }) };
    }
    if ((m = /^\/git\/blobs\/(\w+)/.exec(u))) return blobs[m[1]] ? { ok: true, status: 200, text: async () => blobs[m[1]] } : { ok: false, status: 404 };
    throw new Error('unexpected ' + url);
  };
  return { fetchFn, current: () => JSON.parse(cur.text), sha: () => cur.sha, commits, put };
}
const rim = (n, extra = {}) => ({ shopify_variant_id: String(3000 + n), Title: `Rim ${n}`, Vendor: 'Acme', 'Option1 Value': '29"', 'Option2 Value': '28h', 'Variant Metafield: custom.rim_erd [number_decimal]': 600, _rid: `rid_${n}`, ...extra });
const rows = (k) => Array.from({ length: k }, (_, i) => rim(i + 1));
const C = (g) => ({ fetchFn: g.fetchFn, repo: 'o/r', pat: 'x' });
const erd = (n, v) => ({ ...rim(n), 'Variant Metafield: custom.rim_erd [number_decimal]': v });

test('stale save that touches DIFFERENT rows is merged, both sets of changes end up in the file', async () => {
  const g = fakeRepo(rows(20)); const loaded = g.sha();                     // my tab loads here
  // someone else edits Rim 3 and adds Rim 99
  const theirs = rows(20).map((r) => (r.Title === 'Rim 3' ? erd(3, 611) : r)).concat([rim(99)]); g.put(theirs, 'theirs');
  // I edit Rim 7 and add Rim 50
  const mine = rows(20).map((r) => (r.Title === 'Rim 7' ? erd(7, 622) : r)).concat([rim(50)]);
  const res = await saveFiles({ ...C(g), changes: { rims: mine }, baseShas: { rims: loaded } });
  assert.equal(res.status, 200); assert.ok(res.body.merged.rims);
  const f = g.current(); const e = (t) => f.find((r) => r.Title === t)['Variant Metafield: custom.rim_erd [number_decimal]'];
  assert.equal(f.length, 22); assert.equal(e('Rim 3'), 611); assert.equal(e('Rim 7'), 622); assert.ok(f.some((r) => r.Title === 'Rim 50') && f.some((r) => r.Title === 'Rim 99'));
});

test('the SAME row changed differently on both sides is refused and names the row; nothing is written', async () => {
  const g = fakeRepo(rows(20)); const loaded = g.sha();
  g.put(rows(20).map((r) => (r.Title === 'Rim 3' ? erd(3, 611) : r)), 'theirs');
  const before = g.commits.length;
  const res = await saveFiles({ ...C(g), changes: { rims: rows(20).map((r) => (r.Title === 'Rim 3' ? erd(3, 633) : r)) }, baseShas: { rims: loaded } });
  assert.equal(res.status, 409); assert.equal(res.body.code, 'CONFLICT'); assert.deepEqual(res.body.rows, ['Rim 3']); assert.equal(g.commits.length, before);
});

test('the same change made on both sides is not a conflict; an edit of a row someone removed is', () => {
  const base = rows(5);
  const same = mergeRows(base, base.map((r) => (r.Title === 'Rim 2' ? erd(2, 610) : r)), base.map((r) => (r.Title === 'Rim 2' ? erd(2, 610) : r)));
  assert.equal(same.ok, true);
  const gone = mergeRows(base, base.map((r) => (r.Title === 'Rim 2' ? erd(2, 610) : r)), base.filter((r) => r.Title !== 'Rim 2'));
  assert.equal(gone.ok, false); assert.deepEqual(gone.conflicts, ['Rim 2']);
});

test('merge works with rows that already share a variant id (duplicates keep their own identity)', () => {
  const base = rows(4).concat([rim(2, { Title: 'Rim 2 twin', 'Option1 Value': '27.5"', _rid: 'rid_twin' })]);
  const mine = base.map((r) => (r.Title === 'Rim 2 twin' ? { ...r, Vendor: 'Other' } : r));
  const theirs = base.map((r) => (r.Title === 'Rim 1' ? erd(1, 605) : r));
  const m = mergeRows(base, mine, theirs);
  assert.equal(m.ok, true); assert.equal(m.rows.length, 5); assert.equal(m.rows.find((r) => r.Title === 'Rim 2 twin').Vendor, 'Other'); assert.equal(m.rows.find((r) => r.Title === 'Rim 1')['Variant Metafield: custom.rim_erd [number_decimal]'], 605);
});

test('edit drawer: open row A, another save shifts the list, saving A still updates A (found by key, not by position)', () => {
  const list = rows(10); const A = { ...list[4] };                 // the drawer opens Rim 5 (it would have remembered position 4)
  const shifted = [rim(77, { _rid: 'new_77' }), ...list];            // a save elsewhere puts a new row on top: Rim 5 is now at position 5
  const idx = findRowIndex(shifted, { ...A, Vendor: 'Edited' });
  assert.equal(shifted[idx].Title, 'Rim 5'); assert.equal(idx, 5);
  const out = shifted.slice(); out[idx] = { ...A, Vendor: 'Edited' };
  assert.equal(out.filter((r) => r.Vendor === 'Edited').length, 1); assert.equal(out[4].Title, 'Rim 4'); assert.equal(out[4].Vendor, 'Acme');   // the row that now sits at the old position is untouched
});

test('row lookup falls back to variant id, then title + options; a row that is gone gives -1', () => {
  const list = rows(5).map((r) => { const { _rid, ...rest } = r; return rest; });
  assert.equal(findRowIndex(list, { shopify_variant_id: '3003' }), 2);
  assert.equal(findRowIndex(list, { Title: 'Rim 4', Vendor: 'Acme', 'Option1 Value': '29"', 'Option2 Value': '28h' }), 3);
  assert.equal(findRowIndex(list, { Title: 'Nope', Vendor: 'Acme' }), -1);
  const twins = [rim(2), rim(2, { Title: 'Rim 2 twin', 'Option1 Value': '27.5"', _rid: 'rid_t' })].map((r) => { const { _rid, ...rest } = r; return rest; });
  assert.equal(findRowIndex(twins, twins[1]), 1);                      // two rows with one variant id: told apart by title and options
});

test('legacy keys are counted and listed (so the tab can ask) and only removed on request', () => {
  const list = [{ Title: 'a', 'Rim ERD': 600, Name: 'old' }, { Title: 'b', 'Rim ERD': 590 }, { Title: 'c' }, { Title: 'd', Name: '' }];
  assert.deepEqual(findLegacyKeys(list), { 'Rim ERD': 2, Name: 1 });   // an empty legacy value is not worth asking about
  const stripped = stripLegacyKeys(list); assert.equal('Rim ERD' in stripped[0], false); assert.equal('Rim ERD' in list[0], true);   // input untouched
});

test('excluded list: created when missing, add and remove, a no-op writes nothing; the customer files are never touched', async () => {
  const files = {}; const puts = [];
  const fetchFn = async (url, init = {}) => {
    const u = url.replace('https://api.github.com/repos/o/r', ''); let m;
    if ((m = /^\/contents\/component-data\/([\w-]+)\.json/.exec(u))) {
      if ((init.method || 'GET') === 'GET') return files[m[1]] ? { ok: true, status: 200, json: async () => ({ sha: files[m[1]].sha }) } : { ok: false, status: 404 };
      const b = JSON.parse(init.body); if (files[m[1]] ? b.sha !== files[m[1]].sha : b.sha) return { ok: false, status: 409 };
      const text = Buffer.from(b.content, 'base64').toString('utf8'); files[m[1]] = { text, sha: sha(text) }; puts.push(m[1]); return { ok: true, status: 200 };
    }
    if ((m = /^\/git\/blobs\/(\w+)/.exec(u))) { const f = Object.values(files).find((x) => x.sha === m[1]); return { ok: true, status: 200, text: async () => f.text }; }
    throw new Error('unexpected ' + url);
  };
  const c = { fetchFn, repo: 'o/r', pat: 'x', name: 'excluded' };
  let r = await updateListFile({ ...c, message: 'm', mutate: (l) => l.concat([{ id: '10', title: 'Your Own Rim', tab: 'rims' }]) });
  assert.equal(r.status, 200); assert.deepEqual(JSON.parse(files.excluded.text).map((e) => e.id), ['10']);
  r = await updateListFile({ ...c, message: 'm', mutate: (l) => l.concat([{ id: '11', title: 'Velocity A23 (Rim Brake)', tab: 'rims' }]) });
  r = await updateListFile({ ...c, message: 'm', mutate: (l) => l.filter((e) => e.id !== '10') });
  assert.deepEqual(JSON.parse(files.excluded.text).map((e) => e.id), ['11']);
  const n = puts.length; r = await updateListFile({ ...c, message: 'm', mutate: (l) => l }); assert.equal(r.body.unchanged, true); assert.equal(puts.length, n);
  assert.deepEqual([...new Set(puts)], ['excluded']);
});

test("correcting a row's Shopify variant id is an EDIT (no delete confirmation, no archive), the row stays", async () => {
  const live = [rim(1), rim(2, { shopify_variant_id: '9999', Title: 'Rim 2 SL' }), rim(3)];
  const g = fakeRepo(live); const cur = await readFile({ ...C(g), name: 'rims' });
  const fixed = live.map((r) => (r.Title === 'Rim 2 SL' ? { ...r, shopify_variant_id: '4242' } : r));
  const res = await saveFiles({ ...C(g), changes: { rims: fixed }, baseShas: { rims: cur.sha } });
  assert.equal(res.status, 200); assert.equal(res.body.written.rims.edited, 1); assert.equal(res.body.written.rims.removed, 0); assert.equal(g.current().length, 3);
  assert.equal(g.current().find((r) => r.Title === 'Rim 2 SL').shopify_variant_id, '4242');
});

test("two rows that share one variant id: correcting the id of one of them, or renaming one, is an edit and not a delete", async () => {
  const live = [rim(1), rim(2, { shopify_variant_id: "7777", "Option1 Value": "27.5\"" }), rim(3, { shopify_variant_id: "7777", "Option1 Value": "29\"", Title: "Rim 3" }), rim(4)];
  const g = fakeRepo(live); const cur = await readFile({ ...C(g), name: "rims" });
  const fixed = live.map((r) => (r.Title === "Rim 2" ? { ...r, shopify_variant_id: "8888" } : r));
  const a = await saveFiles({ ...C(g), changes: { rims: fixed }, baseShas: { rims: cur.sha } });
  assert.equal(a.status, 200); assert.deepEqual([a.body.written.rims.edited, a.body.written.rims.removed], [1, 0]);
  const cur2 = await readFile({ ...C(g), name: "rims" });
  const renamed = JSON.parse(g.sha ? JSON.stringify(g.current()) : "[]").map((r) => (r.Title === "Rim 4" ? { ...r, Title: "Rim 4 renamed" } : r));
  const b = await saveFiles({ ...C(g), changes: { rims: renamed }, baseShas: { rims: cur2.sha } });
  assert.equal(b.status, 200); assert.deepEqual([b.body.written.rims.edited, b.body.written.rims.removed], [1, 0]);
});
