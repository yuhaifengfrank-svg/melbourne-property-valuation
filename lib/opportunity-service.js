/**
 * opportunity-service.js - Opportunity Scan Engine v2
 *
 * Scans comparable_sales and scores each as an investment opportunity
 * using DB median prices + batch-loaded census + school data.
 */

// Neon HTTP transport (faster cold-start on Vercel than pg TCP)
import { neon } from '@neondatabase/serverless';

const CONFIG = {
  MIN_SALE_PRICE: 50000,
  MAX_SALE_PRICE: 50000000,
  MAX_DAYS_BACK: 3 * 365,
  SCORE_WEIGHTS: { undervaluation: 0.35, schoolQuality: 0.25, growthPotential: 0.20, cashFlow: 0.15, confidence: 0.05 }
};

let _sql = null;
function getSql() {
  if (!_sql && process.env.DATABASE_URL) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  if (!_sql) throw new Error('DATABASE_URL not set');
  return _sql;
}

async function query(text, params) {
  const sql = getSql();
  // Neon serverless v2+: use .query() for parameterized SQL, tagged template for literals
  if (params && params.length > 0) {
    return sql.query(text, params);
  }
  // For no-param queries, tagged-template avoids the raw-sql wrapper
  return sql.query(text, []);
}

// ── Batch suburb data loading (single query each, no N+1) ──
async function loadSuburbData(suburbs) {
  if (suburbs.length === 0) return {};

  const map = {};

  // 1. School data – batch per suburb
  const schools = await query(`
    SELECT l.suburb,
           COUNT(*)::int AS school_count,
           ROUND(AVG(p.icsea)::numeric, 1) AS avg_icsea,
           MAX(p.icsea) AS best_icsea
    FROM school_locations l
    LEFT JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
    WHERE l.suburb = ANY(${suburbs})
    GROUP BY l.suburb
  `);
  for (const s of schools) {
    map[s.suburb] = map[s.suburb] || {};
    map[s.suburb].school = {
      schoolCount: s.school_count,
      avgIcsea: s.avg_icsea ? Number(s.avg_icsea) : null,
      bestIcsea: s.best_icsea ? Number(s.best_icsea) : null,
    };
  }

  // 2. SA2 code mapping
  const sa2Rows = await query(`
    SELECT DISTINCT l.suburb, l.sa2_code
    FROM school_locations l
    WHERE l.suburb = ANY(${suburbs})
      AND l.sa2_code IS NOT NULL
  `);
  const suburbToSa2 = {};
  for (const r of sa2Rows) {
    if (r.sa2_code && !suburbToSa2[r.suburb]) {
      suburbToSa2[r.suburb] = r.sa2_code;
    }
  }

  // 3. Census data – batch by SA2 codes
  const codes = [...new Set(Object.values(suburbToSa2).filter(Boolean))];
  if (codes.length > 0) {
    const censusRows = await query(`
      SELECT sa2_code, g01, g02, g36, g37
      FROM census_sa2_data
      WHERE sa2_code = ANY(${codes})
    `);
    const censusBySa2 = {};
    for (const c of censusRows) {
      censusBySa2[c.sa2_code] = c;
    }

    for (const sub of Object.keys(suburbToSa2)) {
      const sa2Code = suburbToSa2[sub];
      const c = censusBySa2[sa2Code];
      if (!c) continue;
      const g02 = c.g02 || {};
      map[sub] = map[sub] || {};
      map[sub].census = {
        median_household_income_weekly: g02.Median_tot_hhd_inc_weekly || null,
        median_rent_weekly: g02.Median_rent_weekly || null,
        median_family_income_weekly: g02.Median_fam_inc_weekly || null,
        median_mortgage_monthly: g02.Median_mortgage_repay_monthly || null,
      };
    }

    // 4. DFFH rent (2025 Sep) from suburb_metrics
    if (allSuburbs.length > 0) {
      const dffhRows = await query(
        'SELECT suburb, median_rent_dffh FROM suburb_metrics WHERE suburb = ANY($1) AND median_rent_dffh IS NOT NULL',
        [allSuburbs]
      );
      for (const r of dffhRows) {
        if (!r.median_rent_dffh) continue;
        map[r.suburb] = map[r.suburb] || {};
        map[r.suburb].dffh = { median_rent_weekly: Number(r.median_rent_dffh) };
      }
    }
  }

  return map;
}

