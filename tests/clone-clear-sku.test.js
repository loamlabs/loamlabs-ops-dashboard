const test = require('node:test');
const assert = require('node:assert/strict');
const { clearCopyIdentifiers, SKU_NOTE } = require('../lib/clone-clear-sku');

// Mocked Shopify: one original product and its copy, both in memory. No network.
function makeShop({ refuse = new Set(), silentIgnore = new Set(), pageSize = 100 } = {}) {
  const mk = (pid, n) => Array.from({ length: n }, (_, i) => ({ id: `gid://shopify/ProductVariant/${pid}${i}`, title: `v${i}`, sku: `SKU-${i}`, barcode: i % 2 ? `BC-${i}` : null }));
  const shop = { products: { 'gid://shopify/Product/1': mk('1', 3), 'gid://shopify/Product/2': mk('2', 3) }, updates: [] };
  shop.q = async (query, vars) => {
    if (query.includes('cloneSkuRead')) {
      const list = shop.products[vars.id];
      const start = vars.after ? Number(vars.after) : 0;
      const end = start + pageSize;
      return { data: { product: { variants: { pageInfo: { hasNextPage: end < list.length, endCursor: String(end) }, edges: list.slice(start, end).map((node) => ({ node: { ...node } })) } } } };
    }
    if (query.includes('cloneSkuClear')) {
      shop.updates.push({ productId: vars.productId, variants: vars.variants });
      const errs = [];
      for (const u of vars.variants) {
        if (refuse.has(u.id)) { errs.push({ field: ['variants'], message: 'refused ' + u.id }); continue; }
        if (silentIgnore.has(u.id)) continue; // accepted but not applied
        const v = shop.products[vars.productId].find((x) => x.id === u.id);
        v.sku = u.inventoryItem.sku || null;
        v.barcode = u.barcode || null;
      }
      return { data: { productVariantsBulkUpdate: { productVariants: [], userErrors: errs } } };
    }
    throw new Error('unexpected query');
  };
  return shop;
}
const COPY = 'gid://shopify/Product/2';
const ORIG = 'gid://shopify/Product/1';
const quiet = () => {};

test('the copy gets empty SKUs and barcodes, the original is untouched', async () => {
  const shop = makeShop();
  const before = JSON.stringify(shop.products[ORIG]);
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: quiet });
  assert.equal(r.failed.length, 0);
  assert.equal(r.total, 3);
  assert.equal(r.cleared, 3);
  assert.ok(shop.products[COPY].every((v) => !v.sku && !v.barcode));
  assert.equal(JSON.stringify(shop.products[ORIG]), before, 'original unchanged');
  assert.ok(shop.updates.every((u) => u.productId === COPY), 'only the copy was written');
});

test('barcodes are cleared too, and each update touches only sku and barcode', async () => {
  const shop = makeShop();
  await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: quiet });
  const sent = shop.updates[0].variants;
  assert.ok(sent.every((u) => u.barcode === '' && u.inventoryItem.sku === '' && Object.keys(u).sort().join() === 'barcode,id,inventoryItem'));
});

test('variants beyond the first page are cleared too', async () => {
  const shop = makeShop({ pageSize: 2 });
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: quiet });
  assert.equal(r.total, 3);
  assert.ok(shop.products[COPY].every((v) => !v.sku));
});

test('a variant that is already empty is not written', async () => {
  const shop = makeShop();
  shop.products[COPY].forEach((v) => { v.sku = null; v.barcode = null; });
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: quiet });
  assert.equal(shop.updates.length, 0);
  assert.equal(r.cleared, 0);
});

test('failure path: a refused variant is reported and logged, the others are still cleared', async () => {
  const bad = 'gid://shopify/ProductVariant/21';
  const shop = makeShop({ refuse: new Set([bad]) });
  const logs = [];
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: (...a) => logs.push(a.join(' ')) });
  assert.ok(r.failed.some((f) => f.id === bad));
  assert.equal(shop.products[COPY].filter((v) => v.sku).length, 1);
  assert.ok(logs.some((l) => l.includes('FAILED') && l.includes(bad)));
});

test('failure path: accepted but not applied is caught by the read-back', async () => {
  const bad = 'gid://shopify/ProductVariant/22';
  const shop = makeShop({ silentIgnore: new Set([bad]) });
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: shop.q, log: quiet });
  assert.deepEqual(r.failed.map((f) => f.id), [bad]);
  assert.match(r.failed[0].reason, /still has sku/);
});

test('failure path: a thrown error does not throw out of the clone', async () => {
  const shop = makeShop();
  const q = async (query, vars) => { if (query.includes('cloneSkuClear')) throw new Error('network down'); return shop.q(query, vars); };
  const r = await clearCopyIdentifiers({ newProductId: COPY, shopifyQuery: q, log: quiet });
  assert.equal(r.failed.length, 3);
});

test('the result note text', () => {
  assert.equal(SKU_NOTE, 'SKUs and barcodes were cleared on the copy; set new ones before going live.');
});
