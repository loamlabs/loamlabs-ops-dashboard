// Run with: npm test  (history with diff, restore as a new commit, CSV import and the reports; fake GitHub, no network)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { saveFiles, readFile, historyWithDiff, restoreVersion } = require('../lib/components-store');
const { rowsFromCsv, previewImport, parseCsv } = require('../lib/components-csv');
const { validationReport, coverageReport, driftReport } = require('../lib/components-report');

const sha = (t) => crypto.createHash('sha1').update(t).digest('hex');
function fakeRepo(initial) {
  const files = {}; const versions = {}; const commits = []; let n = 0;
  const put = (name, text, message) => { const id = 'c' + String(++n).padStart(6, '0'); files[name] = { text, sha: sha(text) }; versions[id] = { name, text, sha: sha(text) }; commits.unshift({ sha: id, commit: { message, author: { name: 'dash', date: '2026-11-10T00:00:0' + n + 'Z' } }, html_url: 'u', name }); return id; };
  put('rims', JSON.stringify(initial, null, 2), 'initial');
  const fetchFn = async (url, init = {}) => {
    const u = url.replace('https://api.github.com/repos/o/r', '');
    let m;
    if ((m = /^\/commits\?path=component-data\/([\w-]+)\.json/.exec(u))) return { ok: true, status: 200, json: async () => commits.filter((c) => c.name === m[1]) };
    if ((m = /^\/contents\/component-data\/([\w-]+)\.json\?ref=(\w+)/.exec(u))) { const v = versions[m[2]]; return v ? { ok: true, status: 200, json: async () => ({ sha: v.sha }) } : { ok: false, status: 404 }; }
    if ((m = /^\/contents\/component-data\/([\w-]+)\.json/.exec(u))) {
      if ((init.method || 'GET') === 'GET') { const f = files[m[1]]; return f ? { ok: true, status: 200, json: async () => ({ sha: f.sha }) } : { ok: false, status: 404 }; }
      const b = JSON.parse(init.body); const f = files[m[1]]; if (f ? b.sha !== f.sha : b.sha) return { ok: false, status: 409 };
      put(m[1], Buffer.from(b.content, 'base64').toString('utf8'), b.message); return { ok: true, status: 200, json: async () => ({ content: { sha: files[m[1]].sha } }) };
    }
    if ((m = /^\/git\/blobs\/(\w+)/.exec(u))) { const v = Object.values(versions).find((x) => x.sha === m[1]) || Object.values(files).find((x) => x.sha === m[1]); return v ? { ok: true, status: 200, text: async () => v.text } : { ok: false, status: 404 }; }
    throw new Error('unexpected ' + url);
  };
  return { fetchFn, files, commits };
}
const rim = (n, extra = {}) => ({ shopify_variant_id: String(2000 + n), Title: `Rim ${n}`, Vendor: 'Acme', 'Option1 Value': '29"', 'Option2 Value': '28h', 'Variant Metafield: custom.rim_erd [number_decimal]': 600, ...extra });
const rows = (k) => Array.from({ length: k }, (_, i) => rim(i + 1));
const active = async (ids) => Object.fromEntries(ids.map((i) => [i, 'ACTIVE']));

test('history shows what each commit changed; restore writes an older version as a NEW commit', async () => {
  const g = fakeRepo(rows(10)); const ctx = { fetchFn: g.fetchFn, repo: 'o/r', pat: 'x' };
  let cur = await readFile({ ...ctx, name: 'rims' });
  await saveFiles({ ...ctx, changes: { rims: rows(10).concat([rim(11, { Title: 'Flux Pro 54' })]) }, baseShas: { rims: cur.sha } });
  cur = await readFile({ ...ctx, name: 'rims' });
  await saveFiles({ ...ctx, changes: { rims: rows(10).concat([rim(11, { Title: 'Flux Pro 54' })]).map((r) => (r.Title === 'Rim 3' ? { ...r, Vendor: 'Other' } : r)) }, baseShas: { rims: cur.sha } });
  const h = await historyWithDiff({ ...ctx, name: 'rims' });
  assert.equal(h.ok, true); assert.deepEqual([h.history[0].changes.added, h.history[0].changes.edited], [0, 1]); assert.equal(h.history[1].changes.added, 1);
  assert.match(h.history[1].message, /added 1 \(Flux Pro 54\)/);
  const firstSaveSha = h.history[1].sha;
  cur = await readFile({ ...ctx, name: 'rims' });
  const before = g.commits.length;
  const r = await restoreVersion({ ...ctx, name: 'rims', commitSha: firstSaveSha, baseSha: cur.sha, statusLookup: active });
  assert.equal(r.status, 200); assert.equal(g.commits.length, before + 1);     // a new commit, history is kept
  assert.match(g.commits[0].commit.message, /restored rims\.json to version c000002/);
  assert.equal(JSON.parse(g.files.rims.text).find((x) => x.Title === 'Rim 3').Vendor, 'Acme');
});

