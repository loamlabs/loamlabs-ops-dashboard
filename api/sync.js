import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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
  try {
    const { data: rules, error } = await supabase.from('watcher_rules').select('*');
    if (error) throw error;

    const adminToken = await getShopifyToken();
    const reports = [];

    for (const rule of rules) {
      const vResponse = await fetch(`${rule.vendor_url}.js`);
      const vData = await vResponse.json();
      const spokeNum = rule.option_values["Spoke Count"]?.replace(/\D/g, '');
      const isFrontRule = rule.title.toLowerCase().includes('front');

      let candidates = vData.variants.filter(v => {
        const title = v.public_title.toLowerCase();
        const spokeMatch = v.public_title.includes(spokeNum);
        if (isFrontRule) return spokeMatch && title.includes('front');
        return spokeMatch && (title.includes('rear') || title.includes('xd') || title.includes('hg') || title.includes('ms'));
      });

      if (candidates.length > 0) {
        const highestPriceVariant = candidates.reduce((prev, current) => (prev.price > current.price) ? prev : current);
        const vendorPrice = highestPriceVariant.price / 100;
        const goalPrice = (vendorPrice * (rule.price_adjustment_factor || 1.0)).toFixed(2);

        const sResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
          headers: { 'X-Shopify-Access-Token': adminToken }
        });
        const sData = await sResponse.json();
        const myCurrentPrice = parseFloat(sData.variant.price).toFixed(2);

        let actionTaken = "Checked";
        if (goalPrice !== myCurrentPrice) {
          if (rule.auto_update === true) {
            await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-04/variants/${rule.shopify_variant_id}.json`, {
              method: 'PUT',
              headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' },
              body: JSON.stringify({ variant: { id: rule.shopify_variant_id, price: goalPrice } })
            });
            actionTaken = `UPDATED TO $${goalPrice}`;
          } else {
            actionTaken = `MISMATCH (Goal: $${goalPrice})`;
          }
        } else { actionTaken = "In Sync"; }

        reports.push({ item: rule.title, vendor: vendorPrice, mine: myCurrentPrice, action: actionTaken });
        await supabase.from('watcher_rules').update({ last_price: Math.round(vendorPrice * 100), last_run_at: new Date() }).eq('id', rule.id);
      }
    }

    // SEND EMAIL REPORT
    const emailHtml = reports.map(r => `<li><b>${r.item}</b>: Vendor: $${r.vendor} | Mine: $${r.mine} | <b>${r.action}</b></li>`).join('');
    await resend.emails.send({
      from: 'Watcher <system@loamlabsusa.com>',
      to: process.env.REPORT_EMAIL,
      subject: `Daily Vendor Price Report - ${new Date().toLocaleDateString()}`,
      html: `<h3>LoamLabs Vendor Watcher Report</h3><ul>${emailHtml}</ul>`
    });

    res.status(200).json(reports);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
