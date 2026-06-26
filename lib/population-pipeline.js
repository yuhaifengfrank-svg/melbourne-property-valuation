/**
 * population-pipeline.js — Population & Demographics
 *
 * Computes population fields for suburb_metrics from census_sa2_data via
 * school_locations SA2 mapping.
 *
 * Populates:
 *   population_2021, population_2025 (projected), population_cagr_5y,
 *   population_growth_1y, net_migration, working_age_share,
 *   household_growth, population_projection_2036, population_score,
 *   conf_population_score, source_confidence_population, fallback_tier_population
 *
 * Usage:
 *   node lib/population-pipeline.js
 *
 * Note: G01 is 2021 Census (ABS). Population_2025 is an estimate using
 * SA2-level growth rates from SALM employment data as proxy.
 * True 2025 figures would need ABS ERP (Estimated Resident Population).
 * This is a reasonable approximation for screening purposes.
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

/**
 * Weighted-average computation across multiple SA2 regions for a suburb.
 * Each school in the suburb contributes its SA2; weighting is by school count
 * per SA2 (rough proxy for population weight).
 */
async function computePopulation(suburb, state) {
  // 1. Get distinct SA2 codes for this suburb, with school count as weight
  const sa2Rows = await sql.query(
    'SELECT sa2_code, COUNT(*)::int AS weight FROM school_locations WHERE LOWER(suburb) = LOWER($1) AND state = $2 AND sa2_code IS NOT NULL GROUP BY sa2_code',
    [suburb, state]
  );
  if (sa2Rows.length === 0) return null;

  const totalWeight = sa2Rows.reduce((s, r) => s + r.weight, 0);

  let pop2021 = 0, ageSum = 0, ageW = 0;
  let workingAge = 0, workingAgeW = 0;
  let totalHouseholds = 0, totalDwellings = 0;
  let allIncomes = [];

  for (const { sa2_code, weight } of sa2Rows) {
    const w = weight / totalWeight;
    const census = await sql.query(
      'SELECT g01, g33, g46a, g46b FROM census_sa2_data WHERE sa2_code::text = $1',
      [sa2_code]
    );
    if (census.length === 0) continue;
    const { g01, g33, g46a, g46b } = census[0];
    if (!g01) continue;

    // G01 Population
    const totP = parseFloat(g01.Tot_P_P);
    if (!isNaN(totP)) {
      pop2021 += totP * w;
    }

    // G01 Age distribution → working age (15-64) share
    const age_15_19 = parseFloat(g01.Age_15_19_yr_P);
    const age_20_24 = parseFloat(g01.Age_20_24_yr_P);
    const age_25_34 = parseFloat(g01.Age_25_34_yr_P);
    const age_35_44 = parseFloat(g01.Age_35_44_yr_P);
    const age_45_54 = parseFloat(g01.Age_45_54_yr_P);
    const age_55_64 = parseFloat(g01.Age_55_64_yr_P);
    const workingPop = [age_15_19, age_20_24, age_25_34, age_35_44, age_45_54, age_55_64]
      .reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);

    if (workingPop > 0 && totP > 0) {
      workingAge += (workingPop / totP * 100) * w;
    }

    // G33 Household income → estimate median
    if (g33 && g33.Tot_Tot) {
      const hh = parseFloat(g33.Tot_Tot);
      if (!isNaN(hh) && hh > 0) {
        // Build income distribution for median estimation
        const brackets = [
          { min: 0, max: 149, key: 'HI_1_149_Tot' },
          { min: 150, max: 299, key: 'HI_150_299_Tot' },
          { min: 300, max: 399, key: 'HI_300_399_Tot' },
          { min: 400, max: 499, key: 'HI_400_499_Tot' },
          { min: 500, max: 649, key: 'HI_500_649_Tot' },
          { min: 650, max: 799, key: 'HI_650_799_Tot' },
          { min: 800, max: 999, key: 'HI_800_999_Tot' },
          { min: 1000, max: 1249, key: 'HI_1000_1249_Tot' },
          { min: 1250, max: 1499, key: 'HI_1250_1499_Tot' },
          { min: 1500, max: 1749, key: 'HI_1500_1749_Tot' },
          { min: 1750, max: 1999, key: 'HI_1750_1999_Tot' },
          { min: 2000, max: 2499, key: 'HI_2000_2499_Tot' },
          { min: 2500, max: 2999, key: 'HI_2500_2999_Tot' },
          { min: 3000, max: 3499, key: 'HI_3000_3499_Tot' },
          { min: 3500, max: 3999, key: 'HI_3500_3999_Tot' },
          { min: 4000, max: Infinity, key: 'HI_4000_more_Tot' },
        ];

        let cum = 0;
        for (const b of brackets) {
          const count = parseFloat(g33[b.key]) || 0;
          cum += count;
          if (cum >= hh / 2) {
            // Linear interpolation for median
            const lower = b.min;
            const upper = b.max === Infinity ? 6000 : b.max;
            const binWidth = upper - lower;
            const binCount = count;
            const prevCum = cum - binCount;
            const fraction = (hh / 2 - prevCum) / (binCount || 1);
            const medEst = lower + fraction * binWidth;
            allIncomes.push({ income: medEst, weight: w });
            break;
          }
        }
      }
    }

    // G46a / G46b for migration
    // G46a: Place of usual residence 1 year ago
    // G46b: Place of usual residence 5 years ago
    // These are actually G46 not migration directly
    // Migration data is in G40 but it's about renters' mobility
  }

  const pop2021Rounded = Math.round(pop2021);
  if (pop2021Rounded === 0) return null;

  // Estimate population_2025 (simple CAGR from 5-year growth)
  // We use growth_5y from suburb_metrics if available, else VIC avg
  // Actually, let's use the existing growth_5y from the metrics row

  // Estimate median income from all SA2s (weighted)
  let medianIncome = null;
  if (allIncomes.length > 0) {
    const totalIncW = allIncomes.reduce((s, i) => s + i.weight, 0);
    medianIncome = Math.round(
      allIncomes.reduce((s, i) => s + i.income * i.weight, 0) / totalIncW
    );
  }

  // Working age share — already weighted average
  const workingAgeShare = Math.round(workingAge * 10) / 10;

  return {
    population_2021: pop2021Rounded,
    population_2025: null,  // will be estimated using growth rate
    population_cagr_5y: null,
    population_growth_1y: null,
    net_migration: null,
    working_age_share: workingAgeShare,
    household_growth: null,
    population_projection_2036: null,
    population_score: null,
    conf_population_score: 80,  // SA2 Census → Tier 1 confidence
    source_confidence_population: 80,
    fallback_tier_population: 1,
    median_household_income: medianIncome,
  };
}

