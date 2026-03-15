import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
    const { data: rules, error } = await supabase.from('watcher_rules').select('*');
    if (error) throw error;

    const adminToken = await getShopifyToken();
    const reports = [];

    for (const rule of rules) {
      const vResponse = await fetch(`${rule.vendor_url}.js`);
      const vData = await vResponse.json();

      // 1. Get the Spoke Number (e.g., "28")
      const spokeNum = rule.option_values["Spoke Count"].replace(/\D/g, ''); 
      const colorGoal = rule.option_values.Color.toLowerCase();

      // 2. SMARTER KEYWORD MATCHING
      const variant = vData.variants.find(v => {
        const title = v.public_title.toLowerCase();
        
        // It must contain the Color
        const hasColor = title.includes(colorGoal);
        
        // It must contain the Spoke Number, but NOT as part of the axle (110)
        // We look for "28" as a standalone word or segment
        const hasSpoke = title.split('/').some(segment => segment.trim().startsWith(spokeNum));

        // It should match the Position from your title (Front vs Rear)
        const isFront = rule.title.toLowerCase().includes('front') && title.includes('front');
        const isRear = rule.title.toLowerCase().includes('rear') && title.includes('rear');

        return hasColor && hasSpoke && (isFront || isRear);
      });

      if (variant) {
        const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
          headers: { 'X-Shopify-Access-Token': adminToken }
        });
        const sData = await sResponse.json();

        reports.push({
          item: rule.title,
          vendor_price: variant.price / 100,
          loamlabs_price: parseFloat(sData.variant.price),
          status: (variant.price / 100 == sData.variant.price) ? "MATCHED" : "PRICE MISMATCH",
          details: `Found: ${variant.public_title}`
        });

        await supabase.from('watcher_rules').update({ 
          last_price: variant.price, 
          last_run_at: new Date().toISOString() 
        }).eq('id', rule.id);

      } else {
        // DIAGNOSTIC: If we fail, show the first 5 names Berd actually uses
        const exampleNames = vData.variants.slice(0, 5).map(v => v.public_title);
        reports.push({ 
          item: rule.title, 
          status: "FAILED TO MATCH",
          search_was_for: `Color: ${colorGoal}, Spoke: ${spokeNum}`,
          berd_examples: exampleNames 
        });
      }
    }
    res.status(200).json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
