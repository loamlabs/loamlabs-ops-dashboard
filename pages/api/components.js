export default async function handler(req, res) {
    if (req.headers['x-dashboard-auth'] !== process.env.DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { GITHUB_COMPONENTS_PAT, GITHUB_COMPONENTS_REPO } = process.env;

    if (!GITHUB_COMPONENTS_PAT || !GITHUB_COMPONENTS_REPO) {
        return res.status(500).json({ error: 'GitHub credentials missing from environment variables.' });
    }

    if (req.method === 'GET') {
        const fetchFile = async (filename) => {
            const url = `https://api.github.com/repos/${GITHUB_COMPONENTS_REPO}/contents/component-data/${filename}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${GITHUB_COMPONENTS_PAT}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            if (response.status === 404) return []; // Might not exist yet
            if (!response.ok) {
                console.error(`Failed to fetch ${filename}:`, await response.text());
                return [];
            }
            const text = await response.text();
            try { return JSON.parse(text); } catch(e) { return []; }
        };

        try {
            const [hubs, rims, spokes, nipples] = await Promise.all([
                fetchFile('hubs.json'),
                fetchFile('rims.json'),
                fetchFile('spokes.json'),
                fetchFile('nipples.json')
            ]);
            return res.status(200).json({ hubs, rims, spokes, nipples });
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: 'Failed to communicate with GitHub API.' });
        }
    }
    
    if (req.method === 'POST') {
        const { hubs, rims, spokes, nipples } = req.body;
        
        try {
            const filesToUpdate = [];
            if (hubs) filesToUpdate.push({ filename: 'hubs.json', data: hubs });
            if (rims) filesToUpdate.push({ filename: 'rims.json', data: rims });
            if (spokes) filesToUpdate.push({ filename: 'spokes.json', data: spokes });
            if (nipples) filesToUpdate.push({ filename: 'nipples.json', data: nipples });

            for (const file of filesToUpdate) {
                const url = `https://api.github.com/repos/${GITHUB_COMPONENTS_REPO}/contents/component-data/${file.filename}`;
                
                // 1. Get current SHA
                const getResp = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${GITHUB_COMPONENTS_PAT}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                let sha = undefined;
                if (getResp.ok) {
                    const getData = await getResp.json();
                    sha = getData.sha;
                }

                // 2. Put new content (base64)
                const contentStr = JSON.stringify(file.data, null, 2);
                const base64Content = Buffer.from(contentStr).toString('base64');

                const putResp = await fetch(url, {
                    method: 'PUT',
                    headers: { 
                        'Authorization': `Bearer ${GITHUB_COMPONENTS_PAT}`, 
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Dashboard Commit: Update ${file.filename}`,
                        content: base64Content,
                        sha: sha
                    })
                });

                if (!putResp.ok) {
                    throw new Error(`Failed to update ${file.filename}: ` + await putResp.text());
                }
            }
            return res.status(200).json({ success: true });
        } catch(e) {
            console.error(e);
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
