/**
 * api/top-school.js — Top School Zone Suburbs API
 *
 * GET /api/top-school
 *   Returns suburbs with best school quality scores
 *
 * GET /api/top-school?limit=10
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
    const results = await fetchTopByFactor('school', limit);
    res.status(200).json({ factor: 'school', count: results.length, results });
  } catch (e) {
    console.error('[top-school]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
