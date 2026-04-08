export default async function handler(req, res) {
    if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tab } = req.query;
    if (!tab) {
        return res.status(400).json({ error: 'Tab parameter is required' });
    }

    const { GITHUB_COMPONENTS_PAT, GITHUB_COMPONENTS_REPO } = process.env;

    if (!GITHUB_COMPONENTS_PAT || !GITHUB_COMPONENTS_REPO) {
        return res.status(500).json({ error: 'GitHub credentials missing.' });
    }

    const filename = `${tab}.json`;
    const url = `https://api.github.com/repos/${GITHUB_COMPONENTS_REPO}/commits?path=component-data/${filename}&per_page=10`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${GITHUB_COMPONENTS_PAT}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`GitHub History Error (${filename}):`, errText);
            return res.status(response.status).json({ error: 'Failed to fetch GitHub history' });
        }

        const commits = await response.json();
        
        // Clean up data for the UI
        const history = commits.map(c => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author.name,
            date: c.commit.author.date,
            url: c.html_url
        }));

        return res.status(200).json(history);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
