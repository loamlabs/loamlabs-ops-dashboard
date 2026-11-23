#!/usr/bin/env node
// lib/alpina-hoss-cli.js   Alpina stock from Hoss -> which Alpina variants may be sold. See docs/ALPINA_HOSS_STOCK.md.
//
//   DRY RUN on the saved pages (reads Shopify, writes nothing; this is what an assistant may run):
//     node lib/alpina-hoss-cli.js --saved "C:\...\hoss-pages" --out "C:\...\alpina_out"
//   Offline with a saved copy of the store: add  --store alpina_store.json
//   LIVE READ + PLAN (Jerry's scheduler only; signs in to Hoss with HOSS_LOGIN_USER / HOSS_LOGIN_PASSWORD from the environment):
//     node lib/alpina-hoss-cli.js --live-read --out <folder> --scheduled            (the scheduler's command: runs only when the interval has passed; BASELINE until approved)
//     node lib/alpina-hoss-cli.js --live-read --out <folder> --force                (a manual run any time)
//   WRITE (only after DEPLOY ALPINA STOCK and Jerry's baseline approval; undo file first, every change read back):
//     first time:  --apply --approve-baseline --limit <number of changes you reviewed>
//     afterwards:  --apply                                                       (flips are automatic within the limit)
//   SAVED PAGES (the NAS default, because Hoss's login has a human check that a program must not get around): the 8 Alpina pages Jerry saves by hand into a folder
//     node lib/alpina-hoss-cli.js --pages "/data/pages" --out <folder> --scheduled    (the 5:40 am check: runs only with 8 NEW pages, otherwise skips quietly)
//     node lib/alpina-hoss-cli.js --pages "/data/pages" --out <folder> --force        (a manual read; add --apply [--approve-baseline --limit N] to write)
//     node lib/alpina-hoss-cli.js --pages-status --pages "/data/pages"                (what is in the folder: age of each page, new / read / too old / missing)
//   ALPINA_SOURCE=pages (the NAS setting) makes --live-read refuse to run. Pages older than ALPINA_PAGES_MAX_AGE_DAYS (default 4) are never used.
// Prices are never touched. Only inventoryPolicy (CONTINUE = keep selling at 0 stock, DENY = sold out) of Alpina variants changes.
const fs = require('fs');
const path = require('path');
const A = require('./alpina-hoss');
const { readHoss } = require('./alpina-hoss-fetch');
const P = require('./alpina-hoss-pages');

const HANDLES = () => { const s = new Set(); for (const p of Object.values(A.HOSS_PAGES)) { if (p.retail) s.add(p.retail); if (p.builder) s.add(p.builder); } return [...s]; };
const flag = (args, n) => args.includes('--' + n);
const val = (args, n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

function loadEnv(file) { const env = {}; try { for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ''); } } catch (e) { /* no file */ } return env; }

/** Shopify Admin client (client-credentials app, like the other hand-run commands). */
function shopifyClient(env, fetchImpl = fetch) {
    const shop = env.SHOPIFY_SHOP_NAME; let token = null;
    async function auth() { if (token) return token; const r = await (await fetchImpl(`https://${shop}.myshopify.com/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: 'client_credentials' }) })).json(); token = r.access_token; if (!token) throw new Error('could not get a Shopify token'); return token; }
    return async function gql(query, variables) {
        for (let a = 0; a < 5; a++) {
            const r = await (await fetchImpl(`https://${shop}.myshopify.com/admin/api/2024-10/graphql.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': await auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
            if (r.errors && JSON.stringify(r.errors).includes('Throttled')) { await new Promise((s) => setTimeout(s, 2000 * (a + 1))); continue; }
            if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300));
            return r.data;
        }
        throw new Error('Shopify kept throttling');
    };
}

