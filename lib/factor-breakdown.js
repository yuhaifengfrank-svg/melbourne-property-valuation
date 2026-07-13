/**
 * factor-breakdown.js — Phase 2: Opportunity Score Breakdown Layer
 *
 * Computes per-suburb factor scores, explanations, and drives the
 * /api/suburb-intelligence/* and /api/top-* endpoints.
 *
 * Does NOT add new datasets, crawlers, or UI.
 * Pure transformation of existing suburb_metrics data into explainable intelligence.
 */

import { neon } from '@neondatabase/serverless';

import { assertDatabaseEnvironment } from '../api/_db.js';

let _sql = null;
function getSql() {
  const connectionString = assertDatabaseEnvironment();
  if (!_sql) {
    _sql = neon(connectionString, { fetchOptions: { cache: 'no-store' } });
  }
  if (!_sql) throw new Error('DATABASE_URL not set');
  return _sql;
}

function q(text, params) {
  const s = getSql();
  if (params && params.length > 0) return s.query(text, params);
  return s.query(text, []);
}

// ── Factor Normalization ──
// Each raw value maps to 0-100, where higher = better for investors.

function scoreValue(suburb) {
  // Undervaluation: lower median = more value opportunity
  // < $500K = strong, > $1.5M = weak
  const p = Number(suburb.median_house_price) || Number(suburb.median_unit_price) || null;
  if (!p) return { score: 40, tier: 'C' };
  if (p <= 400000) return { score: 95, tier: 'A+' };
  if (p <= 500000) return { score: 90, tier: 'A' };
  if (p <= 600000) return { score: 80, tier: 'A-' };
  if (p <= 750000) return { score: 70, tier: 'B+' };
  if (p <= 1000000) return { score: 55, tier: 'B' };
  if (p <= 1250000) return { score: 40, tier: 'C+' };
  if (p <= 1500000) return { score: 30, tier: 'C' };
  return { score: 20, tier: 'D' };
}

function scoreGrowth(suburb) {
  // Weighted avg of 1y, 3y, 5y growth
  const g1 = Number(suburb.growth_1y) || null;
  const g3 = Number(suburb.growth_3y) || null;
  const g5 = Number(suburb.growth_5y) || null;

  if (g3 == null && g1 == null && g5 == null) return { score: 30, tier: 'D' };

  let weighted = 0;
  let totalW = 0;
  if (g1 != null) { weighted += g1 * 1.0; totalW += 1.0; }
  if (g3 != null) { weighted += g3 * 2.0; totalW += 2.0; }
  if (g5 != null) { weighted += g5 * 1.5; totalW += 1.5; }
  const avg = weighted / totalW;

  if (avg >= 30) return { score: 95, tier: 'A+', raw: avg };
  if (avg >= 20) return { score: 85, tier: 'A', raw: avg };
  if (avg >= 15) return { score: 75, tier: 'A-', raw: avg };
  if (avg >= 10) return { score: 65, tier: 'B+', raw: avg };
  if (avg >= 5) return { score: 55, tier: 'B', raw: avg };
  if (avg >= 0) return { score: 40, tier: 'C+', raw: avg };
  if (avg >= -5) return { score: 25, tier: 'C', raw: avg };
  return { score: 15, tier: 'D', raw: avg };
}

function scoreYield(suburb) {
  const y = Number(suburb.gross_yield) || null;
  if (y == null) {
    // Proxy from price
    const p = Number(suburb.median_house_price) || Number(suburb.median_unit_price) || null;
    if (!p) return { score: 35, tier: 'D' };
    if (p <= 500000) return { score: 60, tier: 'B', note: 'Estimated from price' };
    if (p <= 750000) return { score: 50, tier: 'C+', note: 'Estimated from price' };
    if (p <= 1000000) return { score: 40, tier: 'C', note: 'Estimated from price' };
    return { score: 30, tier: 'D', note: 'Estimated from price' };
  }
  // 2% = 20, 4% = 55, 6% = 80, 8%+ = 100
  const s = Math.round(Math.max(0, Math.min(100, (y - 0.5) / 8 * 100)));
  if (s >= 80) return { score: s, tier: 'A', raw: y };
  if (s >= 60) return { score: s, tier: 'B+', raw: y };
  if (s >= 40) return { score: s, tier: 'B', raw: y };
  if (s >= 20) return { score: s, tier: 'C', raw: y };
  return { score: s, tier: 'D', raw: y };
}

