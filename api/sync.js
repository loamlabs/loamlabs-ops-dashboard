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

      const variant = vData.variants.find(v => {
        const title = v.public_title.toLowerCase();
        
        // 1. Spoke Check (Finds "28" regardless of "h", "Hole", or "Spoke")
        const spokeNum = rule.option_values["Spoke Count"] ? rule.option_values["Spoke Count"].replace(/\D/g, '') : null;
        const spokeMatch = spokeNum ? title.includes(spokeNum) : true;

        // 2. Color Check (Only checks if color is present in vendor title)
        const colorMatch = rule.option_values.Color ? title.includes(rule.option_values.Color.toLowerCase()) : true;

        // 3. Freehub Check (Critical for Rear Hubs)
        const freehubGoal = rule.option_values.Freehub ? rule.option_values.Freehub.toLowerCase() : null;
        const freehubMatch = freehubGoal ? title.includes(freehubGoal) : true;

        // 4. Position Check
        const isFront = rule.title.toLowerCase().includes('front') && title.includes('front');
        const isRear = rule.title.toLowerCase().includes('rear') && (title.includes('rear') || title.includes('hg') || title.includes('xd') || title.includes('ms'));

        return spokeMatch && colorMatch && freehubMatch && (isFront || isRear);
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
          matched_on: variant.public_title
        });

        await supabase.from('watcher_rules').update({ 
          last_price: variant.price, 
          last_run_at: new Date().toISOString() 
        }).eq('id', rule.id);
      } else {
        reports.push({ 
          item: rule.title, 
          status: "NOT FOUND", 
          debug: `Searched for Spoke: ${rule.option_values["Spoke Count"]}, Freehub: ${rule.option_values.Freehub || 'N/A'}`
        });
      }
    }
    res.status(200).json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
