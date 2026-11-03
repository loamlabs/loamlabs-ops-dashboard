// Run with: npm test   (fake Shopify, no network)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createShopifyStore } = require('../lib/build-guard-shopify');
const { runBuildGuard } = require('../lib/build-guard');
const { parseGuardRequest, PHRASE } = require('../lib/build-guard-mode');

const comps = (...ids) => JSON.stringify({ v: 1, components: ids.map((id, i) => ({ role: 'part' + i, variants: [id] })) });

function fakeShopify(initial) {
  const state = JSON.parse(JSON.stringify(initial));   // { products: [...], components: { id: {qty, policy, title} } }
  const calls = [];
  const gql = async (query, v) => {
    if (query.includes('products(first: 25')) {
      calls.push('listProducts');
      const page = v.cursor ? Number(v.cursor) : 0;
      const prods = state.products.slice(page * 2, page * 2 + 2);   // 2 products per page to exercise paging
      return { products: { pageInfo: { hasNextPage: (page + 1) * 2 < state.products.length, endCursor: String(page + 1) }, edges: prods.map((p) => ({ node: { id: p.id, title: p.title, status: p.status, variants: { edges: p.variants.map((x) => ({ node: {
        id: 'gid://shopify/ProductVariant/' + x.id, title: x.title || 'Default Title', inventoryPolicy: x.policy, inventoryQuantity: x.qty,
        inventoryItem: { id: 'gid://shopify/InventoryItem/' + x.id, tracked: x.tracked, inventoryLevels: { edges: [{ node: { id: 'l', location: { id: 'gid://shopify/Location/1' } } }] } },
        components: x.components === undefined ? null : { value: x.components }, state: x.state ? { value: x.state } : null, off: x.off ? { value: x.off } : null } })) } } })) } };
    }
    if (query.includes('nodes(ids')) {
      calls.push('readComponents');
      return { nodes: v.ids.map((gid) => { const c = state.components[gid.split('/').pop()]; return c ? { id: gid, title: c.title, inventoryQuantity: c.qty, inventoryPolicy: c.policy, product: { title: 'Part' } } : null; }) };
    }
    const find = (gid) => state.products.flatMap((p) => p.variants).find((x) => 'gid://shopify/ProductVariant/' + x.id === gid);
    if (query.includes('inventoryLevels(first: 10)') && query.includes('inventoryItem(id')) { calls.push('levels'); return { inventoryItem: { inventoryLevels: { edges: [{ node: { location: { id: 'gid://shopify/Location/1' } } }] } } }; }
    if (query.includes('productVariantsBulkUpdate')) {
      calls.push('bulkUpdate'); const x = find(v.variants[0].id); x.policy = v.variants[0].inventoryPolicy; if (v.variants[0].inventoryItem) x.tracked = v.variants[0].inventoryItem.tracked; return { productVariantsBulkUpdate: { userErrors: [] } };
    }
    if (query.includes('inventorySetQuantities')) {
      calls.push('setQty'); const q = v.input.quantities[0]; find('gid://shopify/ProductVariant/' + q.inventoryItemId.split('/').pop()).qty = q.quantity; return { inventorySetQuantities: { userErrors: [] } };
    }
    if (query.includes('metafieldsSet')) {
      calls.push('metafieldsSet'); const m = v.m[0]; find(m.ownerId).state = m.value; return { metafieldsSet: { userErrors: [] } };
    }
    throw new Error('unexpected query');
  };
  return { gql, state, calls };
}

const base = () => ({
  products: [
    { id: 'P1', title: 'Gravel Build', status: 'ACTIVE', variants: [{ id: '101', title: 'DT 240', qty: 3, policy: 'DENY', tracked: true, components: comps('11', '12') }] },
    { id: 'P2', title: 'Draft Build', status: 'DRAFT', variants: [{ id: '201', qty: 0, policy: 'CONTINUE', tracked: false, components: comps('11', '12') }] },
    { id: 'P3', title: 'Old Build', status: 'ARCHIVED', variants: [{ id: '301', qty: 5, policy: 'DENY', tracked: true, components: comps('11') }] },
    { id: 'P4', title: 'Tagged but no list', status: 'ACTIVE', variants: [{ id: '401', qty: 5, policy: 'DENY', tracked: true }] },
    { id: 'P5', title: 'Switched off', status: 'ACTIVE', variants: [{ id: '501', qty: 5, policy: 'DENY', tracked: true, components: comps('11'), off: 'true' }] },
  ],
  components: { 11: { qty: 4, policy: 'DENY', title: 'Rim' }, 12: { qty: 2, policy: 'DENY', title: 'Hub' } },
});

test('adapter lists only guarded masters (list present), reads statuses, pages through products', async () => {
  const f = fakeShopify(base());
  const m = await createShopifyStore(f.gql).listMasters();
  assert.deepEqual(m.map((x) => x.variantId).sort(), ['101', '201', '501']);   // archived and no-list variants are not masters
  assert.equal(m.find((x) => x.variantId === '101').title, 'Gravel Build (DT 240)');
  assert.equal(m.find((x) => x.variantId === '501').guardOff, true);
  assert.equal(m.find((x) => x.variantId === '201').productStatus, 'DRAFT');
});

