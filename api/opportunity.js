/**
 * api/opportunity.js - Opportunity API endpoint (v2)
 * Reads pre-computed scores from suburb_metrics — fast, no N+1 queries.
 * GET /api/opportunity?suburb=&minScore=&maxResults=&strategy=
 */

import { neon } from '@neondatabase/serverless';
import {
  isSupportedFutureStrategy,
  normalizePropertyType,
  normalizeStrategy,
  scoreFutureOpportunity,
  supportedFutureStrategies,
} from '../lib/future-opportunity-outlook.js';

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
  const requestedStrategy = request.query.strategy || 'balanced';
  const strategy = normalizeStrategy(requestedStrategy);
  const validStrategies = supportedFutureStrategies();
  if (!isSupportedFutureStrategy(requestedStrategy)) {
    response.status(400).json({
      ok: false,
      error: 'unsupported_strategy',
      message: `Strategy "${request.query.strategy}" is not supported.`,
      supportedStrategies: validStrategies,
      opportunities: []
    });
    return;
  }
  const minPrice = request.query.minPrice ? Number(request.query.minPrice) : null;
  const maxPrice = request.query.maxPrice ? Number(request.query.maxPrice) : null;
  const propertyType = normalizePropertyType(request.query.propertyType || request.query.property_type || 'either');

  try {
    const sql = getSql();

    let where = [`opportunity_score IS NOT NULL`];
    let params = [];
    let p = 0;

    if (suburbFilter) {
      p++; where.push(`LOWER(suburb) LIKE $${p}`); params.push(`%${suburbFilter.toLowerCase()}%`);
    }
    ({ p } = appendPriceFilter({ where, params, p, propertyType, minPrice, maxPrice }));

    const candidateLimit = Math.min(Math.max(maxResults * 4, 100), 500);
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
    params.push(candidateLimit);

    const rows = await sql.query(q, params);

    const opportunities = rows
      .map(r => mapOpportunityRow(r, { strategy, propertyType }))
      .filter(o => o.futureOpportunityIndex >= minScore)
      .sort((a, b) => b.futureOpportunityIndex - a.futureOpportunityIndex)
      .slice(0, maxResults);

    response.status(200).json({
      ok: true,
      opportunities,
      meta: {
        totalFound: opportunities.length,
        totalCandidates: rows.length,
        strategy,
        propertyType,
        scoreType: 'Future Opportunity Index',
        modelVersion: opportunities[0]?.modelVersion || 'future_outlook_v1',
        forecastHorizon: '3-5 years',
        isPriceForecast: false,
        disclaimer: 'Future Opportunity Index is a relative 0-100 screening signal. It is not a price forecast, financial advice, or a guaranteed return.',
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

export function appendPriceFilter({ where, params, p, propertyType, minPrice, maxPrice }) {
  if (minPrice == null && maxPrice == null) return { p };

  const hasMin = minPrice != null && Number.isFinite(minPrice);
  const hasMax = maxPrice != null && Number.isFinite(maxPrice);
  const priceClauseFor = (column) => {
    const clauses = [];
    if (hasMin) {
      p++;
      clauses.push(`${column} >= $${p}`);
      params.push(minPrice);
    }
    if (hasMax) {
      p++;
      clauses.push(`${column} <= $${p}`);
      params.push(maxPrice);
    }
    return `(${column} IS NOT NULL AND ${clauses.join(' AND ')})`;
  };

  if (propertyType === 'house') {
    where.push(priceClauseFor('median_house_price'));
  } else if (propertyType === 'unit') {
    where.push(priceClauseFor('median_unit_price'));
  } else {
    where.push(`(${priceClauseFor('median_house_price')} OR ${priceClauseFor('median_unit_price')})`);
  }
  return { p };
}

export function mapOpportunityRow(r, { strategy = 'balanced', propertyType = 'either' } = {}) {
  const base = {
    suburb: r.suburb,
    state: r.state || 'VIC',
    medianHousePrice: toNumberOrNull(r.median_house_price),
    medianUnitPrice: toNumberOrNull(r.median_unit_price),
    grossYield: toNumberOrNull(r.gross_yield),
    rentalYield: toNumberOrNull(r.gross_yield),
    schoolScore: toNumberOrNull(r.school_score),
    vacancyRate: toNumberOrNull(r.vacancy_rate),
    supplyConstraintScore: toNumberOrNull(r.supply_constraint_score),
    infrastructureScore: toNumberOrNull(r.infrastructure_score),
    overallConfidence: toNumberOrNull(r.overall_confidence),
    legacyOpportunityScore: toNumberOrNull(r.opportunity_score),
    legacyOpportunityType: r.opportunity_type || 'Balanced',
    dataUpdated: r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
  };
  const outlook = scoreFutureOpportunity(base, { strategy, propertyType });
  return {
    ...base,
    ...outlook,
    opportunityScore: outlook.futureOpportunityIndex,
    opportunityType: outlook.opportunityType,
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