function scoreVacancy(suburb) {
  const v = Number(suburb.vacancy_rate) || null;
  if (v == null) return { score: 45, tier: 'C' };
  // Lower vacancy = stronger rental demand
  if (v <= 1.5) return { score: 90, tier: 'A+' };
  if (v <= 3) return { score: 80, tier: 'A' };
  if (v <= 5) return { score: 65, tier: 'B+' };
  if (v <= 8) return { score: 50, tier: 'B' };
  if (v <= 12) return { score: 35, tier: 'C' };
  return { score: 15, tier: 'D' };
}

function scoreSchool(suburb) {
  const s = Number(suburb.school_score);
  // If missing OR exactly zero (no data), treat as unavailable
  if (s == null || s === 0 || isNaN(s)) return { score: null, tier: 'N/A', unavailable: true };
  if (s >= 90) return { score: 95, tier: 'A+' };
  if (s >= 80) return { score: 85, tier: 'A' };
  if (s >= 70) return { score: 75, tier: 'B+' };
  if (s >= 60) return { score: 65, tier: 'B' };
  if (s >= 50) return { score: 55, tier: 'C+' };
  if (s >= 40) return { score: 45, tier: 'C' };
  return { score: 30, tier: 'D' };
}

function scoreIncome(suburb) {
  // Proxy from median_house_price (higher price areas = higher income)
  const p = Number(suburb.median_house_price) || Number(suburb.median_unit_price) || null;
  if (!p) return { score: 40, tier: 'C' };
  if (p >= 1500000) return { score: 90, tier: 'A' };
  if (p >= 1200000) return { score: 80, tier: 'A-' };
  if (p >= 1000000) return { score: 70, tier: 'B+' };
  if (p >= 750000) return { score: 60, tier: 'B' };
  if (p >= 500000) return { score: 50, tier: 'C+' };
  return { score: 40, tier: 'C' };
}

function scorePopulation(suburb) {
  const p = Number(suburb.population_growth) || Number(suburb.conf_population) || null;
  if (p == null) return { score: 35, tier: 'D' };
  if (p >= 80) return { score: 90, tier: 'A+' };
  if (p >= 70) return { score: 80, tier: 'A' };
  if (p >= 60) return { score: 70, tier: 'B+' };
  if (p >= 50) return { score: 60, tier: 'B' };
  return { score: 45, tier: 'C' };
}

function scoreSupply(suburb) {
  // Supply constraint: higher = better for investors (supply-limited = price support)
  const sc = Number(suburb.conf_supply_constraint) || null;
  const lr = Number(suburb.supply_land_release_indicator) || 30;
  const pp = Number(suburb.supply_precinct_proximity) || 30;

  if (sc == null) return { score: 35, tier: 'D' };
  // Supply constraint shows tightness; invert land release (higher release = less constraint)
  const effective = Math.round(sc * 0.7 + (100 - lr) * 0.15 + pp * 0.15);
  const capped = Math.min(100, effective);
  if (capped >= 80) return { score: capped, tier: 'A' };
  if (capped >= 65) return { score: capped, tier: 'B+' };
  if (capped >= 50) return { score: capped, tier: 'B' };
  return { score: capped, tier: 'C' };
}

function scoreInfrastructure(suburb) {
  const i = Number(suburb.infrastructure_score) || Number(suburb.conf_infrastructure) || null;
  if (i == null) return { score: 35, tier: 'D' };
  if (i >= 60) return { score: 85, tier: 'A' };
  if (i >= 50) return { score: 70, tier: 'B+' };
  if (i >= 40) return { score: 55, tier: 'B' };
  if (i >= 30) return { score: 40, tier: 'C' };
  return { score: 30, tier: 'D' };
}

// ── Explanation Engine ──

function explainValue(s, suburb) {
  const p = Number(suburb.median_house_price) || Number(suburb.median_unit_price);
  const u = Number(suburb.median_unit_price);
  const lines = [];
  if (p <= 500000) {
    lines.push(`Median house price of $${p.toLocaleString()} is well below Melbourne median — strong value entry point`);
    if (s.tier === 'A+' && p <= 400000) lines.push('Sub-$400K pricing makes this one of the most affordable options in the market');
  } else if (p <= 750000) {
    lines.push(`Median house price of $${p.toLocaleString()} is moderately affordable with room for capital appreciation`);
  } else if (p <= 1000000) {
    lines.push(`Median house price of $${p.toLocaleString()} sits in the mid-market range`);
    lines.push('Growth potential exists but entry point requires higher capital');
  } else if (p <= 1500000) {
    lines.push(`Premium pricing at $${p.toLocaleString()} — value lies in established location quality, not entry price`);
  } else {
    lines.push(`Blue-chip pricing above $${(p / 1000000).toFixed(1)}M — value is in location scarcity and wealth preservation`);
  }
  if (u && u < p * 0.7) lines.push(`Units at $${u.toLocaleString()} offer a more accessible entry point to this suburb`);
  return lines;
}

