// Run with: npm test   (no network: fake Shopify)
// freehub-follow reads and writes BOTH the product and the variant freehub lists (lib/freehub-lists.js, lib/freehub-io.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveFreehubLists, planFreehubWrites } = require('../lib/freehub-lists');
const { readHubFreehubLists, applyFreehubWrites, BATCH } = require('../lib/freehub-io');
const { planFreehubList, driverStates } = require('../lib/freehub-follow');

const L = (...a) => JSON.stringify(a);
const V = (id, raw) => ({ id, raw });
const watch0 = { obs: { XD: 'out' }, removed: [], order: ['XD', 'HG', 'MS'] };
const watch1 = { obs: { XD: 'out' }, removed: ['XD'], order: ['XD', 'HG', 'MS'] };

// ---------- reading: which list is current ----------
test('read: product list only (the real e*thirteen hubs today): ok, the product list, no variant has a list', () => {
  const h = resolveFreehubLists({ productRaw: L('XD', 'HG', 'MS'), variants: [V(1, null), V(2, null), V(3, null)] });
  assert.equal(h.status, 'ok'); assert.deepEqual(h.list, ['XD', 'HG', 'MS']); assert.equal(h.productHasList, true); assert.equal(h.variantsWithList.length, 0);
});
test('read: product and variant lists present and equal (Phil Wood Track style): ok, product list wins, the variants that have a list are known', () => {
  const h = resolveFreehubLists({ productRaw: L('Track'), variants: [V(1, L('Track')), V(2, L('Track')), V(3, null)] });
  assert.equal(h.status, 'ok'); assert.deepEqual(h.list, ['Track']); assert.deepEqual(h.variantsWithList.map((v) => v.id), [1, 2]);
});
test('read: same members in another order is not a disagreement', () => {
  assert.equal(resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: [V(1, L('HG', 'XD'))] }).status, 'ok');
});
test('read: future state, no product list: the variant lists are the list (they must be equal)', () => {
  const h = resolveFreehubLists({ productRaw: null, variants: [V(1, L('XD', 'HG')), V(2, L('XD', 'HG'))] });
  assert.equal(h.status, 'ok'); assert.deepEqual(h.list, ['XD', 'HG']); assert.equal(h.productHasList, false);
});
test('read: disagreement is never guessed: product vs variant, and variant vs variant without a product list', () => {
  const a = resolveFreehubLists({ productRaw: L('XD', 'HG', 'MS'), variants: [V(1, L('XD', 'HG', 'MS')), V(2, L('XD', 'HG'))] });
  assert.equal(a.status, 'disagree'); assert.equal(a.list, null); assert.match(a.reason, /variant 2/);
  const b = resolveFreehubLists({ productRaw: null, variants: [V(1, L('XD')), V(2, L('HG'))] });
  assert.equal(b.status, 'disagree');
});
test('read: no list anywhere is "none"; text that is not a list is "unreadable" (skipped, not treated as empty)', () => {
  assert.equal(resolveFreehubLists({ productRaw: null, variants: [V(1, null)] }).status, 'none');
  assert.equal(resolveFreehubLists({ productRaw: 'XD,HG', variants: [] }).status, 'unreadable');
  assert.equal(resolveFreehubLists({ productRaw: L('XD'), variants: [V(7, '{"a":1}')] }).status, 'unreadable');
});

