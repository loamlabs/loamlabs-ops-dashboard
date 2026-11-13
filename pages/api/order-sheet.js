// GET /api/order-sheet?order=1466   header x-dashboard-auth (same as the other routes)
// Asks Backend 1's read-only order sheet endpoint (server side, with ORDER_SHEET_SECRET) and returns the sheet. Open by number only. The secret never reaches the browser.
import { isDashboardAuthorized, getSheet } from '../../lib/order-sheet-proxy';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  if (!isDashboardAuthorized(req.headers)) return res.status(401).json({ ok: false, error: 'DASHBOARD_UNAUTHORIZED', message: 'Not signed in.' });
  const out = await getSheet({ order: req.query.order });
  return res.status(out.status).json(out.body);
}
