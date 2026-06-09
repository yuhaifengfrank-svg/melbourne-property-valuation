/**
 * refresh-suburb-metrics.js — Nightly batch job
 *
 * Refreshes suburb_metrics from existing DB data.
 * Run: node lib/refresh-suburb-metrics.js
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

async function query(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

async function refreshSuburbMetrics() {
  console.log('[refresh] Starting suburb_metrics refresh...');
  const t0 = Date.now();

  await query('TRUNCATE suburb_metrics', []);
  console.log('[refresh] Truncated suburb_metrics');

  // Step 1: populate base metrics via a single INSERT…SELECT
  const insertSql = `
    INSERT INTO suburb_metrics (suburb, state,
      median_house_price, median_unit_price, median_house_rent, median_unit_rent,
      growth_1y, growth_3y, growth_5y,
      school_score, opportunity_score, opportunity_type, updated_at)
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
      g1 AS (
        SELECT suburb,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date > NOW() - INTERVAL '365 days') AS yr1,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date BETWEEN NOW() - INTERVAL '730 days' AND NOW() - INTERVAL '365 days') AS yr2,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date > NOW() - INTERVAL '1095 days') AS yr3,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date BETWEEN NOW() - INTERVAL '2190 days' AND NOW() - INTERVAL '1095 days') AS yr4,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date > NOW() - INTERVAL '1825 days') AS yr5,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
                 FILTER (WHERE sale_date BETWEEN NOW() - INTERVAL '3650 days' AND NOW() - INTERVAL '1825 days') AS yr6
        FROM comparable_sales
        WHERE sale_price > 50000 AND sale_price < 50000000
          AND sale_date > NOW() - INTERVAL '3650 days'
        GROUP BY suburb
      ),
      sch AS (
        SELECT l.suburb,
               ROUND(CAST(AVG(p.icsea) AS numeric), 1) AS score
        FROM school_locations l
        JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
        WHERE p.icsea IS NOT NULL
        GROUP BY l.suburb
      )
    SELECT
      s.suburb, s.state,
      hp.med, up.med,
      NULL::numeric(10,0), NULL::numeric(10,0),
      -- growth_1y: (yr1 - yr2) / yr2 * 100
      CASE WHEN g1.yr1 IS NOT NULL AND g1.yr2 IS NOT NULL AND g1.yr2 > 0
        THEN ROUND(CAST((g1.yr1 - g1.yr2) / g1.yr2 * 100 AS numeric), 2)
      END,
      -- growth_3y: (yr3 - yr4) / yr4 * 100
      CASE WHEN g1.yr3 IS NOT NULL AND g1.yr4 IS NOT NULL AND g1.yr4 > 0
        THEN ROUND(CAST((g1.yr3 - g1.yr4) / g1.yr4 * 100 AS numeric), 2)
      END,
      -- growth_5y: (yr5 - yr6) / yr6 * 100
      CASE WHEN g1.yr5 IS NOT NULL AND g1.yr6 IS NOT NULL AND g1.yr6 > 0
        THEN ROUND(CAST((g1.yr5 - g1.yr6) / g1.yr6 * 100 AS numeric), 2)
      END,
      -- school_score normalized 0-100
      CASE WHEN sch.score IS NOT NULL
        THEN GREATEST(0, LEAST(100, ROUND(CAST((sch.score - 800.0) / 450.0 * 100 AS numeric), 1)))
      END,
      NULL::numeric(5,1), NULL::text,
      NOW()
    FROM suburbs s
    LEFT JOIN hp ON s.suburb = hp.suburb
    LEFT JOIN up ON s.suburb = up.suburb
    LEFT JOIN g1 ON s.suburb = g1.suburb
    LEFT JOIN sch ON s.suburb = sch.suburb
  `;

  const insResult = await query(insertSql, []);
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
          + COALESCE(growth_3y * 0.8, 0) * 0.25
          + COALESCE(school_score * 0.1, 5) * 0.10
          + 10
        , 20)
      AS numeric), 1),
      opportunity_type = CASE
        WHEN COALESCE(school_score, 0) >= 75 THEN 'School Zone'
        WHEN COALESCE(growth_3y, 0) >= 15 THEN 'Growth'
        WHEN COALESCE(growth_1y, 0) >= 8 THEN 'Balanced Growth'
        ELSE 'Value'
      END,
      updated_at = NOW()
  `;
  const updResult = await query(updateSql, []);
  console.log(`[refresh] Updated ${updResult.rowCount || '?'} rows`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[refresh] ✓ Complete in ${elapsed}s`);
  return { elapsed, inserted: insResult.rowCount, updated: updResult.rowCount };
}

if (process.argv[1] && (process.argv[1].includes('refresh-suburb-metrics') || process.argv[1].includes('/refresh-suburb-metrics'))) {
  refreshSuburbMetrics()
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error('Refresh failed:', e); process.exit(1); });
}

export { refreshSuburbMetrics };
