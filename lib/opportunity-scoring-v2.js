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
const MAX_SCORE = 100;
const SCORE_FLOORS = { strong: 75, moderate: 55, developing: 35, minimal: 15 };

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

function calcRentalScoresV2(m) {
  // Yield from gross_yield if available
  // If not: proxy from median house price (cheaper = higher yield potential)
  let yldScore, vacScore;

  if (m.gross_yield != null) {
    // 2% = 20, 4% = 55, 6% = 80, 8%+ = 100
    yldScore = Math.round(Math.max(0, Math.min(100, (m.gross_yield - 0.5) / 8 * 100)));
  } else {
    // Use price proxy: under 500K = high yield potential
    const hp = m.median_house_price || m.median_unit_price;
    if (hp) {
      if (hp <= 500000) yldScore = 60;
      else if (hp <= 750000) yldScore = 50;
      else if (hp <= 1000000) yldScore = 40;
      else if (hp <= 1500000) yldScore = 30;
      else yldScore = 20;
    } else {
      yldScore = 40;
    }
  }

  if (m.vacancy_rate != null) {
    // 0% = 100, 5% = 0
    vacScore = Math.round(Math.max(0, Math.min(100, 100 - m.vacancy_rate * 20)));
  } else {
    // No vacancy data = moderate default
    vacScore = 50;
  }

  return { yldScore, vacScore };
}

