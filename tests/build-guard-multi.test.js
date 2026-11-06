// Run with: npm test   (fake Shopify, no network)
// Hub-choice build, step 0: the guard with products that hold MANY guarded variants (paging, per-cause cap, grouped email, batched writes).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createShopifyStore } = require('../lib/build-guard-shopify');
const { runBuildGuard, planMaster, evaluateGroups } = require('../lib/build-guard');

const comps = (...ids) => JSON.stringify({ v: 1, components: ids.map((id, i) => ({ role: 'part' + i, variants: [String(id)] })) });

/** products: [{id, title, status, variants:[{id, qty, policy, tracked, components, state?}]}]; parts: {id: {qty, policy, title, product, price?}} */
function fake(initial, { variantsPerPage = 100 } = {}) {
    const state = JSON.parse(JSON.stringify(initial));
    const calls = [];
    const node = (x) => ({
        id: 'gid://shopify/ProductVariant/' + x.id, title: x.title || 'Default Title', price: x.price === undefined ? undefined : String(x.price), inventoryPolicy: x.policy, inventoryQuantity: x.qty,
        inventoryItem: { id: 'gid://shopify/InventoryItem/' + x.id, tracked: x.tracked },
        components: x.components === undefined ? null : { value: x.components }, state: x.state ? { value: x.state } : null, off: x.off ? { value: x.off } : null,
    });
    const find = (gid) => state.products.flatMap((p) => p.variants).find((x) => 'gid://shopify/ProductVariant/' + x.id === gid);
    const gql = async (query, v) => {
        if (query.includes('products(first: 25')) {
            calls.push('listProducts');
            return { products: { pageInfo: { hasNextPage: false, endCursor: null }, edges: state.products.map((p) => ({ node: { id: p.id, title: p.title, status: p.status, variants: {
                pageInfo: { hasNextPage: p.variants.length > variantsPerPage, endCursor: String(variantsPerPage) },
                edges: p.variants.slice(0, variantsPerPage).map((x) => ({ node: node(x) })) } } })) } };
        }
        if (query.includes('product(id: $id)') && query.includes('variants(first: 100, after: $cursor)')) {
            calls.push('variantsPage');
            const p = state.products.find((x) => x.id === v.id); const from = Number(v.cursor);
            const slice = p.variants.slice(from, from + variantsPerPage);
            return { product: { variants: { pageInfo: { hasNextPage: from + variantsPerPage < p.variants.length, endCursor: String(from + variantsPerPage) }, edges: slice.map((x) => ({ node: node(x) })) } } };
        }
        if (query.includes('nodes(ids')) {
            calls.push('readComponents');
            return { nodes: v.ids.map((gid) => { const c = state.parts[gid.split('/').pop()]; return c ? { id: gid, title: c.title, price: c.price === undefined ? undefined : String(c.price), inventoryQuantity: c.qty, inventoryPolicy: c.policy, inventoryItem: c.cost === undefined ? null : { unitCost: { amount: String(c.cost) } }, product: { title: c.product || 'Part' } } : null; }) };
        }
        if (query.includes('inventoryLevels(first: 10)') && query.includes('inventoryItem(id')) { calls.push('levels'); return { inventoryItem: { inventoryLevels: { edges: [{ node: { location: { id: 'gid://shopify/Location/1' } } }] } } }; }
        if (query.includes('productVariantsBulkUpdate')) {
            calls.push('bulkUpdate:' + v.variants.length);
            if (state.failBulk && state.failBulk === v.productId) return { productVariantsBulkUpdate: { userErrors: [{ message: 'nope' }] } };
            v.variants.forEach((u) => { const x = find(u.id); x.policy = u.inventoryPolicy; if (u.inventoryItem) x.tracked = u.inventoryItem.tracked; });
            return { productVariantsBulkUpdate: { userErrors: [] } };
        }
        if (query.includes('inventorySetQuantities')) {
            calls.push('setQty:' + v.input.quantities.length);
            v.input.quantities.forEach((q) => { find('gid://shopify/ProductVariant/' + q.inventoryItemId.split('/').pop()).qty = q.quantity; });
            return { inventorySetQuantities: { userErrors: [] } };
        }
        if (query.includes('metafieldsSet')) { calls.push('metafieldsSet:' + v.m.length); v.m.forEach((m) => { find(m.ownerId).state = m.value; }); return { metafieldsSet: { userErrors: [] } }; }
        throw new Error('unexpected query');
    };
    return { gql, state, calls };
}

