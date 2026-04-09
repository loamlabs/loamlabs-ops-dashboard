
async function getShopifyToken() {
  const shopName = process.env.SHOPIFY_SHOP_NAME;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shopName || !clientId || !clientSecret) {
    throw new Error('Shopify credentials missing from environment (SHOPIFY_SHOP_NAME, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET)');
  }

  const response = await fetch(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  
  if (!response.ok) {
     const errorText = await response.text();
     throw new Error(`Failed to get Shopify token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  // 1. Auth Check
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 2. Request Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed (Use POST)' });
  }

  const { variantIds } = req.body;
  if (!variantIds || !Array.isArray(variantIds)) {
    return res.status(400).json({ error: 'Missing or invalid variantIds array' });
  }

  if (variantIds.length === 0) {
    return res.status(200).json({});
  }

  try {
    const adminToken = await getShopifyToken();
    const shopifyUrl = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;

    // Map short IDs to Shopify GIDs - Shopify Variant GID is 'gid://shopify/ProductVariant/ID'
    const gids = variantIds.map(id => {
       if (!id) return null;
       id = String(id).trim();
       if (id.startsWith('gid://')) return id;
       // Handle numeric string or raw number
       const numericId = id.split('/').pop();
       return `gid://shopify/ProductVariant/${numericId}`;
    }).filter(Boolean);
    
    if (gids.length === 0) return res.status(200).json({});

    const query = `
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            sku
            product {
               id
               title
               metafields(first: 50) {
                 edges {
                   node { key namespace value }
                 }
               }
            }
            metafields(first: 50) {
              edges {
                node { key namespace value }
              }
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    `;

    const response = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { ids: gids.slice(0, 100) } }) // Batch limit safety
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[API] Shopify GraphQL HTTP Error: ${response.status}`, errText);
        return res.status(response.status).json({ error: 'Shopify HTTP Error', details: errText });
    }

    const data = await response.json();
    if (data.errors) {
       console.error(`[API] Shopify GraphQL Query Errors:`, JSON.stringify(data.errors));
       return res.status(500).json({ error: 'Shopify Query Error', details: data.errors });
    }

    const nodes = data.data?.nodes || [];
    const variantMap = {};

    nodes.forEach((node, index) => {
       if (!node || !node.id) {
          console.warn(`[API] Node at index ${index} (GID: ${gids[index]}) was NOT FOUND or is not a ProductVariant.`);
          return;
       }
       
       const shortId = node.id.split('/').pop();
       variantMap[shortId] = {
          id: shortId,
          full_id: node.id,
          title: node.title,
          sku: node.sku,
          product: node.product ? {
             id: node.product.id.split('/').pop(),
             title: node.product.title,
             metafields: node.product.metafields?.edges.map(e => e.node) || []
          } : null,
          metafields: node.metafields?.edges.map(e => e.node) || [],
          option1: node.selectedOptions?.[0]?.value,
          option2: node.selectedOptions?.[1]?.value,
          option3: node.selectedOptions?.[2]?.value,
          options: node.selectedOptions?.reduce((acc, opt) => {
             acc[opt.name] = opt.value;
             return acc;
          }, {}) || {}
       };
    });

    return res.status(200).json(variantMap);
  } catch (e) {
    console.error('[API] Unexpected Error in get-variant-details:', e);
    return res.status(500).json({ error: 'Internal Server Error', details: e.message });
  }
}
