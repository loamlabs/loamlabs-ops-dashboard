import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

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
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch Speed Vision Data
    const svResponse = await fetch('https://speedvision.bike/products/mtb-wheel-builder-sets-fronts-or-rear-singles');
    const svHtml = await svResponse.text();
    const svJsonMatch = svHtml.match(/var bcpo_data=({.*?});/s);
    if (!svJsonMatch) throw new Error("Could not parse Speed Vision bcpo_data");
    const svData = JSON.parse(svJsonMatch[1]);
    
    // Extract base price and component options from SV
    const svBasePriceObj = svData.virtual_options.find(o => o.title.toLowerCase().includes('wheelset base price'));
    const svBasePrice = svBasePriceObj ? parseFloat(svBasePriceObj.values[0].price || '0') : 0;
    
    const svRimOptions = svData.virtual_options.find(o => o.title.toLowerCase().includes('rim choices')).values;
    const svHubOptions = svData.virtual_options.find(o => o.title.toLowerCase().includes('hub')).values;
    
    // 2. Fetch LoamLabs Component Pricing from Supabase
    let query = supabase.from('watcher_rules').select('title, vendor_name, current_shopify_price');
    let { data: rules } = await query;
    if (!rules) rules = [];

    // Helper to find our price
    const findLoamPrice = (searchTerm) => {
      const match = rules.find(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()));
      return match ? parseFloat(match.current_shopify_price) : null;
    };

    // Fallback static assembly cost based on user snippet logic
    const getAssemblyCost = (hubStr, rimStr) => {
       const h = hubStr.toLowerCase();
       const r = rimStr.toLowerCase();
       let cost = 60; // Default
       if (h.includes('industry nine') || h.includes('hydra')) cost = 40;
       if (h.includes('hope')) cost = 70;
       if (h.includes('chris king')) cost = 80;
       if (r.includes('we are one')) cost = 40;
       if (r.includes('reserve')) cost = 50;
       return cost; 
    };

    // 4. Generate matrix
    const matrix = [];
    const targetComparisons = [
      { svHub: 'I9 Hydra', llHubTerm: 'Hydra', svRim: 'We Are One Triad', llRimTerm: 'We Are One Triad' },
      { svHub: 'DT 240', llHubTerm: '240 EXP', svRim: 'Notubes Flow', llRimTerm: 'Flow EX3' },
      { svHub: 'Hope Pro 5', llHubTerm: 'Hope Pro 5', svRim: 'Race Face ARC', llRimTerm: 'Race Face ARC' }
    ];

    const standardSpokeCost = 96; // $3/spoke * 32
    const standardNippleCost = 15; // default
    const standardValveCost = 25; // default valve

    targetComparisons.forEach(comp => {
       const svHubOpt = svHubOptions.find(o => o.key.includes(comp.svHub));
       const svRimOpt = svRimOptions.find(o => o.key.includes(comp.svRim));
       
       if (svHubOpt && svRimOpt) {
          const svPrice = svBasePrice + (parseFloat(svHubOpt.price || 0)) + (parseFloat(svRimOpt.price || 0) * 2); 
          
          const llHubPrice = findLoamPrice(comp.llHubTerm) || 0;
          const llRimPrice = findLoamPrice(comp.llRimTerm) || 0;
          
          const llAssembly = getAssemblyCost(comp.llHubTerm, comp.llRimTerm);
          const llRawTotal = (llRimPrice * 2) + llHubPrice + standardSpokeCost + standardNippleCost + standardValveCost + llAssembly;
          const llDiscounted = llRawTotal * 0.90; // 10% off

          matrix.push({
            hub: comp.svHub,
            rim: comp.svRim,
            svPrice: svPrice,
            llPrice: llDiscounted,
            delta: llDiscounted - svPrice,
            cheaperForLoam: llDiscounted < svPrice,
            details: {
               llHubPrice, llRimPrice, llAssembly,
               svHubPrice: svHubOpt.price,
               svRimPrice: svRimOpt.price
            }
          });
       }
    });

    return res.status(200).json({ matrix, svOptions: { hubs: svHubOptions.map(o => o.key), rims: svRimOptions.map(o => o.key) } });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
