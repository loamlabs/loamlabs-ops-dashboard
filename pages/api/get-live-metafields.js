// pages/api/get-live-metafields.js
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'Missing productId' });

  try {
    const token = await getShopifyToken();
    const shopToken = token;

    // We query both the product's metafields and its variants' metafields
    // To be safe, we fetch the first 100 metafields (custom namespace).
    const query = `
      query getMetafields($id: ID!) {
        product(id: $id) {
          metafields(first: 100) {
            edges {
              node {
                key
                value
                type
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                metafields(first: 100) {
                  edges {
                    node {
                      key
                      value
                      type
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopToken,
      },
      body: JSON.stringify({
        query,
        variables: { id: `gid://shopify/Product/${productId}` }
      })
    });

    const data = await response.json();
    if (data.errors) {
      console.error('GraphQL Metafield Fetch Error:', data.errors);
      return res.status(500).json({ error: 'Shopify Error', details: data.errors });
    }

    const prodData = data.data.product;
    if (!prodData) return res.status(404).json({ error: 'Product not found' });

    const productMetafields = prodData.metafields.edges.map(e => e.node);
    const variantsMetafields = {};
    prodData.variants.edges.forEach(vEdge => {
      const vId = vEdge.node.id.split('/').pop();
      variantsMetafields[vId] = vEdge.node.metafields.edges.map(e => e.node);
    });

    res.status(200).json({ success: true, productMetafields, variantsMetafields });
  } catch (error) {
    console.error('Fetch Metafields API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
