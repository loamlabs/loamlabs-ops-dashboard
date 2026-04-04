import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // Simple password check via Header
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let allData = [];
  let hasMore = true;
  let rangeStart = 0;
  let rangeEnd = 999;

  const SAFE_COLS = 'id, shopify_product_id, shopify_variant_id, title, vendor_name, vendor_url, auto_update, last_price, last_availability, last_run_at, original_msrp, current_shopify_price, current_compare_at_price, needs_review, price_last_changed_at, out_of_stock_since, oos_reminder_enabled, oos_reminder_days, bti_part_number, bti_oos_action, bti_monitoring_enabled, bti_inventory_active, price_adjustment_factor, price_drop_threshold, wheel_spec_position, wheel_spec_brake_interface, wheel_spec_hub_spacing, wheel_spec_rim_size, rim_erd, internal_width_mm, inventory_alert_threshold, hub_manual_cross_value';
  const ADVANCED_COLS = `${SAFE_COLS}, tags`;

  while (hasMore) {
    let query = supabase.from('watcher_rules').select(ADVANCED_COLS);
    let { data, error } = await query.order('created_at', { ascending: false }).range(rangeStart, rangeEnd);

    // Fallback if tags column doesn't exist
    if (error && error.message.includes('column "tags" does not exist')) {
      console.log("Migration pending: tags column missing. Falling back to safe query.");
      const retry = await supabase.from('watcher_rules').select(SAFE_COLS).order('created_at', { ascending: false }).range(rangeStart, rangeEnd);
      data = retry.data;
      error = retry.error;
    }

    if (error) return res.status(500).json({ error: error.message });

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < 1000) {
        hasMore = false;
      } else {
        rangeStart += 1000;
        rangeEnd += 1000;
      }
    } else {
      hasMore = false;
    }
  }

  res.status(200).json(allData);
}