/** Read the 15 Alpina products (8 retail, 7 builder) with every variant: { handle, status, id, variants: [{ id, policy, opts }] } */
async function readStore(gql) {
    const out = [];
    for (const handle of HANDLES()) {
        const d = await gql(`query($h:String!){productByHandle(handle:$h){id handle status variants(first:100){pageInfo{hasNextPage endCursor} edges{node{id inventoryPolicy selectedOptions{name value}}}}}}`, { h: handle });
        const p = d.productByHandle; if (!p) { out.push({ handle, missing: true, variants: [] }); continue; }
        const vs = p.variants.edges.map((e) => e.node); let pi = p.variants.pageInfo;
        while (pi.hasNextPage) { const n = await gql(`query($id:ID!,$c:String){product(id:$id){variants(first:100,after:$c){pageInfo{hasNextPage endCursor} edges{node{id inventoryPolicy selectedOptions{name value}}}}}}`, { id: p.id, c: pi.endCursor }); vs.push(...n.product.variants.edges.map((e) => e.node)); pi = n.product.variants.pageInfo; await new Promise((s) => setTimeout(s, 300)); }
        out.push({ handle: p.handle, status: p.status, id: p.id, variants: vs.map((n) => ({ id: n.id.split('/').pop(), policy: n.inventoryPolicy, opts: Object.fromEntries(n.selectedOptions.map((o) => [o.name, o.value])) })) });
    }
    return out;
}

function reportText({ source, result, state, today, cfg, baseline }) {
    const L = [];
    L.push(`ALPINA STOCK FROM HOSS, ${baseline ? 'BASELINE (nothing is written)' : 'LIVE'} ${today}`);
    L.push(`source: ${source}`);
    L.push(`variants matched ${result.totals.variantsMatched}; proposed: ${result.totals.close} close (sold out), ${result.totals.open} open (selling again); held by a sanity check ${result.totals.held}; limit per run ${result.cap}`);
    if (result.blocked.length) { L.push(''); L.push('NOTHING WILL BE WRITTEN FROM THIS RUN:'); result.blocked.forEach((b) => L.push('  - ' + b)); }
    L.push(''); L.push('PER PRODUCT (retail = bundle rule, builder = threshold ' + cfg.threshold + '):');
    for (const s of Object.values(result.perProduct)) L.push(`  ${s.handle} [${s.kind}, ${s.status || '?'}]: ${s.variants} variants, orderable now ${s.orderableNow}, after ${s.orderableAfter}; close ${s.close}, open ${s.open}, unknown/unmatched ${s.unknown + s.unmatched}${s.held ? '  HELD: ' + s.held : ''}`);
    L.push(''); L.push('SAMPLE OF 30 CHANGES:');
    const step = Math.max(1, Math.floor(result.flips.length / 30)); result.flips.filter((_, i) => i % step === 0).slice(0, 30).forEach((f) => L.push(`  ${f.handle} | ${f.color} ${f.lengthMm}mm${f.bundle ? ' x' + f.bundle : ''} | Hoss ${f.hoss} | ${f.from} -> ${f.to} (${f.why})`));
    if (Object.keys(result.unmatched).length) { L.push(''); L.push('UNMATCHED STORE VARIANTS (never touched):'); for (const [h, l] of Object.entries(result.unmatched)) L.push(`  ${h}: ${l.length} (${l.slice(0, 5).join(', ')}${l.length > 5 ? ', ...' : ''})`); }
    L.push(''); L.push('HOSS ROWS WITHOUT A VARIANT ON OUR SIDE:'); for (const [k, v] of Object.entries(result.hossOnly)) L.push(`  ${k}: ${v}`);
    return L.join('\n');
}

