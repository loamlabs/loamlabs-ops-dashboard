// Runs the build availability guard from a machine/GitHub Actions runner (same pattern as run-sync-locally.js).
//   node run-build-guard-locally.js                     dry run (default): prints the plan, writes nothing
//   node run-build-guard-locally.js --live --phrase "RUN BUILD GUARD LIVE" [--only <master variant id>] [--max 10]
require('dotenv').config({ path: '.env.local' });
const guardHandler = require('./pages/api/build-guard').default;

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const query = {};
if (argv.includes('--live')) { query.live = '1'; query.phrase = arg('--phrase'); }
if (arg('--only')) query.only = arg('--only');
if (arg('--max')) query.max = arg('--max');

const req = { method: 'POST', headers: { 'x-loam-secret': process.env.CRON_SECRET }, query, body: {} };
const res = {
  status: (code) => { console.log('Status:', code); return res; },
  json: (data) => { console.log('Response JSON:', JSON.stringify(data, null, 2)); return res; },
};

(async () => {
  console.log(`Starting build guard (${query.live ? 'LIVE' : 'dry run'})...`);
  await guardHandler(req, res);
  console.log('Build guard finished.');
})();
