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

export default async function handler(request) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url, 'http://localhost');
  const suburbFilter = url.searchParams.get('suburb');
  const minScore = Number(url.searchParams.get('minScore') || 0);
  const maxResults = Math.min(Number(url.searchParams.get('maxResults') || 50), 200);
  const strategy = url.searchParams.get('strategy') || 'smart';
  const minPrice = url.searchParams.get('minPrice') ? Number(url.searchParams.get('minPrice')) : null;
  const maxPrice = url.searchParams.get('maxPrice') ? Number(url.searchParams.get('maxPrice')) : null;

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

    return new Response(JSON.stringify({
      ok: true,
      opportunities,
      meta: {
        totalFound: rows.length,
        strategy,
        collectedAt: new Date().toISOString()
      }
    }), { headers });

  } catch (error) {
    console.error('Opportunity API error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      opportunities: []
    }), { status: 500, headers });
  }
}