function explainGrowth(s, suburb) {
  const g1 = Number(suburb.growth_1y);
  const g3 = Number(suburb.growth_3y);
  const g5 = Number(suburb.growth_5y);
  const lines = [];
  if (g3 != null) lines.push(g3 >= 10
    ? `Strong 3-year growth of ${g3.toFixed(1)}% outpaces Melbourne market average`
    : `3-year growth of ${g3.toFixed(1)}% is ${g3 >= 0 ? 'modest but positive' : 'negative — requires patience'}`);
  if (g1 != null) lines.push(g1 >= 10
    ? `Recent 1-year momentum of ${g1.toFixed(1)}% signals accelerating demand`
    : g1 >= 0
      ? `1-year growth of ${g1.toFixed(1)}% shows ${g1 > 3 ? 'steady' : 'flat'} market conditions`
      : `1-year decline of ${g1.toFixed(1)}% — watch for market cycle bottom`);
  if (g5 != null) lines.push(g5 >= 15
    ? `5-year CAGR of ${g5.toFixed(1)}% confirms sustained long-term appreciation`
    : `5-year CAGR of ${g5.toFixed(1)}% indicates moderate long-term price growth`);
  if (lines.length === 0) lines.push('Insufficient growth data — recommend cross-referencing with suburb sales history');
  return lines;
}

function explainYield(s, suburb) {
  const y = Number(suburb.gross_yield);
  const p = Number(suburb.median_house_price);
  const lines = [];
  if (y != null) {
    lines.push(y >= 4
      ? `Gross rental yield of ${y.toFixed(2)}% is attractive — strong cash flow potential`
      : `Gross yield of ${y.toFixed(2)}% is ${y >= 3 ? 'adequate' : 'below 3% — yield-focused investors may look elsewhere'}`);
    if (y >= 5) lines.push('Yield above 5% is rare in the current market — strong rental demand signal');
    if (y < 3 && p && p > 1000000) lines.push('Low yield is typical for premium suburbs — capital growth is the primary return driver here');
  } else {
    lines.push('Rental yield data not directly available');
    if (p) {
      if (p <= 500000) lines.push('Pricing suggests reasonable yield potential — typical for affordable suburbs');
      else if (p <= 750000) lines.push('Mid-range pricing supports moderate yield expectations');
      else lines.push('Higher median price suggests yield may be lower — typical for established suburbs');
    }
  }
  if (suburb.median_unit_rent && suburb.median_house_rent) {
    const unitRent = Number(suburb.median_unit_rent);
    const houseRent = Number(suburb.median_house_rent);
    if (unitRent / houseRent > 0.8) lines.push('Unit rental demand is strong relative to houses — good for investor diversification');
  }
  return lines;
}

function explainVacancy(s, suburb) {
  const v = Number(suburb.vacancy_rate);
  const lines = [];
  if (v != null) {
    if (v <= 3) lines.push(`Low vacancy rate of ${v.toFixed(1)}% indicates strong rental demand and minimal vacancy risk`);
    if (v <= 1.5) lines.push('Sub-1.5% vacancy is exceptionally tight — tenants competing for limited stock');
    if (v > 3 && v <= 5) lines.push(`Moderate vacancy of ${v.toFixed(1)}% — rental demand is healthy but not tight`);
    if (v > 5 && v <= 8) lines.push(`Vacancy of ${v.toFixed(1)}% is elevated — factor in longer lease-up periods`);
    if (v > 8) lines.push(`High vacancy of ${v.toFixed(1)}% signals rental oversupply — proceed with caution`);
  } else {
    lines.push('Vacancy data not available — vacancy risk is unknown');
  }
  // Resort area overlay
  if (v != null && v <= 1.5 && suburb.vacancy_rate_overlay) {
    lines.push('Note: This suburb is a coastal/resort area — low vacancy may reflect holiday home use rather than permanent rental demand');
  }
  return lines;
}