test('component goes out: draft and active masters are closed (qty 0, DENY, tracked, state written); off-switch master untouched', async () => {
  const f = fakeShopify(base());
  f.state.components[12].qty = 0;
  const r = await runBuildGuard(createShopifyStore(f.gql));
  assert.equal(r.changed.length, 2);
  const v = (id) => f.state.products.flatMap((p) => p.variants).find((x) => x.id === id);
  for (const id of ['101', '201']) { assert.equal(v(id).qty, 0); assert.equal(v(id).policy, 'DENY'); assert.equal(v(id).tracked, true); assert.equal(v(id).state, 'sold_out_by_guard'); }
  assert.equal(v('501').qty, 5); assert.equal(v('501').state, undefined);
  assert.equal(v('401').qty, 5);
  assert.equal(r.changed[1].before.policy, 'CONTINUE');                         // undo record of the draft master
  assert.match(r.emailLines[0], /set to sold out: part1: Part \(Hub\)/);
});

test('component back: the guard reopens what it closed (CONTINUE, tracked), no quantity write', async () => {
  const f = fakeShopify(base());
  f.state.components[12].qty = 0;
  const store = createShopifyStore(f.gql);
  await runBuildGuard(store);
  f.state.components[12].qty = 6; f.calls.length = 0;
  const r = await runBuildGuard(createShopifyStore(f.gql));
  assert.equal(r.changed.length, 2);
  const v = f.state.products.flatMap((p) => p.variants).find((x) => x.id === '101');
  assert.equal(v.policy, 'CONTINUE'); assert.equal(v.state, 'on_sale_by_guard'); assert.equal(v.qty, 0);
  assert.equal(f.calls.includes('setQty'), false);
});

test('deleted component variant closes the build; dry run writes nothing at all', async () => {
  const f = fakeShopify(base());
  delete f.state.components[11];
  const r = await runBuildGuard(createShopifyStore(f.gql), { dryRun: true });
  assert.equal(r.changed.length, 2); assert.equal(r.changed[0].dryRun, true);
  assert.deepEqual(f.calls.filter((c) => ['bulkUpdate', 'setQty', 'metafieldsSet'].includes(c)), []);
  assert.match(r.emailLines[0], /\(missing\)/);
});

test('only=<variant id> limits the run to one master; maxWrites brake stops a runaway', async () => {
  const f = fakeShopify(base()); f.state.components[12].qty = 0;
  const one = await runBuildGuard(createShopifyStore(f.gql, { onlyVariantId: '201' }));
  assert.deepEqual(one.changed.map((c) => c.variantId), ['201']);
  const f2 = fakeShopify(base()); f2.state.components[12].qty = 0;
  const capped = await runBuildGuard(createShopifyStore(f2.gql), { maxWrites: 1 });
  assert.equal(capped.changed.length, 1); assert.match(capped.skipped.join(' '), /limit of 1/);
});

test('a Shopify error on one master is reported and does not stop the others', async () => {
  const f = fakeShopify(base()); f.state.components[12].qty = 0;
  const gql = async (q, v) => { if (q.includes('productVariantsBulkUpdate') && v.productId === 'P1') return { productVariantsBulkUpdate: { userErrors: [{ message: 'nope' }] } }; return f.gql(q, v); };
  const r = await runBuildGuard(createShopifyStore(gql));
  assert.equal(r.failed.length, 1); assert.equal(r.changed.length, 1); assert.match(r.emailLines.join(' '), /could not update/);
});

test('request mode: dry run by default, live needs the exact phrase, never silently downgraded', () => {
  assert.deepEqual(parseGuardRequest({}), { ok: true, dry: true, only: null, max: 10 });
  assert.equal(parseGuardRequest({ dry: '1' }).dry, true);
  assert.equal(parseGuardRequest({ live: '1' }).ok, false);
  assert.equal(parseGuardRequest({ live: '1', phrase: 'run build guard live' }).ok, false);
  assert.equal(parseGuardRequest({ live: '1', dry: '1', phrase: PHRASE }).ok, false);
  const live = parseGuardRequest({ live: '1', phrase: PHRASE, only: 'gid://shopify/ProductVariant/201', max: '1' });
  assert.deepEqual(live, { ok: true, dry: false, only: '201', max: 1 });
});

test('no inventory scope needed when the master is already at 0 and tracked: only policy + state are written', async () => {
  const f = fakeShopify(base()); f.state.components[12].qty = 0;
  f.calls.length = 0;
  await runBuildGuard(createShopifyStore(f.gql, { onlyVariantId: '201' }));          // draft master: qty 0
  assert.equal(f.calls.includes('levels'), false); assert.equal(f.calls.includes('setQty'), false);
  assert.deepEqual(f.calls.filter((c) => ['bulkUpdate', 'metafieldsSet'].includes(c)), ['bulkUpdate', 'metafieldsSet']);
  const f2 = fakeShopify(base()); f2.state.components[12].qty = 0; f2.calls.length = 0;
  await runBuildGuard(createShopifyStore(f2.gql, { onlyVariantId: '101' }));          // active master holds 3: quantity has to be zeroed
  assert.equal(f2.calls.includes('levels'), true); assert.equal(f2.calls.includes('setQty'), true);
});
