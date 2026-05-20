const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();
const KV_KEY = 'gym_sessions';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const sessions = await redis.get(KV_KEY);
      return res.status(200).json({ sessions: sessions || [] });
    } catch (err) {
      console.error('Redis read error:', err);
      return res.status(500).json({ error: 'Failed to read sessions' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { sessions } = req.body;
      if (!Array.isArray(sessions)) return res.status(400).json({ error: 'Invalid sessions data' });
      await redis.set(KV_KEY, sessions);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Redis write error:', err);
      return res.status(500).json({ error: 'Failed to write sessions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
