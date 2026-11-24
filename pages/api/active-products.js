import { getShopifyToken } from '../../lib/build-guard-run';
import { makeGql } from '../../lib/build-guard-shopify';

// READ ONLY. The ids of the ACTIVE store products (about 730; 3 Shopify pages, well under a second), used by the vendor connection dots on the
// Vendor Watcher home to count only items we sell now (drafted and archived products are ignored). Cached in memory for 10 minutes.
//   GET /api/active-products   header x-dashboard-auth = DASHBOARD_PASSWORD   ->  { ids: ["...", ...], cached: boolean, ms: number }
const TTL_MS = 10 * 60 * 1000;
let cache = null;

export default async function handler(req, res) {
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const t0 = Date.now();
  if (cache && Date.now() - cache.at < TTL_MS) return res.status(200).json({ ids: cache.ids, cached: true, ms: Date.now() - t0 });
  try {
    const token = await getShopifyToken(fetch, process.env);
    const gql = makeGql(fetch, process.env.SHOPIFY_SHOP_NAME, token, '2025-01');
    const ids = []; let cursor = null;
    for (let page = 0; page < 40; page++) {
      const d = await gql('query($c:String){products(first:250,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor} nodes{id}}}', { c: cursor });
      d.products.nodes.forEach((n) => ids.push(n.id.split('/').pop()));
      if (!d.products.pageInfo.hasNextPage) break;
      cursor = d.products.pageInfo.endCursor;
    }
    cache = { at: Date.now(), ids };
    return res.status(200).json({ ids, cached: false, ms: Date.now() - t0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