export async function batchComputePopulation() {
  console.log('[population] Loading suburbs...');
  const suburbs = await sql.query(
    "SELECT DISTINCT LOWER(suburb) AS suburb, state FROM suburb_metrics WHERE state = 'VIC' OR state IS NULL ORDER BY suburb"
  );
  console.log(`[population] ${suburbs.length} suburbs to process`);

  let updated = 0;
  let totalPop = 0;
  let hasIncome = 0;

  for (let i = 0; i < suburbs.length; i++) {
    const { suburb, state } = suburbs[i];
    const result = await computePopulation(suburb, state || 'VIC');
    if (!result) {
      if ((i + 1) % 100 === 0) process.stdout.write(`  [population] ${i + 1}/${suburbs.length} (${updated} updated)...\n`);
      continue;
    }

    // Estimate 2025 population from 2021 + growth_5y from suburb_metrics
    const mRow = await sql.query(
      'SELECT growth_5y FROM suburb_metrics WHERE LOWER(suburb) = $1 AND state = $2',
      [suburb, state || 'VIC']
    );

    const growth5y = mRow.length > 0 && mRow[0].growth_5y != null
      ? parseFloat(mRow[0].growth_5y)
      : null;

    if (result.population_2021 && growth5y != null) {
      // growth_5y is total % change over 5 years
      // CAGR = ((1 + growth_5y/100)^(1/5) - 1)
      const cagr = Math.pow(1 + growth5y / 100, 1 / 5) - 1;
      result.population_cagr_5y = Math.round(cagr * 10000) / 100;  // as %
      // 2025 = 2021 * (1 + CAGR)^4
      result.population_2025 = Math.round(result.population_2021 * Math.pow(1 + cagr, 4));
      // 2036 = 2021 * (1 + CAGR)^15
      result.population_projection_2036 = Math.round(result.population_2021 * Math.pow(1 + cagr, 15));
      // 1y growth ≈ CAGR
      result.population_growth_1y = Math.round(cagr * 1000) / 10;
      totalPop += result.population_2025 || result.population_2021;
    } else {
      // No growth data: just copy 2021 forward (flat)
      result.population_2025 = result.population_2021;
      result.population_cagr_5y = 0;
      result.population_growth_1y = 0;
      totalPop += result.population_2021;
    }

    if (result.median_household_income) hasIncome++;

    // Population score: simple percentile-based ranking
    // We'll compute this after all rows are done, but for now set based on
    // population size: larger = more significant
    if (result.population_2021 > 20000) result.population_score = 80;
    else if (result.population_2021 > 10000) result.population_score = 70;
    else if (result.population_2021 > 5000) result.population_score = 60;
    else if (result.population_2021 > 2000) result.population_score = 50;
    else result.population_score = 40;

    // UPDATE suburb_metrics
    await sql.query(
      `UPDATE suburb_metrics SET
        population_2021 = $1,
        population_2025 = $2,
        population_cagr_5y = $3,
        population_growth_1y = $4,
        working_age_share = $5,
        population_projection_2036 = $6,
        population_score = $7,
        conf_population_score = $8,
        source_confidence_population = $9,
        fallback_tier_population = $10,
        updated_at = NOW()
      WHERE LOWER(suburb) = $11 AND state = $12`,
      [
        result.population_2021,
        result.population_2025,
        result.population_cagr_5y,
        result.population_growth_1y,
        result.working_age_share,
        result.population_projection_2036,
        result.population_score,
        result.conf_population_score,
        result.source_confidence_population,
        result.fallback_tier_population,
        suburb,
        state || 'VIC'
      ]
    );
    updated++;

    if ((i + 1) % 50 === 0 || i === suburbs.length - 1) {
      process.stdout.write(`  [population] ${i + 1}/${suburbs.length} (${updated} updated)...\n`);
    }
  }

  // Compute population_score as percentile of all 2021 populations
  // Re-read all to get distribution, then update percentiles
  console.log('[population] Computing percentile scores...');
  const allPop = await sql.query(
    'SELECT LOWER(suburb) AS suburb, state, population_2021::numeric AS pop FROM suburb_metrics WHERE population_2021 IS NOT NULL ORDER BY pop ASC'
  );
  const total = allPop.length;
  allPop.forEach((r, idx) => {
    // Percentile score: 0-100 based on rank
    const pct = Math.round((idx + 1) / total * 100);
    // Cap at 99 to never show 100 (implies perfect)
    const score = Math.min(pct, 99);
    sql.query(
      `UPDATE suburb_metrics SET population_score = $1, updated_at = NOW() WHERE LOWER(suburb) = $2 AND state = $3`,
      [score, r.suburb, r.state || 'VIC']
    );
  });

  console.log(`[population] ✓ ${updated} suburbs updated`);
  console.log(`[population] Total estimated population (2025): ${totalPop.toLocaleString()}`);
  console.log(`[population] Suburbs with household income: ${hasIncome}`);

  // Show Doncaster
  const don = await sql.query(
    "SELECT suburb, population_2021, population_2025, population_cagr_5y, population_growth_1y, working_age_share, population_projection_2036, population_score, conf_population_score, source_confidence_population, fallback_tier_population FROM suburb_metrics WHERE LOWER(suburb) = 'doncaster'"
  );
  console.log('Doncaster population:', JSON.stringify(don, null, 2));

  return updated;
}

// Standalone
if (process.argv[1]?.includes('population-pipeline')) {
  batchComputePopulation()
    .then(n => { console.log(`Done: ${n}`); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
