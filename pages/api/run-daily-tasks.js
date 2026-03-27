import { Redis } from '@upstash/redis';
import { Resend } from 'resend';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const resend = new Resend(process.env.RESEND_API_KEY);

const SHOPIFY_DOMAIN = `${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

// --- Task 1: Abandoned Build Report Logic ---
const renderWheelComponents = (wheelComponents) => {
  if (!wheelComponents || wheelComponents.length === 0) return '';
  return wheelComponents.map(component => `
    <tr>
      <td class="component-label" style="padding-left:25px; color:#666;">${component.type}</td>
      <td class="component-name" style="font-weight:bold;">${component.name}</td>
    </tr>
  `).join('');
};

async function sendAbandonedBuildReport() {
    console.log("Running Task: Send Abandoned Build Report...");
    const builds = await redis.lrange('abandoned_builds', 0, -1);
    
    if (!builds || builds.length === 0) {
        console.log("Report Task: No abandoned builds to report.");
        return { status: 'success', message: 'No builds to report.' };
    }

    const buildsHtml = builds.map((build, index) => {
        let visitorHtml = '';
        if (build.visitor) {
            if (build.visitor.isLoggedIn) {
                const customerUrl = `https://${SHOPIFY_DOMAIN}/admin/customers/${build.visitor.customerId}`;
                const visitorName = `${build.visitor.firstName || ''} ${build.visitor.lastName || ''}`.trim();
                visitorHtml = `<tr><td style="font-weight:bold; width:120px; padding:8px; border:1px solid #ddd;">User</td><td style="padding:8px; border:1px solid #ddd;"><strong><a href="${customerUrl}" target="_blank">${visitorName || 'Customer'}</a></strong><br><small>${build.visitor.email}</small></td></tr>`;
            } else {
                visitorHtml = `<tr><td style="font-weight:bold; width:120px; padding:8px; border:1px solid #ddd;">User</td><td style="padding:8px; border:1px solid #ddd;">Anonymous Visitor<br><small>ID: ${build.visitor.anonymousId}</small></td></tr>`;
            }
        }
        const hasFrontComponents = build.components && build.components.front && build.components.front.length > 0;
        const hasRearComponents = build.components && build.components.rear && build.components.rear.length > 0;
        
        return `
            <div style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid #eee;">
                <h3>Build #${index + 1} (ID: ${build.buildId})</h3>
                <p>Captured: ${new Date(build.capturedAt).toLocaleString()}</p>
                <table style="border-collapse:collapse; width:100%; border:1px solid #ddd;">
                    ${visitorHtml}
                    <tr><td style="font-weight:bold; width:120px; padding:8px; border:1px solid #ddd;">Type</td><td style="padding:8px; border:1px solid #ddd;"><strong>${build.buildType}</strong></td></tr>
                    <tr><td style="font-weight:bold; width:120px; padding:8px; border:1px solid #ddd;">Style</td><td style="padding:8px; border:1px solid #ddd;">${build.ridingStyleDisplay}</td></tr>
                    ${hasFrontComponents ? `<tr><td colspan="2" style="background-color:#f7f7f7; text-align:center; font-weight:bold; padding:8px; border:1px solid #ddd;">Front Wheel</td></tr>${renderWheelComponents(build.components.front)}` : ''}
                    ${hasRearComponents ? `<tr><td colspan="2" style="background-color:#f7f7f7; text-align:center; font-weight:bold; padding:8px; border:1px solid #ddd;">Rear Wheel</td></tr>${renderWheelComponents(build.components.rear)}` : ''}
                    <tr><td style="font-weight:bold; width:120px; padding:8px; border:1px solid #ddd;">Subtotal</td><td style="padding:8px; border:1px solid #ddd;"><strong>${'$' + ((build.subtotal || 0) / 100).toFixed(2)}</strong></td></tr>
                </table>
            </div>
        `;
    }).join('');

    const emailHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif; color:#333;"><div style="max-width:600px; margin:auto; padding:20px; border:1px solid #ddd;"><h2>Daily Abandoned Build Report</h2><p>Found <strong>${builds.length}</strong> significant build(s) in the last 24 hours.</p>${buildsHtml}</div></body></html>`;
    
    await resend.emails.send({ 
      from: 'LoamLabs Audit <info@loamlabsusa.com>', 
      to: [process.env.REPORT_EMAIL_TO], 
      subject: `Abandoned Build Report: ${builds.length} build(s)`, 
      html: emailHtml 
    });

    // Clear the list after reporting
    await redis.del('abandoned_builds');
    
    return { status: 'success', message: `Report sent for ${builds.length} builds.` };
}

