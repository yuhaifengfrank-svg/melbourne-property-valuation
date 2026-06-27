/**
 * refresh-suburb-metrics.js — Nightly batch job
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
 * Cron: 0 3 * * * (3am daily)
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
      median_house_price, median_unit_price, median_apartment_price, median_townhouse_price, median_combined_price,
      median_rent, median_unit_rent, median_rent_dffh, median_rent_source,
      school_score, gross_yield, vacancy_rate, vacancy_rate_adjusted,
      updated_at)
    WITH
      all_subs AS (
        SELECT DISTINCT LOWER(cs.suburb) as suburb, COALESCE(cs.state, 'VIC') AS state
        FROM comparable_sales cs
        WHERE cs.suburb IS NOT NULL AND cs.sale_price > 50000
        UNION
        SELECT DISTINCT LOWER(sm.suburb), sm.state
        FROM suburb_metrics sm
        WHERE sm.median_house_price IS NOT NULL
      ),
      hp AS (
        SELECT LOWER(suburb) AS suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type = 'House' AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY LOWER(suburb)
      ),
      up AS (
        SELECT LOWER(suburb) AS suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type = 'Unit'
          AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY LOWER(suburb)
      ),
      ap AS (
        SELECT LOWER(suburb) AS suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type = 'Apartment'
          AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY LOWER(suburb)
      ),
      th AS (
        SELECT LOWER(suburb) AS suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS med
        FROM comparable_sales
        WHERE property_type = 'Townhouse'
          AND sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '1095 days'
        GROUP BY LOWER(suburb)
      ),
      sch AS (
        SELECT suburb, ROUND(CAST(AVG(icsea) AS numeric), 1) AS score FROM (
          SELECT LOWER(l.suburb) AS suburb, p.icsea,
                 ROW_NUMBER() OVER (PARTITION BY LOWER(l.suburb) ORDER BY p.icsea DESC) AS rn
          FROM school_locations l
          JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
          WHERE p.icsea IS NOT NULL
        ) ranked
        WHERE rn <= 3
        GROUP BY suburb
      ),
      rent AS (
        SELECT LOWER(sl.suburb) AS suburb,
               ROUND(AVG((census.g02->>'Median_rent_weekly')::numeric)) AS median_rent_weekly
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g02->>'Median_rent_weekly' IS NOT NULL
          AND (census.g02->>'Median_rent_weekly')::text ~ '^[0-9]+$'
        GROUP BY LOWER(sl.suburb)
      ),
      vac AS (
        SELECT LOWER(sl.suburb) AS suburb,
               ROUND(
                 SUM((census.g36->>'Unoccupied_PDs_Dwgs')::numeric)
                   / NULLIF(SUM((census.g36->>'Total_PDs_Dwellings')::numeric), 0) * 100, 2
               ) AS vac_rate
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g36 IS NOT NULL
        GROUP BY LOWER(sl.suburb)
      ),
      dw AS (
        SELECT LOWER(sl.suburb) AS suburb,
               AVG((census.g41->>'sep_house_pct')::numeric) AS pct_house,
               AVG((census.g41->>'flat_pct')::numeric) AS pct_flat,
               AVG((census.g41->>'semi_pct')::numeric) AS pct_townhouse
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g41 IS NOT NULL
        GROUP BY LOWER(sl.suburb)
      )
    SELECT
      s.suburb, s.state,
      hp.med,
      up.med,
      ap.med,
      th.med,
      ROUND(
        COALESCE(dw.pct_house, 0) / GREATEST(dw.pct_house + dw.pct_flat + dw.pct_townhouse, 1) * COALESCE(hp.med, 0)
        + COALESCE(dw.pct_flat, 0) / GREATEST(dw.pct_house + dw.pct_flat + dw.pct_townhouse, 1) * COALESCE(ap.med, COALESCE(up.med, 0))
        + COALESCE(dw.pct_townhouse, 0) / GREATEST(dw.pct_house + dw.pct_flat + dw.pct_townhouse, 1) * COALESCE(th.med, COALESCE(up.med, 0))
      ) AS combined_price,
      rent.median_rent_weekly::numeric(10,0),
      NULL::numeric(10,0),
      NULL::numeric(10,0),
      NULL::varchar(20),
      CASE WHEN sch.score IS NOT NULL
        THEN GREATEST(0, LEAST(100, ROUND(CAST((sch.score - 800.0) / 450.0 * 100 AS numeric), 1)))
      END,
      CASE WHEN rent.median_rent_weekly IS NOT NULL AND hp.med IS NOT NULL AND hp.med > 0
        THEN ROUND(CAST(rent.median_rent_weekly * 52.0 / hp.med * 100 AS numeric), 2)
      END,
      vac.vac_rate,
      CASE
        WHEN vac.vac_rate IS NOT NULL
        THEN ROUND(
          CASE
            WHEN LOWER(s.suburb) IN ('lorne','aireys inlet','anglesea','barwon heads','point lonsdale','queenscliff','sorrento','portsea','blairgowrie','rye','rosebud','mccrae','dromana','safety beach','mount martha','mount eliza','tootgarook','bonbeach','edithvale','black rock','beaumaris','patterson lakes')
              THEN vac.vac_rate * 1.0
            WHEN COALESCE(dw.pct_flat, 0) >= 50
              THEN vac.vac_rate * 0.175
            WHEN COALESCE(dw.pct_house, 0) >= 85
              THEN vac.vac_rate * 0.30
            ELSE vac.vac_rate * 0.25
          END, 2
        )
      END,
      NOW()
    FROM all_subs s
    LEFT JOIN hp ON s.suburb = hp.suburb
    LEFT JOIN up ON s.suburb = up.suburb
    LEFT JOIN ap ON s.suburb = ap.suburb
    LEFT JOIN th ON s.suburb = th.suburb
    LEFT JOIN sch ON s.suburb = sch.suburb
    LEFT JOIN rent ON s.suburb = rent.suburb
    LEFT JOIN vac ON s.suburb = vac.suburb
    LEFT JOIN dw ON s.suburb = dw.suburb
    ON CONFLICT (suburb, state) DO UPDATE SET
      median_house_price = COALESCE(EXCLUDED.median_house_price, suburb_metrics.median_house_price),
      median_unit_price = COALESCE(EXCLUDED.median_unit_price, suburb_metrics.median_unit_price),
      median_apartment_price = COALESCE(EXCLUDED.median_apartment_price, suburb_metrics.median_apartment_price),
      median_townhouse_price = COALESCE(EXCLUDED.median_townhouse_price, suburb_metrics.median_townhouse_price),
      median_combined_price = COALESCE(EXCLUDED.median_combined_price, suburb_metrics.median_combined_price),
      median_rent = COALESCE(EXCLUDED.median_rent, suburb_metrics.median_rent),
      median_unit_rent = COALESCE(EXCLUDED.median_unit_rent, suburb_metrics.median_unit_rent),
      school_score = COALESCE(EXCLUDED.school_score, suburb_metrics.school_score),
      gross_yield = COALESCE(EXCLUDED.gross_yield, suburb_metrics.gross_yield),
      vacancy_rate = COALESCE(EXCLUDED.vacancy_rate, suburb_metrics.vacancy_rate),
      vacancy_rate_adjusted = COALESCE(EXCLUDED.vacancy_rate_adjusted, suburb_metrics.vacancy_rate_adjusted),
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

  // Step 3b: Compute growth_score from vgv_cagr_10y + growth_5y + vgv_combined_cagr
  //   Formula: 0.4 × scale(vgv_cagr_10y) + 0.3 × scale(growth_5y) + 0.3 × scale(vgv_combined_cagr)
  //   Scale: linear from observed min→max to 0→100
  //   Coverage: growth_5y 247/247 fills any gap when VGV data missing
  console.log('[refresh] Computing growth_score...');
  await updateGrowthScore();

  // Step 4: Compute gross_yield for suburb_metrics rows that have rent but no yield yet
  await q(`
    UPDATE suburb_metrics SET
      gross_yield = CASE
        WHEN median_rent IS NOT NULL AND median_house_price IS NOT NULL AND median_house_price > 0
          THEN ROUND(CAST(median_rent * 52.0 / median_house_price * 100 AS numeric), 2)
        ELSE gross_yield
      END,
      updated_at = NOW()
    WHERE gross_yield IS NULL AND median_rent IS NOT NULL AND median_house_price IS NOT NULL
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
        -- True occupancy rate from G37: (owned outright + owned with mortgage) / total
        WHEN census.g37->>'Total_Total' IS NOT NULL AND census.g37->>'O_OR_Total' IS NOT NULL AND census.g37->>'O_MTG_Total' IS NOT NULL
          AND (census.g37->>'Total_Total')::numeric > 0
        THEN ROUND(CAST(
          ((census.g37->>'O_OR_Total')::numeric + (census.g37->>'O_MTG_Total')::numeric)
          / (census.g37->>'Total_Total')::numeric * 100
        AS numeric), 1)
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

  // Step N: Compute growth_score from vgv_cagr_10y + growth_5y + vgv_combined_cagr
  //   Formula: 0.4 × scale(vgv_cagr_10y) + 0.3 × scale(growth_5y) + 0.3 × scale(vgv_combined_cagr)
  //   Scale: linear from observed min→max to 0→100
  //   Coverage: growth_5y 247/247 fills any gap when VGV data missing
  console.log("[refresh] Computing growth_score...");
  await updateGrowthScore();
  console.log("[refresh] growth_score updated");

  // Step 5.7: Fill null vacancy_rate_adjusted for rows that have raw vacancy but no adjusted
  //   Uses same zone multipliers as the Step 1 INSERT above.
  await sql.query(`
    UPDATE suburb_metrics
    SET vacancy_rate_adjusted = ROUND(
      CASE
        WHEN LOWER(suburb) IN ('lorne','aireys inlet','anglesea','barwon heads','point lonsdale','queenscliff','sorrento','portsea','blairgowrie','rye','rosebud','mccrae','dromana','safety beach','mount martha','mount eliza','tootgarook','bonbeach','edithvale','black rock','beaumaris','patterson lakes')
          AND vacancy_rate IS NOT NULL
        THEN vacancy_rate * 1.0
        WHEN COALESCE(dwelling_flat, 0) >= 50
          AND vacancy_rate IS NOT NULL
        THEN vacancy_rate * 0.175
        WHEN COALESCE(dwelling_separate_house, 0) >= 85
          AND vacancy_rate IS NOT NULL
        THEN vacancy_rate * 0.30
        WHEN vacancy_rate IS NOT NULL
        THEN vacancy_rate * 0.25
        ELSE NULL
      END, 2
    ),
    updated_at = NOW()
    WHERE vacancy_rate_adjusted IS NULL AND vacancy_rate IS NOT NULL
  `, []);
  console.log('[refresh] Vacancy adjusted for new suburbs');

  // Step 5.8: Fill null adjusted vacancy with global median (fallback for unmapped subs)
  await sql.query(`
    UPDATE suburb_metrics
    SET vacancy_rate_adjusted = (
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY vacancy_rate_adjusted)
      FROM suburb_metrics
      WHERE vacancy_rate_adjusted IS NOT NULL
    ),
    updated_at = NOW()
    WHERE vacancy_rate_adjusted IS NULL AND vacancy_rate IS NOT NULL
  `, []);
  console.log('[refresh] Filled remaining null vacancy_rate_adjusted with median');

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

  // Step 5.9: Compute undervaluation score (0-100) from blended price vs. fundamental model
  //   V2 model: log(blendedPrice) ~ school_score + log(hhdIncome) + occupancy + log(distCBD) + supply_constraint
  //   blendedPrice = house_price × sep_house_pct + unit_price × (1 - sep_house_pct)
  //   undervaluation = 60% price_deviationscore + 40% affordability_score
  //   deviation score: ratio 0.7→100, 1.3→0
  //   affordability score: PIR ≤5→100, ≥15→0
  //   PIR = blendedPrice / (hhd_income_weekly × 52)
  console.log('[refresh] Computing undervaluation score...');
  await q(`
    WITH suburb_inputs AS (
      SELECT
        sm.suburb,
        sm.state,
        -- Blended price: weighted by dwelling composition
        COALESCE(
          sm.median_house_price::numeric * COALESCE(sm.dwelling_separate_house, 50) / 100.0
          + COALESCE(sm.median_unit_price, sm.median_house_price)::numeric * (100.0 - COALESCE(sm.dwelling_separate_house, 50)) / 100.0,
          sm.median_house_price::numeric
        ) AS blended_price,
        sm.school_score::numeric AS school_score,
        sm.dwelling_occupancy_rate::numeric AS occupancy,
        COALESCE(sm.supply_constraint_score::numeric, 50) AS supply_constraint,
        -- HHD income from Census G02
        (census.g02->>'Median_tot_hhd_inc_weekly')::numeric * 52 AS hhd_annual_income,
        -- Distance from CBD (Melbourne GPO: -37.8136, 144.9631) — haversine formula
        ROUND(CAST(
          6371.0 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS((loc.avg_lat - (-37.8136)) / 2.0)), 2)
            + COS(RADIANS(loc.avg_lat)) * COS(RADIANS(-37.8136))
            * POWER(SIN(RADIANS((loc.avg_lng - 144.9631) / 2.0)), 2)
          ))
        AS numeric), 1) AS dist_cbd_km
      FROM suburb_metrics sm
      LEFT JOIN LATERAL (
        SELECT AVG(sl2.latitude) AS avg_lat, AVG(sl2.longitude) AS avg_lng
        FROM school_locations sl2
        WHERE LOWER(sm.suburb) = LOWER(sl2.suburb) AND sm.state = 'VIC'
      ) loc ON true
      LEFT JOIN LATERAL (
        SELECT c2.g02
        FROM school_locations sl2
        JOIN census_sa2_data c2 ON sl2.sa2_code = c2.sa2_code::text
        WHERE LOWER(sm.suburb) = LOWER(sl2.suburb) AND sm.state = 'VIC'
        LIMIT 1
      ) census ON true
      WHERE sm.state = 'VIC' AND sm.median_house_price IS NOT NULL AND census.g02 IS NOT NULL
    ),
    -- OLS regression coefficients (pre-computed from 233 VIC suburbs, R²=0.614)
    -- Intercept: 12.6737, School: 1.2715, log(Income): -0.0622, Occupancy: 1.9550,
    -- log(distCBD): -0.1258, SupplyConstraint: 0.0755
    model AS (
      SELECT
        suburb, state, blended_price, school_score, occupancy,
        supply_constraint, hhd_annual_income, dist_cbd_km,
        -- Predicted log(price)
        12.6737
        + 1.2715 * (school_score / 100.0)
        + (-0.0622) * LN(GREATEST(hhd_annual_income, 1))
        + 1.9550 * (occupancy / 100.0)
        + (-0.1258) * LN(GREATEST(dist_cbd_km + 1, 1))
        + 0.0755 * (supply_constraint / 100.0)
        AS log_pred_price
      FROM suburb_inputs
    )
    UPDATE suburb_metrics sm SET
      undervaluation = ROUND(CAST(
        CASE
          WHEN m.blended_price IS NOT NULL AND m.hhd_annual_income > 0 AND m.dist_cbd_km IS NOT NULL THEN
            -- Combine price deviation (60%) + affordability (40%)
            ROUND(
              0.60 * GREATEST(0, LEAST(100,
                (1.3 - (m.blended_price / GREATEST(EXP(m.log_pred_price), 1)))
                / 0.6 * 100
              ))
              + 0.40 * GREATEST(0, LEAST(100,
                (15.0 - (m.blended_price / m.hhd_annual_income))
                / 10.0 * 100
              ))
            )
          ELSE sm.undervaluation
        END
      AS numeric), 0),
      undervaluation_label = CASE
        WHEN m.blended_price IS NOT NULL AND m.hhd_annual_income > 0 AND m.dist_cbd_km IS NOT NULL THEN
          CASE
            WHEN (m.blended_price / GREATEST(EXP(m.log_pred_price), 1)) < 0.85 THEN 'Attractive'
            WHEN (m.blended_price / GREATEST(EXP(m.log_pred_price), 1)) > 1.15 THEN 'Overpriced'
            ELSE 'Fairly Valued'
          END
        ELSE sm.undervaluation_label
      END,
      updated_at = NOW()
    FROM model m
    WHERE LOWER(sm.suburb) = LOWER(m.suburb) AND sm.state = 'VIC'
      AND m.blended_price IS NOT NULL AND m.hhd_annual_income > 0 AND m.dist_cbd_km IS NOT NULL
  `);
  console.log('[refresh] undervaluation score updated');

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
      COUNT(*) FILTER (WHERE median_rent IS NOT NULL)::int AS with_rent,
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

// ── growth_score: 0.4 × scale(vgv_cagr_10y) + 0.3 × scale(growth_5y) + 0.3 × scale(vgv_combined_cagr) ──
async function updateGrowthScore() {
  return q(`
    UPDATE suburb_metrics SET
      growth_score = ROUND(CAST(
        CASE
          WHEN vgv_cagr_10y IS NOT NULL AND growth_5y IS NOT NULL AND vgv_combined_cagr IS NOT NULL THEN
            0.4 * GREATEST(0, LEAST(100, (vgv_cagr_10y::numeric - (-3.92)) / (19.51 - (-3.92)) * 100))
            + 0.3 * GREATEST(0, LEAST(100, (growth_5y::numeric - (-5.0)) / (20.0 - (-5.0)) * 100))
            + 0.3 * GREATEST(0, LEAST(100, (vgv_combined_cagr::numeric - (-2.86)) / (15.43 - (-2.86)) * 100))
          WHEN growth_5y IS NOT NULL THEN
            GREATEST(0, LEAST(100, (growth_5y::numeric - (-5.0)) / (20.0 - (-5.0)) * 100))
          ELSE NULL
        END
      AS numeric), 0)
      , updated_at = NOW()
    WHERE state = 'VIC'
  `);
}
