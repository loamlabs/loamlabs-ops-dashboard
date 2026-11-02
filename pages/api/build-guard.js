import { Resend } from 'resend';
import { runBuildGuard } from '../../lib/build-guard';
import { createShopifyStore, makeGql } from '../../lib/build-guard-shopify';
import { parseGuardRequest } from '../../lib/build-guard-mode';

export const maxDuration = 300;

// Keeps preconfigured-build master variants in step with their components' stock (see lib/build-guard.js).
//   GET/POST /api/build-guard                     dry run (default): plans only, writes nothing, sends no email
//   GET/POST /api/build-guard?live=1&phrase=...   live run (needs the typed phrase), optional &only=<master variant id>&max=<n>
// Secret-protected like /api/sync (x-loam-secret = CRON_SECRET, or x-dashboard-auth = DASHBOARD_PASSWORD).

async function getShopifyToken() {
  const response = await fetch(`https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  const data = await response.json();
  if (!data.access_token) throw new Error('could not get a Shopify token');
  return data.access_token;
}

export default async function handler(req, res) {
  const authHeader = (req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'])?.trim();
  if (authHeader !== process.env.CRON_SECRET?.trim() && authHeader !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const mode = parseGuardRequest({ ...(req.query || {}), ...(req.body || {}) });
  if (!mode.ok) return res.status(400).json({ error: mode.error });

  try {
    const token = await getShopifyToken();
    const store = createShopifyStore(makeGql(fetch, process.env.SHOPIFY_SHOP_NAME, token), { onlyVariantId: mode.only });
    const result = await runBuildGuard(store, { sellable: { type: 'continue' }, dryRun: mode.dry, maxWrites: mode.max });

    if (!mode.dry && result.emailLines.length > 0 && process.env.RESEND_API_KEY && process.env.REPORT_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Watcher <system@loamlabsusa.com>',
        to: process.env.REPORT_EMAIL,
        subject: `Build guard: ${result.changed.length} build${result.changed.length === 1 ? '' : 's'} changed`,
        html: `<div style="font-family:sans-serif;"><h2>Build availability guard</h2><ul>${result.emailLines.map((l) => `<li>${String(l).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`,
      });
    }
    return res.status(200).json({ mode: mode.dry ? 'dry-run' : 'live', ...result });
  } catch (err) {
    console.error('[BUILD GUARD] failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
