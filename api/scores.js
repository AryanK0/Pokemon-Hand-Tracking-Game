const { Redis } = require('@upstash/redis');
const kv = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

function sanitizeName(name) {
  return name
    .toString()
    .trim()
    .replace(/[<>{}]/g, '')
    .slice(0, 15);
}

module.exports = async function handler(req, res) {
  // Add CORS headers so it works smoothly on Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, score } = req.body || {};

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100000) {
    return res.status(400).json({ error: 'invalid score' });
  }

  const cleanName = sanitizeName(name);
  if (cleanName.length === 0) {
    return res.status(400).json({ error: 'name is required' });
  }

  const roundedScore = Math.floor(score);
  
  try {
    const currentScore = await kv.zscore('leaderboard', cleanName);
    
    if (currentScore === null || roundedScore > currentScore) {
      await kv.zadd('leaderboard', { score: roundedScore, member: cleanName });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('KV Error:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
};
