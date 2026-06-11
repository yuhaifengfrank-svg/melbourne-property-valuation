/**
 * api/opportunity.js - Opportunity API endpoint (v2)
 * Reads pre-computed scores from suburb_metrics — fast, no N+1 queries.
 * GET /api/opportunity?suburb=&minScore=&maxResults=&strategy=
 */

import { neon } from '@neondatabase/serverless';

let _sql = null;
function getSql() {
  if (!_sql && process.env.DATABASE_URL) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  const suburbFilter = request.query.suburb;
  const minScore = Number(request.query.minScore || 0);
  const maxResults = Math.min(Number(request.query.maxResults || 50), 200);
  const strategy = request.query.strategy || 'smart';
  const VALID_STRATEGIES = ['smart'];
  if (!VALID_STRATEGIES.includes(strategy)) {
    response.status(400).json({
      ok: false,
      error: 'unsupported_strategy',
      message: `Strategy "${strategy}" is not yet implemented. Only "smart" is supported at this time. Future Growth strategies are under development.`,
      supportedStrategies: ['smart'],
      opportunities: []
    });
    return;
  }
  const minPrice = request.query.minPrice ? Number(request.query.minPrice) : null;
  const maxPrice = request.query.maxPrice ? Number(request.query.maxPrice) : null;

  try {
    const sql = getSql();

    let where = [`opportunity_score IS NOT NULL`];
    let params = [];
    let p = 0;

    if (suburbFilter) {
      p++; where.push(`LOWER(suburb) LIKE $${p}`); params.push(`%${suburbFilter.toLowerCase()}%`);
    }
    if (minPrice != null) {
      p++; where.push(`median_house_price >= $${p}`); params.push(minPrice);
    }
    if (maxPrice != null) {
      p++; where.push(`median_house_price <= $${p}`); params.push(maxPrice);
    }
    where.push(`opportunity_score >= ${minScore}`);

    const q = `
      SELECT suburb, state,
             median_house_price, median_unit_price,
             growth_1y, growth_3y, growth_5y,
             gross_yield, school_score, vacancy_rate,
             supply_constraint_score, infrastructure_score,
             overall_confidence, opportunity_score, opportunity_type,
             conf_school, conf_yield, conf_vacancy, updated_at
      FROM suburb_metrics
      WHERE ${where.join(' AND ')}
      ORDER BY opportunity_score DESC
      LIMIT $${++p}
    `;
    params.push(maxResults);

    const rows = await sql.query(q, params);

    const opportunities = rows.map(r => ({
      suburb: r.suburb,
      state: r.state || 'VIC',
      medianHousePrice: Number(r.median_house_price) || null,
      medianUnitPrice: Number(r.median_unit_price) || null,
      grossYield: Number(r.gross_yield) || null,
      rentalYield: Number(r.gross_yield) || null,
      schoolScore: Number(r.school_score) || null,
      vacancyRate: Number(r.vacancy_rate) || null,
      supplyConstraintScore: Number(r.supply_constraint_score) || null,
      infrastructureScore: Number(r.infrastructure_score) || null,
      overallConfidence: Number(r.overall_confidence) || null,
      opportunityScore: Number(r.opportunity_score),
      opportunityType: r.opportunity_type || 'Balanced',
      dataUpdated: r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
    }));

    response.status(200).json({
      ok: true,
      opportunities,
      meta: {
        totalFound: rows.length,
        strategy,
        scoreType: 'Beta composite indicator',
        disclaimer: 'The Opportunity Score is a Beta composite of recent price trends, school quality, rental yield, vacancy and affordability. It is not a calibrated future price forecast. A dedicated Future Growth model is under development.',
        collectedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Opportunity API error:', error);
    response.status(500).json({
      ok: false,
      error: error.message,
      opportunities: []
    });
  }
}
