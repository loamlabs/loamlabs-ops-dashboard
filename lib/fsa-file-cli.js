#!/usr/bin/env node
// lib/fsa-file-cli.js  (run by hand from the loamlabs-ops-dashboard folder; reads .env.local for the Shopify app credentials)
//
//   DRY RUN (default, writes nothing anywhere):
//     node lib/fsa-file-cli.js --prices "C:\...\_private\fsa\FSA_PriceList_Wholesale_V2.0_2026-V2.xlsx" --instock "C:\...\_private\fsa\customer instock list ORIGINAL.csv"
//   WRITE (explicit flag; writes an undo file FIRST):
//     node lib/fsa-file-cli.js --prices ... --instock ... --apply [--force]
//   other: --sheet <name, default "Wholesale Pricelist">   --out <folder for the report and undo file, default = the folder of the price file>
//          --env <path to .env.local if not in this folder>   --today YYYY-MM-DD
//
// The files and the reports stay on this computer (never in the repo: the script refuses a path inside the repo).
// The Wholesale column of the price list is never copied anywhere (lib/fsa-file.js rebuilds every row from reference, description, MAP and quantity only).
const fs = require('fs');
const path = require('path');
const { readDealerFile } = require('./dealer-file');
const { plan, formatReport, undoPayload } = require('./fsa-file');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const REPO = path.resolve(__dirname, '..');
const inRepo = (p) => { const r = path.relative(REPO, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const die = (m) => { console.error('STOPPED: ' + m); process.exit(1); };

async function main() {
    const pricesPath = val('prices'), instockPath = val('instock');
    if (!pricesPath || !instockPath) die('give --prices <xlsx or csv> and --instock <csv>');
    for (const p of [pricesPath, instockPath, val('out') || pricesPath]) if (inRepo(p)) die(`"${p}" is inside the repository: keep the FSA files and reports outside the repo (for example in _private\\fsa)`);
    const outDir = path.resolve(val('out') || path.dirname(pricesPath));
    const today = val('today') || new Date().toISOString().slice(0, 10);

    const pr = readDealerFile(fs.readFileSync(pricesPath), { sheet: val('sheet') || 'Wholesale Pricelist', mapping: { reference: 'Part Number', description: 'Display Name', map: 'MAP' } });
    const st = readDealerFile(fs.readFileSync(instockPath), { mapping: { reference: 'Part Number', description: 'Display Name', qty: 'Available' }, blankQtyIsZero: true });
    if (!pr.ok) die('could not read the price file: ' + pr.warnings.slice(0, 2).join(' | '));
    if (!st.ok) die('could not read the instock file: ' + st.warnings.slice(0, 2).join(' | '));
    if (pr.columns.map === undefined) die('the price file has no MAP column');
    if (st.columns.qty === undefined) die('the instock file has no Available column');

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

    // READ the vendor FSA variants (read only)
    const variants = []; let cursor = null, more = true;
    while (more) {
        const d = await gql(`query($c:String){products(first:40,after:$c,query:"vendor:FSA"){pageInfo{hasNextPage endCursor} edges{node{id title vendor status tags variants(first:100){edges{node{id title sku price compareAtPrice inventoryPolicy inventoryQuantity}}}}}}}`, { c: cursor });
        for (const e of d.products.edges) { const p = e.node; if (String(p.vendor).toUpperCase() !== 'FSA') continue; for (const ve of p.variants.edges) { const v = ve.node; variants.push({ variantId: v.id.split('/').pop(), productId: p.id, productTitle: p.title, title: v.title, sku: v.sku || '', price: Number(v.price), compareAt: v.compareAtPrice === null ? null : Number(v.compareAtPrice), policy: v.inventoryPolicy, qty: v.inventoryQuantity, tags: p.tags, status: p.status }); } }
        more = d.products.pageInfo.hasNextPage; cursor = d.products.pageInfo.endCursor; await new Promise((s) => setTimeout(s, 500));
    }
    if (!variants.length) die('no FSA products found in the store');

    const pl = plan({ priceRows: pr.rows, stockRows: st.rows, variants });
    const report = formatReport(pl, today);
    fs.mkdirSync(outDir, { recursive: true });
    const reportFile = path.join(outDir, `fsa_${flag('apply') ? 'apply' : 'dryrun'}_${today}.txt`);
    fs.writeFileSync(reportFile, report); console.log(report); console.log('report saved: ' + reportFile);

    if (!flag('apply')) { console.log('DRY RUN: nothing was written. Add --apply to write the changes above (products tagged watcher-ignore are never written).'); return; }
    if (pl.refuse.length) die('refused: ' + pl.refuse.join(' | '));
    if (pl.needsForce && !flag('force')) die(`more than the usual number of changes (${pl.changeCount}): check the report, then add --force`);
    const payload = undoPayload(pl, new Date().toISOString());
    if (!payload.variants.length) { console.log('nothing to change.'); return; }
    const undoFile = path.join(outDir, `fsa_undo_${today}.json`);
    fs.writeFileSync(undoFile, JSON.stringify(payload, null, 1));   // undo file FIRST
    console.log('undo file saved: ' + undoFile);
    for (const l of pl.lines.filter((x) => !x.ignoredByTag && x.changes.length)) {
        const v = { id: 'gid://shopify/ProductVariant/' + l.id };
        for (const c of l.changes) { if (c.field === 'price') v.price = c.to.toFixed(2); if (c.field === 'compareAt') v.compareAtPrice = null; if (c.field === 'policy') v.inventoryPolicy = c.to; }
        const d = await gql(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$pid,variants:$v){userErrors{field message}}}`, { pid: l.productId, v: [v] });
        const errs = d.productVariantsBulkUpdate.userErrors; console.log((errs.length ? 'ERROR ' + JSON.stringify(errs) : 'written') + ': ' + l.product + ' / ' + l.title);
        await new Promise((s) => setTimeout(s, 600));
    }
}
main().catch((e) => { console.error('FAILED: ' + String(e.message).slice(0, 300)); process.exit(1); });
