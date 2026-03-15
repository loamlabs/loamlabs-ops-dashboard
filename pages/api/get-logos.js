import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. Password Check
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Get unique vendors from rules (with safety check)
    const { data: rules, error: rulesError } = await supabase.from('watcher_rules').select('vendor_name');
    if (rulesError) throw rulesError;

    // Use empty array if rules is null
    const safeRules = rules || [];
    const uniqueVendors = [...new Set(safeRules.map(r => r.vendor_name).filter(Boolean))];

    // 3. Get saved logos (with safety check)
    const { data: logos, error: logoError } = await supabase.from('vendor_logos').select('*');
    if (logoError) throw logoError;

    res.status(200).json({ vendors: uniqueVendors, savedLogos: logos || [] });
  } catch (err) {
    console.error("Logo API Error:", err.message);
    // Return empty data instead of crashing
    res.status(200).json({ vendors: [], savedLogos: [] });
  }
}
