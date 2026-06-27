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

const AU_STATE_CODES = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);

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
  const requestedState = request.query.state;
  const state = normalizeStateFilter(requestedState);
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
  if (requestedState && !state) {
    response.status(400).json({
      ok: false,
      error: 'unsupported_state',
      message: `State "${requestedState}" is not supported.`,
      supportedStates: [...AU_STATE_CODES],
      opportunities: []
    });
    return;
  }
  const minPrice = request.query.minPrice ? Number(request.query.minPrice) : null;
  const maxPrice = request.query.maxPrice ? Number(request.query.maxPrice) : null;
  const propertyType = normalizePropertyType(request.query.propertyType || request.query.property_type || 'either');

  try {
    const sql = getSql();

    let where = [`s.opportunity_score IS NOT NULL`];
    let params = [];
    let p = 0;

    if (suburbFilter) {
      p++; where.push(`LOWER(s.suburb) LIKE $${p}`); params.push(`%${suburbFilter.toLowerCase()}%`);
    }
    ({ p } = appendStateFilter({ where, params, p, state }));
    ({ p } = appendPriceFilter({ where, params, p, propertyType, minPrice, maxPrice }));

    const q = `
      SELECT s.suburb, s.state,
             s.median_house_price, s.median_unit_price,
             s.median_rent,
             s.median_house_rent,
             s.median_rent_dffh,
             s.median_rent_source,
             s.growth_1y, s.growth_3y, s.growth_5y,
             s.gross_yield, s.school_score, s.vacancy_rate,
             s.supply_constraint_score, s.infrastructure_score,
             s.overall_confidence, s.opportunity_score, s.opportunity_type,
             s.conf_school, s.conf_yield, s.conf_vacancy,
             s.updated_at,
             AVG((c.g02->>'Median_tot_hhd_inc_weekly')::int) * 52 AS hhd_income
      FROM suburb_metrics s
      LEFT JOIN school_locations sl ON LOWER(s.suburb) = LOWER(sl.suburb)
      LEFT JOIN census_sa2_data c ON c.sa2_code::text = sl.sa2_code::text
      WHERE ${where.join(' AND ')}
      GROUP BY s.suburb, s.state, s.median_house_price, s.median_unit_price, s.median_rent,
               s.median_house_rent, s.median_rent_dffh, s.median_rent_source,
               s.growth_1y, s.growth_3y, s.growth_5y,
               s.gross_yield, s.school_score, s.vacancy_rate,
               s.supply_constraint_score, s.infrastructure_score,
               s.overall_confidence, s.opportunity_score, s.opportunity_type,
               s.conf_school, s.conf_yield, s.conf_vacancy, s.updated_at
    `;

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
        state: state || 'all',
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
    console.error('Opportunity API error:', sanitizeOpportunityErrorForLog(error));
    response.status(500).json(publicOpportunityError());
  }
}

export function normalizeStateFilter(value) {
  if (value === null || value === undefined || value === '') return null;
  const state = String(value).trim().toUpperCase();
  return AU_STATE_CODES.has(state) ? state : null;
}

export function appendStateFilter({ where, params, p, state }) {
  if (!state) return { p };
  p++;
  where.push(`UPPER(s.state) = $${p}`);
  params.push(state);
  return { p };
}

export function publicOpportunityError() {
  return {
    ok: false,
    error: 'internal_server_error',
    message: 'Opportunity data is temporarily unavailable. Please try again later.',
    opportunities: [],
  };
}

export function sanitizeOpportunityErrorForLog(error) {
  const message = String(error?.message || 'Unknown opportunity API error')
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(password=)[^&\s]+/gi, '$1[REDACTED]');

  return {
    name: String(error?.name || 'Error'),
    code: error?.code ? String(error.code) : undefined,
    message,
  };
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
    medianRent: toNumberOrNull(r.median_rent_dffh) ?? toNumberOrNull(r.median_rent) ?? toNumberOrNull(r.median_house_rent),
    hhdIncome: toNumberOrNull(r.hhd_income),
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
