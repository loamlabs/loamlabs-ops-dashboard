// After productDuplicate, a copy must never share a SKU or barcode (GTIN) with the original.
// clearCopyIdentifiers pages every variant of the NEW product, clears sku and barcode where set,
// then reads them back. Failures are returned (and logged), never thrown, so the clone itself is not undone.
// shopifyQuery(query, variables) -> parsed GraphQL JSON ({ data, errors }).

const READ = `
  query cloneSkuRead($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title sku barcode } }
      }
    }
  }
`;

const UPDATE = `
  mutation cloneSkuClear($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku barcode }
      userErrors { field message }
    }
  }
`;

async function readAll(newProductId, shopifyQuery) {
  const out = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const r = await shopifyQuery(READ, { id: newProductId, after });
    const conn = r.data?.product?.variants;
    if (!conn) throw new Error('could not read variants of the copy: ' + JSON.stringify(r.errors || r).slice(0, 300));
    out.push(...conn.edges.map((e) => e.node));
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

const dirty = (v) => Boolean((v.sku && String(v.sku).trim()) || (v.barcode && String(v.barcode).trim()));

async function clearCopyIdentifiers({ newProductId, shopifyQuery, log = console.log }) {
  const failed = [];
  let variants;
  try {
    variants = await readAll(newProductId, shopifyQuery);
  } catch (e) {
    log('[CLONE_SKU] read failed:', e.message);
    return { total: 0, cleared: 0, failed: [{ id: null, title: null, reason: e.message }] };
  }
  const todo = variants.filter(dirty);
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    try {
      const r = await shopifyQuery(UPDATE, {
        productId: newProductId,
        variants: chunk.map((v) => ({ id: v.id, barcode: '', inventoryItem: { sku: '' } })),
      });
      const errs = r.data?.productVariantsBulkUpdate?.userErrors || [];
      if (r.errors || errs.length) {
        const reason = JSON.stringify(r.errors || errs).slice(0, 300);
        log('[CLONE_SKU] clear refused:', reason);
        chunk.forEach((v) => failed.push({ id: v.id, title: v.title, reason }));
      }
    } catch (e) {
      log('[CLONE_SKU] clear threw:', e.message);
      chunk.forEach((v) => failed.push({ id: v.id, title: v.title, reason: e.message }));
    }
  }
  // read back: anything still set counts as a failure (once per variant)
  try {
    const after = await readAll(newProductId, shopifyQuery);
    const seen = new Set(failed.map((f) => f.id));
    for (const v of after) {
      if (dirty(v) && !seen.has(v.id)) failed.push({ id: v.id, title: v.title, reason: 'still has sku/barcode after clearing' });
    }
  } catch (e) {
    log('[CLONE_SKU] read-back failed:', e.message);
    failed.push({ id: null, title: null, reason: 'read-back failed: ' + e.message });
  }
  failed.forEach((f) => log(`[CLONE_SKU] FAILED ${f.id} (${f.title}): ${f.reason}`));
  return { total: variants.length, cleared: todo.length - failed.filter((f) => f.id).length, failed };
}

const SKU_NOTE = 'SKUs and barcodes were cleared on the copy; set new ones before going live.';

module.exports = { clearCopyIdentifiers, SKU_NOTE };
