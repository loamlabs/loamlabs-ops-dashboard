import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EXCLUDED_TAGS = ['tires', 'rotor', 'tubeless-tape', 'forgebond', 'coloring-kit', 'wheelbuildingtools', 'fillmore-capkit', 'apparel', 'loamlabs10', 'assembly-service'];

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.body?.resetFactors) {
      const { error } = await supabase.from('watcher_rules').update({ price_adjustment_factor: 1.0 }).neq('title', 'XXX');
      if (error) throw error;
      return res.status(200).json({ success: true, count: 'all' });
    }

    const adminToken = await getShopifyToken();
    const vendorFilter = req.body?.vendor;
    const productIdFilter = req.body?.productId;
    let hasNextPage = true;
    let cursor = null;
    let importedTotal = 0;

    while (hasNextPage) {
      const queryArg = productIdFilter ? `id:${productIdFilter}` : `status:active`;
      const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($after: String, $query: String) { 
            products(first: 50, after: $after, query: $query) { 
              pageInfo { hasNextPage } 
              edges { 
                cursor 
                node { 
                  id title vendor tags 
                  variants(first: 100) { 
                    edges { 
                      node { 
                        id 
                        title 
                        selectedOptions { name value } 
                        metafield(namespace: "custom", key: "bti_part_number") { value }
                      } 
                    } 
                  } 
                } 
              } 
            } 
          }`,
          variables: { after: cursor, query: queryArg }
        })
      });

      const data = await response.json();
      const products = data.data?.products?.edges || [];
      if (products.length === 0) break;

      const filtered = products.filter(edge => {
        const tags = (edge.node.tags || []).map(t => t.toLowerCase());
        const vendor = edge.node.vendor?.toLowerCase() || '';
        if (vendorFilter && vendor !== vendorFilter.toLowerCase()) return false;
        return !tags.some(tag => EXCLUDED_TAGS.includes(tag)) && vendor !== 'your own component';
      });

      if (filtered.length > 0) {
        let variantBatch = [];
        for (const p of filtered) {
          const seenTechnicalSpecs = new Set();
          for (const v of p.node.variants.edges) {
            const mappedOptions = {};
            v.node.selectedOptions.forEach(opt => { mappedOptions[opt.name] = opt.value; });

            const isRim = p.node.title.toLowerCase().includes('rim');
            const isWheelset = p.node.title.toLowerCase().includes('wheel');
            const spokeOptNames = Object.keys(mappedOptions).filter(k => k.toLowerCase().includes('spoke'));
            const spokeCountValue = spokeOptNames.length > 0 ? mappedOptions[spokeOptNames[0]] : 'Std';

            let colorOptNames = Object.keys(mappedOptions).filter(k => k.toLowerCase().includes('color'));
            let colorValue = colorOptNames.length > 0 ? mappedOptions[colorOptNames[0]] : '';

            let technicalKey = `${p.node.id}-${spokeCountValue}-${colorValue}`;
            let titleSuffix = colorValue && spokeCountValue !== 'Std' ? `(${spokeCountValue} / ${colorValue})` : colorValue ? `(${colorValue})` : `(${spokeCountValue})`;

            if (isRim) {
              const sizeOptNames = Object.keys(mappedOptions).filter(k => k.toLowerCase().includes('size'));
              const colorOptNames = Object.keys(mappedOptions).filter(k => k.toLowerCase().includes('color'));
              
              const sizeValue = sizeOptNames.length > 0 ? mappedOptions[sizeOptNames[0]] : '';
              const colorValue = colorOptNames.length > 0 ? mappedOptions[colorOptNames[0]] : '';
              
              technicalKey = `${p.node.id}-${spokeCountValue}-${sizeValue}-${colorValue}`;
              
              const parts = [];
              if (sizeValue) parts.push(sizeValue);
              if (colorValue) parts.push(colorValue);
              if (spokeCountValue !== 'Std') parts.push(spokeCountValue);
              
              titleSuffix = parts.length > 0 ? `(${parts.join(' / ')})` : '';
            } else if (isWheelset) {
              // Extract all variants precisely
              technicalKey = `${p.node.id}-${v.node.id}`;
              const parts = Object.values(mappedOptions).filter(Boolean);
              titleSuffix = parts.length > 0 ? `(${parts.join(' / ')})` : '';
            }

            if (!seenTechnicalSpecs.has(technicalKey)) {
              seenTechnicalSpecs.add(technicalKey);

              variantBatch.push({
                shopify_product_id: p.node.id.split('/').pop(),
                shopify_variant_id: v.node.id.split('/').pop(),
                title: `${p.node.title} ${titleSuffix}`.replace(/×/g, 'x').trim(),
                vendor_name: p.node.vendor,
                site_type: 'SHOPIFY',
                option_values: mappedOptions,
                bti_part_number: v.node.metafield?.value || null,
                tags: p.node.tags || []
              });
            }
          }
        }
        
        if (variantBatch.length > 0) {
          const { error: upsertError } = await supabase.from('watcher_rules').upsert(variantBatch, { onConflict: 'shopify_variant_id', ignoreDuplicates: false });
          if (upsertError) throw upsertError;
          importedTotal += variantBatch.length;
        }
      }
      
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      if (hasNextPage) cursor = products[products.length - 1].cursor;
    }

    res.status(200).json({ success: true, count: importedTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
