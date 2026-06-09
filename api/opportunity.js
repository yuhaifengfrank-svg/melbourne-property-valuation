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
             school_score, vacancy_rate,
             opportunity_score, opportunity_type
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
      growth1y: Number(r.growth_1y) || null,
      growth3y: Number(r.growth_3y) || null,
      growth5y: Number(r.growth_5y) || null,
      schoolScore: Number(r.school_score) || null,
      vacancyRate: Number(r.vacancy_rate) || null,
      opportunityScore: Number(r.opportunity_score),
      opportunityType: r.opportunity_type || 'Balanced'
    }));

    response.status(200).json({
      ok: true,
      opportunities,
      meta: {
        totalFound: rows.length,
        strategy,
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
