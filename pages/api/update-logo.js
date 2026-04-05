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
  
  // LOGGING: Check if auth matches
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
      console.error("Logo Update: Unauthorized attempt");
      return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, logo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const { data, error } = await supabase
      .from('vendor_logos')
      .upsert({ name, logo_url, updated_at: new Date() }, { onConflict: 'name' })
      .select();

    if (error) {
        console.error("Supabase Error during Logo Update:", error);
        throw error;
    }
    
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
