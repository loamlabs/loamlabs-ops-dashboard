// Run with: npm test   (fake Shopify, no network)
// The build tools read the freehub list and map VARIANT FIRST, the product only as a fallback, never merged (same rule as theme Release 37):
// variant only / product only / both (variant wins) / neither, for the Create Signature Build tool and the hub-choice tool, plus the store layer that reads the variant fields.
const test = require('node:test');
const assert = require('node:assert/strict');
const { freehubListOf, freehubMapOf, hasValue } = require('../lib/signature-build/util');
const { makeWorld, makeStore, makeDb, I } = require('./helpers/signature-fakes');
const { planBuild } = require('../lib/signature-build/plan');
const { planHubChoice } = require('../lib/signature-build/hub/plan');
const { createShopifyBuildStore } = require('../lib/signature-build/shopify');
const { makeHubWorld, makeLengthsCsv, makeHubStore, makeDb: makeHubDb } = require('./helpers/hub-fakes');

const GID = (n) => `gid://shopify/ProductVariant/${n}`;
const codes = (list) => list.map((x) => x.code);

/* ---------------- the rule itself ---------------- */
test('rule: variant only, product only, both (variant wins, never merged), neither', () => {
    const variant = { freehub: ['XD'], freehubMap: { XD: 'v-xd' } }, product = { freehub: ['XD', 'HG', 'MS'], freehubMap: { XD: 'p-xd', HG: 'p-hg', MS: 'p-ms' } };
    assert.deepEqual(freehubListOf(variant, {}), { value: ['XD'], from: 'variant' });
    assert.deepEqual(freehubMapOf(variant, {}), { value: { XD: 'v-xd' }, from: 'variant' });
    assert.deepEqual(freehubListOf({}, product), { value: ['XD', 'HG', 'MS'], from: 'product' });
    assert.deepEqual(freehubMapOf({}, product), { value: product.freehubMap, from: 'product' });
    assert.deepEqual(freehubListOf(variant, product), { value: ['XD'], from: 'variant' }, 'both: the variant list wins, HG and MS of the product are NOT added');
    assert.deepEqual(freehubMapOf(variant, product), { value: { XD: 'v-xd' }, from: 'variant' }, 'both: the variant map wins, not merged with the product map');
    assert.deepEqual(freehubListOf({}, {}), { value: null, from: null }); assert.deepEqual(freehubMapOf(null, undefined), { value: null, from: null });
});

test('rule: the list and the map are resolved on their own; an empty list or map counts as none', () => {
    const variant = { freehub: ['HG'], freehubMap: null }, product = { freehub: ['XD', 'HG'], freehubMap: { XD: 'p-xd', HG: 'p-hg' } };
    assert.equal(freehubListOf(variant, product).from, 'variant'); assert.equal(freehubMapOf(variant, product).from, 'product');
    const emptyVariant = { freehub: [], freehubMap: {} };
    assert.equal(freehubListOf(emptyVariant, product).from, 'product'); assert.equal(freehubMapOf(emptyVariant, product).from, 'product');
    assert.deepEqual([hasValue([]), hasValue({}), hasValue(null), hasValue(['XD']), hasValue({ XD: 1 }), hasValue('XD')], [false, false, false, true, true, false]);
});

/* ---------------- the store layer reads the variant metafields ---------------- */
test('store: both variant queries ask for custom.freehub and custom.freehub_variant_map, and the variants carry them parsed (null when absent or broken)', async () => {
    const seen = [];
    const node = (id, fh, map) => ({ id: `gid://shopify/ProductVariant/${id}`, title: 'v', price: '10', inventoryQuantity: 1, inventoryPolicy: 'DENY', selectedOptions: [], paint: null, fh: fh === null ? null : { value: fh }, fhMap: map === null ? null : { value: map } });
    const gql = async (q, vars) => {
        seen.push(q);
        if (q.includes('nodes(ids')) return { nodes: [{ ...node(1, '["XD","HG"]', '{"XD":"a","HG":"b"}'), product: { id: 'gid://shopify/Product/9', title: 'P', handle: 'p', status: 'ACTIVE' } }] };
        if (q.includes('variants(first: 100')) return { product: { variants: { pageInfo: { hasNextPage: false }, edges: [{ node: node(1, '["XD"]', '{"XD":"a"}') }, { node: node(2, null, null) }, { node: node(3, 'not json', '[1') }] } } };
        return { product: { id: 'gid://shopify/Product/9', title: 'P', vendor: 'V', tags: [], options: [], hubType: null, freehub: { value: '["XD","HG","MS"]' }, freehubMap: { value: '{"XD":"p"}' }, rules: null } };
    };
    const store = createShopifyBuildStore(gql);
    const got = await store.getVariants(['1']); const v = got.get('1');
    assert.deepEqual(v.freehub, ['XD', 'HG']); assert.deepEqual(v.freehubMap, { XD: 'a', HG: 'b' });
    const p = await store.getProduct('gid://shopify/Product/9');
    assert.deepEqual(p.freehub, ['XD', 'HG', 'MS']); assert.deepEqual(p.freehubMap, { XD: 'p' });
    assert.deepEqual([p.variants[0].freehub, p.variants[1].freehub, p.variants[2].freehub, p.variants[2].freehubMap], [['XD'], null, null, null]);
    assert.ok(seen.filter((q) => q.includes('nodes(ids') || q.includes('variants(first: 100')).every((q) => /key: "freehub"/.test(q) && /key: "freehub_variant_map"/.test(q)), 'every variant query asks for both fields');
});

