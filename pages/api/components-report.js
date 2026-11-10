import { readFile } from '../../lib/components-store';
import { validationReport, coverageReport, driftReport } from '../../lib/components-report';
import { productsByTag, variantFacts } from '../../lib/components-shopify-read';
import { makeGql } from '../../lib/build-guard-shopify';
import { getShopifyToken } from '../../lib/build-guard-run';

// GET /api/components-report?tab=rims|hubs   READ-ONLY: validation, coverage and drift lists. Changes nothing anywhere.
const TAGS = { rims: 'component:rim', hubs: 'component:hub' };
export default async function handler(req, res) {
    if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const tab = String(req.query.tab || 'rims');
    if (!TAGS[tab]) return res.status(400).json({ error: 'Reports exist for rims and hubs.' });
    const { GITHUB_COMPONENTS_PAT: pat, GITHUB_COMPONENTS_REPO: repo } = process.env;
    try {
        const file = await readFile({ repo, pat, name: tab });
        if (!file.ok) return res.status(502).json({ error: file.error });
        const ex = await readFile({ repo, pat, name: 'excluded', allowMissing: true });
        const gql = makeGql(fetch, process.env.SHOPIFY_SHOP_NAME, await getShopifyToken(fetch, process.env), '2025-01');
        const products = await productsByTag(gql, TAGS[tab]);
        const linked = file.data.map((r) => String(r.shopify_variant_id || r['Variant ID'] || '')).filter(Boolean);
        const facts = await variantFacts(gql, linked);
        const rowStatus = Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v.status]));
        const excluded = (ex.ok ? ex.data : []).filter((e) => !e.tab || e.tab === tab);
        return res.status(200).json({ tab, rows: file.data.length, validation: validationReport(file.data), coverage: coverageReport({ rows: file.data, products, rowStatus, excluded }), drift: driftReport(file.data, facts) });
    } catch (e) { return res.status(500).json({ error: 'Report failed: ' + String(e.message).slice(0, 100) }); }
}
