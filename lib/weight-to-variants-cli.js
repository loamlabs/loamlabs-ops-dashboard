#!/usr/bin/env node
// lib/weight-to-variants-cli.js  (run by hand from the loamlabs-ops-dashboard folder; reads .env.local for the Shopify app credentials)
//
//   STEP 1, copy product weight to variants that have none:
//     DRY RUN (default):   node lib/weight-to-variants-cli.js --type hub --out "C:\...\weight_migration"
//     WRITE:               node lib/weight-to-variants-cli.js --type hub --out "C:\...\weight_migration" --apply [--force]
//   STEP 2, clear the product-level weight where every variant now holds it:
//     DRY RUN (default):   node lib/weight-to-variants-cli.js --clear-product --type hub --out ...
//     WRITE:               node lib/weight-to-variants-cli.js --clear-product --type hub --out ... --apply [--force]
//   STEP 3, spokes only: clear the OLD product weight_g where custom.spoke_base_weight_g exists and is equal (the new field stays):
//     DRY RUN (default):   node lib/weight-to-variants-cli.js --clear-spoke-old --out ...      WRITE: add --apply
//   limits: --type hub|rim|spoke|nipple|freehub|valvestem|accessory|other|wheelset   --vendor "Spank"   --handle some-product-handle   (each can be repeated, comma separated)
//   other:  --out <folder for the report and undo file (outside the repo)>   --env <path to .env.local>   --today YYYY-MM-DD
//           --from-raw <file>  dry run on a saved read of the store (never allowed with --apply)
//
// Never overwrites an existing variant weight. More than 40 products to change in one run needs --force. Every product that has a product-level weight is listed with a status.
// Deleting the metafield DEFINITION is not done here: it is a manual admin step once every reader is proven.
const fs = require('fs');
const path = require('path');
const { componentType, planCopy, planClear, planClearSpokeOld, formatCopy, formatClear, undoCopy, undoClear } = require('./weight-to-variants');

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const vals = (n) => { const out = []; args.forEach((a, i) => { if (a === '--' + n && args[i + 1]) out.push(...String(args[i + 1]).split(',').map((s) => s.trim()).filter(Boolean)); }); return out; };
const val = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const REPO = path.resolve(__dirname, '..');
const inRepo = (p) => { const r = path.relative(REPO, path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const die = (m) => { console.error('STOPPED: ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VF = 'id title wg: metafield(namespace:"custom", key:"weight_g"){ value }';
const Q = `query($c:String,$q:String){ products(first:10, after:$c, query:$q){ pageInfo{hasNextPage endCursor} edges{ node{ id title handle vendor productType tags pw: metafield(namespace:"custom", key:"weight_g"){ value } sb: metafield(namespace:"custom", key:"spoke_base_weight_g"){ value } variants(first:50){ pageInfo{hasNextPage endCursor} edges{ node{ ${VF} } } } } } } }`;
const QV = `query($id:ID!,$c:String){ product(id:$id){ variants(first:50, after:$c){ pageInfo{hasNextPage endCursor} edges{ node{ ${VF} } } } } }`;
const toProduct = (p) => ({ id: p.id, handle: p.handle, title: p.title, vendor: p.vendor, type: componentType(p.tags, p.productType), productWeight: p.pw && p.pw.value !== undefined ? p.pw.value : null, spokeBase: p.sb && p.sb.value !== undefined ? p.sb.value : null, variants: p.variants.edges.map((e) => ({ id: e.node.id, title: e.node.title, weight: e.node.wg ? e.node.wg.value : null })) });

async function main() {
    const spokeOld = flag('clear-spoke-old'); if (spokeOld && flag('clear-product')) die('use --clear-product or --clear-spoke-old, not both'); const copyMode = !flag('clear-product') && !spokeOld; const apply = flag('apply');
    if (apply && val('from-raw')) die('--apply cannot be used with --from-raw (it is a saved read, not the live store)');
    const outDir = path.resolve(val('out') || '.'); if (inRepo(outDir)) die(`"${outDir}" is inside the repository: keep reports and undo files outside the repo`);
    const today = val('today') || new Date().toISOString().slice(0, 10);
    const filt = { types: spokeOld ? ['spoke'] : vals('type'), vendors: vals('vendor'), handles: vals('handle') };
    let products;
    let token = null, shop = null, gql = null;
    if (val('from-raw')) { products = JSON.parse(fs.readFileSync(val('from-raw'), 'utf8')).map(toProduct); }
    else {
        const env = {}; for (const l of fs.readFileSync(val('env') || path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); }
        shop = env.SHOPIFY_SHOP_NAME; if (!shop || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) die('Shopify credentials missing in .env.local');
        const t = await (await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }) })).json();
        token = t.access_token; if (!token) die('could not get a Shopify token');
        gql = async (query, variables) => {
            for (let a = 0; a < 12; a++) {
                const r = await (await fetch(`https://${shop}.myshopify.com/admin/api/2024-10/graphql.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
                if (r.errors && JSON.stringify(r.errors).includes('Throttled')) { await sleep(3000); continue; }
                if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300));
                const c = r.extensions && r.extensions.cost; if (c) { const need = c.requestedQueryCost - c.throttleStatus.currentlyAvailable; if (need > 0) await sleep(Math.ceil((need / c.throttleStatus.restoreRate) * 1000) + 100); }
                return r.data;
            }
            throw new Error('Shopify kept throttling');
        };
        // narrow the read with a store search where the limits allow it (the plan still filters again)
        const parts = []; if (filt.vendors.length) parts.push('(' + filt.vendors.map((v) => `vendor:'${v.replace(/'/g, '')}'`).join(' OR ') + ')');
        const tagFor = { hub: 'component:hub', rim: 'component:rim', spoke: 'component:spoke', nipple: 'component:nipple', freehub: 'component:freehub', valvestem: 'component:valvestem', accessory: 'accessory' };
        if (filt.types.length && filt.types.every((t) => tagFor[t])) parts.push('(' + filt.types.map((t) => `tag:'${tagFor[t]}'`).join(' OR ') + ')');
        if (filt.handles.length) parts.push('(' + filt.handles.map((h) => `handle:'${h.replace(/'/g, '')}'`).join(' OR ') + ')');
        const query = parts.length ? parts.join(' AND ') : null; const raw = []; let cursor = null, more = true;
        while (more) {
            const d = (await gql(Q, { c: cursor, q: query })).products;
            for (const e of d.edges) { const p = e.node; const vc = p.variants; while (vc.pageInfo.hasNextPage) { const nx = (await gql(QV, { id: p.id, c: vc.pageInfo.endCursor })).product.variants; vc.edges.push(...nx.edges); vc.pageInfo = nx.pageInfo; } raw.push(p); }
            cursor = d.pageInfo.endCursor; more = d.pageInfo.hasNextPage;
        }
        products = raw.map(toProduct);
    }
    const pl = copyMode ? planCopy(products, filt) : spokeOld ? planClearSpokeOld(products, filt) : planClear(products, filt);
    const report = (copyMode ? formatCopy : formatClear)(pl, today);
    fs.mkdirSync(outDir, { recursive: true });
    const tag = (copyMode ? 'copy' : spokeOld ? 'clearspokeold' : 'clear') + (filt.types.length ? '_' + filt.types.join('-') : '') + (filt.vendors.length ? '_' + filt.vendors.join('-').replace(/\W+/g, '') : '') + (filt.handles.length ? '_handles' : '');
    const reportFile = path.join(outDir, `weight_${apply ? 'apply' : 'dryrun'}_${tag}_${today}.txt`);
    fs.writeFileSync(reportFile, report); console.log(report); console.log('report saved: ' + reportFile);
    if (!apply) { console.log('DRY RUN: nothing was written. Add --apply to write.'); return; }

    if (pl.refuse.length && !flag('force')) die(pl.refuse.join(' | '));
    const undo = copyMode ? undoCopy(pl, new Date().toISOString()) : undoClear(pl, new Date().toISOString());
    const items = copyMode ? undo.variants : undo.products; if (!items.length) { console.log('nothing to change.'); return; }
    const undoFile = path.join(outDir, `weight_undo_${tag}_${today}.json`); fs.writeFileSync(undoFile, JSON.stringify(undo, null, 1)); console.log('undo file saved: ' + undoFile);   // undo file FIRST
    let errors = 0;
    for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        if (copyMode) {
            const d = await gql('mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{field message}}}', { m: batch.map((v) => ({ ownerId: v.variantId, namespace: 'custom', key: 'weight_g', type: 'number_decimal', value: String(v.written) })) });
            const e = d.metafieldsSet.userErrors; if (e.length) { errors += e.length; console.log('ERROR ' + JSON.stringify(e).slice(0, 300)); } else console.log(`written ${batch.length} variant weights`);
        } else {
            const d = await gql('mutation($m:[MetafieldIdentifierInput!]!){metafieldsDelete(metafields:$m){userErrors{field message}}}', { m: batch.map((p) => ({ ownerId: p.productId, namespace: 'custom', key: 'weight_g' })) });
            const e = d.metafieldsDelete.userErrors; if (e.length) { errors += e.length; console.log('ERROR ' + JSON.stringify(e).slice(0, 300)); } else console.log(`cleared ${batch.length} product weights`);
        }
        await sleep(600);
    }
    // read back what was written
    let bad = 0;
    for (let i = 0; i < items.length; i += 40) {
        const batch = items.slice(i, i + 40); const ids = batch.map((x) => (copyMode ? x.variantId : x.productId));
        const d = await gql(`query($ids:[ID!]!){nodes(ids:$ids){ ... on ProductVariant { id m: metafield(namespace:"custom", key:"weight_g"){ value } } ... on Product { id m: metafield(namespace:"custom", key:"weight_g"){ value } sb: metafield(namespace:"custom", key:"spoke_base_weight_g"){ value } } }}`, { ids });
        d.nodes.forEach((n, k) => { const want = copyMode ? Number(batch[k].written) : null; const got = n && n.m ? Number(n.m.value) : null; if (copyMode ? got !== want : got !== null) bad++; if (spokeOld && !(n && n.sb && Number(n.sb.value) === Number(batch[k].value))) bad++; });   // spoke mode: the new base weight must still be there and equal
    }
    console.log(`read back: ${items.length - bad} of ${items.length} correct${errors ? `; ${errors} write errors` : ''}`);
}
main().catch((e) => { console.error('FAILED: ' + String(e.message).slice(0, 300)); process.exit(1); });