function repoPath(p) { const r = path.relative(path.resolve(__dirname, '..'), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }

/** The whole command, with every outside thing injectable (tests). Returns { code, result?, text, stopped? }. */
async function main(args, deps = {}) {
    const say = deps.say || ((m) => console.log(m)); const now = deps.now ? deps.now() : new Date(); const today = now.toISOString().slice(0, 10);
    const env = { ...loadEnv(deps.envFile || path.join(__dirname, '..', '.env.local')), ...(deps.env || process.env) };
    const out = path.resolve(val(args, 'out') || path.join(process.cwd(), 'alpina_hoss_out'));
    if (repoPath(out) || (val(args, 'saved') && repoPath(val(args, 'saved'))) || (val(args, 'pages') && repoPath(val(args, 'pages')))) { say('STOPPED: keep the output folder and saved pages outside the repository'); return { code: 1 }; }
    fs.mkdirSync(out, { recursive: true });
    const statePath = path.resolve(val(args, 'state') || path.join(out, 'state.json'));
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { baselineApproved: false, lastShare: {}, lastAttemptAt: null, lastSuccessAt: null };
    const cfg = { ...A.DEFAULTS, threshold: Number(val(args, 'threshold') || env.ALPINA_THRESHOLD || A.DEFAULTS.threshold), intervalDays: Number(env.ALPINA_INTERVAL_DAYS || val(args, 'interval-days') || A.DEFAULTS.intervalDays) };
    const mail = deps.mail || (async ({ subject, text }) => { if (!env.RESEND_API_KEY || !env.REPORT_EMAIL) { say('(no RESEND_API_KEY / REPORT_EMAIL: alert email not sent)'); return; } const { Resend } = require('resend'); await new Resend(env.RESEND_API_KEY).emails.send({ from: 'Watcher <system@loamlabsusa.com>', to: env.REPORT_EMAIL, subject, text }); });
    const saveState = () => { if (!deps.noState) fs.writeFileSync(statePath, JSON.stringify(state, null, 1)); };
    const live = flag(args, 'live-read'), apply = flag(args, 'apply');
    const pagesDir = val(args, 'pages') || null; const maxAgeDays = Number(val(args, 'max-age-days') || env.ALPINA_PAGES_MAX_AGE_DAYS || P.MAX_AGE_DAYS);
    if (flag(args, 'pages-status')) { const t = P.pagesStatusText({ dir: pagesDir || val(args, 'out') || '.', now, maxAgeDays, state }); say(t); return { code: 0, text: t }; }
    if (live && String(env.ALPINA_SOURCE || '').toLowerCase() === 'pages') { const m = 'STOPPED: this job is set to read saved pages (ALPINA_SOURCE=pages); the live Hoss login is switched off here. Use --pages <folder>.'; say(m); return { code: 1, text: m }; }
    const real = live || !!pagesDir;   // a real source (live site or the hand-saved pages), as against the test sources --saved and --readings
    // interval gate (the scheduler may call every day; a run happens only when intervalDays have passed since the last attempt)
    if (flag(args, 'scheduled') && !flag(args, 'force') && state.lastAttemptAt && (now - new Date(state.lastAttemptAt)) / 864e5 < cfg.intervalDays - 0.1) { say(`skipped: last run ${state.lastAttemptAt}, interval is ${cfg.intervalDays} days`); return { code: 0, skipped: true }; }
    // 1. the readings
    let pages, source;
    if (val(args, 'saved')) {
        const dir = val(args, 'saved'); pages = {}; source = 'SAVED PAGES in ' + dir + ' (old numbers: test data only)';
        for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.html'))) { const p = A.parseHossPage(fs.readFileSync(path.join(dir, f), 'utf8')); if (p.pageKey) pages[p.pageKey] = p; }
    } else if (val(args, 'readings')) {
        pages = JSON.parse(fs.readFileSync(val(args, 'readings'), 'utf8')); source = 'readings file ' + val(args, 'readings');
    } else if (pagesDir) {
        const ev = P.evaluatePages({ dir: pagesDir, now, maxAgeDays, scheduled: flag(args, 'scheduled'), force: flag(args, 'force'), state, cfg });
        if (ev.status === 'skip') {   // quiet: nothing to do (scheduled only)
            say('skipped: ' + ev.reason);
            if (ev.alert) { try { await mail({ subject: 'Alpina stock: the saved Hoss pages are too old (nothing changed)', text: 'The Alpina stock job did not run and changed nothing.\nReason: ' + ev.reason + '\nSave the 8 Alpina pages from Hoss again into the NAS folder docker/alpina/data/pages, then send read-now.txt (or wait for the next 5:40 am check).' }); state.staleAlertedFor = ev.alertMarker; saveState(); } catch (e) { say('alert email failed: ' + e.message); } }
            return { code: 0, skipped: true, text: ev.reason };
        }
        state.lastAttemptAt = now.toISOString(); saveState();
        if (ev.status === 'stopped') {   // STOP: nothing is written; one alert email
            const msg = 'The Alpina stock job STOPPED and changed nothing.\nReason: ' + ev.reason + '\n' + P.pagesStatusText({ dir: pagesDir, now, maxAgeDays, state }) + '\nNo stock was changed. Fix the pages folder (save the 8 pages again), then send read-now.txt.';
            say(msg); try { await mail({ subject: (ev.kind === 'stale' ? 'Alpina stock: saved Hoss pages too old (nothing changed)' : 'Alpina stock job stopped (nothing changed)'), text: msg }); } catch (e) { say('alert email failed: ' + e.message); }
            fs.writeFileSync(path.join(out, `alpina_stopped_${today}.txt`), msg); return { code: 2, stopped: { reason: ev.reason, kind: ev.kind }, text: msg };
        }
        pages = ev.pages; source = 'SAVED HOSS PAGES in ' + pagesDir + ' (saved ' + ((now - ev.newestMs) / 864e5).toFixed(1) + ' to ' + ((now - ev.oldestMs) / 864e5).toFixed(1) + ' days ago, limit ' + maxAgeDays + ')';
        state.lastPagesReadAt = now.toISOString(); state.lastPagesFingerprint = ev.fingerprint; state.staleAlertedFor = null; saveState();
        fs.writeFileSync(path.join(out, `hoss_readings_${today}.json`), JSON.stringify(pages));
    } else if (live) {
        state.lastAttemptAt = now.toISOString(); saveState();
        const rd = await (deps.readHoss || readHoss)({ env, log: say, cfg, ...(deps.readOpts || {}) });
        if (!rd.ok) {   // STOP: one alert email, nothing changes
            const msg = `The Alpina stock reader STOPPED and changed nothing.\nReason: ${rd.stopped.reason}${rd.stopped.status ? ' (HTTP ' + rd.stopped.status + ')' : ''}\nPage: ${rd.stopped.url || '-'}\nNo stock was changed. The next scheduled run tries again after the interval; fix the cause first if it says login, captcha or layout.`;
            say(msg); try { await mail({ subject: 'Alpina stock reader stopped (nothing changed)', text: msg }); } catch (e) { say('alert email failed: ' + e.message); }
            fs.writeFileSync(path.join(out, `alpina_stopped_${today}.txt`), msg); return { code: 2, stopped: rd.stopped, text: msg };
        }
        pages = rd.pages; source = 'LIVE read of hasgllc.com (' + Object.keys(pages).length + ' pages)'; fs.writeFileSync(path.join(out, `hoss_readings_${today}.json`), JSON.stringify(pages));
    } else { say('give --pages <folder>, --saved <folder>, --readings <file> or --live-read'); return { code: 1 }; }
    // 2. our store
    let store; if (val(args, 'store')) store = JSON.parse(fs.readFileSync(val(args, 'store'), 'utf8')); else store = await readStore(deps.gql || shopifyClient(env));
    // 3. plan
    const baseline = !(apply && (state.baselineApproved || flag(args, 'approve-baseline')));
    const result = A.plan({ pages, store, cfg, state });
    const limit = val(args, 'limit') ? Number(val(args, 'limit')) : null;
    if (limit !== null && result.overCap && result.flips.length <= limit) { result.blocked = result.blocked.filter((b) => !/the limit is/.test(b)); result.ok = !result.blocked.length; result.cap = limit; result.overCap = false; }
    const text = reportText({ source, result, state, today, cfg, baseline });
    fs.writeFileSync(path.join(out, `alpina_${baseline ? 'baseline' : 'apply'}_${today}.txt`), text); fs.writeFileSync(path.join(out, `alpina_proposals_${today}.json`), JSON.stringify({ made: now.toISOString(), source, totals: result.totals, flips: result.flips, held: result.held }, null, 1));
    say(text);
    if (!real || !apply || baseline || !result.ok) {
        if (real && !result.ok) { const msg = 'The Alpina stock run changed nothing: ' + result.blocked.join(' | '); try { await mail({ subject: 'Alpina stock run: nothing changed', text: msg }); } catch (e) { /* ignore */ } }
        if (real && result.ok) { state.lastSuccessAt = now.toISOString(); state.lastShare = A.shareState(result.perProduct); saveState(); }
        if (real && baseline && result.ok) { try { await mail({ subject: 'Alpina stock baseline ready for review', text: text.slice(0, 6000) }); } catch (e) { /* ignore */ } }
        say(baseline ? 'BASELINE / DRY RUN: nothing was written.' : 'Nothing written (' + (result.ok ? 'no real source (--pages or --live-read)' : 'blocked') + ').');
        return { code: result.ok ? 0 : 3, result, text, baseline };
    }
    // 4. WRITE: undo file first, one product at a time, every change read back
    if (flag(args, 'approve-baseline')) { state.baselineApproved = true; saveState(); }
    const gql = deps.gql || shopifyClient(env); const undo = { note: 'Undo for alpina-hoss-cli --apply: put each variant back to the policy shown (from).', made: now.toISOString(), changes: result.flips.map((f) => ({ id: f.id, handle: f.handle, from: f.from, to: f.to })) };
    const undoFile = path.join(out, `alpina_undo_${today}.json`); fs.writeFileSync(undoFile, JSON.stringify(undo, null, 1)); say('undo file saved first: ' + undoFile);
    const byProduct = new Map(); for (const f of result.flips) { (byProduct.get(f.handle) || byProduct.set(f.handle, []).get(f.handle)).push(f); }
    const prodId = new Map(store.map((p) => [p.handle, p.id])); let written = 0;
    for (const [handle, list] of byProduct) {
        for (let i = 0; i < list.length; i += 100) {
            const batch = list.slice(i, i + 100);
            const d = await gql(`mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$pid,variants:$v){userErrors{field message}}}`, { pid: prodId.get(handle), v: batch.map((f) => ({ id: 'gid://shopify/ProductVariant/' + f.id, inventoryPolicy: f.to })) });
            const errs = d.productVariantsBulkUpdate.userErrors; if (errs.length) { const m = `Alpina stock write STOPPED on ${handle}: ${JSON.stringify(errs).slice(0, 200)}. ${written} changes were written; the undo file is ${undoFile}.`; say(m); try { await mail({ subject: 'Alpina stock write stopped', text: m }); } catch (e) { /* ignore */ } return { code: 4, text: m, written }; }
            written += batch.length; await new Promise((s) => setTimeout(s, deps.fast ? 0 : 600));
        }
        // read back this product
        const cur = new Map(); let c = null, more = true; while (more) { const d = await gql(`query($id:ID!,$c:String){product(id:$id){variants(first:100,after:$c){pageInfo{hasNextPage endCursor} edges{node{id inventoryPolicy}}}}}`, { id: prodId.get(handle), c }); d.product.variants.edges.forEach((e) => cur.set(e.node.id.split('/').pop(), e.node.inventoryPolicy)); c = d.product.variants.pageInfo.endCursor; more = d.product.variants.pageInfo.hasNextPage; }
        const bad = list.filter((f) => cur.get(f.id) !== f.to); if (bad.length) { const m = `Alpina stock READ-BACK MISMATCH on ${handle}: ${bad.length} of ${list.length} not as written (first: ${bad[0].id}). Stopped. Undo file: ${undoFile}.`; say(m); try { await mail({ subject: 'Alpina stock read-back mismatch', text: m }); } catch (e) { /* ignore */ } return { code: 5, text: m, written }; }
        say(`${handle}: ${list.length} changes written and read back`);
    }
    state.lastSuccessAt = now.toISOString(); state.lastShare = A.shareState(result.perProduct); saveState();
    try { await mail({ subject: `Alpina stock: ${result.totals.close} sold out, ${result.totals.open} selling again`, text: text.slice(0, 6000) }); } catch (e) { say('summary email failed: ' + e.message); }
    say(`DONE: ${written} changes written and read back. Undo: node lib/alpina-hoss-undo.js "${undoFile}"`);
    return { code: 0, result, written, text };
}

if (require.main === module) main(process.argv.slice(2)).then((r) => process.exit(r.code || 0)).catch((e) => { console.error('FAILED: ' + String(e.message).slice(0, 300)); process.exit(1); });
module.exports = { main, readStore, shopifyClient, reportText, HANDLES };
