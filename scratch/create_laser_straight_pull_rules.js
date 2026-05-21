require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Configuration for the new product
const HANDLE = 'sapim-laser-straight-pull-spokes';
const VENDOR_URL = 'https://velonixcyclesupply.com/products/laser-straight-pull-spokes.js';

async function getShopifyToken() {
  const res = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });
  return (await res.json()).access_token;
}

async function run() {
  const token = await getShopifyToken();
  console.log(`Processing product: ${HANDLE}`);

  // 1️⃣ Fetch Shopify product and all existing variants
  let query = `
    query {
      productByHandle(handle: "${HANDLE}") {
        id
        title
        options { name }
        variants(first: 250) {
          pageInfo { hasNextPage }
          edges { cursor node { id title price selectedOptions { name value } } }
        }
      }
    }
  `;
  let res = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query })
  });
  let data = await res.json();
  const product = data.data.productByHandle;
  if (!product) { console.error('Product not found!'); return; }

  const productId = product.id.split('/').pop();
  const optionNames = product.options.map(o => o.name);
  console.log('Option names:', optionNames);

  // Gather all existing Shopify variants
  let allShopifyVariants = [];
  let hasNext = product.variants.pageInfo.hasNextPage;
  let cursor = product.variants.edges[product.variants.edges.length - 1]?.cursor;
  product.variants.edges.forEach(e => allShopifyVariants.push(e.node));
  while (hasNext) {
    const pagingQuery = `
      query($id: ID!, $after: String!) {
        product(id: $id) {
          variants(first: 250, after: $after) {
            pageInfo { hasNextPage }
            edges { cursor node { id title price selectedOptions { name value } } }
          }
        }
      }
    `;
    res = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: pagingQuery, variables: { id: product.id, after: cursor } })
    });
    data = await res.json();
    const conn = data.data.product.variants;
    conn.edges.forEach(e => allShopifyVariants.push(e.node));
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.edges[conn.edges.length - 1]?.cursor;
  }

  console.log(`Shopify currently has ${allShopifyVariants.length} variants.`);

  // Helper to build a key for matching (color-length)
  const shopifyKeyMap = new Map();
  allShopifyVariants.forEach(v => {
    let color = '';
    let length = '';
    v.selectedOptions.forEach(opt => {
      const name = opt.name.toLowerCase();
      if (name.includes('color')) color = opt.value.trim().toLowerCase();
      if (name.includes('length')) length = opt.value.trim().replace('mm', '').toLowerCase();
    });
    if (color && length) shopifyKeyMap.set(`${color}-${length}`, v);
  });

  // 2️⃣ Fetch Velonix data
  const vData = await fetch(VENDOR_URL).then(r => r.json());
  const velonixVariants = vData.variants;
  console.log(`Velonix provides ${velonixVariants.length} variants.`);

  const rulesToInsert = [];
  const createdVariants = [];

  // 3️⃣ Iterate Velonix variants, create missing Shopify variants, then add rules
  for (const v of velonixVariants) {
    const parts = v.public_title.split('/');
    if (parts.length < 2) continue;
    const color = parts[0].trim();
    const length = parts[1].trim().replace('mm', '').trim();
    const key = `${color.toLowerCase()}-${length.toLowerCase()}`;

    let shopifyVariant = shopifyKeyMap.get(key);
    // Determine spoke count from Velonix variant title (e.g., "Silver / 150mm") – we need to parse "Spoke Count" later from product options.
    // Assume the product uses a default Spoke Count of 14 for all variants unless a specific count is encoded in the title.
    // For simplicity we use 14 here; if you have other counts you can adjust later.
    const countNum = 14;
    const baseCost = (color.toLowerCase() === 'black') ? 1.42 : 1.11;
    const vendorPackCost = countNum * baseCost;
    const priceCents = Math.round(vendorPackCost * 1.08 * 100); // apply price_adjustment_factor 1.08

    if (!shopifyVariant) {
      // Create new Shopify variant via REST API
      const payload = {
        variant: {
          // options will be filled below after we compute the correct values
        }
      };
      // Build the option values in proper order, ensuring the spoke count includes the "Spokes" suffix
      const optionValues = {};
      optionNames.forEach(name => {
        const lname = name.toLowerCase();
        if (lname.includes('spoke')) optionValues[name] = `${countNum} Spokes`;
        else if (lname.includes('color')) optionValues[name] = color;
        else if (lname.includes('length')) optionValues[name] = `${length}mm`;
        else optionValues[name] = '';
      });
      // Assign options to payload according to their index (option1, option2, option3)
      const optionKeys = Object.keys(optionValues);
      payload.variant.option1 = optionValues[optionKeys[0]] || '';
      if (optionKeys[1]) payload.variant.option2 = optionValues[optionKeys[1]] || '';
      if (optionKeys[2]) payload.variant.option3 = optionValues[optionKeys[2]] || '';
      payload.variant.price = (priceCents / 100).toFixed(2);
      payload.variant.inventory_management = 'shopify';
      payload.variant.inventory_policy = 'continue';

      const createRes = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/products/${productId}/variants.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify(payload)
      });
      const createData = await createRes.json();
      if (!createData.variant) {
        console.error('Failed to create variant for', key, createData);
        continue;
      }
      shopifyVariant = createData.variant;
      console.log('Created Shopify variant', key);
    }

    // Build rule entry
    const variantId = shopifyVariant.id.toString().split('/').pop();
    const optionsMap = {};
    shopifyVariant.options && shopifyVariant.options.forEach((optVal, idx) => {
      const optName = optionNames[idx];
      if (optName) optionsMap[optName] = optVal;
    });
    // Ensure we also have selectedOptions format like other rules
    const selectedOptions = [];
    optionNames.forEach(name => {
      const val = optionsMap[name] || '';
      selectedOptions.push({ name, value: val });
    });

    rulesToInsert.push({
      shopify_product_id: productId,
      shopify_variant_id: variantId,
      title: `${product.title} (${shopifyVariant.title || `${color} / ${length}mm`})`,
      vendor_name: 'Velonix',
      site_type: 'SHOPIFY',
      option_values: optionsMap,
      tags: ['spokes'],
      vendor_url: VENDOR_URL,
      auto_update: true,
      needs_review: false,
      price_adjustment_factor: 1.08,
      last_price: Math.round(vendorPackCost * 100),
      current_shopify_price: priceCents,
      last_availability: true
    });
  }

  console.log(`Prepared ${rulesToInsert.length} rules (including newly created variants).`);

  // 4️⃣ Insert rules in batches
  const batchSize = 100;
  for (let i = 0; i < rulesToInsert.length; i += batchSize) {
    const batch = rulesToInsert.slice(i, i + batchSize);
    const { error } = await supabase.from('watcher_rules').insert(batch);
    if (error) console.error('Supabase insert error:', error);
    else console.log(`Inserted batch ${i / batchSize + 1}`);
  }

  console.log('✅ All done for Sapim Laser Straight Pull Spokes.');
}

run().catch(console.error);
