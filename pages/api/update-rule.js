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


export default async function handler(req, res) {
  if (!checkSupabase(res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  const { id, updates } = req.body;
  
  const sanitizedUpdates = {};
  if (updates.vendor_url !== undefined) sanitizedUpdates.vendor_url = updates.vendor_url;
  if (updates.auto_update !== undefined) sanitizedUpdates.auto_update = updates.auto_update;
  if (updates.price_adjustment_factor !== undefined) sanitizedUpdates.price_adjustment_factor = updates.price_adjustment_factor === null ? null : parseFloat(updates.price_adjustment_factor);
  if (updates.price_drop_threshold !== undefined) sanitizedUpdates.price_drop_threshold = parseFloat(updates.price_drop_threshold);
  if (updates.oos_reminder_days !== undefined) sanitizedUpdates.oos_reminder_days = parseInt(updates.oos_reminder_days) || 20;
  if (updates.oos_reminder_enabled !== undefined) sanitizedUpdates.oos_reminder_enabled = !!updates.oos_reminder_enabled;
  if (updates.bti_part_number !== undefined) sanitizedUpdates.bti_part_number = updates.bti_part_number;
  if (updates.bti_oos_action !== undefined) sanitizedUpdates.bti_oos_action = updates.bti_oos_action;
  if (updates.bti_monitoring_enabled !== undefined) sanitizedUpdates.bti_monitoring_enabled = !!updates.bti_monitoring_enabled;
  
  if (updates.price_adjustment_factor !== undefined || updates.vendor_url !== undefined) {
      sanitizedUpdates.needs_review = false;
  }

  try {
    const { error } = await supabase
      .from('watcher_rules')
      .update(sanitizedUpdates)
      .eq('id', id);

    if (error) throw error;

    // --- Push to Shopify Metafields if BTI Settings Changed ---
    const hasBtiUpdate = updates.bti_part_number !== undefined || updates.bti_oos_action !== undefined || updates.bti_monitoring_enabled !== undefined;
    if (hasBtiUpdate && updates.shopify_product_id) {
       const metafields = [];
       if (updates.bti_part_number !== undefined) metafields.push({ namespace: "custom", key: "bti_part_number", value: String(updates.bti_part_number || ""), type: "single_line_text_field" });
       if (updates.bti_oos_action !== undefined) metafields.push({ namespace: "custom", key: "out_of_stock_action", value: String(updates.bti_oos_action || "continue"), type: "single_line_text_field" });
       if (updates.bti_monitoring_enabled !== undefined) metafields.push({ namespace: "custom", key: "bti_sync_authority", value: String(!!updates.bti_monitoring_enabled), type: "boolean" });

       if (metafields.length > 0) {
          const query = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`;
          const ownerId = `gid://shopify/Product/${updates.shopify_product_id}`;
          const inputs = metafields.map(m => ({ ...m, ownerId }));

          await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
            },
            body: JSON.stringify({ query, variables: { metafields: inputs } })
          });
       }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