/** n products x k variants; variant j of every product uses front hub part (100+j%3) and shared rim part 1 */
function world({ products = 2, perProduct = 6, qty = 0, policy = 'CONTINUE', tracked = true } = {}) {
    const ps = [];
    for (let p = 0; p < products; p++) {
        ps.push({ id: 'gid://shopify/Product/P' + p, title: 'Hub choice ' + p, status: 'DRAFT', variants: Array.from({ length: perProduct }, (_, j) => ({
            id: `${p}${String(j).padStart(2, '0')}`, title: `Hub ${j % 3}`, qty, policy, tracked, components: comps(1, 100 + (j % 3), 5),
        })) });
    }
    return { products: ps, parts: {
        1: { qty: 4, policy: 'DENY', title: 'Rim', product: 'Reserve 30|DH Carbon Rim' },
        100: { qty: 3, policy: 'DENY', title: '32h / Black', product: 'Hydra2 Front Hub' },
        101: { qty: 3, policy: 'DENY', title: '32h / Black', product: 'Sidekick GR Rear Hub' },
        102: { qty: 3, policy: 'DENY', title: '32h / Black', product: 'Hope Pro5 Front Hub' },
        5: { qty: 9, policy: 'DENY', title: 'Nipple', product: 'Nipples' },
    } };
}

test('paging: a product with more than 100 variants is read in full, none is silently unguarded', async () => {
    const w = world({ products: 1, perProduct: 130 });
    const f = fake(w);
    const m = await createShopifyStore(f.gql).listMasters();
    assert.equal(m.length, 130);
    assert.ok(f.calls.includes('variantsPage'));
    assert.equal(new Set(m.map((x) => x.variantId)).size, 130);
    // small pages exercise more than one extra page
    const f2 = fake(w, { variantsPerPage: 40 });
    assert.equal((await createShopifyStore(f2.gql).listMasters()).length, 130);
    assert.equal(f2.calls.filter((c) => c === 'variantsPage').length, 3);
});

test('masters carry product id, product title, price (for the drift report)', async () => {
    const w = world({ products: 1, perProduct: 2 }); w.products[0].variants[0].price = 1799.5;
    const m = await createShopifyStore(fake(w).gql).listMasters();
    assert.equal(m[0].productTitle, 'Hub choice 0'); assert.equal(m[0].productId, 'gid://shopify/Product/P0'); assert.equal(m[0].price, 1799.5); assert.equal(m[1].price, null);
});

test('component states carry price and cost when Shopify returns them; the result JSON stays free of helper fields', async () => {
    const w = world({ products: 1, perProduct: 1 }); w.parts[1].price = 649; w.parts[1].cost = 360;
    const r = await runBuildGuard(createShopifyStore(fake(w).gql), { dryRun: true });
    assert.equal(r.states.get('1').price, 649); assert.equal(r.states.get('1').cost, 360); assert.equal(r.states.get('100').price, undefined);
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(r))), ['changed', 'skipped', 'failed', 'emailLines', 'mastersSeen']);
});

test('planMaster: reports the cause (product names, no variant details) and the on/off state', () => {
    const ok = { found: true, quantity: 5, policy: 'DENY' };
    const states = new Map([['1', ok], ['2', { found: true, quantity: 0, policy: 'DENY', label: 'Sidekick GR Rear Hub (32h / Black)' }], ['3', { found: false }]]);
    const m = { variantId: 'V', title: 'T', quantity: 0, policy: 'CONTINUE', tracked: true, componentsRaw: comps(1, 2, 3) };
    const p = planMaster({ master: m, states, sellable: { type: 'continue' } });
    assert.equal(p.state, 'off'); assert.equal(p.cause, '3 + Sidekick GR Rear Hub');
    assert.equal(planMaster({ master: { ...m, componentsRaw: comps(1) }, states, sellable: { type: 'continue' } }).state, 'on');
    assert.deepEqual(evaluateGroups([{ role: 'x', variants: ['2'], mode: 'any' }], states).causes, ['Sidekick GR Rear Hub']);
});