export async function scanOpportunities(params = {}) {
  const { strategy = 'smart', suburbRegion = null, propertyType = null,
          minPrice = null, maxPrice = null, minScore = 0, maxResults = 50 } = params;

  const MD = CONFIG.MAX_DAYS_BACK, MNP = CONFIG.MIN_SALE_PRICE, MXP = CONFIG.MAX_SALE_PRICE;

  // Build query
  let sq = [
    "SELECT id, sale_address, suburb, state, property_type,",
    "       bedrooms, bathrooms, car_spaces, land_size_sqm,",
    "       sale_price, sale_date, lat, lon, created_at",
    "FROM comparable_sales",
    "WHERE sale_price IS NOT NULL AND sale_price > " + MNP + " AND sale_price < " + MXP,
    "  AND sale_date IS NOT NULL AND sale_date > NOW() - INTERVAL '" + MD + " days'"
  ];
  let p = [];

  if (suburbRegion) { p.push("%" + suburbRegion.toLowerCase() + "%"); sq.push("  AND LOWER(suburb) LIKE $" + p.length); }
  if (propertyType) { p.push(propertyType.toLowerCase()); sq.push("  AND LOWER(property_type) = $" + p.length); }
  if (minPrice) { p.push(minPrice); sq.push("  AND sale_price >= $" + p.length); }
  if (maxPrice) { p.push(maxPrice); sq.push("  AND sale_price <= $" + p.length); }
  // Fetch at most 2000 recent sales, more than enough for scoring
  sq.push("ORDER BY sale_date DESC LIMIT 2000");

  const compsRaw = await query(sq.join("\n"), p.length > 0 ? p : undefined);
  const comps = Array.isArray(compsRaw) ? compsRaw : (compsRaw.rows || []);
  if (!comps || comps.length === 0) {
    return { opportunities: [], meta: { totalScanned: 0, strategy, message: 'No matches' } };
  }

  // 1. Suburb median prices – one query
  const allSuburbs = [...new Set(comps.map(c => c.suburb).filter(Boolean))];
  const medianPrices = {};
  if (allSuburbs.length > 0) {
    const ph = allSuburbs.map((_, i) => "$" + (i + 1));
    const mq = "SELECT suburb, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) as median_price" +
      " FROM comparable_sales WHERE suburb IN (" + ph.join(",") + ")" +
      " AND sale_price > " + MNP + " GROUP BY suburb";
    const mr = await query(mq, allSuburbs);
    (Array.isArray(mr) ? mr : (mr.rows || [])).forEach(r => { medianPrices[r.suburb] = Number(r.median_price); });
  }

  // 2. Batch load school + census data – with fallback on timeout
  let suburbData = {};
  try {
    const batchPromise = loadSuburbData(allSuburbs);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('batch_data_timeout')), 8000));
    suburbData = await Promise.race([batchPromise, timeoutPromise]);
  } catch (e) {
    // Timed out loading school/census — score with undervaluation only
    // suburbData stays empty; individual score functions will get no data and return defaults
  }

  // 3. Score & map
  let scored = comps.map(c => {
    const sd = suburbData[c.suburb] || {};
    const med = medianPrices[c.suburb] || null;
    const scr = scoreProperty(c, sd, med, strategy);
    return {
      id: c.id, address: c.sale_address, suburb: c.suburb, state: c.state,
      propertyType: c.property_type, bedrooms: c.bedrooms, bathrooms: c.bathrooms,
      carSpaces: c.car_spaces, landSize: c.land_size_sqm,
      salePrice: Number(c.sale_price), soldDate: c.sale_date,
      ...scr
    };
  });

  let filtered = scored.filter(s => s.opportunityScore >= minScore);
  filtered.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return {
    opportunities: filtered.slice(0, maxResults),
    meta: {
      totalScanned: scored.length, matchingFilter: filtered.length,
      strategy, suburbCount: allSuburbs.length,
      averageScore: scored.length ? Math.round(scored.reduce((s, o) => s + o.opportunityScore, 0) / scored.length) : 0
    }
  };
}

