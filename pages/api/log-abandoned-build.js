const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper function to manually read the request body
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });
}

export default async function handler(req, res) {
  // Set CORS headers for the Shopify Theme
  res.setHeader('Access-Control-Allow-Origin', 'https://loamlabsusa.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await readRawBody(req);
      const buildData = JSON.parse(rawBody);
      
      const dataToStore = {
          ...buildData,
          capturedAt: new Date().toISOString(),
      };

      await redis.lpush('abandoned_builds', JSON.stringify(dataToStore));
      
      res.status(202).json({ message: 'Build data accepted.' });
    } catch (error) {
      console.error('Error in log-abandoned-build:', error);
      res.status(202).json({ message: 'Error processed.' });
    }
    return;
  }
  
  res.status(405).json({ message: 'Method Not Allowed' });
}
