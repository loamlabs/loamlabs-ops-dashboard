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
  if (!checkSupabase(res)) return;
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const adminToken = await getShopifyToken();
    
    // 1. Get ALL unique vendors from your Shopify store
    const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ shop { productVendors(first: 100) { edges { node } } } }` })
    });
    const sData = await sResponse.json();
    const allShopifyVendors = sData.data.shop.productVendors.edges.map(e => e.node).sort();

    // 2. Get the saved logo mappings from Supabase
    const { data: savedLogos } = await supabase.from('vendor_logos').select('*');
    
    res.status(200).json({ vendors: allShopifyVendors, savedLogos: savedLogos || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
