import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Function to get the temporary token (The 2026 Method)
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
  try {
    // 2. Fetch rules from Supabase
    const { data: rules, error } = await supabase.from('watcher_rules').select('*');
    if (error) throw error;

    // 3. Get our temporary Shopify key
    const adminToken = await getShopifyToken();
    const reports = [];

    for (const rule of rules) {
      // 4. Scrape the Vendor (Berd)
      const vResponse = await fetch(`${rule.vendor_url}.js`);
      const vData = await vResponse.json();

      const variant = vData.variants.find(v => 
        v.public_title.includes(rule.option_values.Color) && 
        v.public_title.includes(rule.option_values["Spoke Count"])
      );

      if (variant) {
        // 5. Fetch YOUR current price from Shopify to compare
        const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
          headers: { 'X-Shopify-Access-Token': adminToken }
        });
        const sData = await sResponse.json();
        const myPrice = sData.variant.price;

        reports.push({
          item: rule.title,
          berd_price: variant.price / 100,
          my_current_price: myPrice,
          status: (variant.price / 100 == myPrice) ? "Matched" : "Price Mismatch!"
        });

        // 6. Update Supabase memory
        await supabase.from('watcher_rules')
          .update({ last_price: variant.price, last_run_at: new Date() })
          .eq('id', rule.id);
      }
    }
    res.status(200).json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
