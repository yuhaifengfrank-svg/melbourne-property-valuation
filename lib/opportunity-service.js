/**
 * opportunity-service.js - Opportunity Scan Engine v2
 *
 * Scans comparable_sales and scores each as an investment opportunity
 * using DB median prices + census + school data.
 */

import { neon } from '@neondatabase/serverless';
import { getSuburbCensus } from './census-service.js';
import { getSuburbSchoolProfile } from './school-service.js';

const CONFIG = {
  MIN_SALE_PRICE: 50000,
  MAX_SALE_PRICE: 50000000,
  MAX_DAYS_BACK: 3 * 365,
  SCORE_WEIGHTS: { undervaluation: 0.35, schoolQuality: 0.25, growthPotential: 0.20, cashFlow: 0.15, confidence: 0.05 }
};

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  return neon(process.env.DATABASE_URL);
}

export async function scanOpportunities(params = {}) {
  const { strategy = 'smart', suburbRegion = null, propertyType = null,
          minPrice = null, maxPrice = null, minScore = 0, maxResults = 50 } = params;

  const sql = getSql();
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
  sq.push("ORDER BY sale_date DESC");

  const compsRaw = await sql.query(sq.join("\n"), p.length > 0 ? p : undefined);
  const comps = Array.isArray(compsRaw) ? compsRaw : (compsRaw.rows || []);
  if (!comps || comps.length === 0) {
    return { opportunities: [], meta: { totalScanned: 0, strategy, message: 'No matches' } };
  }

  // Suburb median prices from DB
  const allSuburbs = [...new Set(comps.map(c => c.suburb).filter(Boolean))];
  const medianPrices = {};
  if (allSuburbs.length > 0) {
    try {
      const ph = allSuburbs.map((_, i) => "$" + (i + 1));
      const mq = "SELECT suburb, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) as median_price" +
        " FROM comparable_sales WHERE suburb IN (" + ph.join(",") + ")" +
        " AND sale_price > " + MNP + " GROUP BY suburb";
      const mr = await sql.query(mq, allSuburbs);
      (Array.isArray(mr) ? mr : (mr.rows || [])).forEach(r => { medianPrices[r.suburb] = Number(r.median_price); });
    } catch(e) { /* fallback null */ }
  }

  // Batch suburb data
  const suburbData = {};
  await Promise.all(allSuburbs.map(async (s) => {
    try {
      const [c, sch] = await Promise.all([getSuburbCensus(s), getSuburbSchoolProfile(s)]);
      suburbData[s] = { census: c, school: sch, medianPrice: medianPrices[s] || null };
    } catch (e) {
      suburbData[s] = { census: null, school: null, medianPrice: medianPrices[s] || null };
    }
  }));

  // Score & map
  let scored = comps.map(c => {
    const sd = suburbData[c.suburb] || {};
    const scr = scoreProperty(c, sd, strategy);
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

function scoreProperty(comp, sd, strategy) {
  const w = getWeights(strategy);
  const { us, up } = calcUndervaluation(comp, sd);
  const ss = calcSchoolScore(sd);
  const gs = calcGrowthScore(comp, sd);
  const cs = calcCashFlowScore(sd);
  // Confidence based on how many comps in this suburb (from medianPrice presence as proxy)
  const conf = sd.medianPrice ? 65 : 40;

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

function calcUndervaluation(comp, sd) {
  const mp = sd.medianPrice;
  if (!mp || mp <= 0) return { us: 50, up: 0 };

  const sp = Number(comp.sale_price);
  if (!sp || sp <= 0) return { us: 50, up: 0 };

  const diff = (mp - sp) / mp;

  // Score: -20% below median = 80pts, -40% = 100pts, 0% = 50pts, +20% above = 20pts
  let s = 50 + (diff * 150);
  s = Math.max(0, Math.min(100, s));
  return { us: Math.round(s), up: Math.round(diff * 100) };
}

function calcSchoolScore(sd) {
  if (!sd.school) return 40;
  const icsea = sd.school.avgIcsea || sd.school.bestIcsea;
  if (!icsea) return 40;
  return Math.round(Math.max(0, Math.min(100, ((icsea - 800) / 450) * 100)));
}

function calcGrowthScore(comp, sd) {
  if (!sd.census) return 50;
  const inc = sd.census.median_household_income_weekly || 0;
  if (inc <= 0) return 50;
  const sp = Number(comp.sale_price) || 0;
  if (sp <= 0) return 50;
  const pir = sp / (inc * 52); // Price-to-Income Ratio
  // PIR 4x=80pts, 7x=50pts, 15x+=20pts
  return Math.round(Math.max(20, Math.min(90, 100 - ((pir - 3) / 15) * 100)));
}

function calcCashFlowScore(sd) {
  if (!sd.census || !sd.census.median_rent_weekly) return 40;
  const rw = sd.census.median_rent_weekly || 0;
  if (rw <= 0) return 40;
  const inc = sd.census.median_household_income_weekly || 1500;
  const rti = rw / inc;
  // 30%+ of income = 80pts, 20%=50pts, 15%=30pts
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
