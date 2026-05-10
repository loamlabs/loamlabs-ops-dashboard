import { createClient } from '@supabase/supabase-js';

const SHOPIFY_DOMAIN = `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;

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

  const { ids, metafields, targetType, imageUrl, productId } = req.body; // ids: array of Shopify IDs (product or variant), targetType: 'Product' | 'ProductVariant'
  if (!ids || !Array.isArray(ids) || !metafields || !Array.isArray(metafields) || !targetType) {
    return res.status(400).json({ error: 'Missing ids, metafields (array) or targetType' });
  }

  try {
    const SHOPIFY_TOKEN = await getShopifyToken();

    // 1. Prepare batch of metafield set mutations
    const metafieldsToSet = [];
    ids.forEach(id => {
      // Ensure Shopify ID formatting
      const stringId = String(id);
      const shopifyId = stringId.includes('gid://') ? stringId : `gid://shopify/${targetType}/${stringId}`;
      
      metafields.forEach(meta => {
        let finalVal = String(meta.value);
        if (meta.type && meta.type.startsWith('list.') && !finalVal.startsWith('[')) {
          finalVal = JSON.stringify(finalVal.split(',').map(s => s.trim()).filter(Boolean));
        }

        metafieldsToSet.push({
          ownerId: shopifyId,
          namespace: meta.namespace,
          key: meta.key,
          value: finalVal,
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
        const shopifyRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
          body: JSON.stringify({ query: setMetaMutation, variables: { metafields: metafieldsToSet.slice(i, i + chunkSize) } })
        });
        const data = await shopifyRes.json();
        if (data.errors) throw new Error(data.errors[0].message);
        if (data.data?.metafieldsSet?.userErrors?.length > 0) {
           return res.status(400).json({ error: data.data.metafieldsSet.userErrors[0].message });
        }
      }

      // 2. Synchronize Supabase (Only for columns that exist)
      const { data: schemaCheck } = await supabase.from('watcher_rules').select('*').limit(1);
      const validColumns = schemaCheck && schemaCheck.length > 0 ? Object.keys(schemaCheck[0]) : [];

      const updateData = {};
      metafields.forEach(meta => {
        if (validColumns.includes(meta.key)) updateData[meta.key] = meta.value;
        else if (validColumns.includes(`product_${meta.key}`)) updateData[`product_${meta.key}`] = meta.value;
      });

      if (Object.keys(updateData).length > 0) {
        const { error: dbError } = await supabase
          .from('watcher_rules')
          .update(updateData)
          .in('shopify_variant_id', ids.map(id => String(id).split('/').pop()));
        
        if (dbError) throw dbError;
      }
    }

    // 3. Process Variant Thumbnail Image URL if provided
    if (imageUrl && targetType === 'ProductVariant' && productId) {
      const cleanProdId = String(productId).split('/').pop();
      const variantIds = ids.map(id => parseInt(String(id).split('/').pop(), 10));
      
      // Fetch existing product images to avoid duplicating the same image
      const imagesRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-04/products/${cleanProdId}/images.json`, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      const imagesData = await imagesRes.json();
      const existingImages = imagesData.images || [];
      
      // Clean query params for comparison (Shopify adds ?v=...)
      const cleanInputUrl = imageUrl.split('?')[0];
      const match = existingImages.find(img => img.src.split('?')[0] === cleanInputUrl);
      
      if (match) {
        // Image exists, append the new variant IDs to it
        const mergedVariantIds = Array.from(new Set([...(match.variant_ids || []), ...variantIds]));
        const updateRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-04/products/${cleanProdId}/images/${match.id}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
          body: JSON.stringify({ image: { id: match.id, variant_ids: mergedVariantIds } })
        });
        if (!updateRes.ok) throw new Error("Failed to update existing product image with variants");
      } else {
        // Image doesn't exist on product, upload it and assign to variants
        const createRes = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-04/products/${cleanProdId}/images.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
          body: JSON.stringify({ image: { src: imageUrl, variant_ids: variantIds } })
        });
        if (!createRes.ok) throw new Error("Failed to upload new variant image");
      }
    }

    res.status(200).json({ success: true, count: ids.length, fields: metafields.length });
  } catch (err) {
    console.error("Bulk Update Error:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}
