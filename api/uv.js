/**
 * api/uv.js — Undervaluation API endpoint
 * 
 * GET /api/uv?suburb=brighton
 *   → Returns UV score for one suburb
 * 
 * GET /api/uv?opportunities=true&minUv=60&limit=10&segment=C6_GreenfieldGrowth
 *   → Returns ranked undervalued suburbs
 */

let uvService = null;

async function ensureLoaded() {
  if (uvService) return;
  uvService = await import('../lib/uv-service.js');
  uvService.loadModel();
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    await ensureLoaded();
    const { suburb, opportunities, minUv, limit, segment } = req.query;

    // Mode 1: single suburb UV score
    if (suburb) {
      const score = uvService.getCachedScore(suburb.toLowerCase());
      if (!score) {
        return res.status(404).json({ error: `Suburb '${suburb}' not found in UV model` });
      }
      return res.status(200).json({ suburb: suburb.toLowerCase(), ...score });
    }

    // Mode 2: ranked opportunities
    if (opportunities === 'true' || opportunities === '1') {
      const list = uvService.getOpportunities({
        minUv: minUv ? parseInt(minUv) : 60,
        limit: limit ? parseInt(limit) : 20,
        segment: segment || undefined
      });
      return res.status(200).json({
        count: list.length,
        opportunities: list
      });
    }

    // Mode 3: model info
    return res.status(200).json({
      model: 'uv-v4.0',
      description: 'Core + Satellite OLS undervaluation model',
      docs: 'GET /api/uv?suburb=brighton or GET /api/uv?opportunities=true'
    });
  } catch (err) {
    console.error('[uv-api]', err);
    return res.status(500).json({ error: err.message });
  }
};
