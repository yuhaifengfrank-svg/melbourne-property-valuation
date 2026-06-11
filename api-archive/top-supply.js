/**
 * api/top-supply.js — Top Supply-Constrained Suburbs API
 *
 * GET /api/top-supply
 *   Returns suburbs with highest supply constraint scores
 *
 * GET /api/top-supply?limit=100
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
    const results = await fetchTopByFactor('supply', limit);
    res.status(200).json({ factor: 'supply', count: results.length, results });
  } catch (e) {
    console.error('[top-supply]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
