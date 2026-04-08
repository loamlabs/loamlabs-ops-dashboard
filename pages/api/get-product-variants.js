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
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { productId } = req.query;
  if (!productId) {
    return res.status(400).json({ error: 'Missing productId parameter' });
  }

  try {
    const adminToken = await getShopifyToken();
    const shopifyUrl = `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`;
    
    // Convert short ID to GID if needed
    const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

    const query = `
      query($id: ID!) {
        product(id: $id) {
          title
          variants(first: 250) {
            edges {
              node {
                id
                title
                sku
                selectedOptions {
                  name
                  value
                }
              }
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
      body: JSON.stringify({ query, variables: { id: gid } })
    });

    const data = await response.json();
    if (data.errors) {
      return res.status(500).json({ error: 'Shopify API Error', details: data.errors });
    }

    const product = data.data?.product;
    if (!product) {
      return res.status(404).json({ error: 'Product not found in Shopify' });
    }

    const variants = product.variants.edges.map(e => ({
      id: e.node.id.split('/').pop(), // Return the numeric part if needed, or full GID? Let's keep it consistent.
      full_id: e.node.id,
      title: e.node.title,
      options: e.node.selectedOptions.reduce((acc, opt) => {
        acc[opt.name] = opt.value;
        return acc;
      }, {})
    }));

    return res.status(200).json({ title: product.title, variants });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
