import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EXCLUDED_TAGS = ['addon', 'component:freehub', 'component:spoke', 'component:valvestem', 'component:nipple', 'tires', 'rotor', 'tubeless-tape', 'forgebond', 'coloring-kit', 'wheelbuildingtools', 'fillmore-capkit', 'apparel', 'loamlabs10', 'assembly-service'];

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const adminToken = await getShopifyToken();
    let hasNextPage = true;
    let cursor = null;
    let importedTotal = 0;

    while (hasNextPage) {
      const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($after: String) { 
            products(first: 50, after: $after) { 
              pageInfo { hasNextPage } 
              edges { 
                cursor 
                node { 
                  id title vendor tags 
                  variants(first: 100) { 
                    edges { 
                      node { id title selectedOptions { name value } } 
                    } 
                  } 
                } 
              } 
            } 
          }`,
          variables: { after: cursor }
        })
      });

      const data = await response.json();
      const products = data.data?.products?.edges || [];
      if (products.length === 0) break;

      const filtered = products.filter(edge => {
        const tags = (edge.node.tags || []).map(t => t.toLowerCase());
        const vendor = edge.node.vendor?.toLowerCase() || '';
        return !tags.some(tag => EXCLUDED_TAGS.includes(tag)) && vendor !== 'your own component';
      });

      if (filtered.length > 0) {
        let variantBatch = [];
        for (const p of filtered) {
          const seenTechnicalSpecs = new Set();
          for (const v of p.node.variants.edges) {
            const spokeCountValue = v.node.selectedOptions.find(opt => opt.name.toLowerCase().includes('spoke count'))?.value || 'Std';
            const technicalKey = `${p.node.id}-${spokeCountValue}`;

            if (!seenTechnicalSpecs.has(technicalKey)) {
              seenTechnicalSpecs.add(technicalKey);
              const mappedOptions = {};
              v.node.selectedOptions.forEach(opt => { mappedOptions[opt.name] = opt.value; });

              variantBatch.push({
                shopify_product_id: p.node.id.split('/').pop(),
                shopify_variant_id: v.node.id.split('/').pop(),
                title: `${p.node.title} (${spokeCountValue})`.replace(/×/g, 'x'),
                vendor_name: p.node.vendor,
                auto_update: false,
                site_type: 'SHOPIFY',
                option_values: mappedOptions,
                price_adjustment_factor: 1.1111 
              });
            }
          }
        }
        
        if (variantBatch.length > 0) {
          const { error: upsertError } = await supabase.from('watcher_rules').upsert(variantBatch, { onConflict: 'shopify_variant_id' });
          if (upsertError) throw upsertError;
          importedTotal += variantBatch.length;
        }
      }
      
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      if (hasNextPage) cursor = products[products.length - 1].cursor;
    }

    res.status(200).json({ success: true, count: importedTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
