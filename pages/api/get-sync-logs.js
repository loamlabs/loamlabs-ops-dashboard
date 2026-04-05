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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
