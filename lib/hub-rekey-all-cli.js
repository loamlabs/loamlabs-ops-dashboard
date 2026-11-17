#!/usr/bin/env node
// lib/hub-rekey-all-cli.js  (hand-run, OFFLINE: local files only, no Shopify, no GitHub; never writes the library file in place)
// Runs the hub re-key for one or more vendor sheet folders (Agent C's master_apply.mjs output) one after the other on the same library (each vendor starts from the result of the one before),
// writes a diff per vendor and one coverage report. Real ids: put new_ids.csv (master_title,hub_spacing,spoke_count,color,variant_id) in the vendor's sheet folder; without it placeholder ids are used.
//
//   node lib/hub-rekey-all-cli.js --library hubs.json --sheets-dir "C:\...\hub_masters\sheets" --vendors erase-components,phil-wood,berd,hope,project321 --out "C:\...\folder"
//        [--redirect-map redirect_map.csv] [--redirect-notes redirect_map_notes.csv] [--spacings hub_spacing_choices.json] [--other-dir <folder with rims.json nipples.json spokes.json ...>]
//        [--spank-products spank_master_products.csv --spank-variants spank_master_variants.csv]  (adds the Spank sheets as a vendor "spank", first)
// Writes into --out: <vendor>/rekey_diff.txt, <vendor>/rekey_summary.json, hubs_rekeyed_PLACEHOLDERS.json (or hubs_rekeyed.json when no placeholder is left), COVERAGE.txt, run_summary.json
const fs = require('fs');
const path = require('path');
const { loadMasters, loadNewIds, rekey, formatDiff } = require('./hub-rekey');
const { redirectIndex, hubCoverage, otherFileLinks, formatCoverage } = require('./hub-rekey-coverage');
const { parseCsv } = require('./components-csv');

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const REPO = path.resolve(__dirname, '..');
const inRepo = (p) => { const r = path.relative(REPO, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const die = (m) => { console.error('STOPPED: ' + m); process.exit(1); };
const table = (text) => { const t = parseCsv(text); const h = t[0].map((x) => x.trim()); return t.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]]))); };

const lib = val('library'), out = val('out'), sheets = val('sheets-dir'), list = val('vendors');
if (!lib || !out || (!sheets && !val('spank-products'))) die('give --library, --out and --sheets-dir with --vendors (or --spank-products and --spank-variants)');
if (inRepo(out)) die('--out is inside the repository: write the result outside the repo');
const rowsStart = JSON.parse(fs.readFileSync(lib, 'utf8')); if (!Array.isArray(rowsStart)) die('the library file is not a list');
const spacings = val('spacings') ? JSON.parse(fs.readFileSync(val('spacings'), 'utf8')) : null;
const redirect = redirectIndex(val('redirect-map') ? table(fs.readFileSync(val('redirect-map'), 'utf8')).map((r) => ({ from: r['Redirect from'], to: r['Redirect to'] })) : [], val('redirect-notes') ? table(fs.readFileSync(val('redirect-notes'), 'utf8')) : []);

const plan = [];
if (val('spank-products')) plan.push({ name: 'spank', products: fs.readFileSync(val('spank-products'), 'utf8'), variants: fs.readFileSync(val('spank-variants'), 'utf8'), ids: val('spank-new-ids') });
if (sheets) { const names = list === 'all' || !list ? fs.readdirSync(sheets).filter((d) => fs.existsSync(path.join(sheets, d, 'master_products.csv'))) : list.split(',').map((s) => s.trim()).filter(Boolean); for (const n of names) { const d = path.join(sheets, n); if (!fs.existsSync(path.join(d, 'master_products.csv'))) die('no master_products.csv in ' + d); plan.push({ name: n, products: fs.readFileSync(path.join(d, 'master_products.csv'), 'utf8'), variants: fs.readFileSync(path.join(d, 'master_variants.csv'), 'utf8'), ids: fs.existsSync(path.join(d, 'new_ids.csv')) ? path.join(d, 'new_ids.csv') : null }); } }

fs.mkdirSync(out, { recursive: true });
let rows = rowsStart; const vendors = []; const summary = []; let anyPlaceholder = false, allOk = true;
for (const p of plan) {
    const masters = loadMasters(p.products, p.variants); const newIds = p.ids ? loadNewIds(fs.readFileSync(p.ids, 'utf8')) : new Map();
    const res = rekey({ rows, masters, newIds, spacings, placeholderPrefix: p.name }); rows = res.rows; vendors.push({ name: p.name, masters, logs: [res.log] });
    const dir = path.join(out, p.name); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rekey_diff.txt'), formatDiff(res, `${p.name} ${new Date().toISOString().slice(0, 10)}${res.checks.placeholders ? ' (placeholder ids: NOT for the library)' : ''}${p.ids ? ' (real ids from ' + path.basename(path.dirname(p.ids)) + '/new_ids.csv)' : ''}`));
    const s = { vendor: p.name, masters: masters.length, realIds: !!p.ids, created: res.log.created.length, updated: res.log.updated.length, retired: res.log.retired.length, unmatched: res.log.unmatched.length, dyingWithoutRow: res.log.dyingWithoutRow.length, placeholders: res.checks.placeholders, warnings: res.log.warnings.length, checksOk: res.checks.ok };
    fs.writeFileSync(path.join(dir, 'rekey_summary.json'), JSON.stringify({ ...s, checks: res.checks, retired: res.log.retired, unmatched: res.log.unmatched, warnings: res.log.warnings }, null, 1));
    summary.push(s); if (res.checks.placeholders) anyPlaceholder = true; if (!res.checks.ok) allOk = false;
    console.log(`${p.name}: masters ${s.masters}, updated ${s.updated}, created ${s.created}, retired ${s.retired}, unmatched ${s.unmatched}, warnings ${s.warnings}, placeholders ${s.placeholders}, checks ${s.checksOk ? 'OK' : 'PROBLEM'}`);
}
const name = anyPlaceholder ? 'hubs_rekeyed_PLACEHOLDERS.json' : 'hubs_rekeyed.json';
fs.writeFileSync(path.join(out, name), JSON.stringify(rows, null, 2));
const cov = hubCoverage({ rowsBefore: rowsStart, vendors, redirect });
const other = {}; if (val('other-dir')) for (const f of ['rims', 'nipples', 'spokes', 'accessories']) { const fp = path.join(val('other-dir'), f + '_main.json'); const fp2 = path.join(val('other-dir'), f + '.json'); const use = fs.existsSync(fp) ? fp : fs.existsSync(fp2) ? fp2 : null; if (use) other[f] = JSON.parse(fs.readFileSync(use, 'utf8')); }
const otherLinks = otherFileLinks(other, vendors, redirect);
fs.writeFileSync(path.join(out, 'COVERAGE.txt'), formatCoverage(cov, otherLinks, `${new Date().toISOString().slice(0, 10)} (vendors: ${plan.map((p) => p.name).join(', ')}; other files read: ${Object.keys(other).join(', ') || 'none'})`));
fs.writeFileSync(path.join(out, 'run_summary.json'), JSON.stringify({ vendors: summary, coverage: { linked: cov.linked.length, handled: cov.handled, notHandled: cov.notHandled.length, tally: cov.tally }, otherLinks: otherLinks.length, rowsBefore: rowsStart.length, rowsAfter: rows.length }, null, 1));
console.log(`coverage: linked ${cov.linked.length}, handled ${cov.handled}, not handled/unmatched ${cov.notHandled.length}; other-file mentions ${otherLinks.length}; rows ${rowsStart.length} -> ${rows.length}; written ${path.join(out, name)}`);
if (!allOk) process.exit(2);
