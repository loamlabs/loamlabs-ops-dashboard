import { createClient } from '@supabase/supabase-js';

const SHOPIFY_DOMAIN = `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const { ids, metafields, targetType } = req.body; // ids: array of Shopify IDs (product or variant), targetType: 'Product' | 'ProductVariant'
  if (!ids || !Array.isArray(ids) || !metafields || !Array.isArray(metafields) || !targetType) {
    return res.status(400).json({ error: 'Missing ids, metafields (array) or targetType' });
  }

  try {
    const SHOPIFY_TOKEN = await getShopifyToken();

    // 1. Prepare batch of metafield set mutations
    const metafieldsToSet = [];
    ids.forEach(id => {
      // Ensure Shopify ID formatting
      const shopifyId = id.includes('gid://') ? id : `gid://shopify/${targetType}/${id}`;
      
      metafields.forEach(meta => {
        metafieldsToSet.push({
          ownerId: shopifyId,
          namespace: meta.namespace,
          key: meta.key,
          value: String(meta.value),
          type: meta.type || 'single_line_text_field'
        });
      });
    });

    if (metafieldsToSet.length > 0) {
      const setMetaMutation = `
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key }
            userErrors { field message }
          }
        }
      `;
      
      const chunkSize = 25;
      for (let i = 0; i < metafieldsToSet.length; i += chunkSize) {
        const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
          body: JSON.stringify({ query: setMetaMutation, variables: { metafields: metafieldsToSet.slice(i, i + chunkSize) } })
        });
        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);
        if (data.data?.metafieldsSet?.userErrors?.length > 0) {
           return res.status(400).json({ error: data.data.metafieldsSet.userErrors[0].message });
        }
      }

      // 2. Synchronize Supabase
      const updateData = {};
      metafields.forEach(meta => {
        // Map back to our column names if necessary (e.g. if we used prefixes)
        updateData[meta.key] = meta.value;
      });

      const { error: dbError } = await supabase
        .from('watcher_rules')
        .update(updateData)
        .in('shopify_variant_id', ids.map(id => id.split('/').pop()));
      
      if (dbError) throw dbError;
    }

    res.status(200).json({ success: true, count: ids.length, fields: metafields.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
