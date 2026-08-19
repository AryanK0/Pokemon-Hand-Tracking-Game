const { Redis } = require('@upstash/redis');
const kv = Redis.fromEnv();

module.exports = async function handler(req, res) {
  // Add CORS headers
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get top 3 members sorted by score descending
    const topScores = await kv.zrange('leaderboard', 0, 2, { rev: true, withScores: true });
    
    // Normalize response based on what @vercel/kv returns
    let formatted = [];
    if (topScores.length > 0 && typeof topScores[0] === 'object') {
      formatted = topScores.map(entry => ({
        name: entry.member,
        score: entry.score
      }));
    } else {
      // In case it returns flat array: [ "Alice", 100, "Bob", 80 ]
      for (let i = 0; i < topScores.length; i += 2) {
        formatted.push({ name: topScores[i], score: topScores[i + 1] });
      }
    }
    
    res.status(200).json(formatted);
  } catch (error) {
    console.error('KV Error:', error);
    res.status(500).json({ error: 'Failed to fetch top scores' });
  }
};
