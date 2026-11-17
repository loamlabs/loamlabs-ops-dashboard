#!/usr/bin/env node
// lib/spank-portal-cli.js  (run by hand from the loamlabs-ops-dashboard folder; reads .env.local for the Shopify app credentials)
//
//   DRY RUN (default, writes nothing anywhere):
//     node lib/spank-portal-cli.js --portal "C:\path\portal_rims_hubs_2026-11-16.csv" --map "C:\path\spank_variant_map.csv"
//   WRITE (explicit flag; writes an undo file FIRST):
//     node lib/spank-portal-cli.js --portal ... --map ... --apply [--force]
//   other: --out <folder for the report and undo file, default = the folder of the portal file>   --today YYYY-MM-DD (tests / re-runs)   --env <path to .env.local if not in this folder>
//
// The portal file and the report stay on this computer (never in the repo: the script refuses a path inside the repo).
// The dealer price column of the portal file is never read (lib/spank-portal.js looks up only part_number, msrp, qty_available, portal_item_name, status_text).
const fs = require('fs');
const path = require('path');
const { parsePortalCsv, parseMapCsv, plan, formatReport } = require('./spank-portal');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const REPO = path.resolve(__dirname, '..');
const inRepo = (p) => { const r = path.relative(REPO, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const die = (m) => { console.error('STOPPED: ' + m); process.exit(1); };

async function main() {
    const portalPath = val('portal'), mapPath = val('map');
    if (!portalPath || !mapPath) die('give --portal <csv> and --map <csv>');
    for (const p of [portalPath, mapPath, val('out') || portalPath]) if (inRepo(p)) die(`"${p}" is inside the repository: keep the portal file, the mapping and the reports outside the repo`);
    const outDir = path.resolve(val('out') || path.dirname(portalPath));
    const today = val('today') || new Date().toISOString().slice(0, 10);

    const portal = parsePortalCsv(fs.readFileSync(portalPath, 'utf8'));
    const mapping = parseMapCsv(fs.readFileSync(mapPath, 'utf8'));
    const ws = portal.warnings.concat(mapping.warnings); ws.slice(0, 8).forEach((w) => console.log('warning: ' + w)); if (ws.length > 8) console.log('warning: ... and ' + (ws.length - 8) + ' more (items with no MSRP are usually OEM or parts)');
    if (!mapping.map.size) die('the mapping file has no usable rows');

    // credentials (never printed)
    const env = {}; for (const l of fs.readFileSync(val('env') || path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
    const shop = env.SHOPIFY_SHOP_NAME; if (!shop || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) die('Shopify credentials missing in .env.local');
    const tokenRes = await (await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }) })).json();
    const token = tokenRes.access_token; if (!token) die('could not get a Shopify token');
    const gql = async (query, variables) => {
        for (let a = 0; a < 4; a++) {
            const r = await (await fetch(`https://${shop}.myshopify.com/admin/api/2024-10/graphql.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
            if (r.errors && JSON.stringify(r.errors).includes('Throttled')) { await new Promise((s) => setTimeout(s, 2000 * (a + 1))); continue; }
            if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300));
            return r.data;
        }
        throw new Error('Shopify kept throttling');
    };

    // READ the mapped variants (read only)
    const ids = [...mapping.map.keys()]; const variants = [];
    for (let i = 0; i < ids.length; i += 40) {
        const d = await gql(`query($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id title price compareAtPrice inventoryPolicy inventoryQuantity product{id title monitoring:metafield(namespace:"custom",key:"inventory_monitoring_enabled"){value}} vmon:metafield(namespace:"custom",key:"inventory_monitoring_enabled"){value} bti:metafield(namespace:"custom",key:"bti_part_number"){value}}}}`, { ids: ids.slice(i, i + 40).map((x) => 'gid://shopify/ProductVariant/' + x) });
        for (const n of d.nodes) if (n) variants.push({ id: n.id.split('/').pop(), productId: n.product.id, title: `${n.product.title} / ${n.title}`, price: Number(n.price), compareAt: n.compareAtPrice === null ? null : Number(n.compareAtPrice), policy: n.inventoryPolicy, qty: n.inventoryQuantity, monitoringFlag: n.product.monitoring ? n.product.monitoring.value : null, variantMonitoringFlag: n.vmon ? n.vmon.value : null, btiNumber: n.bti ? n.bti.value : null });
        await new Promise((s) => setTimeout(s, 500));
    }
    const pl = plan({ variants, map: mapping.map, items: portal.items, today });
    const report = formatReport(pl);
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = today;
    const reportFile = path.join(outDir, `spank_portal_${flag('apply') ? 'apply' : 'dryrun'}_${stamp}.txt`);
    fs.writeFileSync(reportFile, report); console.log(report); console.log('report saved: ' + reportFile);

    if (!flag('apply')) { console.log('DRY RUN: nothing was written. Add --apply to write the changes above.'); return; }
    if (pl.refuse.length) die('refused: ' + pl.refuse.join(' | '));
    if (pl.needsForce && !flag('force')) die(`more than the usual number of changes (${pl.changeCount}): check the report, then add --force`);
    const todo = pl.lines.filter((l) => l.changes.length);
    if (!todo.length) { console.log('nothing to change.'); return; }
    // undo file FIRST
    const undoFile = path.join(outDir, `spank_portal_undo_${stamp}.json`);
    fs.writeFileSync(undoFile, JSON.stringify({ note: 'Undo for spank-portal-cli --apply. Re-apply these values: price, compareAt (null = none), inventoryPolicy.', made: new Date().toISOString(), variants: todo.map((l) => ({ id: l.id, productId: l.productId, title: l.title, price: l.current.price, compareAt: l.current.compareAt, inventoryPolicy: l.current.policy })) }, null, 1));
    console.log('undo file saved: ' + undoFile);
    for (const l of todo) {
        const v = { id: 'gid://shopify/ProductVariant/' + l.id };
        for (const c of l.changes) { if (c.field === 'price') v.price = String(c.to.toFixed(2)); if (c.field === 'compareAt') v.compareAtPrice = null; if (c.field === 'policy') v.inventoryPolicy = c.to; }
        const d = await gql(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$pid,variants:$v){userErrors{field message}}}`, { pid: l.productId, v: [v] });
        const errs = d.productVariantsBulkUpdate.userErrors; console.log((errs.length ? 'ERROR ' + JSON.stringify(errs) : 'written') + ': ' + l.title);
        await new Promise((s) => setTimeout(s, 600));
    }
}
main().catch((e) => { console.error('FAILED: ' + String(e.message).slice(0, 300)); process.exit(1); });