function explainSchool(s, suburb) {
  const ss = Number(suburb.school_score);
  const lines = [];
  // Data unavailable = scoreSchool returned null/unavailable
  if (ss == null || ss === 0 || isNaN(ss) || s.unavailable) {
    lines.push('School quality data not available for this suburb');
    return lines;
  }
  if (ss >= 80) lines.push(`School score of ${ss} is top-tier — attracts families willing to pay a premium`);
  else if (ss >= 60) lines.push(`School score of ${ss} is above average — adds moderate family-demand premium`);
  else if (ss >= 40) lines.push(`School score of ${ss} is average — adequate schooling available`);
  else lines.push(`School score of ${ss} is below average — family buyers may be less attracted to this area`);
  if (ss >= 70) lines.push('Strong school zones provide price insulation during market downturns');
  return lines;
}

function explainIncome(s, suburb) {
  const p = Number(suburb.median_house_price);
  const lines = [];
  if (p >= 1000000) lines.push(`High median price of $${(p / 1000000).toFixed(1)}M suggests affluent demographic — supports price stability`);
  else if (p >= 750000) lines.push(`Median price of $${p.toLocaleString()} indicates upper-middle income demographic`);
  else if (p >= 500000) lines.push(`Mid-range pricing reflects middle-income demographic — broad buyer demand pool`);
  else lines.push(`Affordable pricing reflects lower-income demographic — growth potential exists as area matures`);

  // Employment data
  const unemp = Number(suburb.supply_unemployment_rate);
  if (unemp != null) {
    if (unemp > 10) lines.push(`Unemployment rate of ${unemp.toFixed(1)}% is elevated — may limit local housing demand growth`);
    else if (unemp > 7) lines.push(`Unemployment rate of ${unemp.toFixed(1)}% is above state average — monitor employment trends`);
    else lines.push(`Unemployment rate of ${unemp.toFixed(1)}% is healthy — supports sustainable housing demand`);
  }

  return lines;
}

function explainPopulation(s, suburb) {
  const p = Number(suburb.population_growth);
  const lines = [];
  if (p != null) {
    if (p >= 70) lines.push(`Strong population growth driven by young families — sustained housing demand expected`);
    if (p >= 50 && p < 70) lines.push('Moderate population growth — steady demographic renewal');
    if (p < 50) lines.push('Lower population growth suggests a mature or aging demographic profile');
  } else {
    lines.push('Population growth data not available for this suburb');
  }
  return lines;
}

function explainSupply(s, suburb) {
  const sc = Number(suburb.conf_supply_constraint);
  const gc = Number(suburb.supply_growth_corridor_score);
  const lr = Number(suburb.supply_land_release_indicator);
  const isGC = suburb.supply_is_growth_corridor;
  const emp = Number(suburb.supply_employment_growth);
  const unemp = Number(suburb.supply_unemployment_rate);

  const lines = [];
  if (sc != null) {
    if (sc >= 65) lines.push('Housing supply is constrained — limited new development supports price growth');
    else if (sc >= 50) lines.push('Moderate supply constraint — development is occurring but not oversupplying');
    else lines.push('Lower supply constraint indicates land availability — price growth may be capped by new supply');
  }

  if (isGC) lines.push('Identified as a growth corridor — significant new housing and infrastructure investment underway');
  if (gc && gc >= 50) lines.push(`Growth corridor score of ${gc}/100 confirms active development zone`);

  // Employment context
  if (emp != null) lines.push(`Employment base of ${Number(emp).toLocaleString()} workers provides local economic activity`);
  if (unemp != null && unemp < 5) lines.push(`Low unemployment (${unemp.toFixed(1)}%) suggests strong local labour market`);
  if (lr >= 70) lines.push('Active land release area — new housing supply may moderate price growth');

  return lines;
}

function explainInfrastructure(s, suburb) {
  const i = Number(suburb.infrastructure_score) || Number(suburb.conf_infrastructure);
  const lines = [];
  if (i != null) {
    if (i >= 60) lines.push('Major infrastructure investment in vicinity — significant value uplift potential');
    else if (i >= 50) lines.push('Infrastructure projects nearby — moderate value uplift expected');
    else if (i >= 40) lines.push('Some infrastructure activity — limited direct impact on property values');
    else lines.push('No major infrastructure projects identified in this area');
  }
  return lines;
}

// ── Composite: Build full factor breakdown for one suburb ──