/* ---------------- Create Signature Build ---------------- */
const rear = (w) => w.V[I(3001)];    // the chosen rear hub variant of the fake recipe
const planWith = async (mut) => {
    const world = makeWorld(); if (mut) mut(world);
    const store = makeStore(world), db = makeDb();
    return planBuild({ store, db, recipe: world.recipe(), overrides: {} });
};
const fhOf = (plan) => ({ options: plan.freehub.options, source: plan.freehub.source, list: JSON.parse(plan.product.metafields.find((m) => m.key === 'freehub').value), map: JSON.parse(plan.product.metafields.find((m) => m.key === 'freehub_variant_map').value) });

test('signature build: product only (today): the product list and map are copied, source says product', async () => {
    const plan = await planWith();
    assert.equal(plan.ok, true); const f = fhOf(plan);
    assert.deepEqual(f.options, ['XD', 'HG']); assert.deepEqual(f.source, { list: 'product', map: 'product' });
});

test('signature build: variant only (the product copies are gone): the chosen rear hub variant\'s list and map are copied', async () => {
    const plan = await planWith((w) => {
        w.P[300].freehub = null; w.P[300].freehubMap = null;
        rear(w).freehub = ['XD', 'HG']; rear(w).freehubMap = { XD: GID(I(3901)), HG: GID(I(3902)) };
    });
    assert.equal(plan.ok, true, JSON.stringify(plan.blockers)); const f = fhOf(plan);
    assert.deepEqual(f.options, ['XD', 'HG']); assert.deepEqual(f.source, { list: 'variant', map: 'variant' }); assert.deepEqual(f.map, { XD: GID(I(3901)), HG: GID(I(3902)) });
});

test('signature build: both present: the variant wins and the two are never merged', async () => {
    const plan = await planWith((w) => {
        // the product still lists XD, HG, Campy with map entries for XD and HG; the variant lists only XD and maps it to a DIFFERENT body variant
        rear(w).freehub = ['XD']; rear(w).freehubMap = { XD: GID(I(3902)) };
    });
    assert.equal(plan.ok, true, JSON.stringify(plan.blockers)); const f = fhOf(plan);
    assert.deepEqual(f.options, ['XD'], 'HG of the product list is not added'); assert.deepEqual(f.map, { XD: GID(I(3902)) }, 'the variant\'s body variant, not the product\'s');
    assert.deepEqual(f.source, { list: 'variant', map: 'variant' });
});

test('signature build: a variant list with the map only on the product reads each on its own (list from the variant, map from the product)', async () => {
    const plan = await planWith((w) => { rear(w).freehub = ['HG']; });
    assert.equal(plan.ok, true, JSON.stringify(plan.blockers)); const f = fhOf(plan);
    assert.deepEqual(f.options, ['HG']); assert.deepEqual(f.source, { list: 'variant', map: 'product' });
});

test('signature build: neither on the variant nor on the product: FREEHUB_MAP_MISSING, and nothing is written', async () => {
    const world = makeWorld(); world.P[300].freehub = null; world.P[300].freehubMap = null;
    const store = makeStore(world), db = makeDb();
    const plan = await planBuild({ store, db, recipe: world.recipe(), overrides: {} });
    assert.ok(codes(plan.blockers).includes('FREEHUB_MAP_MISSING'), 'a blocker the tool refuses to create from');
    assert.match(plan.blockers.find((b) => b.code === 'FREEHUB_MAP_MISSING').message, /on the chosen variant or on the product/);
    assert.equal(store.writes.length, 0);
    // the list alone (no map anywhere) is also a miss
    const w2 = makeWorld(); w2.P[300].freehubMap = null; w2.P[300].freehub = null; w2.V[I(3001)].freehub = ['XD'];
    assert.ok(codes((await planBuild({ store: makeStore(w2), db: makeDb(), recipe: w2.recipe(), overrides: {} })).blockers).includes('FREEHUB_MAP_MISSING'));
});

/* ---------------- hub-choice tool ---------------- */
const hubRun = async (mut) => {
    const w = makeHubWorld(); if (mut) mut(w);
    return { w, plan: await planHubChoice({ store: makeHubStore(w), db: makeHubDb(), config: w.config(), lengthsCsv: makeLengthsCsv(w) }) };
};
const rearProducts = (w, model) => { const h = w.hubs.find((x) => x.model === model); return [w.P[h.rearProducts['12x148']], w.P[h.rearProducts['12x157']]]; };
const cell = (plan, model, key) => plan.matrix.find((x) => x.hub === model && x.spacing === key);
const recOf = (plan, key) => JSON.parse(plan.variants.find((v) => v.key === key).metafields[1].value);

