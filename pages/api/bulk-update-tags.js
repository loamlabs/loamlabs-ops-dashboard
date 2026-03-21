import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  const { productIds, addTag } = req.body;
  if (!productIds || !Array.isArray(productIds) || !addTag) {
    return res.status(400).json({ error: 'Missing productIds (array) or addTag' });
  }

  try {
    // 1. Fetch current tags for the first variant of each product to preserve them
    const { data: currentRules, error: fetchError } = await supabase
      .from('watcher_rules')
      .select('shopify_product_id, tags')
      .in('shopify_product_id', productIds);

    if (fetchError) throw fetchError;

    // 2. Perform updates product by product to ensure tag consistency
    // (In our system, all variants of a product share the same tags from Shopify)
    const updatePromises = productIds.map(async (pid) => {
        const productRule = currentRules.find(r => r.shopify_product_id === pid);
        let tags = Array.isArray(productRule?.tags) ? [...productRule.tags] : [];
        
        if (!tags.includes(addTag)) {
            tags.push(addTag);
            return supabase
                .from('watcher_rules')
                .update({ tags })
                .eq('shopify_product_id', pid);
        }
        return Promise.resolve({ error: null });
    });

    const results = await Promise.all(updatePromises);
    const errors = results.filter(r => r.error).map(r => r.error);

    if (errors.length > 0) throw new Error(errors[0].message);

    res.status(200).json({ success: true, count: productIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