export function buildFactorBreakdown(suburb) {
  const value = scoreValue(suburb);
  const growth = scoreGrowth(suburb);
  const yield_ = scoreYield(suburb);
  const vacancy = scoreVacancy(suburb);
  const school = scoreSchool(suburb);
  const income = scoreIncome(suburb);
  const population = scorePopulation(suburb);
  const supply = scoreSupply(suburb);
  const infrastructure = scoreInfrastructure(suburb);

  return {
    suburb: suburb.suburb,
    state: suburb.state || 'VIC',

    // Factor scores
    value: {
      score: value.score,
      tier: value.tier,
      raw: value.raw ?? null,
      currentPrice: Number(suburb.median_house_price) || Number(suburb.median_unit_price) || null,
      medianHousePrice: Number(suburb.median_house_price) || null,
      medianUnitPrice: Number(suburb.median_unit_price) || null,
    },
    growth: { score: growth.score, tier: growth.tier, raw: growth.raw ?? null },
    yield: { score: yield_.score, tier: yield_.tier, raw: yield_.raw ?? null },
    vacancy: { score: vacancy.score, tier: vacancy.tier, raw: Number(suburb.vacancy_rate) ?? null },
    school: {
      score: school.score,
      tier: school.tier,
      raw: school.unavailable ? null : (Number(suburb.school_score) ?? null),
      unavailable: school.unavailable || false,
    },
    income: { score: income.score, tier: income.tier, raw: Number(suburb.median_house_price) ?? null },
    population: { score: population.score, tier: population.tier, raw: Number(suburb.population_growth) ?? null },
    supply: { score: supply.score, tier: supply.tier, raw: Number(suburb.conf_supply_constraint) ?? null },
    infrastructure: { score: infrastructure.score, tier: infrastructure.tier, raw: Number(suburb.conf_infrastructure) ?? null },

    // Overall confidence
    overallConfidence: Number(suburb.overall_confidence) ?? null,

    // Explanations
    explanations: {
      value: explainValue(value, suburb),
      growth: explainGrowth(growth, suburb),
      yield: explainYield(yield_, suburb),
      vacancy: explainVacancy(vacancy, suburb),
      school: explainSchool(school, suburb),
      income: explainIncome(income, suburb),
      population: explainPopulation(population, suburb),
      supply: explainSupply(supply, suburb),
      infrastructure: explainInfrastructure(infrastructure, suburb),
    },
  };
}

// ── Top-N layer ──

export async function fetchSuburbIntelligence(suburbName) {
  const rows = await q(
    `SELECT * FROM suburb_metrics WHERE LOWER(suburb) = LOWER($1)`,
    [suburbName]
  );
  if (!rows || rows.length === 0) {
    // Fuzzy match
    const fuzzy = await q(
      `SELECT * FROM suburb_metrics WHERE LOWER(suburb) LIKE LOWER($1) LIMIT 1`,
      [`%${suburbName}%`]
    );
    if (!fuzzy || fuzzy.length === 0) return null;
    return buildFactorBreakdown(fuzzy[0]);
  }
  return buildFactorBreakdown(rows[0]);
}

export async function fetchTopByFactor(factor, limit = 20) {
  const cap = Math.min(limit, 200);

  // Fetch all ranked suburbs (we need full population for correct secondary sort)
  const rows = await q(
    `SELECT * FROM suburb_metrics WHERE opportunity_score IS NOT NULL`
  );

  // Score every suburb in-memory so we have proper factorScores
  const scored = rows.map(r => {
    const fb = buildFactorBreakdown(r);
    const fs = fb[factor];
    return {
      suburb: fb.suburb,
      state: fb.state,
      factorScore: fs?.score ?? null,
      factorTier: fs?.tier ?? null,
      opportunityScore: Number(r.opportunity_score) ?? null,
      opportunityType: r.opportunity_type ?? 'Balanced',
      overallConfidence: fb.overallConfidence,
      supplyScore: fb.supply?.score ?? null,
      medianPrice: Number(r.median_house_price) ?? 0,
      explanations: fb.explanations[factor]?.slice(0, 3) ?? [],
    };
  });

  // Multi-pass stable sort: primary = factorScore DESC
  //   tiebreaker 1: overall_confidence DESC
  //   tiebreaker 2: supply_score DESC
  //   tiebreaker 3: median_price DESC
  scored.sort((a, b) => {
    const fA = a.factorScore ?? -1;
    const fB = b.factorScore ?? -1;
    if (fA !== fB) return fB - fA;

    const ocA = a.overallConfidence ?? 0;
    const ocB = b.overallConfidence ?? 0;
    if (ocA !== ocB) return ocB - ocA;

    const sA = a.supplyScore ?? 0;
    const sB = b.supplyScore ?? 0;
    if (sA !== sB) return sB - sA;

    return (b.medianPrice ?? 0) - (a.medianPrice ?? 0);
  });

  return scored.slice(0, cap);
}
