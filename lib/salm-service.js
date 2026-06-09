/**
 * salm-service.js — SALM SA2 Labour Market Data Service
 *
 * Provides access to DEWR Small Area Labour Markets data stored in salm_sa2_data.
 * Used by refresh-suburb-metrics.js to update employment/unemployment metrics
 * with fresher data than Census 2021 G46.
 *
 * Data currency: December 2024 quarter (latest available at time of integration)
 * Next release: March 2026 quarter due June 2026
 */

import { neon } from '@neondatabase/serverless';

const SERVICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let _serviceCache = new Map();
let _serviceCacheTimestamps = new Map();

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  return neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
}

function q(text, params) {
  const s = getSql();
  if (params && params.length > 0) return s.query(text, params);
  return s.query(text, []);
}

/**
 * Get SALM data for a suburb
 * @param {string} suburb — suburb name (case-insensitive)
 * @returns {Object|null} SALM data for the suburb's SA2
 */
export async function getSalmBySuburb(suburb) {
  if (!suburb) return null;

  const cacheKey = `salm:${suburb.toUpperCase()}`;
  const cached = _serviceCache.get(cacheKey);
  if (cached && Date.now() - _serviceCacheTimestamps.get(cacheKey) < SERVICE_CACHE_TTL_MS) {
    return cached;
  }

  // Look up SA2 code from school_locations
  const sa2Result = await q(
    `SELECT sa2_code FROM school_locations WHERE LOWER(suburb) = LOWER($1) AND sa2_code IS NOT NULL LIMIT 1`,
    [suburb]
  );

  if (!sa2Result || sa2Result.length === 0) {
    _serviceCache.set(cacheKey, null);
    _serviceCacheTimestamps.set(cacheKey, Date.now());
    return null;
  }

  const sa2Code = sa2Result[0].sa2_code;
  return getSalmBySa2Code(sa2Code, cacheKey);
}

/**
 * Get SALM data directly by SA2 code
 * @param {string} sa2Code — 9-digit ABS SA2 code
 * @param {string} cacheKey — optional cache key override
 * @returns {Object|null}
 */
export async function getSalmBySa2Code(sa2Code, cacheKey) {
  if (!sa2Code) return null;

  const ck = cacheKey || `salm:sa2:${sa2Code}`;
  const cached = _serviceCache.get(ck);
  if (cached && Date.now() - _serviceCacheTimestamps.get(ck) < SERVICE_CACHE_TTL_MS) {
    return cached;
  }

  const result = await q(
    `SELECT * FROM salm_sa2_data WHERE sa2_code = $1 LIMIT 1`,
    [sa2Code]
  );

  if (!result || result.length === 0) {
    _serviceCache.set(ck, null);
    _serviceCacheTimestamps.set(ck, Date.now());
    return null;
  }

  const row = result[0];
  const salm = {
    sa2_code: row.sa2_code,
    sa2_name: row.sa2_name,
    latest_quarter: row.latest_quarter,
    labour_force: row.labour_force,
    unemployed: row.unemployed,
    unemployment_rate: row.unemployment_rate,
    employment: row.labour_force != null && row.unemployed != null
      ? row.labour_force - row.unemployed
      : null,
    has_data: row.has_labour_force || row.has_unemployment_rate,
    quarters_available: row.quarters_available,
    historical_data: row.historical_data,
  };

  _serviceCache.set(ck, salm);
  _serviceCacheTimestamps.set(ck, Date.now());
  return salm;
}

/**
 * Compute employment growth from historical SALM data
 * Shows trend direction: positive = improving, negative = worsening
 * @param {Object} salm — SALM data object from getSalmBySuburb()
 * @returns {Object} { growth_pct, direction, stable } or null
 */