test('restore cannot remove a row of a retired / draft product either (same rule as delete)', async () => {
  const g = fakeRepo(rows(5)); const ctx = { fetchFn: g.fetchFn, repo: 'o/r', pat: 'x' };
  const cur = await readFile({ ...ctx, name: 'rims' });
  await saveFiles({ ...ctx, changes: { rims: rows(5).concat([rim(6)]) }, baseShas: { rims: cur.sha } });
  const cur2 = await readFile({ ...ctx, name: 'rims' });
  const draft = async (ids) => Object.fromEntries(ids.map((i) => [i, 'DRAFT']));
  const r = await restoreVersion({ ...ctx, name: 'rims', commitSha: 'c000001', baseSha: cur2.sha, statusLookup: draft });
  assert.equal(r.body.code, 'RETIRE_INSTEAD'); assert.equal(JSON.parse(g.files.rims.text).length, 6);
});

test('CSV: Agent C Block A and Block B both give the library format; counts and problems are previewed', () => {
  const header = 'shopify_product_id,shopify_variant_id,ProductURL,Title,Vendor,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant Metafield: custom.rim_erd [number_decimal],Variant Metafield: custom.weight_g [number_decimal]';
  const csv = `# BLOCK A: ...\nID,Title,Vendor,Tags,Variant ID,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant Metafield: custom.rim_erd [number_decimal],Variant Metafield: custom.weight_g [number_decimal]\n77,X Flux Pro Rim,X,"a, b",9001,Size,"29""",Spoke Count,28h,601,425\n# BLOCK B: ...\n${header}\n77,9001,https://shop/x,X Flux Pro,X,Size,"29""",Spoke Count,28h,601,425\n77,9002,https://shop/x,X Flux Pro,X,Size,"29""",Spoke Count,32h,,430\n`;
  const r = rowsFromCsv(csv);
  assert.equal(r.format, 'B'); assert.equal(r.rows.length, 2); assert.equal(r.rows[0].shopify_variant_id, 9001); assert.equal(r.rows[0]['Option1 Value'], '29"');
  assert.equal(r.rows[1]['Variant Metafield: custom.rim_erd [number_decimal]'], null);
  const a = rowsFromCsv(csv.split('# BLOCK B')[0]); assert.equal(a.format, 'A'); assert.equal(a.rows[0].Title, 'X Flux Pro');   // trailing " Rim" dropped like the stored format
  const p = previewImport('rims', rows(3), r.rows);
  assert.equal(p.toAdd.length, 2); assert.equal(p.problems.length, 1); assert.match(p.problems[0].problems[0], /ERD is missing/); assert.equal(p.countAfter, 3);   // a problem blocks the whole import
  assert.equal(previewImport('rims', rows(3), [rim(1)]).alreadyThere.length, 1);
  assert.deepEqual(parseCsv('a,"b,c",d\n1,2,3'), [['a', 'b,c', 'd'], ['1', '2', '3']]);
});

test('reports: validation, coverage (never proposes deleting), drift', () => {
  const library = rows(6).concat([rim(7, { 'Variant Metafield: custom.rim_erd [number_decimal]': 480 }), rim(8, { 'Variant Metafield: custom.rim_erd [number_decimal]': '' }), rim(1, { Title: 'dup id' })]);
  const v = validationReport(library);
  assert.equal(v.missingErd.length, 1); assert.equal(v.outliers.length, 1); assert.equal(v.duplicateVariantIds.length, 1);
  const c = coverageReport({ rows: library, products: [{ id: '1', title: 'Rim 1', status: 'ACTIVE', vendor: 'A', variantIds: ['2001'] }, { id: '9', title: 'New Flux', status: 'ACTIVE', vendor: 'A', variantIds: ['9001'] }, { id: '10', title: 'Own Rim', status: 'ACTIVE', vendor: 'A', variantIds: ['9100'] }],
    rowStatus: { 2001: 'ACTIVE', 2002: 'DRAFT', 2003: 'MISSING', 2004: 'ACTIVE' }, excluded: [{ id: '10' }] });
  assert.deepEqual(c.missingRows.map((p) => p.title), ['New Flux']); assert.equal(c.excluded.length, 1);
  assert.deepEqual(c.suggestRetired.map((r) => r.why).sort(), ['DRAFT', 'MISSING']); assert.equal(c.notTagged.length, 1);   // 2004 exists and is active in Shopify but is no longer tagged as a rim
  const d = driftReport(library, { 2001: { erd: 603, weight: null }, 2002: { erd: 600, weight: 400 } });
  assert.equal(d.length, 2); assert.ok(d.every((x) => x.field === 'ERD'));   // the duplicated id 2001 is reported for both rows
});
