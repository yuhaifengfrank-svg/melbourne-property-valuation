/**
 * refresh-suburb-metrics.js — Nightly batch job
 *
 * Refreshes suburb_metrics from existing DB data.
 * Sources:
 *  - comparable_sales: median prices, growth_1y (year-on-year median comparison)
 *  - school_locations + school_profiles: ICSEA → school_score
 *  - census_sa2_data.g02.Median_rent_weekly: gross yield calculation
 *
 * Run: node lib/refresh-suburb-metrics.js
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

async function q(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

async function refreshSuburbMetrics() {
  console.log('[refresh] Starting suburb_metrics refresh...');
  const t0 = Date.now();

  await q('TRUNCATE suburb_metrics', []);
  console.log('[refresh] Truncated suburb_metrics');

  // Step 1: populate base metrics
  //   growth_1y = latest 365d median vs previous 365d median
  const insertSql = `
    INSERT INTO suburb_metrics (suburb, state,
      median_house_price, median_unit_price,
      median_house_rent, median_unit_rent,
      growth_1y, growth_3y, growth_5y,
      school_score, gross_yield,
      opportunity_score, opportunity_type, updated_at)
    WITH
      suburbs AS (
        SELECT DISTINCT cs.suburb, COALESCE(cs.state, 'VIC') AS state
        FROM comparable_sales cs
        WHERE cs.suburb IS NOT NULL AND cs.sale_price > 50000
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
      -- growth_1y: median of latest 365d vs median of previous 365d
      g1 AS (
        SELECT suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date > NOW() - INTERVAL '365 days') AS yr1_med,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date BETWEEN NOW() - INTERVAL '730 days' AND NOW() - INTERVAL '365 days') AS yr2_med,
               COUNT(*) FILTER (WHERE sale_date > NOW() - INTERVAL '365 days') AS yr1_cnt
        FROM comparable_sales
        WHERE sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '730 days'
        GROUP BY suburb
      ),
      sch AS (
        SELECT l.suburb,
               ROUND(CAST(AVG(p.icsea) AS numeric), 1) AS score
        FROM school_locations l
        JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
        WHERE p.icsea IS NOT NULL
        GROUP BY l.suburb
      ),
      -- Census rent via school_locations → sa2_code → census_sa2_data
      rent AS (
        SELECT DISTINCT ON (sl.suburb)
               sl.suburb,
               (census.g02->>'Median_rent_weekly')::numeric AS median_rent_weekly
        FROM school_locations sl
        JOIN census_sa2_data census ON sl.sa2_code = census.sa2_code::text
        WHERE census.g02->>'Median_rent_weekly' IS NOT NULL
          AND (census.g02->>'Median_rent_weekly')::text ~ '^[0-9]+$'
      )
    SELECT
      s.suburb, s.state,
      hp.med, up.med,
      rent.median_rent_weekly AS median_house_rent,
      NULL::numeric(10,0) AS median_unit_rent,
      -- growth_1y: (yr1_med - yr2_med) / yr2_med * 100, only when both have >= 3 sales
      CASE WHEN g1.yr1_med IS NOT NULL AND g1.yr2_med IS NOT NULL AND g1.yr2_med > 0 AND g1.yr1_cnt >= 3
        THEN ROUND(CAST((g1.yr1_med - g1.yr2_med) / g1.yr2_med * 100 AS numeric), 2)
      END,
      NULL::numeric(5,2),  -- growth_3y (pending data)
      NULL::numeric(5,2),  -- growth_5y (pending data)
      -- school_score normalized 0-100
      CASE WHEN sch.score IS NOT NULL
        THEN GREATEST(0, LEAST(100, ROUND(CAST((sch.score - 800.0) / 450.0 * 100 AS numeric), 1)))
      END,
      -- gross_yield = rent_weekly * 52 / median_house_price * 100
      CASE WHEN rent.median_rent_weekly IS NOT NULL AND hp.med IS NOT NULL AND hp.med > 0
        THEN ROUND(CAST(rent.median_rent_weekly * 52.0 / hp.med * 100 AS numeric), 2)
      END,
      NULL::numeric(5,1), NULL::text, NOW()
    FROM suburbs s
    LEFT JOIN hp ON s.suburb = hp.suburb
    LEFT JOIN up ON s.suburb = up.suburb
    LEFT JOIN g1 ON s.suburb = g1.suburb
    LEFT JOIN sch ON s.suburb = sch.suburb
    LEFT JOIN rent ON s.suburb = rent.suburb
  `;

  const insResult = await q(insertSql, []);
  console.log(`[refresh] Inserted ${insResult.rowCount || '?'} rows`);

  // Step 2: compute opportunity_score + opportunity_type
  const updateSql = `
    UPDATE suburb_metrics SET
      opportunity_score = ROUND(CAST(
        COALESCE(
          CASE WHEN median_house_price IS NOT NULL
            THEN (1.0 - LEAST(1.0, median_house_price / 2000000.0)) * 30
            ELSE 15
          END
          + COALESCE(growth_1y * 0.6, 0) * 0.25
          + COALESCE(gross_yield * 5, 10) * 0.15
          + COALESCE(school_score * 0.1, 5) * 0.10
          + 10
        , 20)
      AS numeric), 1),
      opportunity_type = CASE
        WHEN COALESCE(school_score, 0) >= 65 THEN 'School Zone'
        WHEN COALESCE(growth_1y, 0) >= 10 THEN 'Growth'
        WHEN COALESCE(gross_yield, 0) >= 3.0 THEN 'Cashflow'
        ELSE 'Value'
      END,
      updated_at = NOW()
  `;
  const updResult = await q(updateSql, []);
  console.log(`[refresh] Updated ${updResult.rowCount || '?'} rows`);

  // Data quality report
  const dq = await q(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE median_house_price IS NOT NULL)::int AS with_hp,
      COUNT(*) FILTER (WHERE median_unit_price IS NOT NULL)::int AS with_up,
      COUNT(*) FILTER (WHERE median_house_rent IS NOT NULL)::int AS with_rent,
      COUNT(*) FILTER (WHERE growth_1y IS NOT NULL)::int AS with_g1y,
      COUNT(*) FILTER (WHERE school_score IS NOT NULL)::int AS with_sch,
      COUNT(*) FILTER (WHERE gross_yield IS NOT NULL)::int AS with_yield
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
