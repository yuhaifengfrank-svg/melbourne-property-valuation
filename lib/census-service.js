/**
 * census-service.js - ABS 2021 Census SA2 Data Service
 * 
 * Provides suburb/SA2-level census data for the valuation engine and suburb pages.
 * Uses the JSONB census_sa2_data table.
 */

import { neon } from '@neondatabase/serverless';

// Simple in-memory cache
let cache = new Map();
let cacheTimestamps = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  return neon(process.env.DATABASE_URL);
}

/**
 * Get census data for a suburb by looking up SA2 code from school_locations
 * @param {string} suburb - Suburb name (case-insensitive)
 * @returns {Object|null} Census data summary or null if not found
 */
export async function getSuburbCensus(suburb) {
  if (!suburb) return null;

  const cacheKey = `suburb:${suburb.toUpperCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cacheTimestamps.get(cacheKey) < CACHE_TTL_MS) {
    return cached;
  }

  const sql = getSql();

  let sa2Result = await sql`
    SELECT sa2_code, allocation_weight
    FROM suburb_sa2_membership
    WHERE LOWER(suburb)=LOWER(${suburb}) AND state='VIC'
    ORDER BY sa2_code
  `;
  if (sa2Result.length === 0) {
    sa2Result = await sql`
      SELECT sa2_code, 1::numeric allocation_weight
      FROM school_locations
      WHERE LOWER(suburb) = LOWER(${suburb}) AND sa2_code IS NOT NULL
      LIMIT 1
    `;
  }

  if (sa2Result.length === 0) {
    cache.set(cacheKey, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }

  const sa2Codes = sa2Result.map(row => row.sa2_code);

  // Get census data
  const censusRows = await sql`
    SELECT *
    FROM census_sa2_data
    WHERE sa2_code = ANY(${sa2Codes})
  `;

  if (censusRows.length === 0) {
    cache.set(cacheKey, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }

  const row = censusRows[0];
  const result = censusRows.length === 1
    ? extractCensusSummary(row, suburb)
    : aggregateCensusSummaries(censusRows, sa2Result, suburb);

  // Attach SEIFA data from the seifa JSONB column if present
  if (censusRows.length === 1 && row.seifa) {
    result.seifa = {
      irsd_score: row.seifa.irsd_score ?? null,
      irsd_decile: row.seifa.irsd_decile ?? null,
      irsad_score: row.seifa.irsad_score ?? null,
      irsad_decile: row.seifa.irsad_decile ?? null,
      ier_score: row.seifa.ier_score ?? null,
      ier_decile: row.seifa.ier_decile ?? null,
      ieo_score: row.seifa.ieo_score ?? null,
      ieo_percentile: row.seifa.ieo_percentile ?? null,
    };
  }

  cache.set(cacheKey, result);
  cacheTimestamps.set(cacheKey, Date.now());
  return result;
}

function aggregateCensusSummaries(rows, memberships, suburb) {
  const weights = Object.fromEntries(memberships.map(row => [row.sa2_code, Number(row.allocation_weight)]));
  const weighted = selector => rows.reduce((total, row) => total + Number(selector(row) || 0) * (weights[row.sa2_code] || 0), 0);
  const summed = selector => rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
  return {
    sa2_code: rows.map(row => row.sa2_code).join(','),
    sa2_codes: rows.map(row => row.sa2_code),
    suburb,
    geography: 'combined SA2s',
    population: summed(row => row.g01?.Tot_P_P),
    median_household_income_weekly: Math.round(weighted(row => row.g02?.Median_tot_hhd_inc_weekly)),
    median_family_income_weekly: Math.round(weighted(row => row.g02?.Median_tot_fam_inc_weekly)),
    median_personal_income_weekly: Math.round(weighted(row => row.g02?.Median_tot_prsnl_inc_weekly)),
    median_rent_weekly: Math.round(weighted(row => row.g02?.Median_rent_weekly)),
    median_mortgage_monthly: Math.round(weighted(row => row.g02?.Median_mortgage_repay_monthly)),
    limitations: ['Combined SA2 medians are dwelling-weighted model inputs, not direct suburb observations.'],
  };
}

/**
 * Get census data for a specific SA2 code
 * @param {string} sa2Code - 9-digit SA2 code
 * @returns {Object|null}
 */
export async function getSa2Census(sa2Code) {
  if (!sa2Code) return null;

  const cacheKey = `sa2:${sa2Code}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cacheTimestamps.get(cacheKey) < CACHE_TTL_MS) {
    return cached;
  }

  const sql = getSql();
  const rows = await sql`
    SELECT * FROM census_sa2_data WHERE sa2_code = ${sa2Code} LIMIT 1
  `;

  if (rows.length === 0) return null;

  const result = extractCensusSummary(rows[0]);
  cache.set(cacheKey, result);
  cacheTimestamps.set(cacheKey, Date.now());
  return result;
}

