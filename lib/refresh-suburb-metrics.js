/**
 * refresh-suburb-metrics.js — Derived-metrics batch job
 *
 * UPSERT mode: preserves manually seeded data (VGV resorts, corrected vacancy).
 * Only overwrites fields that have fresh data; leaves others intact.
 *
 * Data flow:
 *   1. comparable_sales   → median_house_price, median_unit_price, growth (via growth-projector)
 *   2. school_locations + school_profiles → school_score
 *   3. census_sa2_data (G02) → median_house_rent → gross_yield
 *   4. census_sa2_data (G36) → vacancy_rate
 *   5. growth-projector   → growth_1y, growth_3y, growth_5y
 *   6. salm_sa2_data (SALM) → supply_unemployment_rate, supply_employment_growth, conf_income
 *   7. opportunity-scoring-v2 → opportunity_score, opportunity_type
 *
 * Safety:
 *   - Does NOT TRUNCATE. Uses INSERT ON CONFLICT (suburb, state) DO UPDATE.
 *   - Existing vacancy/cagr/growth not overwritten with NULLs.
 *   - VGV-seeded suburbs preserved even when absent from comparable_sales.
 *   - 12 unmapped suburbs keep global avg vacancy if still unmapped.
 *
 * Run: node lib/refresh-suburb-metrics.js
 * Schedule: weekly after source ingestion, plus manual runs after data imports.
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

async function q(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

async function refreshSuburbMetrics() {
  console.log('[refresh] Starting suburb_metrics upsert refresh...');
  const t0 = Date.now();

  // Step 1: Upsert base metrics from comparable_sales, schools, census
  //   Only inserts new rows when not present — existing rows (VGV resorts) get
  //   partial updates where fresh data exists.
  const upsertSql = `
    INSERT INTO suburb_metrics (suburb, state,
      median_house_price, median_unit_price,
      median_house_rent, median_unit_rent,
      school_score, gross_yield, vacancy_rate,
      updated_at)
    WITH
      all_subs AS (
        SELECT DISTINCT cs.suburb, COALESCE(cs.state, 'VIC') AS state
        FROM comparable_sales cs
        WHERE cs.suburb IS NOT NULL AND cs.sale_price > 50000
        UNION
        SELECT DISTINCT LOWER(sm.suburb) as suburb, sm.state
        FROM suburb_metrics sm
        WHERE sm.median_house_price IS NOT NULL
      ),
      hp AS (
        SELECT suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type IN ('House','house') AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY suburb
      ),
      up AS (
        SELECT suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type IN ('Unit','Apartment','Townhouse','unit','apartment','townhouse')
          AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY suburb
      ),
      sch AS (
        SELECT l.suburb, ROUND(CAST(AVG(p.icsea) AS numeric), 1) AS score
        FROM school_locations l
        JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
        WHERE p.icsea IS NOT NULL
        GROUP BY l.suburb
      ),
      rent AS (
        SELECT DISTINCT ON (sl.suburb) sl.suburb,
               (census.g02->>'Median_rent_weekly')::numeric AS median_rent_weekly
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g02->>'Median_rent_weekly' IS NOT NULL
          AND (census.g02->>'Median_rent_weekly')::text ~ '^[0-9]+$'
      ),
      vac AS (
        SELECT DISTINCT ON (sl.suburb) sl.suburb,
               ROUND(
                 ((census.g36->>'Unoccupied_PDs_Dwgs')::numeric 
                   / NULLIF((census.g36->>'Total_PDs_Dwellings')::numeric, 0)) * 100, 2
               ) AS vac_rate
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g36 IS NOT NULL
      )
    SELECT
      s.suburb, s.state,
      hp.med,
      up.med,
      rent.median_rent_weekly::numeric(10,0),
      NULL::numeric(10,0),
      CASE WHEN sch.score IS NOT NULL
        THEN GREATEST(0, LEAST(100, ROUND(CAST((sch.score - 800.0) / 450.0 * 100 AS numeric), 1)))
      END,
      CASE WHEN rent.median_rent_weekly IS NOT NULL AND hp.med IS NOT NULL AND hp.med > 0
        THEN ROUND(CAST(rent.median_rent_weekly * 52.0 / hp.med * 100 AS numeric), 2)
      END,
      vac.vac_rate,
      NOW()
    FROM all_subs s
    LEFT JOIN hp ON s.suburb = hp.suburb
    LEFT JOIN up ON s.suburb = up.suburb
    LEFT JOIN sch ON s.suburb = sch.suburb
    LEFT JOIN rent ON s.suburb = rent.suburb
    LEFT JOIN vac ON s.suburb = vac.suburb
    ON CONFLICT (suburb, state) DO UPDATE SET
      median_house_price = COALESCE(EXCLUDED.median_house_price, suburb_metrics.median_house_price),
      median_unit_price = COALESCE(EXCLUDED.median_unit_price, suburb_metrics.median_unit_price),
      median_house_rent = COALESCE(EXCLUDED.median_house_rent, suburb_metrics.median_house_rent),
      median_unit_rent = COALESCE(EXCLUDED.median_unit_rent, suburb_metrics.median_unit_rent),
      school_score = COALESCE(EXCLUDED.school_score, suburb_metrics.school_score),
      gross_yield = COALESCE(EXCLUDED.gross_yield, suburb_metrics.gross_yield),
      vacancy_rate = COALESCE(EXCLUDED.vacancy_rate, suburb_metrics.vacancy_rate),
      updated_at = NOW()
  `;

  const insResult = await q(upsertSql, []);
  console.log(`[refresh] Upserted ${insResult.rowCount || '?'} rows`);

  // Step 2: Fill vacancy for unmapped suburbs (no SA2 → no G36 → NULL)
  // These 12 suburbs don't have school_locations→sa2_code mapping
  await q(`
    UPDATE suburb_metrics SET
      vacancy_rate = COALESCE(vacancy_rate, (
        SELECT ROUND(AVG(vacancy_rate)::numeric, 2) FROM suburb_metrics WHERE vacancy_rate IS NOT NULL
      )),
      updated_at = NOW()
    WHERE vacancy_rate IS NULL
  `);
  console.log('[refresh] Filled unmapped suburb vacancies with global avg');

  // Step 3: Run growth projection for all suburbs with data
  //   This updates growth_1y/3y/5y using the growth-projector engine.
  //   Existing VGV CAGR is preserved for data-poor suburbs (fallback D).
  console.log('[refresh] Running growth projection...');
  const { batchProjectAll } = await import('./growth-projector.js');
  await batchProjectAll();

  // Step 4: Compute gross_yield for suburb_metrics rows that have rent but no yield yet
  await q(`
    UPDATE suburb_metrics SET
      gross_yield = CASE
        WHEN median_house_rent IS NOT NULL AND median_house_price IS NOT NULL AND median_house_price > 0
          THEN ROUND(CAST(median_house_rent * 52.0 / median_house_price * 100 AS numeric), 2)
        ELSE gross_yield
      END,
      updated_at = NOW()
    WHERE gross_yield IS NULL AND median_house_rent IS NOT NULL AND median_house_price IS NOT NULL
  `);

  // Step 5: Populate SALM employment/unemployment data from salm_sa2_data
  //   Replaces Census G46 2021 data with much fresher quarterly estimates.
  //   Updates: supply_unemployment_rate, supply_employment_growth, supply_unemployment_quarter, conf_income
  //   Uses LOWER() for case-insensitive suburb matching.
  console.log('[refresh] Updating SALM employment metrics...');
  await q(`
    UPDATE suburb_metrics sm
    SET
      supply_unemployment_rate = ROUND(COALESCE(salm.unemployment_rate, sm.supply_unemployment_rate)::numeric, 1),
      supply_employment_growth = COALESCE(salm.labour_force - salm.unemployed, sm.supply_employment_growth)::numeric,
      supply_unemployment_quarter = COALESCE(salm.latest_quarter, sm.supply_unemployment_quarter),
      conf_income = CASE
        -- If SALM has data: set confidence based on data completeness and value
        WHEN salm.has_unemployment_rate AND salm.unemployment_rate IS NOT NULL AND salm.labour_force IS NOT NULL THEN
          CASE
            -- Low unemployment = strong labour market → higher confidence
            WHEN salm.unemployment_rate < 4.0 THEN 85.0
            WHEN salm.unemployment_rate < 6.0 THEN 80.0
            WHEN salm.unemployment_rate < 8.0 THEN 75.0
            WHEN salm.unemployment_rate < 12.0 THEN 70.0
            ELSE 65.0
          END
        -- No SALM data: fall back to existing conf_income (from Census or manual)
        ELSE sm.conf_income
      END,
      updated_at = NOW()
    FROM (
      SELECT LOWER(sl.suburb) AS lsuburb, sl.sa2_code, s.*
      FROM school_locations sl
      JOIN salm_sa2_data s ON sl.sa2_code = s.sa2_code
    ) salm
    WHERE LOWER(sm.suburb) = salm.lsuburb
      AND sm.state = 'VIC'
  `);
  console.log('[refresh] SALM employment metrics updated');

  // Step 5.5: Populate G41 dwelling structure data from census_sa2_data
  //   Updates: dwelling_total, dwelling_separate_house, dwelling_flat,
  //   dwelling_semi_detached, dwelling_3br_plus, dwelling_1br_2br, dwelling_occupancy_rate
  console.log('[refresh] Updating G41 dwelling structure metrics...');
  await sql.query(`
    UPDATE suburb_metrics sm
    SET
      dwelling_total         = COALESCE((census.g41->>'total_dwellings')::numeric, sm.dwelling_total),
      dwelling_separate_house = COALESCE((census.g41->>'sep_house_pct')::numeric, sm.dwelling_separate_house),
      dwelling_flat           = COALESCE((census.g41->>'flat_pct')::numeric, sm.dwelling_flat),
      dwelling_semi_detached  = COALESCE((census.g41->>'semi_pct')::numeric, sm.dwelling_semi_detached),
      dwelling_3br_plus       = COALESCE((census.g41->>'pct_3br_plus')::numeric, sm.dwelling_3br_plus),
      dwelling_1br_2br        = COALESCE((census.g41->>'pct_1br_2br')::numeric, sm.dwelling_1br_2br),
      dwelling_occupancy_rate = CASE
        WHEN census.g41->>'total_dwellings' IS NOT NULL AND census.g01->>'Tot_P_P' IS NOT NULL
          AND (census.g41->>'total_dwellings')::numeric > 0
          AND (census.g01->>'Tot_P_P')::numeric > 0
        THEN ROUND(CAST((census.g01->>'Tot_P_P')::numeric / (census.g41->>'total_dwellings')::numeric AS numeric), 2)
        ELSE sm.dwelling_occupancy_rate
      END,
      updated_at = NOW()
    FROM school_locations sl
    JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
    WHERE LOWER(sm.suburb) = LOWER(sl.suburb)
      AND sm.state = 'VIC'
      AND census.g41 IS NOT NULL
      AND census.g01 IS NOT NULL
  `, []);
  console.log('[refresh] G41 dwelling metrics updated');

  // Step 5.6: Recalculate supply_housing_per_capita from actual dwelling data
  //   Replaces the old flat 0.4000 with real data where available
  console.log('[refresh] Updating housing per capita...');
  await sql.query(`
    UPDATE suburb_metrics sm
    SET
      supply_housing_per_capita = CASE
        WHEN sm.dwelling_total IS NOT NULL AND census.g01->>'Tot_P_P' IS NOT NULL
          AND (census.g01->>'Tot_P_P')::numeric > 0
        THEN ROUND(CAST(sm.dwelling_total / (census.g01->>'Tot_P_P')::numeric AS numeric), 4)
        ELSE sm.supply_housing_per_capita
      END,
      supply_housing_stock = CASE
        WHEN sm.dwelling_total IS NOT NULL
        THEN sm.dwelling_total
        ELSE sm.supply_housing_stock
      END,
      updated_at = NOW()
    FROM school_locations sl
    JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
    WHERE LOWER(sm.suburb) = LOWER(sl.suburb)
      AND sm.state = 'VIC'
      AND census.g41 IS NOT NULL
  `, []);
  console.log('[refresh] Housing per capita updated from G41');

  // Step 6: Run opportunity scoring v2 (reads suburb_metrics, writes scores)
  console.log('[refresh] Running opportunity scoring...');
  const { scoreAllSuburbs } = await import('./opportunity-scoring-v2.js');
  try { await scoreAllSuburbs(); } catch(e) { console.warn('[refresh] Scoring failed:', e.message); }

  // Data quality report
  const dq = await q(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE median_house_price IS NOT NULL)::int AS with_hp,
      COUNT(*) FILTER (WHERE median_unit_price IS NOT NULL)::int AS with_up,
      COUNT(*) FILTER (WHERE median_house_rent IS NOT NULL)::int AS with_rent,
      COUNT(*) FILTER (WHERE growth_1y IS NOT NULL)::int AS with_g1y,
      COUNT(*) FILTER (WHERE growth_3y IS NOT NULL)::int AS with_g3y,
      COUNT(*) FILTER (WHERE growth_5y IS NOT NULL)::int AS with_g5y,
      COUNT(*) FILTER (WHERE school_score IS NOT NULL)::int AS with_sch,
      COUNT(*) FILTER (WHERE gross_yield IS NOT NULL)::int AS with_yield,
      COUNT(*) FILTER (WHERE vacancy_rate IS NOT NULL)::int AS with_vac,
      COUNT(*) FILTER (WHERE opportunity_score IS NOT NULL)::int AS with_score,
      COUNT(*) FILTER (WHERE median_house_price IS NOT NULL AND govt_5yr_cagr IS NOT NULL)::int AS with_cagr
    FROM suburb_metrics
  `, []);
  console.log('[refresh] Data quality:', JSON.stringify(dq[0], null, 2));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[refresh] ✓ Complete in ${elapsed}s`);
}

if (process.argv[1] && (process.argv[1].includes('refresh-suburb-metrics') || process.argv[1].includes('/refresh-suburb-metrics'))) {
  refreshSuburbMetrics()
    .then(() => process.exit(0))
    .catch(e => { console.error('Refresh failed:', e); process.exit(1); });
}

export { refreshSuburbMetrics };
