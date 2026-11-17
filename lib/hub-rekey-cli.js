#!/usr/bin/env node
// lib/hub-rekey-cli.js  (hand-run, offline: reads local files only, no Shopify, no GitHub; it NEVER writes the library file in place)
//
//   node lib/hub-rekey-cli.js --library "C:\...\hubs.json" --products "C:\...\spank_master_products.csv" --variants "C:\...\spank_master_variants.csv" --out "C:\...\folder"
//        [--new-ids "C:\...\new_ids.csv"]   master_title,hub_spacing,spoke_count,color,variant_id   (the real ids, only known after Agent C's apply)
//        [--spacings "C:\...\hub_spacing_choices.json"]   the store's list of hub spacings (a JSON array of strings)
//        [--master "Spank HEX J-Type Rear Hub - 6-Bolt"]  only this master (repeatable)
//
// Writes into --out: hubs_rekeyed.json (or hubs_rekeyed_PLACEHOLDERS.json while any new variant still has a placeholder id), rekey_diff.txt, rekey_summary.json.
// Take the result into the library only through a normal reviewed PR, after Agent C's apply, with the real ids (--new-ids). Refuses paths inside the repo.
const fs = require('fs');
const path = require('path');
const { loadMasters, loadNewIds, rekey, formatDiff } = require('./hub-rekey');

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const vals = (n) => args.flatMap((a, i) => (a === '--' + n && args[i + 1] ? [args[i + 1]] : []));
const REPO = path.resolve(__dirname, '..');
const inRepo = (p) => { const r = path.relative(REPO, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const die = (m) => { console.error('STOPPED: ' + m); process.exit(1); };

const lib = val('library'), pc = val('products'), vc = val('variants'), out = val('out');
if (!lib || !pc || !vc || !out) die('give --library, --products, --variants and --out');
if (inRepo(out)) die('--out is inside the repository: write the result outside the repo');
const rows = JSON.parse(fs.readFileSync(lib, 'utf8')); if (!Array.isArray(rows)) die('the library file is not a list');
let masters = loadMasters(fs.readFileSync(pc, 'utf8'), fs.readFileSync(vc, 'utf8'));
const only = vals('master'); if (only.length) masters = masters.filter((m) => only.includes(m.title)); if (!masters.length) die('no master matches');
const newIds = val('new-ids') ? loadNewIds(fs.readFileSync(val('new-ids'), 'utf8')) : new Map();
const spacings = val('spacings') ? JSON.parse(fs.readFileSync(val('spacings'), 'utf8')) : null;
const res = rekey({ rows, masters, newIds, spacings });
fs.mkdirSync(out, { recursive: true });
const name = res.checks.placeholders ? 'hubs_rekeyed_PLACEHOLDERS.json' : 'hubs_rekeyed.json';
fs.writeFileSync(path.join(out, name), JSON.stringify(res.rows, null, 2));
const diff = formatDiff(res, `${new Date().toISOString().slice(0, 10)}${res.checks.placeholders ? ' (placeholder ids: NOT for the library)' : ''}`);
fs.writeFileSync(path.join(out, 'rekey_diff.txt'), diff); fs.writeFileSync(path.join(out, 'rekey_summary.json'), JSON.stringify({ checks: res.checks, created: res.log.created.length, updated: res.log.updated.length, retired: res.log.retired, warnings: res.log.warnings }, null, 1));
console.log(diff); console.log('written: ' + path.join(out, name));
if (!res.checks.ok) process.exit(2);
