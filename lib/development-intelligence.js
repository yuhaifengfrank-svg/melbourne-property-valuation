import { neon } from '@neondatabase/serverless';

const _sql = [];
function sql() {
  if (!_sql[0]) _sql[0] = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  return _sql[0];
}

// ── Zone → Development Score mapping ──
const ZONE_SCORES = {
  RGZ: 100,   // Residential Growth Zone — highest density
  MUZ: 95,    // Mixed Use Zone
  DZ:  95,    // Development Zone
  UGZ: 95,    // Urban Growth Zone
  PDZ: 95,    // Priority Development Zone
  ACZ: 90,    // Activity Centre Zone
  CCZ: 85,    // Commonwealth & Commercial Core
  C1Z: 80,    // Commercial 1
  C2Z: 80,    // Commercial 2
  B1Z: 80,    // Business 1
  B2Z: 80,    // Business 2
  B3Z: 80,    // Business 3
  HCTZ: 80,   // Housing Choice Tool
  GRZ: 75,    // General Residential Zone
  IN1Z: 60,   // Industrial 1
  IN2Z: 60,   // Industrial 2
  IN3Z: 60,   // Industrial 3
  NRZ: 40,    // Neighbourhood Residential Zone
  LDRZ: 35,   // Low Density Residential
  RLZ: 35,    // Residential Low Density
  SUZ: 35,    // Special Use
  UFZ: 30,    // Urban Floodway
  SUZ5: 35,   // Special Use Zone 5
  FZ: 25,     // Farming Zone
  TZ: 25,     // Township Zone
  GWZ: 20,    // Green Wedge Zone
  GWAZ: 20,   // Green Wedge A Zone
  RAZ: 15,    // Rural Activity Zone
  RCZ: 15,    // Rural Conservation
  PPRZ: 10,   // Public Park & Recreation
  PCRZ: 10,   // Public Conservation & Resource
  PUZ: 10,    // Public Use Zone
  CA: 10,     // Commonwealth Area
  PZ: 5,      // Priority Zone
};
const ZONE_DEFAULT = 30;

// ── Overlay → development penalty score ──
const OVERLAY_PENALTY = new Map([
  ['DPO', 85],    // Development Plan — manageable
  ['PAO', 80],    // Public Acquisition — manageable
  ['DCPO', 80],   // Development Contributions
  ['CLPO', 80],   // Transport project
  ['DDO', 75],    // Design & Development — design constraints
  ['SLO', 60],    // Significant Landscape
  ['EAO', 55],    // Environmental Audit — may need assessment
  ['AEO', 55],    // Airport Environs
  ['BAO', 55],    // Buffer Area
  ['IPO', 50],    // Incorporated Plan
  ['BFO', 50],    // Built Form
  ['VPO', 45],    // Vegetation Protection
  ['EMO', 40],    // Erosion Management
  ['ESO', 35],    // Environmental Significance
  ['EPO', 35],    // Environmental Protection
  ['HO', 30],     // Heritage Overlay
  ['FO', 20],     // Floodway
  ['SBO', 20],    // Salinity/Boom
  ['LSIO', 15],   // Land Subject to Inundation
  ['BMO', 15],    // Bushfire Management
  ['PBO', 15],    // Bushfire
  ['BSO', 15],    // Bushfire Safety
  ['BO', 10],     // Bushfire? Overlay
  ['EO', 10],     // Erosion/Extreme
  ['WO', 10],     // Wildfire
  ['LDR', 80],    // Low Density Residential control
]);
const OVERLAY_DEFAULT = 50;

// ── Vacancy rate → score ──
function vacancyScore(vacancyRate) {
  if (vacancyRate == null) return 50;
  if (vacancyRate < 1) return 100;
  if (vacancyRate <= 2) return 85;
  if (vacancyRate <= 3) return 60;
  if (vacancyRate <= 5) return 40;
  return 20;
}

// ── Population growth score (from census comparison) ──
function popGrowthScore(pctChange) {
  if (pctChange == null) return 50;
  if (pctChange > 5) return 100;
  if (pctChange >= 2) return 75;
  if (pctChange >= 0) return 50;
  return 20;
}

