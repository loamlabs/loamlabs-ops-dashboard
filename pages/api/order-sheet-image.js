// GET /api/order-sheet-image?order=1466&wheel=front|rear&view=all|high|low&width=600   header x-dashboard-auth
// Returns the PNG of one spoke map (from Backend 1's endpoint, server side). A plain <img src> cannot send the header, so the page loads each image with fetch and shows a blob URL.
import { isDashboardAuthorized, getImage } from '../../lib/order-sheet-proxy';

export const config = { maxDuration: 30, api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' }); }
  if (!isDashboardAuthorized(req.headers)) return res.status(401).json({ ok: false, error: 'DASHBOARD_UNAUTHORIZED', message: 'Not signed in.' });
  const out = await getImage({ order: req.query.order, wheel: req.query.wheel, view: req.query.view, width: req.query.width });
  if (out.status === 200) { res.setHeader('Content-Type', out.contentType); return res.status(200).send(out.buffer); }
  return res.status(out.status).json(out.body);
}
