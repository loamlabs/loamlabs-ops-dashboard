import { createClient } from '@supabase/supabase-js';
import { getShopifyToken } from './get-rules';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const { product_ids } = req.body;
  
  if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid product_ids array' });
  }

  try {
    const adminToken = await getShopifyToken();
    if (!adminToken) throw new Error("Missing Shopify Token");

    // Deduplicate array
    const uniqueIds = [...new Set(product_ids)];

    for (const pid of uniqueIds) {
      const productGid = `gid://shopify/Product/${pid}`;
      
      const IGNORE_TAG = "watcher-ignore";
      const updateRes = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation tagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } } }`,
          variables: { id: productGid, tags: [IGNORE_TAG] }
        })
      });
      
      const updateData = await updateRes.json();
      if (updateData.errors) {
          console.error("Shopify GraphQL Root Error:", updateData.errors);
      }
      if (updateData.data?.tagsAdd?.userErrors?.length > 0) {
         console.error("Shopify Mutate Error:", updateData.data.tagsAdd.userErrors);
      }
    }

    // Purge all variants of the targeted products from Supabase natively using a vectorized IN block mapped precisely to Strings to safely bypass Javascript BigInt arithmetic limits
    const stringifiedIds = uniqueIds.map(id => id.toString());
    await supabase.from('watcher_rules').delete().in('shopify_product_id', stringifiedIds);

    res.status(200).json({ success: true, count: uniqueIds.length });
  } catch (err) {
    console.error("Ignore API Error:", err);
    res.status(500).json({ error: err.message });
  }
}