// ── Supply constraint score ──
function supplyScore(housingPerCapita, zoneCode) {
  let s = 50;
  if (housingPerCapita != null) {
    if (housingPerCapita < 0.35) s = 85;
    else if (housingPerCapita < 0.45) s = 70;
    else if (housingPerCapita < 0.55) s = 50;
    else if (housingPerCapita < 0.65) s = 35;
    else s = 25;
  }
  // NRZ/LDRZ penalise supply elasticity
  if (zoneCode === 'NRZ' || zoneCode === 'LDRZ' || zoneCode === 'RLZ') s = Math.max(10, s - 10);
  return s;
}

// ── Growth Demand Vacancy (5%) ──
function growthDemandVacancyScore(metrics, zoneCode) {
  const v = vacancyScore(metrics.vacancy_rate_adjusted) * 0.40;
  const p = popGrowthScore(metrics.population_growth || metrics.pop_growth_pct) * 0.30;
  const s = supplyScore(metrics.supply_housing_per_capita, zoneCode) * 0.30;
  return Math.round(v + p + s);
}

// ── Infrastructure score (0-100) ──
function infraScore(infrastructureScore) {
  if (infrastructureScore == null) return 50;
  return Math.round(Math.min(100, Math.max(0, infrastructureScore)));
}

// ── Parcel size score (5%) ──
// Default suburb-level estimate from dwelling density + land type.
// Property-level when coordinates available.
function parcelSizeScore(parcelSqm) {
  if (parcelSqm == null) return 50;
  if (parcelSqm > 2000) return 100;
  if (parcelSqm >= 1000) return 85;
  if (parcelSqm >= 600) return 70;
  if (parcelSqm >= 400) return 50;
  if (parcelSqm >= 200) return 30;
  return 10;
}

// ── Heritage level score ──
function heritageLevelScore(heritageStatus) {
  switch (heritageStatus) {
    case 'state': return 10;   // VHR — extreme limitation
    case 'both': return 5;     // HO + VHR
    case 'local': return 50;   // HO only
    case 'none': return 100;
    default: return 100;
  }
}

// ── Determine heritage level from planning cache heritage overlay + VHR ──
// Returns: 'state' | 'local' | 'both' | 'none'
function determineHeritageLevel(planningOverlayCodes, vhrFlag) {
  const hasHO = planningOverlayCodes.some(c => c === 'HO' || c.startsWith('HO'));
  if (hasHO && vhrFlag) return 'both';
  if (vhrFlag) return 'state';
  if (hasHO) return 'local';
  return 'none';
}

// ── Zoning score ──
function zoningScore(zoneCode) {
  if (!zoneCode) return ZONE_DEFAULT;
  // Normalise: 'GRZ1' → 'GRZ', 'MUZ-3' → 'MUZ', 'C1Z' → 'C1Z'
  const norm = zoneCode.replace(/[\d-].*$/, '');
  const known = zoneCode.replace(/[\d-].*$/, '').toUpperCase();
  // Try full code first, then normalised
  return ZONE_SCORES[zoneCode.toUpperCase()] || ZONE_SCORES[known] || ZONE_SCORES[norm] || ZONE_DEFAULT;
}

// ── Overlay penalty score (lowest = most restrictive) ──
function overlaysScore(overlayCodes) {
  if (!overlayCodes || overlayCodes.length === 0) return 100;
  let minScore = 100;
  for (const code of overlayCodes) {
    const c = code.replace(/[\d-].*$/, '').toUpperCase();
    const score = OVERLAY_PENALTY.get(c) || OVERLAY_PENALTY.get(code.toUpperCase()) || OVERLAY_DEFAULT;
    if (score < minScore) minScore = score;
  }
  return minScore;
}