// ---------- planning the writes ----------
const hubProduct = () => resolveFreehubLists({ productRaw: L('XD', 'HG', 'MS'), variants: [V(1, null), V(2, null)] });
test('write plan, hub with a product list only: the product list and the note, NO variant write and no variant list created (today\'s behavior)', () => {
  const p = planFreehubWrites({ hub: hubProduct(), newList: ['HG', 'MS'], newWatch: watch1, curWatch: watch0, listChanged: true });
  assert.deepEqual(p.productEntries.map((e) => e.key), ['freehub', 'freehub_watch']); assert.equal(p.productEntries[0].value, L('HG', 'MS'));
  assert.deepEqual(p.variantIds, []); assert.equal(p.variantEntry, null);
});
test('write plan, product and variants: product list + note, and EVERY variant that already has a list; a variant without one is left alone', () => {
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG', 'MS'), variants: [V(1, L('XD', 'HG', 'MS')), V(2, L('XD', 'HG', 'MS')), V(3, null)] });
  const p = planFreehubWrites({ hub, newList: ['HG', 'MS'], newWatch: watch1, curWatch: watch0, listChanged: true });
  assert.deepEqual(p.variantIds, [1, 2]); assert.equal(p.variantEntry.value, L('HG', 'MS')); assert.equal(p.variantEntry.key, 'freehub'); assert.equal(p.variantEntry.type, 'list.single_line_text_field');
  assert.deepEqual(p.productEntries.map((e) => e.key), ['freehub', 'freehub_watch']);
});
test('write plan, future state (no product list): only the variants get the list; the Watcher note still goes on the PRODUCT', () => {
  const hub = resolveFreehubLists({ productRaw: null, variants: [V(1, L('XD', 'HG')), V(2, L('XD', 'HG'))] });
  const p = planFreehubWrites({ hub, newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  assert.deepEqual(p.variantIds, [1, 2]); assert.deepEqual(p.productEntries.map((e) => e.key), ['freehub_watch']);
  assert.ok(!p.productEntries.some((e) => e.key === 'freehub'), 'no product list is created');
});
test('write plan: a hub with no variant lists never gets one (variantIds empty, variantEntry null)', () => {
  const p = planFreehubWrites({ hub: hubProduct(), newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  assert.equal(p.variantIds.length, 0); assert.equal(p.variantEntry, null);
});
test('write plan, list unchanged: nothing is written; only a changed note (an observation) is written, to the product, never to variants', () => {
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: [V(1, L('XD', 'HG'))] });
  const same = planFreehubWrites({ hub, newList: ['XD', 'HG'], newWatch: watch0, curWatch: watch0, listChanged: false });
  assert.equal(same.writesAnything, false); assert.deepEqual(same.productEntries, []); assert.deepEqual(same.variantIds, []);
  const note = planFreehubWrites({ hub, newList: ['XD', 'HG'], newWatch: { ...watch0, obs: { XD: 'in' } }, curWatch: watch0, listChanged: false });
  assert.deepEqual(note.productEntries.map((e) => e.key), ['freehub_watch']); assert.deepEqual(note.variantIds, []);
});
test('freehub_variant_map is never written by this module', () => {
  const hub = resolveFreehubLists({ productRaw: L('XD'), variants: [V(1, L('XD'))] });
  const p = planFreehubWrites({ hub, newList: [], newWatch: watch1, curWatch: watch0, listChanged: true });
  assert.ok(![...p.productEntries.map((e) => e.key), p.variantEntry && p.variantEntry.key].includes('freehub_variant_map'));
});
test('the existing freehub-follow decision is untouched: removing XD after two runs out, with variants present it still plans the same list', () => {
  const states = driverStates([{ public_title: '148x12mm Boost / XD Driver / 28 Hole', available: false }, { public_title: '148x12mm Boost / HG Driver / 28 Hole', available: true }], '148');
  const plan = planFreehubList({ list: ['XD', 'HG'], watch: { obs: { XD: 'out', HG: 'in' }, removed: [], order: ['XD', 'HG'] }, states });
  assert.deepEqual(plan.newList, ['HG']); assert.equal(plan.changed, true);
});

// ---------- the Shopify side with a fake GraphQL ----------
function fakeShopify({ product = { title: 'e*thirteen Sidekick GR Rear Hub 12x148mm', list: L('XD', 'HG'), watch: null }, variants = [], failOn = () => false }) {
  const calls = [];
  const gql = async (query, vars) => {
    if (/mutation/.test(query)) {
      calls.push({ type: 'write', m: vars.m }); if (failOn(vars.m, calls.filter((c) => c.type === 'write').length)) return { data: { metafieldsSet: { userErrors: [{ message: 'boom' }] } } };
      return { data: { metafieldsSet: { userErrors: [] } } };
    }
    const start = vars.after ? Number(vars.after) : 0; const page = variants.slice(start, start + 100);
    calls.push({ type: 'read', after: vars.after });
    return { data: { product: { title: product.title, list: product.list ? { value: product.list } : null, watch: product.watch ? { value: product.watch } : null,
      variants: { pageInfo: { hasNextPage: start + 100 < variants.length, endCursor: String(start + 100) }, nodes: page.map((v) => ({ id: `gid://shopify/ProductVariant/${v.id}`, fh: v.raw ? { value: v.raw } : null })) } } } };
  };
  return { gql, calls };
}

test('io read: pages through all variants (250 variants = 3 pages) and returns raw values', async () => {
  const variants = Array.from({ length: 250 }, (_, i) => ({ id: 1000 + i, raw: i % 2 ? L('XD') : null }));
  const f = fakeShopify({ variants }); const r = await readHubFreehubLists(f.gql, 555);
  assert.equal(r.variants.length, 250); assert.equal(f.calls.filter((c) => c.type === 'read').length, 3); assert.equal(r.productRaw, L('XD', 'HG')); assert.equal(r.title, 'e*thirteen Sidekick GR Rear Hub 12x148mm');
  assert.equal(r.variants[1].raw, L('XD')); assert.equal(r.variants[0].raw, null);
  assert.equal(await readHubFreehubLists(async () => ({ data: { product: null } }), 1), null);
});

test('io write, product-only hub: exactly ONE call, the same two metafields on the product as before (freehub + freehub_watch), no variant touched', async () => {
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: [V(1, null), V(2, null)] });
  const plan = planFreehubWrites({ hub, newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  const f = fakeShopify({}); const res = await applyFreehubWrites(f.gql, 555, hub, plan);
  assert.equal(res.ok, true); const w = f.calls.filter((c) => c.type === 'write'); assert.equal(w.length, 1);
  assert.deepEqual(w[0].m.map((m) => [m.ownerId, m.key, m.type, m.value]), [['gid://shopify/Product/555', 'freehub', 'list.single_line_text_field', L('HG')], ['gid://shopify/Product/555', 'freehub_watch', 'json', JSON.stringify(watch1)]]);
});

test('io write, product + variants: the variants first (batches of 25), then the product', async () => {
  const vars = Array.from({ length: 60 }, (_, i) => V(2000 + i, L('XD', 'HG')));
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: vars });
  const plan = planFreehubWrites({ hub, newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  const f = fakeShopify({}); const res = await applyFreehubWrites(f.gql, 555, hub, plan);
  const w = f.calls.filter((c) => c.type === 'write'); assert.equal(res.ok, true);
  assert.deepEqual(w.map((c) => c.m.length), [BATCH, BATCH, 10, 2]);                       // 25 + 25 + 10 variants, then the 2 product metafields
  assert.ok(w.slice(0, 3).every((c) => c.m.every((m) => m.ownerId.includes('ProductVariant') && m.key === 'freehub' && m.value === L('HG'))));
  assert.ok(w[3].m.every((m) => m.ownerId === 'gid://shopify/Product/555'));
  assert.equal(res.variantsWritten, 60);
});

test('io write: a failing variant batch puts the written variants back and never touches the product', async () => {
  const vars = Array.from({ length: 30 }, (_, i) => V(3000 + i, L('XD', 'HG')));
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: vars });
  const plan = planFreehubWrites({ hub, newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  const f = fakeShopify({ failOn: (m, n) => n === 2 }); const res = await applyFreehubWrites(f.gql, 555, hub, plan);
  assert.equal(res.ok, false); assert.equal(res.stage, 'variants'); assert.equal(res.rolledBack, 25);
  const w = f.calls.filter((c) => c.type === 'write'); assert.ok(!w.some((c) => c.m.some((m) => m.ownerId.includes('/Product/'))), 'the product was not written');
  const back = w[w.length - 1].m; assert.equal(back.length, 25); assert.ok(back.every((m) => m.value === L('XD', 'HG')), 'old value restored');
});

test('io write: a failing product write after the variants rolls the variants back', async () => {
  const hub = resolveFreehubLists({ productRaw: L('XD', 'HG'), variants: [V(1, L('XD', 'HG')), V(2, L('XD', 'HG'))] });
  const plan = planFreehubWrites({ hub, newList: ['HG'], newWatch: watch1, curWatch: watch0, listChanged: true });
  const f = fakeShopify({ failOn: (m) => m.some((x) => x.ownerId.includes('/Product/')) }); const res = await applyFreehubWrites(f.gql, 555, hub, plan);
  assert.equal(res.ok, false); assert.equal(res.stage, 'product'); assert.equal(res.rolledBack, 2);
  const last = f.calls.filter((c) => c.type === 'write').pop().m; assert.ok(last.every((m) => m.ownerId.includes('ProductVariant') && m.value === L('XD', 'HG')));
});

test('io write: nothing to write means no call at all', async () => {
  const hub = resolveFreehubLists({ productRaw: L('XD'), variants: [V(1, L('XD'))] });
  const plan = planFreehubWrites({ hub, newList: ['XD'], newWatch: watch0, curWatch: watch0, listChanged: false });
  const f = fakeShopify({}); const res = await applyFreehubWrites(f.gql, 555, hub, plan); assert.equal(res.ok, true); assert.equal(f.calls.length, 0);
});

test('the Watcher (sync.js) uses these libraries and no longer writes the product list on its own', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'pages', 'api', 'sync.js'), 'utf8');
  assert.ok(/applyFreehubWrites/.test(src) && /resolveFreehubLists/.test(src) && /readHubFreehubLists/.test(src));
  assert.ok(!/writeHubMetafields|readHubFreehub\(/.test(src), 'the old product-only helpers are gone');
  assert.ok(!/freehub_variant_map/.test(src.slice(src.indexOf('freehubJobs.entries()'), src.indexOf('Sync safety stop (freehub lists)'))), 'the map is not touched');
});
