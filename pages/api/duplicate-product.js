import { createClient } from '@supabase/supabase-js';

const SHOPIFY_DOMAIN = `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

async function shopifyQuery(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { productId, options } = req.body; 
  if (!productId) return res.status(400).json({ error: 'Missing productId' });

  const { newTitle, status, includeMedia } = options || {};

  try {
    // 1. Duplicate the Product via Shopify GraphQL
    const duplicateMutation = `
      mutation productDuplicate($newTitle: String, $productId: ID!, $includeImages: Boolean, $newStatus: ProductStatus) {
        productDuplicate(newTitle: $newTitle, productId: $productId, includeImages: $includeImages, newStatus: $newStatus) {
          newProduct { id title handle variants(first: 100) { edges { node { id title sku } } } }
          userErrors { field message }
        }
      }
    `;

    const dupRes = await shopifyQuery(duplicateMutation, { 
      productId, 
      newTitle: newTitle || undefined,
      includeImages: includeMedia ?? true,
      newStatus: status || 'ACTIVE'
    });
    const dupData = dupRes.data?.productDuplicate;

    if (dupData?.userErrors?.length > 0) {
      return res.status(400).json({ error: dupData.userErrors[0].message });
    }

    const newProduct = dupData.newProduct;

    // 2. Fetch Metafields from Source Product & Variants
    const sourceDataQuery = `
      query getProductMeta($id: ID!) {
        product(id: $id) {
          metafields(first: 50) { edges { node { namespace key value type } } }
          variants(first: 100) {
            edges {
              node {
                title
                sku
                metafields(first: 50) { edges { node { namespace key value type } } }
              }
            }
          }
        }
      }
    `;

    const sourceRes = await shopifyQuery(sourceDataQuery, { id: productId });
    const sourceProduct = sourceRes.data?.product;
    if (!sourceProduct) return res.status(404).json({ error: 'Source product not found for metafield copy' });

    // 3. Apply Metafields to New Product
    const metafieldsToSet = [];

    // Product Level
    sourceProduct.metafields.edges.forEach(({ node }) => {
      // Skip internal shopify ones if any
      if (node.namespace !== 'shopify') {
        metafieldsToSet.push({
          ownerId: newProduct.id,
          namespace: node.namespace,
          key: node.key,
          value: node.value,
          type: node.type
        });
      }
    });

    // Variant Level
    // We match variants by TITLE. This is the safest way since titles should match exactly on duplication.
    sourceProduct.variants.edges.forEach(({ node: sourceVariant }) => {
      const targetVariant = newProduct.variants.edges.find(e => e.node.title === sourceVariant.title)?.node;
      if (targetVariant) {
        sourceVariant.metafields.edges.forEach(({ node: meta }) => {
          if (meta.namespace !== 'shopify') {
            metafieldsToSet.push({
              ownerId: targetVariant.id,
              namespace: meta.namespace,
              key: meta.key,
              value: meta.value,
              type: meta.type
            });
          }
        });
      }
    });

    // 4. Batch Set Metafields
    if (metafieldsToSet.length > 0) {
      const setMetaMutation = `
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key }
            userErrors { field message }
          }
        }
      `;
      // Chunking if too many
      const chunkSize = 25;
      for (let i = 0; i < metafieldsToSet.length; i += chunkSize) {
        await shopifyQuery(setMetaMutation, { metafields: metafieldsToSet.slice(i, i + chunkSize) });
      }
    }

    return res.status(200).json({ 
      success: true, 
      newProductId: newProduct.id,
      newHandle: newProduct.handle,
      message: `Product duplicated and ${metafieldsToSet.length} metafields migrated.` 
    });

  } catch (error) {
    console.error('Duplication Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
