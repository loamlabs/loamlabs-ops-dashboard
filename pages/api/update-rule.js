import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const { id, updates } = req.body;
  
  const sanitizedUpdates = {};
  if (updates.vendor_url !== undefined) sanitizedUpdates.vendor_url = updates.vendor_url;
  if (updates.auto_update !== undefined) sanitizedUpdates.auto_update = updates.auto_update;
  if (updates.price_adjustment_factor !== undefined) sanitizedUpdates.price_adjustment_factor = updates.price_adjustment_factor === null ? null : parseFloat(updates.price_adjustment_factor);
  if (updates.price_drop_threshold !== undefined) sanitizedUpdates.price_drop_threshold = parseFloat(updates.price_drop_threshold);
  
  if (updates.price_adjustment_factor !== undefined || updates.vendor_url !== undefined) {
      sanitizedUpdates.needs_review = false;
  }

  try {
    const { error } = await supabase
      .from('watcher_rules')
      .update(sanitizedUpdates)
      .eq('id', id);

    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
