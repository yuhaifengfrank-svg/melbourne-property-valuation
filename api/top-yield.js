/**
 * api/top-yield.js — Top Yield Suburbs API
 *
 * GET /api/top-yield
 *   Returns suburbs with best rental yields
 *
 * GET /api/top-yield?limit=10
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
    const results = await fetchTopByFactor('yield', limit);
    res.status(200).json({ factor: 'yield', count: results.length, results });
  } catch (e) {
    console.error('[top-yield]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
