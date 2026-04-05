import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const builds = await redis.lrange('abandoned_builds', 0, 49); // Get last 50
    const parsedBuilds = builds.map(b => typeof b === 'string' ? JSON.parse(b) : b);
    
    res.status(200).json({ builds: parsedBuilds });
  } catch (error) {
    console.error('Error fetching abandoned builds:', error);
    res.status(500).json({ error: error.message });
  }
}