function scoreProperty(comp, sd, medianPrice, strategy) {
  const w = getWeights(strategy);
  const { us, up } = calcUndervaluation(comp, medianPrice);
  const ss = calcSchoolScore(sd);
  const gs = calcGrowthScore(comp, sd);
  const cs = calcCashFlowScore(sd);
  const conf = medianPrice ? 65 : 40;

  const total = Math.max(0, Math.min(100, Math.round(us * w.undervaluation + ss * w.schoolQuality + gs * w.growthPotential + cs * w.cashFlow + conf * w.confidence)));
  return { opportunityScore: total, undervaluationScore: us, schoolScore: ss, growthScore: gs, cashFlowScore: cs, confidenceScore: conf, undervaluationPct: up, badges: badges(total, up, ss, gs) };
}

function getWeights(s) {
  const b = { ...CONFIG.SCORE_WEIGHTS };
  switch (s) {
    case 'value': return { ...b, undervaluation: 0.50, schoolQuality: 0.15, growthPotential: 0.15, cashFlow: 0.15, confidence: 0.05 };
    case 'growth': return { ...b, undervaluation: 0.20, schoolQuality: 0.15, growthPotential: 0.45, cashFlow: 0.15, confidence: 0.05 };
    case 'cashflow': return { ...b, undervaluation: 0.15, schoolQuality: 0.10, growthPotential: 0.15, cashFlow: 0.55, confidence: 0.05 };
    case 'school': return { ...b, undervaluation: 0.20, schoolQuality: 0.50, growthPotential: 0.15, cashFlow: 0.10, confidence: 0.05 };
    default: return b;
  }
}

function calcUndervaluation(comp, medianPrice) {
  if (!medianPrice || medianPrice <= 0) return { us: 50, up: 0 };
  const sp = Number(comp.sale_price);
  if (!sp || sp <= 0) return { us: 50, up: 0 };
  const diff = (medianPrice - sp) / medianPrice;
  let s = 50 + (diff * 150);
  s = Math.max(0, Math.min(100, s));
  return { us: Math.round(s), up: Math.round(diff * 100) };
}

function calcSchoolScore(sd) {
  const sch = sd.school;
  if (!sch) return 40;
  const icsea = sch.avgIcsea || sch.bestIcsea;
  if (!icsea) return 40;
  return Math.round(Math.max(0, Math.min(100, ((icsea - 800) / 450) * 100)));
}

function calcGrowthScore(comp, sd) {
  const cens = sd.census;
  if (!cens) return 50;
  const inc = cens.median_household_income_weekly || 0;
  if (inc <= 0) return 50;
  const sp = Number(comp.sale_price) || 0;
  if (sp <= 0) return 50;
  const pir = sp / (inc * 52);
  return Math.round(Math.max(20, Math.min(90, 100 - ((pir - 3) / 15) * 100)));
}

function calcCashFlowScore(sd) {
  // DFFH 2025 Sep rent (from suburb_metrics) preferred over Census 2021
  const dffh = sd.dffh;
  const cens = sd.census;
  const rw = (dffh?.median_rent_weekly || 0) > 0
    ? dffh.median_rent_weekly
    : (cens?.median_rent_weekly || 0);
  if (rw <= 0) return 40;
  const inc = cens?.median_household_income_weekly || 1500;
  const rti = rw / inc;
  return Math.round(Math.max(10, Math.min(100, (rti - 0.10) / 0.30 * 100)));
}

function badges(ts, up, ss, gs) {
  const b = [];
  if (up >= 15) b.push({ label: "Undervalued " + up + "%", type: 'value' });
  else if (up >= 5) b.push({ label: up + "% below median", type: 'value' });
  if (ss >= 80) b.push({ label: "Top School Zone", type: 'school' });
  else if (ss >= 60) b.push({ label: "Good School Zone", type: 'school' });
  if (gs >= 70) b.push({ label: "Strong Growth", type: 'growth' });
  if (ts >= 80) b.push({ label: "Prime Opportunity", type: 'prime' });
  return b;
}