test('one hub out: 4 products x 3 variants close with ONE cause, one email line, even with a cap of 1', async () => {
    const w = world({ products: 4, perProduct: 6 });   // variants j%3==1 use the Sidekick GR rear hub (part 101): 2 per product = 8 variants
    w.parts[101].qty = 0;
    const f = fake(w);
    const r = await runBuildGuard(createShopifyStore(f.gql), { maxWrites: 1 });
    assert.equal(r.changed.length, 8);
    assert.equal(r.emailLines.length, 1);
    assert.equal(r.emailLines[0], 'Sidekick GR Rear Hub out: 8 builds switched off (4 products)');
    assert.equal(r.skipped.length, 0);
    for (const p of f.state.products) for (const v of p.variants) assert.equal(v.state, Number(v.id.slice(1)) % 3 === 1 ? 'sold_out_by_guard' : undefined);
});

test('the cap still stops a second, different cause (and says so)', async () => {
    const w = world({ products: 2, perProduct: 6 });
    w.parts[101].qty = 0; w.parts[102].qty = 0;     // two causes
    const r = await runBuildGuard(createShopifyStore(fake(w).gql), { maxWrites: 1 });
    assert.equal(r.changed.length, 4);              // the first cause only (Sidekick: 2 per product x 2 products)
    assert.equal(r.skipped.length, 4); assert.match(r.skipped[0], /limit of 1 builds per run/);
    assert.equal(r.emailLines.length, 1);
});

test('hard ceiling on variants written in one run', async () => {
    const w = world({ products: 2, perProduct: 6 }); w.parts[1].qty = 0;   // the shared rim: all 12 variants, one cause
    const r = await runBuildGuard(createShopifyStore(fake(w).gql), { maxVariantWrites: 5 });
    assert.equal(r.changed.length, 5); assert.equal(r.skipped.length, 7); assert.match(r.skipped[0], /limit of 5 variants/);
});

test('single-variant products read exactly as before (one line per build, no grouping)', async () => {
    const w = world({ products: 3, perProduct: 1 }); w.parts[100].qty = 0;
    const r = await runBuildGuard(createShopifyStore(fake(w).gql));
    assert.equal(r.changed.length, 3); assert.equal(r.emailLines.length, 3); assert.match(r.emailLines[0], /^Build "Hub choice 0 \(Hub 0\)"|^Build "Hub choice 0" set to sold out/);
});

test('back on sale: one grouped line for many variants', async () => {
    const w = world({ products: 2, perProduct: 6 }); w.parts[100].qty = 0;
    const gql1 = createShopifyStore(fake(w).gql);
    const f = fake(w); await runBuildGuard(createShopifyStore(f.gql));
    f.state.parts[100].qty = 5;
    const r = await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(r.changed.length, 4); assert.deepEqual(r.emailLines, ['4 builds back on sale: all components are available']);
    assert.ok(gql1);
});

test('all variants of a product off: an extra alert line (only when this run switched one off)', async () => {
    const w = world({ products: 2, perProduct: 6 }); w.parts[1].qty = 0;     // the rim is in every variant
    const f = fake(w);
    const r = await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(r.changed.length, 12);
    assert.equal(r.alerts.length, 2);
    assert.ok(r.emailLines.includes('All builds of "Hub choice 0" are off: every variant is sold out'));
    assert.ok(r.emailLines.includes('Reserve 30|DH Carbon Rim out: 12 builds switched off (2 products)'));
    const again = await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(again.changed.length, 0); assert.equal(again.alerts.length, 0);       // quiet the next day
});

