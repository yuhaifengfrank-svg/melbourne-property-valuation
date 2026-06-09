/**
 * api/top-value.js — Top Value Suburbs API
 *
 * GET /api/top-value
 *   Returns suburbs with best value (lowest median prices)
 *
 * GET /api/top-value?limit=10
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
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const results = await fetchTopByFactor('value', limit);
    res.status(200).json({ factor: 'value', count: results.length, results });
  } catch (e) {
    console.error('[top-value]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
