const fs = require('fs');

async function check() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const shopName = envFile.match(/SHOPIFY_SHOP_NAME=([^\r\n]+)/)[1];
  const clientId = envFile.match(/SHOPIFY_CLIENT_ID=([^\r\n]+)/)[1];
  const clientSecret = envFile.match(/SHOPIFY_CLIENT_SECRET=([^\r\n]+)/)[1];

  const tokenRes = await fetch(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  });
  const { access_token } = await tokenRes.json();

  const query = `
    query {
      variantMetafields: metafieldDefinitions(first: 250, ownerType: PRODUCTVARIANT) {
        edges {
          node {
            namespace
            key
            type { name }
            validations { name value }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${shopName}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
      body: JSON.stringify({ query })
  });
  const data = await response.json();
  console.log(JSON.stringify(data.data.variantMetafields.edges.map(e => e.node), null, 2));
}
check();