// ── Confidence Score (0-100) ──
export function computeConfidenceScore(metrics = {}) {
  // Comps count (30%) — fall back to comparable_sales_3yr if present, else estimate via growth_1y presence
  const compCount = Number(metrics.comparable_sales_3yr) || (metrics.median_house_price != null && metrics.growth_1y != null ? 30 : 0);
  const compScore = compCount >= 50 ? 100 : compCount >= 20 ? 80 : compCount >= 10 ? 60 : compCount >= 3 ? 40 : 20;

  // Data field fill rate (25%)
  const FIELD_CHECKS = [
    'median_house_price', 'median_unit_price', 'median_combined_price',
    'median_rent', 'school_score', 'gross_yield', 'vacancy_rate_adjusted',
    'growth_1y', 'undervaluation'
  ];
  const filled = FIELD_CHECKS.filter(f => metrics[f] != null).length;
  const fillScore = Math.round(filled / FIELD_CHECKS.length * 100);

  // Vacancy source reliability (15%)
  // Real if vacancy_rate_adjusted differs from base vacancy_rate (indicates zone-adjusted), or is under 10%
  const vacReal = metrics.vacancy_rate_adjusted != null && metrics.vacancy_rate != null &&
    (String(metrics.vacancy_rate_adjusted) !== String(metrics.vacancy_rate));
  const vacScore = vacReal ? 100 : 40;

  // Growth data freshness (15%) — use presence of recent growth projections as proxy
  const hasRecentGrowth = metrics.growth_1y != null || metrics.growth_3y != null;
  const hasVGV = metrics.vgv_cagr_10y != null;
  const freshnessScore = hasRecentGrowth && hasVGV ? 100 : hasRecentGrowth ? 70 : 40;

  // Census completeness (15%) — use actual DB column names
  const censusChecks = ['population_growth', 'population_2021', 'dwelling_total', 'dwelling_separate_house', 'dwelling_occupancy_rate'];
  const censusFilled = censusChecks.filter(f => metrics[f] != null).length;
  const censusScore = Math.round(censusFilled / censusChecks.length * 100);

  return Math.round(compScore * 0.30 + fillScore * 0.25 + vacScore * 0.15 + freshnessScore * 0.15 + censusScore * 0.15);
}

// ── Main: compute development score for a suburb (from suburb_metrics) ──
export async function computeDevelopmentScore(suburb, state = 'VIC') {
  const db = sql();
  const rows = await db`
    SELECT * FROM suburb_metrics WHERE suburb = ${suburb} AND state = ${state} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const m = rows[0];
  return computeDevelopmentScoreFromMetrics(m);
}

// ── Development score from already-loaded metrics object ──
// For use within the valuation pipeline without extra DB query.
export function computeDevelopmentScoreFromMetrics(m) {
  const zoneCode = m.primary_zone_code || m.zone_code || m.zone_name || null;
  const overlayCodes = parseOverlayCodes(m.overlays || m.planning_overlay_codes || null);
  const hLevel = determineHeritageLevel(
    overlayCodes,
    m.vhr_flagged || m.heritage_vhr_flag || false
  );

  // Zoning (35%)
  const zs = zoningScore(zoneCode);

  // Overlays (20%)
  const os = overlaysScore(overlayCodes);

  // Heritage (15%)
  const hs = heritageLevelScore(hLevel);

  // Growth Demand Vacancy (5%)
  const gdvs = growthDemandVacancyScore(m, zoneCode);

  // Infrastructure (10%)
  const inf = infraScore(m.infrastructure_score);

  // Parcel size (5%) — use suburb average from dwelling density if no property-level data
  const ps = parcelSizeScore(m.parcel_size_sqm || m.avg_parcel_size_sqm || null);

  // Weighted total
  const total = Math.round(zs * 0.35 + os * 0.20 + hs * 0.15 + gdvs * 0.10 + inf * 0.10 + ps * 0.10);

  const conf = computeConfidenceScore(m);

  return {
    developmentScore: Math.min(100, Math.max(0, total)),
    developmentLabel: labelScore(total),
    confidenceScore: conf,
    confidenceLabel: conf >= 90 ? 'High' : conf >= 70 ? 'Moderate' : conf >= 50 ? 'Low' : 'Very Low',
    components: { zoning: zs, overlays: os, heritage: hs, growthDemandVacancy: gdvs, infrastructure: inf, parcelSize: ps },
    heritageLevel: hLevel,
    modelVersion: 'dev_intel_v1',
  };
}

function labelScore(s) {
  if (s >= 80) return 'High';
  if (s >= 60) return 'Moderate-High';
  if (s >= 40) return 'Moderate';
  if (s >= 20) return 'Low';
  return 'Very Low';
}

function parseOverlayCodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(o => typeof o === 'string' ? o : (o.code || o.name || ''));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(o => typeof o === 'string' ? o : (o.code || o.name || ''));
      return [];
    } catch { return [raw]; }
  }
  if (typeof raw === 'object') return [raw.code || raw.name || ''].filter(Boolean);
  return [];
}

export { zoningScore, overlaysScore, heritageLevelScore, parcelSizeScore, growthDemandVacancyScore, infraScore };
