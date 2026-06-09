/**
 * opportunity-scoring-v2.js — Opportunity Engine V2
 *
 * Replaces v1 scoring with pre-computed suburb_metrics + per-property factors.
 *
 * Weights (Phase 2):
 *   Undervaluation  30%
 *   Growth          25%
 *   Rental Yield    15%
 *   Vacancy         15%
 *   School Quality  10%
 *   Confidence       5%
 *
 * Categories (Phase 3):
 *   Growth Opportunity
 *   Cashflow Opportunity
 *   School Zone Opportunity
 *   Balanced Opportunity
 *   Infrastructure Opportunity
 *   Value Opportunity
 *
 * Run against suburb_metrics (refreshed nightly) + comparable_sales.
 */

import { neon } from '@neondatabase/serverless';

// ── Config ──
const WEIGHTS = {
  undervaluation: 0.30,
  growth:         0.25,
  yield:          0.15,
  vacancy:        0.15,
  school:         0.10,
  confidence:     0.05,
};

const MIN_SALE = 50000;
const MAX_SALE = 50000000;
const MAX_DAYS = 1095; // 3 years back
const DEFAULT_BATCH_TIMEOUT_MS = 8000;

let _sql = null;
function getSql() {
  if (!_sql && process.env.DATABASE_URL) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

function q(text, params) {
  const s = getSql();
  if (params && params.length > 0) return s.query(text, params);
  return s.query(text, []);
}

// ── Types & thresholds ──
const OPP_TYPES = {
  school:       { label: 'School Zone Opportunity',  thresholds: { school: 75 } },
  growth:       { label: 'Growth Opportunity',       thresholds: { growth: 70 } },
  cashflow:     { label: 'Cashflow Opportunity',     thresholds: { yield: 70, vacancy: 70 } },
  infrastructure: { label: 'Infrastructure Opportunity', thresholds: { infra: 65 } },
  value:        { label: 'Value Opportunity',        thresholds: { undervaluation: 70 } },
  balanced:     { label: 'Balanced Opportunity',     thresholds: {} },
};

// ── Main scan ──
export async function scanOpportunitiesV2(params = {}) {
  const {
    strategy = 'smart',
    suburbRegion = null,
    propertyType = null,
    minPrice = null,
    maxPrice = null,
    minScore = 0,
    maxResults = 50,
  } = params;

  const t0 = Date.now();

  // Step 1: Load suburb_metrics (pre-computed batch)
  const metrics = await loadAllMetrics();
  if (!metrics || metrics.size === 0) {
    return { opportunities: [], meta: { totalScanned: 0, strategy, message: 'No suburb metrics available' } };
  }

  // Step 2: Load recent sales, filtered by params
  const sales = await loadFilteredSales(suburbRegion, propertyType, minPrice, maxPrice);

  // Step 3: Score each property
  const scored = sales.map(sale => {
    const m = metrics.get(sale.suburb) || {};
    return scorePropertyV2(sale, m, strategy);
  });

  const filtered = scored.filter(s => s.opportunityScore >= minScore);
  filtered.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const elapsed = Date.now() - t0;
  return {
    opportunities: filtered.slice(0, maxResults).map(o => enrichOutput(o)),
    meta: {
      totalScanned: scored.length,
      matchingFilter: filtered.length,
      strategy,
      suburbCount: metrics.size,
      averageScore: scored.length > 0 ? Math.round(scored.reduce((s, o) => s + o.opportunityScore, 0) / scored.length) : 0,
      elapsed,
    },
  };
}

// ── Load suburb_metrics into Map ──
async function loadAllMetrics() {
  const rows = await q('SELECT * FROM suburb_metrics', []);
  const map = new Map();
  for (const r of rows) {
    map.set(r.suburb, r);
  }
  return map;
}

// ── Load filtered sales ──
async function loadFilteredSales(suburbRegion, propertyType, minPrice, maxPrice) {
  const clauses = [
    'sale_price IS NOT NULL AND sale_price > $1 AND sale_price < $2',
    'sale_date IS NOT NULL AND sale_date > NOW() - INTERVAL \'' + MAX_DAYS + ' days\'',
  ];
  const params = [MIN_SALE, MAX_SALE];

  if (suburbRegion) {
    params.push('%' + suburbRegion.toLowerCase() + '%');
    clauses.push('LOWER(suburb) LIKE $' + params.length);
  }
  if (propertyType) {
    params.push(propertyType.toLowerCase());
    clauses.push('LOWER(property_type) = $' + params.length);
  }
  if (minPrice) {
    params.push(Number(minPrice));
    clauses.push('sale_price >= $' + params.length);
  }
  if (maxPrice) {
    params.push(Number(maxPrice));
    clauses.push('sale_price <= $' + params.length);
  }

  const sql = `
    SELECT id, sale_address, suburb, state, property_type,
           bedrooms, bathrooms, car_spaces, land_size_sqm,
           sale_price, sale_date, lat, lon
    FROM comparable_sales
    WHERE ${clauses.join(' AND ')}
    ORDER BY sale_date DESC
    LIMIT 2000
  `;
  const raw = await q(sql, params);
  return raw || [];
}

// ── Score a single property ──
function scorePropertyV2(sale, metrics, strategy) {
  const w = getWeightsV2(strategy);

  // Undervaluation: compare sale price to suburb median
  const med = sale.property_type === 'House' || sale.property_type === 'house'
    ? metrics.median_house_price
    : metrics.median_unit_price;
  const { score: uvScore, pct: uvPct } = calcUndervaluationV2(sale.sale_price, med);

  // Growth: use suburb_metrics growth values
  const gtScore = calcGrowthScoreV2(metrics);

  // Yield: use suburb_metrics yield (or proxy from census)
  const yldScore = calcYieldScoreV2(metrics);

  // Vacancy: use suburb_metrics vacancy (default if NULL)
  const vacScore = calcVacancyScoreV2(metrics);

  // School: school_score from suburb_metrics
  const schScore = metrics.school_score != null
    ? Math.round(Math.max(0, Math.min(100, metrics.school_score)))
    : 40;

  // Confidence: more data = higher confidence
  const conf = med != null ? 70 : 45;

  // Weights overlap — use formula weights from strategy
  const rawWeights = { ...w };
  const numerator =
    uvScore * rawWeights.undervaluation +
    gtScore * rawWeights.growth +
    yldScore * rawWeights.yield +
    vacScore * rawWeights.vacancy +
    schScore * rawWeights.school +
    conf * rawWeights.confidence;

  const totalWeights = rawWeights.undervaluation + rawWeights.growth + rawWeights.yield +
    rawWeights.vacancy + rawWeights.school + rawWeights.confidence;
  const oppScore = Math.round(Math.max(0, Math.min(100, numerator / totalWeights)));

  // Classify
  const oppType = classifyOpportunityV2(oppScore, uvScore, gtScore, yldScore, vacScore, schScore, metrics.infrastructure_score);

  return {
    opportunityScore: oppScore,
    opportunityType: oppType.label,
    undervaluationScore: uvScore,
    undervaluationPct: uvPct,
    growthScore: gtScore,
    yieldScore: yldScore,
    vacancyScore: vacScore,
    schoolScore: schScore,
    confidenceScore: conf,
    badges: badgesV2(oppScore, uvPct, schScore, gtScore, yldScore),
    keyDrivers: keyDriversV2(uvScore, gtScore, yldScore, schScore, vacScore),
    riskFactors: riskFactorsV2(uvPct, metrics.growth_3y, metrics.vacancy_rate),
  };
}

function getWeightsV2(strategy) {
  const b = { ...WEIGHTS };
  switch (strategy) {
    case 'value':
      return { ...b, undervaluation: 0.40, growth: 0.20, yield: 0.15, vacancy: 0.10, school: 0.10, confidence: 0.05 };
    case 'growth':
      return { ...b, undervaluation: 0.15, growth: 0.40, yield: 0.15, vacancy: 0.10, school: 0.15, confidence: 0.05 };
    case 'cashflow':
      return { ...b, undervaluation: 0.10, growth: 0.15, yield: 0.35, vacancy: 0.20, school: 0.15, confidence: 0.05 };
    case 'school':
      return { ...b, undervaluation: 0.15, growth: 0.15, yield: 0.10, vacancy: 0.10, school: 0.45, confidence: 0.05 };
    default:
      return b;
  }
}

function calcUndervaluationV2(salePrice, medianPrice) {
  if (!medianPrice || medianPrice <= 0 || !salePrice || salePrice <= 0) {
    return { score: 50, pct: 0 };
  }
  const diff = (medianPrice - salePrice) / medianPrice; // positive = undervalued
  // Linear: 0% diff = 30pts, 25% diff = 80pts, 40%+ diff = 100pts
  const score = diff <= 0 ? 30 : Math.max(0, Math.min(100, 30 + diff * 200));
  return { score: Math.round(score), pct: Math.round(diff * 100) };
}

function calcGrowthScoreV2(m) {
  // Combine growth_1y, growth_3y, growth_5y, population_growth
  const g1 = m.growth_1y;
  const g3 = m.growth_3y;
  const g5 = m.growth_5y;

  if (g1 == null && g3 == null && g5 == null) return 50;

  // Weighted composite: 3y has most weight
  let score = 50;
  let count = 0;
  if (g3 != null) { score += g3 * 1.5; count++; }
  if (g1 != null) { score += g1; count++; }
  if (g5 != null) { score += g5 * 0.8; count++; }

  if (count > 0) {
    score = score / (1 + count * 0.5); // normalize based on available data
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calcYieldScoreV2(m) {
  // If we have gross_yield from suburb_metrics, use it
  if (m.gross_yield != null) {
    // 2% = 20pts, 4% = 50pts, 6% = 80pts, 8%+ = 100pts
    return Math.round(Math.max(0, Math.min(100, (m.gross_yield - 1) / 7 * 100)));
  }
  return 40; // neutral default
}

function calcVacancyScoreV2(m) {
  if (m.vacancy_rate == null) return 50; // neutral
  // Lower vacancy = higher score (0% = 100, 5% = 0)
  return Math.round(Math.max(0, Math.min(100, 100 - m.vacancy_rate * 20)));
}

function classifyOpportunityV2(score, uv, gt, yld, vac, sch, infra) {
  if (score < 30) return { label: OPP_TYPES.balanced.label, type: 'balanced' };

  const matches = [];

  if (sch >= 75) matches.push(OPP_TYPES.school);
  if (gt >= 70) matches.push(OPP_TYPES.growth);
  if (yld >= 70 && vac >= 70) matches.push(OPP_TYPES.cashflow);
  if (infra >= 65) matches.push(OPP_TYPES.infrastructure);
  if (uv >= 70) matches.push(OPP_TYPES.value);

  if (matches.length === 0) return OPP_TYPES.balanced;
  if (matches.length === 1) return matches[0];

  // Multiple — pick based on highest sub-score
  const subScores = { school: sch, growth: gt, cashflow: Math.round((yld + vac) / 2), value: uv, infrastructure: infra || 0 };
  const best = matches.reduce((a, b) => {
    const ka = a.label.includes('School') ? 'school' : a.label.includes('Growth') ? 'growth' : a.label.includes('Cashflow') ? 'cashflow' : a.label.includes('Value') ? 'value' : 'infrastructure';
    const kb = b.label.includes('School') ? 'school' : b.label.includes('Growth') ? 'growth' : b.label.includes('Cashflow') ? 'cashflow' : b.label.includes('Value') ? 'value' : 'infrastructure';
    return (subScores[ka] || 0) >= (subScores[kb] || 0) ? a : b;
  });
  return best;
}

function badgesV2(ts, uvPct, schScore, gtScore, yldScore) {
  const b = [];
  if (uvPct >= 15) b.push({ label: 'Undervalued ' + uvPct + '%', type: 'value' });
  else if (uvPct >= 5) b.push({ label: uvPct + '% below median', type: 'value' });
  if (schScore >= 80) b.push({ label: 'Top School Zone', type: 'school' });
  else if (schScore >= 60) b.push({ label: 'Good School Zone', type: 'school' });
  if (gtScore >= 70) b.push({ label: 'Strong Growth', type: 'growth' });
  if (yldScore >= 70) b.push({ label: 'Good Yield', type: 'yield' });
  if (ts >= 85) b.push({ label: 'Prime Opportunity', type: 'prime' });
  else if (ts >= 75) b.push({ label: 'Strong Opportunity', type: 'prime' });
  return b;
}

function keyDriversV2(uv, gt, yld, sch, vac) {
  const drivers = [];
  if (uv >= 70) drivers.push('Below suburb median price');
  if (gt >= 70) drivers.push('Strong price growth trend');
  if (yld >= 70) drivers.push('Attractive rental yield');
  if (sch >= 75) drivers.push('High-quality school zone');
  if (vac >= 70) drivers.push('Low vacancy, high rental demand');
  if (drivers.length === 0) drivers.push('Stable market fundamentals');
  return drivers;
}

function riskFactorsV2(uvPct, growth3y, vacancyRate) {
  const risks = [];
  if (uvPct < -10) risks.push('Premium price — limited upside');
  if (growth3y != null && growth3y < 0) risks.push('Declining price trend over 3 years');
  if (vacancyRate != null && vacancyRate > 5) risks.push('Above-average vacancy rate');
  if (risks.length === 0) risks.push('Limited downside indicators observed');
  return risks;
}

function enrichOutput(o) {
  return {
    address: o.address,
    suburb: o.suburb,
    state: o.state,
    propertyType: o.propertyType,
    bedrooms: o.bedrooms,
    bathrooms: o.bathrooms,
    carSpaces: o.carSpaces,
    landSize: o.landSize,
    salePrice: o.salePrice,
    soldDate: o.soldDate,
    opportunityScore: o.opportunityScore,
    opportunityType: o.opportunityType,
    undervaluationScore: o.undervaluationScore,
    undervaluationPct: o.undervaluationPct,
    growthScore: o.growthScore,
    yieldScore: o.yieldScore,
    vacancyScore: o.vacancyScore,
    schoolScore: o.schoolScore,
    confidenceScore: o.confidenceScore,
    badges: o.badges,
    keyDrivers: o.keyDrivers,
    riskFactors: o.riskFactors,
  };
}

// ── CLI test ──
if (process.argv[1] && (process.argv[1].includes('opportunity-scoring-v2'))) {
  const { strategy = 'smart', maxResults = '5' } = process.argv.reduce((acc, arg) => {
    const m = arg.match(/^--(\w+)=(.+)/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});
  scanOpportunitiesV2({ strategy, maxResults: Number(maxResults) })
    .then(r => {
      console.log(JSON.stringify(r.opportunities.slice(0, 3), null, 2));
      console.log('meta:', JSON.stringify(r.meta));
      process.exit(0);
    })
    .catch(e => { console.error(e); process.exit(1); });
}
