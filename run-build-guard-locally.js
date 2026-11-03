// Runs the build availability guard from a machine/GitHub Actions runner. Plain CommonJS: it does not load the Next.js API file.
//   node run-build-guard-locally.js                     dry run (default): prints the plan, writes nothing
//   node run-build-guard-locally.js --live --phrase "RUN BUILD GUARD LIVE" [--only <master variant id>] [--max 10]
require('dotenv').config({ path: '.env.local' });
const { executeGuard } = require('./lib/build-guard-run');

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const query = {};
if (argv.includes('--live')) { query.live = '1'; query.phrase = arg('--phrase'); }
if (arg('--only')) query.only = arg('--only');
if (arg('--max')) query.max = arg('--max');

(async () => {
  console.log(`Starting build guard (${query.live ? 'LIVE' : 'dry run'})...`);
  let sendEmail = null;
  if (process.env.RESEND_API_KEY && process.env.REPORT_EMAIL) {
    const { Resend } = require('resend');
    sendEmail = async (subject, lines) => {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'Watcher <system@loamlabsusa.com>', to: process.env.REPORT_EMAIL, subject,
        html: `<div style="font-family:sans-serif;"><h2>Build availability guard</h2><ul>${lines.map((l) => `<li>${String(l).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`,
      });
    };
  }
  const { status, body } = await executeGuard({ query, env: process.env, fetchFn: fetch, sendEmail });
  console.log('Status:', status);
  console.log('Response JSON:', JSON.stringify(body, null, 2));
  if (status !== 200) process.exitCode = 1;
})();
