/**
 * api/top-growth.js — Top Growth Suburbs API
 *
 * GET /api/top-growth
 *   Returns suburbs with highest growth scores
 *
 * GET /api/top-growth?limit=10
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const { fetchTopByFactor } = await import('../lib/factor-breakdown.js');
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const results = await fetchTopByFactor('growth', limit);
    res.status(200).json({ factor: 'growth', count: results.length, results });
  } catch (e) {
    console.error('[top-growth]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
