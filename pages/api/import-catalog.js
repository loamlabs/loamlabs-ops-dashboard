import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EXCLUDED_TAGS = ['addon', 'component:freehub', 'component:spoke', 'component:valvestem', 'component:nipple', 'tires', 'rotor', 'tubeless-tape', 'forgebond', 'coloring-kit', 'wheelbuildingtools', 'fillmore-capkit', 'apparel', 'loamlabs10', 'assembly-service'];

async function getShopifyToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { 
          products(first: 10) { 
            edges { 
              node { 
                id title vendor tags 
                variants(first: 50) { 
                  edges { node { id title selectedOptions { name value } } } 
                } 
              } 
            } 
          } 
        }`
      })
    });

    const data = await response.json();
    const products = data.data?.products?.edges || [];

    const filtered = products.filter(edge => {
      const tags = (edge.node.tags || []).map(t => t.toLowerCase());
      return !tags.some(tag => EXCLUDED_TAGS.includes(tag));
    });

    if (filtered.length > 0) {
      let variantBatch = [];
      for (const p of filtered) {
        for (const v of p.node.variants.edges) {
          const mappedOptions = {};
          v.node.selectedOptions.forEach(opt => { mappedOptions[opt.name] = opt.value; });
          variantBatch.push({
            shopify_product_id: p.node.id.split('/').pop(),
            shopify_variant_id: v.node.id.split('/').pop(),
            title: `${p.node.title} - ${v.node.title}`,
            vendor_name: p.node.vendor,
            auto_update: false,
            site_type: 'SHOPIFY',
            option_values: mappedOptions,
            price_adjustment_factor: 1.1111 
          });
        }
      }
      await supabase.from('watcher_rules').upsert(variantBatch, { onConflict: 'shopify_variant_id' });
      importedTotal = variantBatch.length;
    }
      hasNextPage = data.data.products.pageInfo.hasNextPage;
      if (hasNextPage) cursor = products[products.length - 1].cursor;
    }
    res.status(200).json({ success: true, count: importedTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
