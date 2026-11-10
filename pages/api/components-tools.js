import { FILES, readFile, saveFiles, historyWithDiff, restoreVersion } from '../../lib/components-store';
import { rowsFromCsv, previewImport } from '../../lib/components-csv';
import { liveStatusLookup } from '../../lib/shopify-variant-status';
import { buildPushPlan, executePush, planUndo } from '../../lib/components-push';
import { variantFacts } from '../../lib/components-shopify-read';
import { makeGql } from '../../lib/build-guard-shopify';
import { getShopifyToken } from '../../lib/build-guard-run';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// One endpoint for the Component library tools. Everything here is read-only EXCEPT:
//   restore      -> one GitHub commit (older version written as a new version; same delete rules and archive as a save)
//   import-add   -> one GitHub commit (rows from a checked CSV preview, through the normal save checks)
//   push / push-undo -> ONE Shopify variant, only when COMPONENT_PUSH_ENABLED is "on" and the typed confirmation matches (see lib/components-push.js)
// GET  ?action=history&tab=rims            versions with what each changed
// GET  ?action=export&tab=rims&format=json|csv     download (no auth header possible in a link: pass ?auth=)
// POST { action: 'import-preview', tab, csv } | { action: 'import-add', tab, csv, baseSha } | { action: 'restore', tab, commitSha, baseSha }
// POST { action: 'push-preview'|'push'|'push-undo', tab: 'rims', variantId, confirm }
const csvEscape = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCsv(rows) {
    const cols = []; rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k) && !k.startsWith('_')) cols.push(k); }));
    return [cols.map(csvEscape).join(',')].concat(rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))).join('\n');
}