test('hub-choice: product only (today): freehubs from the product, source says product', async () => {
    const { plan } = await hubRun();
    assert.equal(plan.dropped.length, 0); assert.deepEqual(cell(plan, 'Hope Pro 5', 'A').freehubFrom, { list: 'product', map: 'product' });
    assert.deepEqual(recOf(plan, '1A').freehubs, ['SRAM XD', 'Shimano HG', 'Shimano MicroSpline']);
});

test('hub-choice: variant only (the product copies are gone): the default rear variant\'s list and map are used', async () => {
    const { plan, w } = await hubRun((w) => {
        for (const P of rearProducts(w, 'Hope Pro 5')) { const lst = ['XD', 'HG'], map = { XD: P.freehubMap.XD, HG: P.freehubMap.HG }; P.freehub = null; P.freehubMap = null; P.variants.forEach((v) => { v.freehub = lst; v.freehubMap = map; }); }
    });
    assert.equal(plan.dropped.filter((d) => d.hub === 'Hope Pro 5').length, 0, JSON.stringify(plan.dropped));
    assert.deepEqual(cell(plan, 'Hope Pro 5', 'A').freehubFrom, { list: 'variant', map: 'variant' });
    assert.deepEqual(recOf(plan, '1A').freehubs, ['SRAM XD', 'Shimano HG']); assert.deepEqual(recOf(plan, '1B').freehubs, ['SRAM XD', 'Shimano HG']);
    assert.ok(w); // the other hubs (still product only) are untouched
    assert.deepEqual(cell(plan, 'Industry Nine Hydra2', 'A').freehubFrom, { list: 'product', map: 'product' });
});

test('hub-choice: both present: the variant wins, never merged (the product\'s MS is not added, the variant\'s body variant is used)', async () => {
    const { plan, w } = await hubRun((w) => {
        for (const P of rearProducts(w, 'Hope Pro 5')) P.variants.forEach((v) => { v.freehub = ['HG']; v.freehubMap = { HG: P.freehubMap.XD }; });   // the variant maps HG to the body variant the product maps XD to
    });
    assert.deepEqual(cell(plan, 'Hope Pro 5', 'A').freehubFrom, { list: 'variant', map: 'variant' });
    const rec = recOf(plan, '1A'); assert.deepEqual(rec.freehubs, ['Shimano HG']); assert.equal(rec.freehubVariantMap['Shimano HG'], rearProducts(w, 'Hope Pro 5')[0].freehubMap.XD);
});

test('hub-choice: neither on the variant nor on the product: the cell is dropped with FREEHUB_MAP_MISSING (the other hubs are not affected)', async () => {
    const { plan } = await hubRun((w) => { for (const P of rearProducts(w, 'Hope Pro 5')) { P.freehub = null; P.freehubMap = null; } });
    const d = plan.dropped.filter((x) => x.code === 'FREEHUB_MAP_MISSING' && x.hub === 'Hope Pro 5');
    assert.deepEqual(d.map((x) => x.spacing).sort(), ['A', 'B', 'C']); assert.match(d[0].reason, /neither on its default variant nor on the product/);
    assert.ok(!cell(plan, 'Hope Pro 5', 'A')); assert.ok(cell(plan, 'Industry Nine Hydra2', 'A'));
});

test('hub-choice store layer: the part product query reads the variant freehub fields', async () => {
    const { createHubStoreMethods } = require('../lib/signature-build/hub/shopify');
    const q = [];
    const gql = async (query) => { q.push(query); return { product: { id: 'gid://shopify/Product/5', title: 'H', vendor: 'V', tags: [], options: [], metafields: { edges: [{ node: { key: 'freehub', value: '["XD","HG","MS"]' } }] }, rules: null,
        variants: { pageInfo: { hasNextPage: false }, edges: [{ node: { id: 'gid://shopify/ProductVariant/1', title: 'a', price: '1', inventoryQuantity: 0, inventoryPolicy: 'DENY', selectedOptions: [], inventoryItem: null, spacing: null, brake: null, erd: null, fh: { value: '["XD"]' }, fhMap: { value: '{"XD":"g"}' } } }, { node: { id: 'gid://shopify/ProductVariant/2', title: 'b', price: '1', inventoryQuantity: 0, inventoryPolicy: 'DENY', selectedOptions: [], inventoryItem: null, spacing: null, brake: null, erd: null, fh: null, fhMap: null } }] } } }; };
    const p = await createHubStoreMethods(gql).getPartProduct('gid://shopify/Product/5');
    assert.deepEqual([p.variants[0].freehub, p.variants[0].freehubMap, p.variants[1].freehub, p.variants[1].freehubMap], [['XD'], { XD: 'g' }, null, null]);
    assert.deepEqual(p.freehub, ['XD', 'HG', 'MS']);
    assert.match(q[0], /key: "freehub"/); assert.match(q[0], /key: "freehub_variant_map"/);
});
