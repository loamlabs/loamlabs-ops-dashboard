// Row ids for the Component library grid.
// Every row needs its own id (_rid): the grid finds, selects and edits cells by "<rid>|<column>".
// Before this fix a successful save put rows back WITHOUT a _rid, and the grid then fell back to the
// Shopify product id, which every variant of a product shares. Two rows with one id = clicking one cell
// selected both and none could be edited.

const SKIP_KEYS = ['_rid', '_rawIdx', '_editIdx', '_isNew', 'id', 'ID', 'shopify_product_id', 'Product ID', 'Variant ID'];

// The same ids the grid has always made when the library is loaded.
function hydrateRows(rawList) {
  const seen = new Set();
  return (rawList || []).map((item, idx) => {
    const baseId = item.id || item.ID || item.shopify_product_id || item['Product ID'];
    const title = item.Title || item.title || item.Name || item.name || 'NoTitle';
    const vendor = item.Vendor || item.vendor || item.Brand || item.brand || 'NoVendor';
    const specs = Object.keys(item).filter((k) => !SKIP_KEYS.includes(k)).sort().map((k) => `${k}:${item[k]}`).join('|');
    const hash = `${title}_${vendor}_${specs}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    let rid = item && item._rid;
    // a numeric id looks like a Shopify id: use the content hash instead so rows stay separate
    if (!rid || /^\d+$/.test(String(rid))) rid = `rid_${hash}`;
    if (seen.has(rid)) rid = `${rid}_${idx}`;
    seen.add(rid);
    return { ...item, shopify_product_id: baseId, _rid: rid, _rawIdx: idx };
  });
}

// What the grid uses as a row's id (same rules as before, kept in one place so it can be tested).
function rowIdOf(item, index) {
  if (!item) return `empty_${index || 'unknown'}`;
  if (item._rid) return item._rid;
  const baseId = item.id || item.shopify_product_id || item.ID || item['Product ID'] || item['Variant ID'];
  if (baseId) return String(baseId);
  const name = String(item.Title || item.Name || item.name || item.title || 'Unknown').trim();
  const vendor = String(item.Vendor || item.vendor || item.Brand || item.brand || 'Unknown').trim();
  const cleanName = `${vendor}_${name}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanName}_${item._rawIdx !== undefined ? item._rawIdx : index}`;
}

module.exports = { hydrateRows, rowIdOf };
