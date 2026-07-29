/**
 * api/suburb-intelligence.js — Phase 2: Suburb Intelligence API
 *
 * GET /api/suburb-intelligence?suburb=Scoresby
 *   Returns full factor breakdown + explanations for one suburb
 *
 * GET /api/suburb-intelligence?suburb=Scoresby&format=text
 *   Returns plain-text explanation suitable for SEO/display
 *
 * Designed for Vercel serverless (Express-style handler signature).
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

  const suburb = req.query.suburb;
  if (!suburb) {
    res.status(400).json({ error: 'Missing required parameter: suburb' });
    return;
  }

  try {
    const { fetchSuburbIntelligence } = await import('./factor-breakdown.js');
    const result = await fetchSuburbIntelligence(suburb);

    if (!result) {
      res.status(404).json({ error: `Suburb not found: ${suburb}` });
      return;
    }

    // If text format requested, return plain-text summary
    if (req.query.format === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(200).send(formatAsText(result));
      return;
    }

    try {
      const {
        ensureCouncilDevelopmentMetricsSchema,
        ensureCouncilPlanningMetricsSchema,
        getSql,
      } = await import('../api/_db.js');
      const { fetchPublicDevelopmentMetrics } = await import('./council-development-metrics.js');
      const { fetchPublicPlanningMetrics } = await import('./council-planning-metrics.js');
      const sql = getSql();
      await ensureCouncilPlanningMetricsSchema(sql);
      await ensureCouncilDevelopmentMetricsSchema(sql);
      result.councilPlanning = await fetchPublicPlanningMetrics(sql, suburb);
      result.councilDevelopment = await fetchPublicDevelopmentMetrics(sql, suburb);
    } catch (planningError) {
      console.error('[suburb-intelligence:planning]', planningError?.message || 'query failed');
      result.councilPlanning = [];
      result.councilDevelopment = [];
    }

    res.status(200).json(result);
  } catch (e) {
    console.error('[suburb-intelligence]', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function formatAsText(r) {
  const lines = [
    `🏘  ${r.suburb}, ${r.state}`,
    `   Confidence: ${r.overallConfidence}/100`,
    '',
    '── Factor Scores ──',
    ...Object.entries({
      Value: r.value,
      Growth: r.growth,
      Yield: r.yield,
      Vacancy: r.vacancy,
      School: r.school,
      Income: r.income,
      Population: r.population,
      Supply: r.supply,
      Infrastructure: r.infrastructure,
    }).map(([k, v]) => `  ${k.padEnd(16)} ${String(v.score).padStart(3)}/100  (${v.tier})`),
    '',
    '── Explanations ──',
    ...Object.entries(r.explanations).flatMap(([k, v]) =>
      [`  ${k}:`, ...v.map(l => `    • ${l}`)]
    ),
  ];
  return lines.join('\n');
}
