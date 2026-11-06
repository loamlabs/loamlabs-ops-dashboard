import { Resend } from 'resend';
import { executeGuard } from '../../lib/build-guard-run';
import { createGuardLock } from '../../lib/guard-lock';

export const maxDuration = 300;

// Keeps preconfigured-build master variants in step with their components' stock (see lib/build-guard.js).
//   GET/POST /api/build-guard                     dry run (default): plans only, writes nothing, sends no email
//   GET/POST /api/build-guard?live=1&phrase=...   live run (needs the typed phrase), optional &only=<master variant id>&max=<n>
// Secret-protected like /api/sync (x-loam-secret = CRON_SECRET, or x-dashboard-auth = DASHBOARD_PASSWORD).

export default async function handler(req, res) {
  const authHeader = (req.headers['x-loam-secret'] || req.headers['x-dashboard-auth'])?.trim();
  if (authHeader !== process.env.CRON_SECRET?.trim() && authHeader !== process.env.DASHBOARD_PASSWORD?.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const sendEmail = (process.env.RESEND_API_KEY && process.env.REPORT_EMAIL)
    ? async (subject, lines) => {
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'Watcher <system@loamlabsusa.com>',
          to: process.env.REPORT_EMAIL,
          subject,
          html: `<div style="font-family:sans-serif;"><h2>Build availability guard</h2><ul>${lines.map((l) => `<li>${String(l).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`,
        });
      }
    : null;
  const query = { ...(req.query || {}), ...(req.body || {}) };
  const trigger = ['watcher', 'bti', 'github', 'manual'].includes(query.trigger) ? query.trigger : null;   // only a label (log and email subject)
  const { status, body } = await executeGuard({ query, env: process.env, fetchFn: fetch, sendEmail, trigger, lock: createGuardLock(process.env) });
  if (status !== 200) console.error('[BUILD GUARD] failed:', body);
  return res.status(status).json(body);
}