test('one hub out only closes its own variants; the others stay on sale and no all-off alert', async () => {
    const w = world({ products: 1, perProduct: 6 }); w.parts[102].qty = 0;
    const f = fake(w);
    const r = await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(r.changed.length, 2); assert.equal(r.alerts.length, 0);
    const open = f.state.products[0].variants.filter((v) => v.state !== 'sold_out_by_guard');
    assert.equal(open.length, 4);
});

test('writes are batched per product: one bulk update, one quantity call, one metafield call each', async () => {
    const w = world({ products: 2, perProduct: 6, qty: 2, policy: 'DENY', tracked: false }); w.parts[1].qty = 0;
    const f = fake(w);
    await runBuildGuard(createShopifyStore(f.gql));
    assert.deepEqual(f.calls.filter((c) => c.startsWith('bulkUpdate')), ['bulkUpdate:6', 'bulkUpdate:6']);
    assert.deepEqual(f.calls.filter((c) => c.startsWith('metafieldsSet')), ['metafieldsSet:6', 'metafieldsSet:6']);
    assert.deepEqual(f.calls.filter((c) => c.startsWith('setQty')), ['setQty:6', 'setQty:6']);
    assert.equal(f.calls.filter((c) => c === 'levels').length, 12);       // locations are read per variant, only because stock had to be zeroed
    for (const p of f.state.products) for (const v of p.variants) { assert.equal(v.qty, 0); assert.equal(v.policy, 'DENY'); assert.equal(v.tracked, true); }
});

test('no quantity call when masters already sit at 0 (CONTINUE, tracked): policy and state only', async () => {
    const w = world({ products: 1, perProduct: 6 }); w.parts[1].qty = 0;
    const f = fake(w);
    await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(f.calls.some((c) => c.startsWith('setQty') || c === 'levels'), false);
});

test('metafields are sent 25 at a time', async () => {
    const w = world({ products: 1, perProduct: 60 }); w.parts[1].qty = 0;
    const f = fake(w);
    await runBuildGuard(createShopifyStore(f.gql));
    assert.deepEqual(f.calls.filter((c) => c.startsWith('metafieldsSet')), ['metafieldsSet:25', 'metafieldsSet:25', 'metafieldsSet:10']);
    assert.deepEqual(f.calls.filter((c) => c.startsWith('bulkUpdate')), ['bulkUpdate:60']);
});

test('a product whose batch fails is reported once (grouped); the other products are still written', async () => {
    const w = world({ products: 2, perProduct: 6 }); w.parts[1].qty = 0; w.failBulk = 'gid://shopify/Product/P0';
    const f = fake(w);
    const r = await runBuildGuard(createShopifyStore(f.gql));
    assert.equal(r.failed.length, 6); assert.equal(r.changed.length, 6);
    assert.ok(r.emailLines.some((l) => /could not update 6 builds of "Hub choice 0"/.test(l)));
    assert.equal(f.state.products[0].variants.every((v) => v.state === undefined), true);
    assert.equal(f.state.products[1].variants.every((v) => v.state === 'sold_out_by_guard'), true);
});

test('dry run with the batch store writes nothing', async () => {
    const w = world({ products: 2, perProduct: 6 }); w.parts[1].qty = 0;
    const f = fake(w);
    const r = await runBuildGuard(createShopifyStore(f.gql), { dryRun: true });
    assert.equal(r.changed.length, 12); assert.equal(r.changed[0].dryRun, true);
    assert.equal(f.calls.some((c) => /^(bulkUpdate|setQty|metafieldsSet)/.test(c)), false);
});

test('a guard-off variant inside a hub-choice product is left alone and reported', async () => {
    const w = world({ products: 1, perProduct: 3 }); w.parts[1].qty = 0; w.products[0].variants[1].off = 'true';
    const r = await runBuildGuard(createShopifyStore(fake(w).gql));
    assert.equal(r.changed.length, 2); assert.equal(r.skipped.length, 1); assert.match(r.skipped[0], /switched off for this build/);
    assert.equal(r.alerts.length, 0);    // one variant is still guard-off, so the product is not "all off"
});
