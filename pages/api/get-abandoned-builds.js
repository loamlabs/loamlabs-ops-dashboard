import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis = null;
if (redisUrl && redisToken) {
  redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-dashboard-auth']?.trim() !== process.env.DASHBOARD_PASSWORD?.trim()) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (!redis) {
      console.warn("Redis is not configured. Returning empty builds.");
      return res.status(200).json({ builds: [] });
    }
    const builds = await redis.lrange('abandoned_builds', 0, 49); // Get last 50
    const parsedBuilds = builds.map(b => typeof b === 'string' ? JSON.parse(b) : b);
    
    res.status(200).json({ builds: parsedBuilds });
  } catch (error) {
    console.error('Error fetching abandoned builds:', error);
    res.status(500).json({ error: error.message });
  }
}