// --- Task 2: Data Audit Logic (Unified with Registry) ---
async function runDataAudit() {
    console.log("Running Task: Data Audit...");
    const QUERY = `
      query($cursor: String) {
        products(first: 250, after: $cursor, query: "tag:'component:rim' OR tag:'component:hub' OR tag:'component:spoke'") {
          edges {
            node {
              id
              title
              status
              tags
              onlineStoreUrl
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    metafields(first: 10, namespace: "custom") {
                      edges {
                        node {
                          key
                          value
                        }
                      }
                    }
                  }
                }
              }
              metafields(first: 20, namespace: "custom") {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    let allProducts = [], hasNextPage = true, cursor = null;
    
    try {
      do {
          const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
            body: JSON.stringify({ query: QUERY, variables: { cursor } })
          });
          const data = await res.json();
          const pageData = data.data.products;
          allProducts.push(...pageData.edges.map(edge => edge.node));
          hasNextPage = pageData.pageInfo.hasNextPage;
          cursor = pageData.pageInfo.endCursor;
      } while (hasNextPage);
    } catch (e) {
      console.error("Fetch failed", e);
      return { status: 'error', message: 'Shopify fetch failed' };
    }

    let errors = { unpublished: [], missingData: [] };

    for (const product of allProducts) {
        if (product.tags.includes('audit:exclude')) continue;

        const isPublished = product.status === 'ACTIVE' && product.onlineStoreUrl;
        if (!isPublished) {
            errors.unpublished.push(`- **${product.title}**: Status is \`${product.status}\``);
            continue;
        }

        const productMetafields = Object.fromEntries(product.metafields.edges.map(e => [e.node.key, e.node.value]));
        const productErrors = [];

        // Check Weights
        const hasProductWeight = !!productMetafields.weight_g;
        let allVariantsHaveWeight = product.variants.edges.length > 0;
        for (const { node: variant } of product.variants.edges) {
            const variantMetafields = Object.fromEntries(variant.metafields.edges.map(e => [e.node.key, e.node.value]));
            if (!variantMetafields.weight_g) { 
              allVariantsHaveWeight = false; 
              break; 
            }
        }
        if (!hasProductWeight && !allVariantsHaveWeight) {
          productErrors.push("Missing: `weight_g` at Product or Variant level.");
        }

        // Specific Component Checks
        const tags = product.tags.map(t => t.toLowerCase());
        if (tags.includes('component:rim')) {
            const requiredHeaders = ['rim_washer_policy', 'rim_spoke_hole_offset', 'rim_target_tension_kgf'];
            requiredHeaders.forEach(key => { if (!productMetafields[key]) productErrors.push(`Missing Product Metafield: \`${key}\``); });
            
            product.variants.edges.forEach(({ node: v }) => {
                const vM = Object.fromEntries(v.metafields.edges.map(e => [e.node.key, e.node.value]));
                if (!vM.rim_erd) productErrors.push(`Variant "${v.title}" missing: \`rim_erd\``);
            });
        }
        
        if (tags.includes('component:hub')) {
            const requiredHub = ['hub_type', 'hub_flange_diameter_left', 'hub_flange_diameter_right', 'hub_flange_offset_left', 'hub_flange_offset_right'];
            requiredHub.forEach(key => { if (!productMetafields[key]) productErrors.push(`Missing Product Metafield: \`${key}\``); });
        }

        if (productErrors.length > 0) {
          errors.missingData.push(`- **${product.title}**:<br><ul>${productErrors.map(e => `<li>${e}</li>`).join('')}</ul>`);
        }
    }

    const totalIssues = errors.unpublished.length + errors.missingData.length;
    if (totalIssues > 0) {
        let emailHtml = `<h1>Data Health Report (${totalIssues} issues)</h1>`;
        if (errors.unpublished.length > 0) emailHtml += `<hr><h2>Unpublished (${errors.unpublished.length})</h2><ul>${errors.unpublished.map(e => `<li>${e}</li>`).join('')}</ul>`;
        if (errors.missingData.length > 0) emailHtml += `<hr><h2>Missing Data (${errors.missingData.length})</h2><ul>${errors.missingData.map(e => `<li>${e}</li>`).join('')}</ul>`;
        
        await resend.emails.send({ 
          from: 'LoamLabs Audit <info@loamlabsusa.com>', 
          to: process.env.REPORT_EMAIL_TO, 
          subject: `Data Health Report: ${totalIssues} Issues Found`, 
          html: emailHtml 
        });
    }

    return { status: 'success', message: `Audit complete. Found ${totalIssues} issues.` };
}

