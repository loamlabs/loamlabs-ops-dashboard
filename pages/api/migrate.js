import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const results = [];

  try {
    // 1. Add Column
    const { error: colError } = await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE watcher_rules ADD COLUMN IF NOT EXISTS bti_inventory_active BOOLEAN DEFAULT FALSE;' 
    });
    results.push({ task: 'Add Column', status: colError ? 'failed' : 'success', error: colError?.message });

    // 2. Add Unique Constraint (after cleaning duplicates if any)
    const { error: constError } = await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE watcher_rules ADD CONSTRAINT unique_shopify_variant_id UNIQUE (shopify_variant_id);' 
    });
    results.push({ task: 'Add Constraint', status: constError ? 'failed' : 'success', error: constError?.message });

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
