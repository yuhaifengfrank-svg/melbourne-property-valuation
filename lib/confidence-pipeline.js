/**
 * confidence-pipeline.js — Data Quality & Confidence Scoring
 *
 * Computes per-metric fallback tiers, source confidence, and overall confidence
 * for every suburb_metrics row.
 *
 * Fallback Tier (0–4: DIRECT → SA2_PROXY → REGIONAL → STATE → GLOBAL, -1 = NO_DATA)
 * Source Confidence (0–100): Tier 0→95, 1→80, 2→65, 3→40, 4→20
 *
 * Usage:
 *   import { computeConfidence, batchComputeConfidence } from './confidence-pipeline.js'
 *   await batchComputeConfidence()
 *
 * Standalone:
 *   node lib/confidence-pipeline.js
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

const SCORE = { 0: 95, 1: 80, 2: 65, 3: 40, 4: 20 };

function inferTier(g, m) {
  switch (g) {
    case 'price':         return m.median_house_price != null ? 0 : -1;
    case 'rent':          return m.median_house_rent != null ? 1 : -1;     // SA2 proxy
    case 'growth':        return m.growth_1y != null ? 0 : (m.growth_5y ? 1 : -1);
    case 'yield':         return (m.gross_yield != null && m.median_house_rent != null && m.median_house_price != null) ? 0 : (m.median_house_price ? 2 : -1);
    case 'vacancy':       return m.vacancy_rate != null ? 1 : -1;
    case 'school':        return m.school_score != null ? 0 : -1;
    case 'infrastructure': return m.infrastructure_score != null ? 1 : -1;
    case 'dwelling':      return m.dwelling_total != null ? 1 : -1;
    case 'salm':          return m.supply_unemployment_rate != null ? 0 : -1;
    case 'income':        return m.conf_income != null ? 0 : -1;
    case 'population':    return m.population_2021 != null ? 1 : -1;
    default:              return -1;
  }
}

function score(t) { return t >= 0 ? (SCORE[t] ?? 0) : 0; }

/** Pure function: compute all confidence fields from metrics object */
export function computeConfidence(m) {
  const groups = ['price','rent','growth','yield','vacancy','school','infrastructure','dwelling','salm','income','population'];
  const t = Object.fromEntries(groups.map(g => [g, inferTier(g, m)]));
  const s = Object.fromEntries(groups.map(g => [g, score(t[g])]));

  // Weighted overall confidence
  const W = { price:1.5, rent:1, growth:1.5, yield:1, vacancy:1, school:1.5, infrastructure:0.5, dwelling:0.5, salm:0.5, income:0.5, population:0.5 };
  let sum = 0, wt = 0;
  for (const [g, w] of Object.entries(W)) { if (s[g] > 0) { sum += s[g] * w; wt += w; } }

  const census = Math.min(s.dwelling, s.income);
  const censusT = Math.min(t.dwelling, t.income);

  return {
    overall_confidence:       wt > 0 ? Math.round(sum / wt) : null,
    conf_value:               s.price,
    conf_growth:              s.growth,
    conf_yield:               s.yield,
    conf_vacancy:             s.vacancy,
    conf_school:              s.school,
    conf_population:          s.population,
    conf_infrastructure:      s.infrastructure,
    conf_supply_constraint:   s.salm,
    source_confidence_price:   s.price,
    source_confidence_rent:    s.rent,
    source_confidence_growth:  s.growth,
    source_confidence_vacancy: s.vacancy,
    source_confidence_school:  s.school,
    source_confidence_census:  census,
    source_confidence_infrastructure: s.infrastructure,
    source_confidence_supply:  s.salm,
    source_confidence_population: s.population,
    fallback_tier_price:       t.price,
    fallback_tier_growth:      t.growth,
    fallback_tier_yield:       t.yield,
    fallback_tier_vacancy:     t.vacancy,
    fallback_tier_school_zone: t.school,
    fallback_tier_infrastructure: t.infrastructure,
    fallback_tier_supply:      t.salm,
    fallback_tier_population:  t.population,
  };
}

export async function batchComputeConfidence() {
  config();
  const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

  console.log('[confidence] Loading metrics...');
  const rows = await sql.query(
    'SELECT suburb, state, median_house_price, median_house_rent, gross_yield, vacancy_rate, growth_1y, growth_5y, school_score, infrastructure_score, supply_unemployment_rate, conf_income, dwelling_total, population_2021 FROM suburb_metrics'
  );
  console.log(`[confidence] Loaded ${rows.length} suburbs`);

  const COLS = [
    'overall_confidence',
    'conf_value','conf_growth','conf_yield','conf_vacancy','conf_school',
    'conf_population','conf_infrastructure','conf_supply_constraint',
    'source_confidence_price','source_confidence_rent','source_confidence_growth',
    'source_confidence_vacancy','source_confidence_school',
    'source_confidence_census','source_confidence_infrastructure','source_confidence_supply',
    'source_confidence_population',
    'fallback_tier_price','fallback_tier_growth',
    'fallback_tier_yield','fallback_tier_vacancy','fallback_tier_school_zone',
    'fallback_tier_infrastructure','fallback_tier_supply',
    'fallback_tier_population',
  ];

  let updated = 0;
  for (const row of rows) {
    const c = computeConfidence(row);
    const sub = (row.suburb || '').toLowerCase();
    const st = (row.state || 'vic').toLowerCase();

    // Build a parameterised UPDATE. For integer values, force ::int to avoid
    // PG type confusion. For text, stringify with quotes.
    const parts = [];
    const vals = [sub, st];
    let idx = 3;

    for (const col of COLS) {
      const v = c[col];
      if (v === null || v === undefined) {
        parts.push(`${col} = NULL`);
      } else {
        parts.push(`${col} = \$${idx}`);
        vals.push(v);
        idx++;
      }
    }
    parts.push(`updated_at = NOW()`);

    const sqlStr = `UPDATE suburb_metrics SET ${parts.join(', ')} WHERE LOWER(suburb) = \$1 AND LOWER(state) = \$2`;
    await sql.query(sqlStr, vals);
    updated++;
  }

  // Verify
  const [vc] = await sql`SELECT COUNT(*)::int AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  console.log(`[confidence] ✓ ${updated} updated, ${vc.c} have overall_confidence`);

  // Show Doncaster
  const [don] = await sql`
    SELECT suburb, overall_confidence, conf_value, conf_growth, conf_yield, conf_vacancy, conf_school,
           conf_population, conf_infrastructure, conf_supply_constraint,
           source_confidence_price, source_confidence_growth, source_confidence_vacancy,
           source_confidence_school,
           fallback_tier_price, fallback_tier_growth, fallback_tier_vacancy,
           fallback_tier_school_zone
    FROM suburb_metrics WHERE LOWER(suburb) = 'doncaster'
  `;
  console.log('Doncaster confidence:', JSON.stringify(don, null, 2));

  return updated;
}

// Standalone runner
if (process.argv[1]?.includes('confidence-pipeline')) {
  batchComputeConfidence()
    .then(n => { console.log(`Done: ${n}`); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
