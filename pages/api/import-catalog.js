import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EXCLUDED_TAGS = [
  'addon', 'component:freehub', 'component:spoke', 'component:valvestem', 
  'component:nipple', 'tires', 'rotor', 'tubeless-tape', 'forgebond', 
  'coloring-kit', 'wheelbuildingtools', 'fillmore-capkit', 'apparel', 
  'loamlabs10', 'assembly-service'
];

async function getShopifyToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });
  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const adminToken = await getShopifyToken();
    let hasNextPage = true;
    let cursor = null;
    let importedTotal = 0;

    while (hasNextPage) {
      const shopifyRes = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($after: String) { 
            products(first: 250, after: $after) { 
              pageInfo { hasNextPage } 
              edges { 
                cursor 
                node { 
                  id title vendor tags
                  variants(first: 1) { edges { node { id } } } 
                } 
              } 
            } 
          }`,
          variables: { after: cursor }
        })
      });

      const data = await shopifyRes.json();
      const products = data.data.products.edges;

      // Filter out products that have any of the forbidden tags
      const filteredProducts = products.filter(edge => {
        const productTags = edge.node.tags.map(t => t.toLowerCase());
        return !productTags.some(tag => EXCLUDED_TAGS.includes(tag));
      });

      if (filteredProducts.length > 0) {
        const rulesToUpsert = filteredProducts.map(p => ({
          shopify_product_id: p.node.id.split('/').pop(),
          shopify_variant_id: p.node.variants.edges[0]?.node.id.split('/').pop(),
          title: p.node.title,
          vendor_name: p.node.vendor,
          auto_update: false,
          site_type: 'SHOPIFY'
        }));

        const { error } = await supabase
          .from('watcher_rules')
          .upsert(rulesToUpsert, { onConflict: 'shopify_product_id' });

        if (error) throw error;
        importedTotal += filteredProducts.length;
      }
      
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      if (hasNextPage) cursor = products[products.length - 1].cursor;
    }

    res.status(200).json({ success: true, count: importedTotal });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
