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
    console.log(`[API] Querying Shopify for GID: ${gid}`);

    const query = `
      query($id: ID!) {
        product(id: $id) {
          title
          status
          handle
          vendor
          metafields(first: 50) {
            edges {
...
    const productMetafields = product.metafields?.edges.map(me => me.node) || [];

    return res.status(200).json({ 
      title: product.title, 
      handle: product.handle,
      vendor: product.vendor,
      variants, 
      metafields: productMetafields 
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
