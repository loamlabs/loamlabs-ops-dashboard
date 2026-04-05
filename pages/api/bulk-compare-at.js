import { createClient } from '@supabase/supabase-js';

// Initialize Supabase only if credentials exist
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Helper to check supabase
const checkSupabase = (res) => {
  if (!supabase) {
    res.status(500).json({ 
      error: 'Supabase configuration is missing. Please check the server environment variables.',
      details: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is undefined.'
    });
    return false;
  }
  return true;
};


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
  if (!checkSupabase(res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  const { ruleIds } = req.body;
  if (!ruleIds || !Array.isArray(ruleIds) || ruleIds.length === 0) {
    return res.status(400).json({ error: 'ruleIds array required' });
  }

  try {
    const adminToken = await getShopifyToken();
    let successCount = 0;
    let errors = [];

    // Fetch all rules in one query
    const { data: rules, error: fetchError } = await supabase
      .from('watcher_rules')
      .select('id, shopify_variant_id, last_price')
      .in('id', ruleIds);

    if (fetchError) throw fetchError;

    for (const rule of rules) {
      if (!rule.last_price || !rule.shopify_variant_id) {
        errors.push({ id: rule.id, reason: 'Missing price or variant ID' });
        continue;
      }

      const compareAtPrice = (rule.last_price / 100).toFixed(2);

      try {
        // Update Shopify variant compare_at_price
        const shopRes = await fetch(
          `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`,
          {
            method: 'PUT',
            headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant: { id: rule.shopify_variant_id, compare_at_price: compareAtPrice } })
          }
        );

        if (!shopRes.ok) {
          const errBody = await shopRes.text();
          errors.push({ id: rule.id, reason: `Shopify ${shopRes.status}: ${errBody.substring(0, 100)}` });
          continue;
        }

        // Update our DB to reflect the new compare-at price
        await supabase
          .from('watcher_rules')
          .update({ current_compare_at_price: rule.last_price })
          .eq('id', rule.id);

        successCount++;
      } catch (e) {
        errors.push({ id: rule.id, reason: e.message });
      }
    }

    res.status(200).json({ success: true, updated: successCount, errors: errors.length, errorDetails: errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
