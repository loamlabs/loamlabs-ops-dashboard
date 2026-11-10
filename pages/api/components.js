import { FILES, readFile, saveFiles } from '../../lib/components-store';
import { liveStatusLookup } from '../../lib/shopify-variant-status';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// GET  /api/components?tab=rims      -> { rims: [...], shas: { rims: '<version>' } }   (an error, never an empty list, when GitHub cannot be read)
// POST /api/components               body { rims: [...], baseShas: { rims: '<version loaded>' }, allowRemove: { rims: <rows the user confirmed removing> } }
//   see lib/components-store.js for the checks (version conflict, shrink guard, validation of new/changed rows, descriptive commit message)
export default async function handler(req, res) {
    if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { GITHUB_COMPONENTS_PAT: pat, GITHUB_COMPONENTS_REPO: repo } = process.env;
    if (!pat || !repo) return res.status(500).json({ error: 'GitHub credentials missing from environment variables.' });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'GET') {
        const wanted = req.query.tab ? [String(req.query.tab)] : FILES;
        if (wanted.some((t) => !FILES.includes(t))) return res.status(400).json({ error: 'Unknown tab.' });
        const out = { shas: {} };
        for (const tab of wanted) {
            const r = await readFile({ repo, pat, name: tab });
            if (!r.ok) return res.status(r.status >= 400 && r.status < 600 ? r.status : 502).json({ error: r.error, tab });
            out[tab] = r.data; out.shas[tab] = r.sha;
        }
        return res.status(200).json(out);
    }

    if (req.method === 'POST') {
        const { baseShas = {}, allowRemove = {}, confirmDelete = false } = req.body || {};
        const changes = {}; FILES.forEach((f) => { if (req.body && Array.isArray(req.body[f])) changes[f] = req.body[f]; });
        try {
            // Shopify is only READ here, to refuse deleting rows of retired/draft/missing products
            let statusLookup = null; try { statusLookup = await liveStatusLookup(process.env); } catch (e) { statusLookup = null; }
            const result = await saveFiles({ repo, pat, changes, baseShas, allowRemove, confirmDelete: confirmDelete === true, statusLookup });
            return res.status(result.status).json(result.body);
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Unexpected error while saving; nothing may have been saved. Reload and check.' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
