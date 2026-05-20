const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();
const KV_KEY = 'gym_sessions';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.url.split('?')[0];

  // Sessions endpoint
  if (path === '/api/handler' && req.query.route === 'sessions') {
    if (req.method === 'GET') {
      try {
        const sessions = await redis.get(KV_KEY);
        return res.status(200).json({ sessions: sessions || [] });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to read sessions' });
      }
    }
    if (req.method === 'POST') {
      try {
        const { sessions } = req.body;
        if (!Array.isArray(sessions)) return res.status(400).json({ error: 'Invalid data' });
        await redis.set(KV_KEY, sessions);
        return res.status(200).json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to write sessions' });
      }
    }
  }

  // AI endpoint
  if (path === '/api/handler' && req.query.route === 'ai') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { messages, system, maxTokens = 800 } = req.body;
    if (!messages || !system) return res.status(400).json({ error: 'Missing params' });
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages }),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
      const text = data.content?.map(b => b.text || '').join('') || '';
      return res.status(200).json({ text });
    } catch (err) {
      return res.status(500).json({ error: 'AI request failed' });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};