export function computeEmploymentTrend(salm) {
  if (!salm || !salm.historical_data) return null;

  const hist = salm.historical_data;
  const quarters = Object.keys(hist).sort();

  // Need at least 2 quarters for trend
  if (quarters.length < 2) return null;

  // Use last 4 quarters for YoY comparison
  const recent = quarters.slice(-4);
  const older = quarters.slice(-8, -4);

  if (recent.length < 2) return null;

  // Get average unemployment rate for recent 4 quarters vs prior 4 quarters
  const recentRates = recent
    .map(q => hist[q]?.rate)
    .filter(r => r != null);
  const olderRates = older.length >= 1
    ? older.map(q => hist[q]?.rate).filter(r => r != null)
    : [];

  if (recentRates.length === 0) return null;

  const recentAvg = recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
  const olderAvg = olderRates.length > 0
    ? olderRates.reduce((a, b) => a + b, 0) / olderRates.length
    : null;

  // Direction: negative change in unemployment rate = improving labour market
  let direction = 'stable';
  let changePct = 0;

  if (olderAvg != null) {
    changePct = ((recentAvg - olderAvg) / Math.max(olderAvg, 0.1)) * 100;
    direction = changePct < -10 ? 'improving' : changePct > 10 ? 'worsening' : 'stable';
  }

  // YoY comparison (same quarter last year)
  const currentQ = salm.latest_quarter;
  // Extract the quarter label and find the one from 4 quarters back
  const lastYearQ = findPriorYearQuarter(currentQ, quarters);

  let yoyChange = null;
  if (lastYearQ && hist[lastYearQ]?.rate != null && hist[currentQ]?.rate != null) {
    yoyChange = hist[currentQ].rate - hist[lastYearQ].rate;
  }

  return {
    change_pct: Math.round(changePct * 10) / 10,
    direction,
    recent_avg_rate: Math.round(recentAvg * 100) / 100,
    older_avg_rate: olderAvg != null ? Math.round(olderAvg * 100) / 100 : null,
    yoy_change: yoyChange != null ? Math.round(yoyChange * 100) / 100 : null,
    quarters_used: recentRates.length,
    stable: direction === 'stable',
  };
}

/**
 * Find the quarter from 4 periods back
 */
function findPriorYearQuarter(currentQ, sortedQuarters) {
  const map = { 'Mar': 2, 'Jun': 3, 'Sep': 4, 'Dec': 5 }; // Sortable months
  const match = currentQ.match(/([A-Z][a-z]+)-(\d+)/);
  if (!match) return null;

  const targetYear = parseInt(match[2]) - 1;
  // Find any quarter from same month but previous year
  for (const q of sortedQuarters) {
    const m = q.match(/([A-Z][a-z]+)-(\d+)/);
    if (m && m[1] === match[1] && parseInt(m[2]) === targetYear) {
      return q;
    }
  }
  // Fallback: find closest quarter to target date
  const targetIdx = sortedQuarters.indexOf(currentQ) - 4;
  if (targetIdx >= 0) return sortedQuarters[targetIdx];
  return null;
}

/**
 * Compute employment growth metric (change in total employed persons)
 * @param {Object} salm — SALM data object
 * @returns {number|null} estimated employment count in latest quarter
 */
export function computeEmploymentCount(salm) {
  if (!salm || salm.labour_force == null || salm.unemployed == null) return null;
  return salm.labour_force - salm.unemployed;
}

/**
 * Clear service cache
 */
export function clearSalmCache() {
  _serviceCache = new Map();
  _serviceCacheTimestamps = new Map();
}

/**
 * Get coverage stats for reporting
 */
export async function getSalmCoverage() {
  const stats = await q(`
    SELECT
      COUNT(*)::int AS total_sa2s,
      COUNT(*) FILTER (WHERE has_labour_force)::int AS with_labour_force,
      COUNT(*) FILTER (WHERE has_unemployed)::int AS with_unemployed,
      COUNT(*) FILTER (WHERE has_unemployment_rate)::int AS with_rate,
      COUNT(*) FILTER (WHERE labour_force IS NULL AND unemployed IS NULL)::int AS empty,
      ROUND(AVG(quarters_available)::numeric, 1)::float8 AS avg_quarters,
      MIN(quarters_available)::int AS min_quarters,
      MAX(quarters_available)::int AS max_quarters
    FROM salm_sa2_data
  `);

  if (!stats || stats.length === 0) return null;
  return stats[0];
}
