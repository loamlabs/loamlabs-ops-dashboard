import { createClient } from '@supabase/supabase-js';

// Initialize Supabase only if credentials exist
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Helper to check supabase
const checkSupabase = (res) => {
  if (!supabase) {
    res.status(500).json({ 
      error: 'Supabase configuration is missing. Please check the server environment variables.',
      details: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is undefined.'
    });
    return false;
  }
  return true;
};

const SHOPIFY_DOMAIN = `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;

async function getShopifyToken() {
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/oauth/access_token`, {
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
  if (!checkSupabase(res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  const { productIds, addTag } = req.body;
  if (!productIds || !Array.isArray(productIds) || !addTag) {
    return res.status(400).json({ error: 'Missing productIds (array) or addTag' });
  }

  try {
    const SHOPIFY_TOKEN = await getShopifyToken();

    // 1. Fetch current tags for the first variant of each product to preserve them
    const { data: currentRules, error: fetchError } = await supabase
      .from('watcher_rules')
      .select('shopify_product_id, tags')
      .in('shopify_product_id', productIds);

    if (fetchError) throw fetchError;

    // 2. Perform updates product by product to ensure tag consistency
    const updatePromises = productIds.map(async (pid) => {
        const productRule = currentRules.find(r => r.shopify_product_id === pid);
        let tags = Array.isArray(productRule?.tags) ? [...productRule.tags] : [];
        
        if (!tags.includes(addTag)) {
            tags.push(addTag);
            
            // A. Update Supabase
            const { error: dbError } = await supabase
                .from('watcher_rules')
                .update({ tags })
                .eq('shopify_product_id', pid);
            
            if (dbError) return { error: dbError };

            // B. Sync to Shopify (Tags are at the PRODUCT level)
            const query = `mutation tagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`;
            const variables = { id: `gid://shopify/Product/${pid}`, tags: [addTag] };
            
            await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
              body: JSON.stringify({ query, variables })
            });
        }
        return { error: null };
    });

    const results = await Promise.all(updatePromises);
    const errors = results.filter(r => r.error).map(r => r.error);

    if (errors.length > 0) throw new Error(errors[0].message);

    res.status(200).json({ success: true, count: productIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