// --- Task 3: Negative Inventory ---
async function runOversellAudit() {
    console.log("Running Task: Negative Inventory Audit...");
    const QUERY = `
      query {
        productVariants(first: 250, query: "inventory_total:<0") {
          edges {
            node {
              id
              title
              sku
              inventoryQuantity
              product { id title }
            }
          }
        }
      }
    `;

    const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
      body: JSON.stringify({ query: QUERY })
    });
    const data = await res.json();
    const variants = data.data.productVariants.edges.map(edge => edge.node);
    
    if (variants.length === 0) return { status: 'success', message: 'No negative inventory found.' };

    let newIssues = [];
    for (const variant of variants) {
        const redisKey = `oversell_reported:${variant.id}`; 
        const alreadyReported = await redis.get(redisKey);
        
        if (!alreadyReported) {
            newIssues.push({
              title: `${variant.product.title} - ${variant.title}`,
              sku: variant.sku || 'No SKU',
              qty: variant.inventoryQuantity,
              adminUrl: `https://${SHOPIFY_DOMAIN}/admin/products/${variant.product.id.split('/').pop()}/variants/${variant.id.split('/').pop()}`
            });
            await redis.set(redisKey, 'true', { ex: 604800 }); // Snooze for 7 days
        }
    }

    if (newIssues.length > 0) {
        const emailHtml = `
          <h2>⚠️ New Negative Inventory Alert</h2>
          <table style="width:100%; border-collapse:collapse;">
            ${newIssues.map(item => `
              <tr>
                <td style="padding:10px; border:1px solid #ddd;"><strong>${item.title}</strong><br><small>SKU: ${item.sku}</small></td>
                <td style="padding:10px; border:1px solid #ddd; text-align:center; color:red;"><strong>${item.qty}</strong></td>
                <td style="padding:10px; border:1px solid #ddd; text-align:center;"><a href="${item.adminUrl}">View</a></td>
              </tr>
            `).join('')}
          </table>
        `;
        
        await resend.emails.send({ 
          from: 'LoamLabs Audit <info@loamlabsusa.com>', 
          to: process.env.REPORT_EMAIL_TO, 
          subject: `Oversell Alert: ${newIssues.length} New Item(s)`, 
          html: emailHtml 
        });
    }

    return { status: 'success', message: 'Oversell Audit Complete.' };
}

// --- MAIN HANDLER ---
export default async function handler(req, res) {
    // Basic auth check for cron
    const authHeader = req.headers.authorization;
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
        const results = await Promise.allSettled([
            sendAbandonedBuildReport(), 
            runDataAudit(),
            runOversellAudit()
        ]);
        
        return res.status(200).json({ 
          message: 'Daily tasks executed.', 
          results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'rejected', reason: r.reason }) 
        });
    } catch (error) {
        console.error('Critical error:', error);
        return res.status(500).json({ message: error.message });
    }
}
