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
  if (!response.ok) throw new Error(`Shopify Auth Failed: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });
  const { query } = req.query;

  try {
    const adminToken = await getShopifyToken();
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;

    console.log("--- STARTING SHOPIFY DISCOVERY ---");

    while (hasNextPage) {
      // Use a more generic query that doesn't rely on 'query' if not searching
      const gqlQuery = query 
        ? `query($q: String, $after: String) { products(first: 250, query: $q, after: $after) { pageInfo { hasNextPage } edges { cursor node { id title vendor } } } }`
        : `query($after: String) { products(first: 250, after: $after) { pageInfo { hasNextPage } edges { cursor node { id title vendor } } } }`;

      const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: gqlQuery,
          variables: { 
            ...(query && { q: `title:*${query}*` }),
            after: cursor 
          }
        })
      });

      const data = await response.json();
      
      if (data.errors) {
        console.error("Shopify GraphQL Error:", data.errors);
        throw new Error(data.errors[0].message);
      }

      const pageProducts = data.data.products.edges || [];
      allProducts = [...allProducts, ...pageProducts];
      
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      if (hasNextPage && pageProducts.length > 0) {
        cursor = pageProducts[pageProducts.length - 1].cursor;
        console.log(`Page Fetched. Total so far: ${allProducts.length}`);
      } else {
        hasNextPage = false;
      }
    }

    console.log(`DISCOVERY COMPLETE: Found ${allProducts.length} items.`);
    res.status(200).json(allProducts);

  } catch (err) {
    console.error("Discovery Engine CRASHED:", err.message);
    res.status(500).json({ error: err.message });
  }
}