export default async function handler(req, res) {
    const supplied = (req.headers['x-dashboard-auth'] || req.query.auth || '').toString().trim();
    if (supplied !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });
    const { GITHUB_COMPONENTS_PAT: pat, GITHUB_COMPONENTS_REPO: repo } = process.env;
    if (!pat || !repo) return res.status(500).json({ error: 'GitHub credentials missing from environment variables.' });
    res.setHeader('Cache-Control', 'no-store');
    const action = String((req.method === 'GET' ? req.query.action : (req.body || {}).action) || '');
    const tab = String((req.method === 'GET' ? req.query.tab : (req.body || {}).tab) || 'rims');
    if (!FILES.includes(tab)) return res.status(400).json({ error: 'Unknown tab.' });
    try {
        if (req.method === 'GET' && action === 'history') {
            const h = await historyWithDiff({ repo, pat, name: tab }); return res.status(h.ok ? 200 : 502).json(h);
        }
        if (req.method === 'GET' && action === 'export') {
            const f = await readFile({ repo, pat, name: tab }); if (!f.ok) return res.status(502).json({ error: f.error });
            const csv = req.query.format === 'csv';
            res.setHeader('Content-Type', csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${tab}-${new Date().toISOString().slice(0, 10)}.${csv ? 'csv' : 'json'}"`);
            return res.status(200).send(csv ? toCsv(f.data) : JSON.stringify(f.data, null, 2));
        }
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = req.body || {};
        if (action === 'import-preview' || action === 'import-add') {
            const f = await readFile({ repo, pat, name: tab }); if (!f.ok) return res.status(502).json({ error: f.error });
            const parsed = rowsFromCsv(body.csv); if (!parsed.rows.length) return res.status(400).json({ error: 'No rows found in the CSV.', errors: parsed.errors });
            const p = previewImport(tab, f.data, parsed.rows);
            if (action === 'import-preview') return res.status(200).json({ format: parsed.format, parseErrors: parsed.errors, sha: f.sha, ...p, toAdd: p.toAdd.map((r) => ({ title: r.Title, variantId: r.shopify_variant_id, size: r['Option1 Value'], holes: r['Option2 Value'], erd: r['Variant Metafield: custom.rim_erd [number_decimal]'] })) });
            if (p.problems.length || parsed.errors.length) return res.status(422).json({ error: 'The CSV has problems; nothing was added.', problems: p.problems, parseErrors: parsed.errors });
            if (!body.baseSha) return res.status(400).json({ error: 'Preview first, then add.' });
            const out = await saveFiles({ repo, pat, changes: { [tab]: f.data.concat(p.toAdd) }, baseShas: { [tab]: body.baseSha } });
            return res.status(out.status).json(out.body);
        }
        if (action === 'restore') {
            if (!body.commitSha || !body.baseSha) return res.status(400).json({ error: 'commitSha and baseSha are required.' });
            const out = await restoreVersion({ repo, pat, name: tab, commitSha: String(body.commitSha), baseSha: body.baseSha, statusLookup: await liveStatusLookup(process.env) });
            return res.status(out.status).json(out.body);
        }
        if (action === 'push-preview' || action === 'push' || action === 'push-undo') {
            if (tab !== 'rims') return res.status(400).json({ error: 'Push exists for rims only.' });
            const gql = makeGql(fetch, process.env.SHOPIFY_SHOP_NAME, await getShopifyToken(fetch, process.env), '2025-01');
            const variantId = String(body.variantId || '');
            const facts = (await variantFacts(gql, [variantId]))[variantId];
            const readCurrent = async () => (await variantFacts(gql, [variantId]))[variantId];
            const logFile = await readFile({ repo, pat, name: 'push-log', allowMissing: true }); if (!logFile.ok) return res.status(502).json({ error: logFile.error });
            let plan, title = '';
            if (action === 'push-undo') {
                const entry = [...logFile.data].reverse().find((e) => e.variantId === variantId && e.kind !== 'undo');
                if (!entry) return res.status(404).json({ error: 'No logged push for this variant.' });
                plan = planUndo(entry, facts || {}); title = entry.title;
            } else {
                const f = await readFile({ repo, pat, name: tab }); if (!f.ok) return res.status(502).json({ error: f.error });
                const row = f.data.find((r) => String(r.shopify_variant_id || r['Variant ID'] || '') === variantId);
                if (!row) return res.status(404).json({ error: 'That variant id is not in the library.' });
                if (!facts || facts.status === 'MISSING') return res.status(404).json({ error: 'That variant was not found in Shopify.' });
                plan = buildPushPlan(row, facts); title = row.Title;
            }
            if (action === 'push-preview') return res.status(200).json({ plan, title, shopifyNow: facts, pushEnabled: process.env.COMPONENT_PUSH_ENABLED === 'on' });
            const appendLog = async (entry) => {
                const cur = await readFile({ repo, pat, name: 'push-log', allowMissing: true });
                const r = await fetch(`https://api.github.com/repos/${repo}/contents/component-data/push-log.json`, { method: 'PUT', headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Dashboard: push log ${entry.kind} variant ${entry.variantId}`, content: Buffer.from(JSON.stringify(cur.data.concat([entry]), null, 2)).toString('base64'), ...(cur.sha ? { sha: cur.sha } : {}) }) });
                if (!r.ok) throw new Error('could not write the push log; nothing was pushed');
            };
            const writeMetafields = async (vid, items) => {
                const d = await gql('mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{message}}}', { m: items.map((i) => ({ ownerId: `gid://shopify/ProductVariant/${vid}`, namespace: 'custom', key: i.key, value: i.value, type: 'number_decimal' })) });
                if (d.metafieldsSet.userErrors.length) throw new Error(d.metafieldsSet.userErrors[0].message);
            };
            const out = await executePush({ plan, confirm: body.confirm, enabled: process.env.COMPONENT_PUSH_ENABLED === 'on', readCurrent, writeMetafields, appendLog, title, kind: action === 'push-undo' ? 'undo' : 'push' });
            return res.status(out.ok ? 200 : 422).json(out);
        }
        return res.status(400).json({ error: 'Unknown action.' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: String(e.message).slice(0, 140) });
    }
}