// ── Types & thresholds ──
const OPP_TYPES = {
  school:       { label: 'School Zone Opportunity',  thresholds: { school: 65 } },
  growth:       { label: 'Growth Opportunity',       thresholds: { growth: 55 } },
  cashflow:     { label: 'Cashflow Opportunity',     thresholds: { yield: 60, vacancy: 55 } },
  infrastructure: { label: 'Infrastructure Opportunity', thresholds: { infra: 50 } },
  value:        { label: 'Value Opportunity',        thresholds: { undervaluation: 60 } },
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
    const s = scorePropertyV2(sale, m, strategy);
    s.address = sale.sale_address;
    s.suburb = sale.suburb;
    s.state = sale.state;
    s.propertyType = sale.property_type;
    s.bedrooms = sale.bedrooms;
    s.bathrooms = sale.bathrooms;
    s.carSpaces = sale.car_spaces;
    s.landSize = sale.land_size_sqm;
    s.salePrice = sale.sale_price;
    s.soldDate = sale.sale_date;
    return s;
  });

  const filtered = scored.filter(s => s.opportunityScore >= minScore);

  // Deduplicate: only highest-scoring property per suburb
  const seenSuburbs = new Set();
  const deduped = [];
  for (const s of filtered.sort((a, b) => b.opportunityScore - a.opportunityScore)) {
    if (!seenSuburbs.has(s.suburb)) {
      seenSuburbs.add(s.suburb);
      deduped.push(s);
    }
  }

  // If not enough after dedup, refill with best per suburb
  const top = deduped.length >= maxResults
    ? deduped.slice(0, maxResults)
    : filtered.slice(0, maxResults);

  const elapsed = Date.now() - t0;
  return {
    opportunities: top.map(o => enrichOutput(o)),
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

// ── Score a single property (optimised v2) ──
function scorePropertyV2(sale, metrics, strategy) {
  const w = getWeightsV2(strategy);

  // ── 1. Determine best available median ──
  const med = (sale.property_type === 'House' || sale.property_type === 'house')
    ? metrics.median_house_price
    : metrics.median_unit_price;

  // ── 2. Factor score functions ──
  const { score: uvScore, pct: uvPct, tier: uvTier } = calcUndervaluationV2(
    sale.sale_price, med, metrics.median_house_price, metrics.median_unit_price
  );
  const gtScore = calcGrowthScoreV2(metrics);
  const { yldScore, vacScore } = calcRentalScoresV2(metrics);
  const schScore = metrics.school_score != null
    ? Math.round(Math.max(0, Math.min(100, metrics.school_score)))
    : 40;

  // ── 3. Confidence from data completeness ──
  let n = 0;
  if (med != null) n++;
  if (metrics.growth_3y != null) n++;
  if (metrics.growth_1y != null) n++;
  if (metrics.school_score != null) n++;
  const conf = 50 + Math.min(50, n * 12.5); // 50..100 based on 1-4 data points

  // ── 4. Composite with per-factor floors ──
  const raw = { ...w };
  const numerator =
    uvScore * raw.undervaluation +
    gtScore * raw.growth +
    yldScore * raw.yield +
    vacScore * raw.vacancy +
    schScore * raw.school +
    conf * raw.confidence;

  const totalW = raw.undervaluation + raw.growth + raw.yield +
    raw.vacancy + raw.school + raw.confidence;
  let rawScore = numerator / totalW;

  // ── 5. Apply score floor tier ──
  // A suburb with NO median, NO growth, NO school just gets 15-20
  // With 1+ strong factor, boost floor to give a sensible score
  let floor = SCORE_FLOORS.minimal;
  if (uvTier >= 3 || gtScore >= 65 || schScore >= 70) floor = SCORE_FLOORS.developing;
  if (uvTier >= 4 || gtScore >= 75 || schScore >= 80) floor = SCORE_FLOORS.moderate;
  if (uvTier >= 5 || gtScore >= 85 || schScore >= 90) floor = SCORE_FLOORS.strong;

  // Blend: if raw is good raise it further; if raw is poor, push toward floor
  const oppScore = Math.round(Math.max(0, Math.min(100,
    rawScore >= floor ? rawScore : (rawScore + floor) / 2
  )));

  // ── 6. Classify ──
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

function calcUndervaluationV2(salePrice, medianPrice, medianHouse, medianUnit) {
  // Use suburb-level median (more stable than single sale comparison)
  // Even if this specific sale property has no median for its type,
  // fallback to house or unit median
  let m = medianPrice || medianHouse || medianUnit;
  if (!m || m <= 0 || !salePrice || salePrice <= 0) {
    return { score: 40, pct: 0, tier: 1 };
  }

  // Tier system based on median house price (lower = more room to grow)
  // Tier 5: median < 500K (90-100), Tier 4: 500-750K (70-89), Tier 3: 750K-1M (50-69)
  // Tier 2: 1M-1.5M (30-49), Tier 1: > 1.5M (10-29)
  let score, tier;
  const hm = medianHouse || m;
  if (hm <= 500000) { score = 90 + Math.round(Math.max(0, (500000 - hm) / 5000)); tier = 5; }
  else if (hm <= 750000) { score = 70 + Math.round((750000 - hm) / 10000); tier = 4; }
  else if (hm <= 1000000) { score = 50 + Math.round((1000000 - hm) / 20000); tier = 3; }
  else if (hm <= 1500000) { score = 30 + Math.round((1500000 - hm) / 25000); tier = 2; }
  else { score = 10 + Math.round(Math.max(0, (2000000 - hm) / 10000)); tier = 1; }

  const diff = medianPrice ? (medianPrice - salePrice) / medianPrice : 0;
  return {
    score: Math.max(1, Math.min(100, score)),
    pct: Math.round(diff * 100),
    tier,
  };
}

function calcGrowthScoreV2(m) {
  // Use suburb_metrics growth values — even when NULL, use sales volume proxy
  const g1 = m.growth_1y;
  const g3 = m.growth_3y;
  const g5 = m.growth_5y;

  if (g1 != null || g3 != null || g5 != null) {
    let score = 0;
    let count = 0;
    if (g3 != null) { score += g3 * 2 + 50; count++; }
    if (g1 != null) { score += g1 * 1.5 + 50; count++; }
    if (g5 != null) { score += g5 * 1.2 + 50; count++; }
    const avg = count > 0 ? Math.round(score / (count * 1.5)) : 50;
    return Math.max(0, Math.min(100, avg));
  }

  // No growth data: proxy from suburb median price
  // Lower-priced suburbs on growth fringes tend to have more growth potential
  // Higher-priced established suburbs are more stable
  // Fall back to: if we have median price, infer
  const hp = m.median_house_price || m.median_unit_price;
  if (hp) {
    if (hp <= 500000) return 50;   // growth corridor suburb
    if (hp <= 750000) return 45;   // mid-ring
    if (hp <= 1000000) return 40;  // established
    if (hp <= 1500000) return 35;  // premium
    return 30;                       // blue-chip
  }

  return 35; // pure unknown — conservative
}

function classifyOpportunityV2(score, uv, gt, yld, vac, sch, infra) {
  if (score < 30) return { label: OPP_TYPES.balanced.label, type: 'balanced' };

  // Continuous category scoring: always pick the highest-scoring category
  // but penalise categories where the raw data doesn't support it
  const catScores = [
    { t: 'school', s: Math.min(100, sch),
      adjust: sch >= 60 ? 0 : -15, },  // only valid if school data exists
    { t: 'growth', s: Math.min(100, gt),
      adjust: gt >= 55 ? 0 : -10, },
    { t: 'cashflow', s: Math.round(0.6 * yld + 0.4 * vac),  // weighted toward yield
      adjust: yld >= 55 ? 0 : -10, },
    { t: 'infrastructure', s: Math.min(100, infra || 0),
      adjust: 0 },
    { t: 'value', s: Math.min(100, uv),
      adjust: uv >= 60 ? 0 : -5 },
  ];

  // Sort by adjusted score descending
  catScores.sort((a, b) => (b.s + b.adjust) - (a.s + a.adjust));
  const best = catScores[0];

  // Best category must have at least 50 adjusted score, else balanced
  if (best.s + best.adjust < 50) return OPP_TYPES.balanced;
  return OPP_TYPES[best.t];
}

function badgesV2(ts, uvPct, schScore, gtScore, yldScore) {
  const b = [];
  if (uvPct >= 15) b.push({ label: 'Undervalued ' + uvPct + '%', type: 'value' });
  else if (uvPct >= 5) b.push({ label: uvPct + '% below median', type: 'value' });
  if (schScore >= 75) b.push({ label: 'Top School Zone', type: 'school' });
  else if (schScore >= 60) b.push({ label: 'Good School Zone', type: 'school' });
  if (gtScore >= 65) b.push({ label: 'Strong Growth', type: 'growth' });
  if (yldScore >= 65) b.push({ label: 'Good Yield', type: 'yield' });
  if (ts >= 85) b.push({ label: 'Top Pick', type: 'prime' });
  else if (ts >= 75) b.push({ label: 'Strong Opportunity', type: 'prime' });
  return b;
}

function keyDriversV2(uv, gt, yld, sch, vac) {
  const drivers = [];
  if (uv >= 65) drivers.push('Affordable entry price point below median');
  if (gt >= 60) drivers.push('Positive price growth momentum');
  if (yld >= 60) drivers.push('Attractive rental yield potential');
  if (sch >= 65) drivers.push('Well-regarded school zone');
  if (vac >= 60) drivers.push('Low vacancy — strong rental demand');
  if (drivers.length === 0) drivers.push('Market fundamentals in development');
  return drivers;
}

function riskFactorsV2(uvPct, growth3y, vacancyRate) {
  const risks = [];
  if (uvPct < -15) risks.push('Priced above suburb median — may limit short-term upside');
  if (growth3y != null && growth3y < -5) risks.push('3-year price decline in suburb');
  if (growth3y != null && growth3y < 0) risks.push('Moderate price softening over 3 years');
  if (vacancyRate != null && vacancyRate > 5) risks.push('Above-average vacancy rate');
  if (risks.length === 0) risks.push('No major red flags in current data');
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