/**
 * Extract readable summary from JSONB census row
 */
function extractCensusSummary(row, suburbHint) {
  const g01 = row.g01 || {};
  const g02 = row.g02 || {};

  const result = {
    sa2_code: row.sa2_code,
    suburb: suburbHint || null,
    // Population
    population: g01.Tot_P_P || null,
    population_male: g01.Tot_P_M || null,
    population_female: g01.Tot_P_F || null,
    // Age
    median_age: g02.Median_age_persons || null,
    age_0_4: g01.Age_0_4_yr_P || null,
    age_5_14: sumNullable(g01.Age_5_11_yr_P, g01.Age_12_17_yr_P),
    age_15_24: g01.Age_18_24_yr_P || null,
    age_25_34: g01.Age_25_34_yr_P || null,
    age_35_44: g01.Age_35_44_yr_P || null,
    age_45_54: g01.Age_45_54_yr_P || null,
    age_55_64: g01.Age_55_64_yr_P || null,
    age_65_74: g01.Age_65_74_yr_P || null,
    age_75_84: g01.Age_75_84_yr_P || null,
    age_85_plus: g01.Age_85ov_P || null,
    // Income
    median_household_income_weekly: g02.Median_tot_hhd_inc_weekly || null,
    median_family_income_weekly: g02.Median_fam_inc_weekly || null,
    median_personal_income_weekly: g02.Median_tot_prsnl_inc_weekly || null,
    // Housing
    median_rent_weekly: g02.Median_rent_weekly || null,
    median_mortgage_monthly: g02.Median_mortgage_repay_monthly || null,
    // Dwelling structure from G36
    dwelling_structure: extractDwellingStructure(row.g36),
    // Tenure from G37
    tenure: extractTenure(row.g37),
  };

  return result;
}

function sumNullable(...vals) {
  const nums = vals.filter(v => v !== null && v !== undefined);
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
}

function extractDwellingStructure(g36) {
  if (!g36) return null;
  return {
    separate_house: g36.OPDs_Separate_house_Dwellings || null,
    flat_apartment: g36.OPDs_Flt_apt_Att_house_Ds || null,
    total_occupied: g36.OPDs_Tot_OPDs_Dwellings || null,
    total_dwellings: g36.Total_PDs_Dwellings || null,
  };
}

function extractTenure(g37) {
  if (!g37) return null;
  return {
    owned_outright: g37.O_OR_Total || null,
    owned_with_mortgage: g37.O_MTG_Total || null,
    renting: g37.R_Tot_Total || null,
    rent_real_estate: g37.R_RE_Agt_Total || null,
    rent_public_housing: g37.R_ST_h_auth_Total || null,
    rent_community: g37.R_Com_Hp_Total || null,
    total: g37.Total_Total || null,
  };
}

/**
 * Clear cache (for testing/refresh)
 */
export function clearCache() {
  cache = new Map();
  cacheTimestamps = new Map();
}
