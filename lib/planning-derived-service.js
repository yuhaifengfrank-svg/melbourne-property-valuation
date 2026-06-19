/**
 * planning-derived-service.js — Phase 0
 *
 * Pure function library for building derived planning records.
 * No geometry returned. No DB writes in this file (writes delegated to caller).
 * All functions are synchronous pure functions (except where sql is passed for INSERT).
 *
 * Heritage status defaults: unknown/partial only — never 'known' without explicit input.
 * No approval/subdivision language.
 */

const HERITAGE_VALUES = ["known", "partial", "unknown"];
const CONSTRAINT_VALUES = ["low", "medium", "high", "unknown"];
const FLEXIBILITY_VALUES = ["favourable", "mixed", "constrained", "unknown"];

/**
 * Derive a simplified constraint summary from planning signals.
 * @param {object} planningSignals — output of getPlanningSignals()
 * @returns {object} { constraintLevel, flexibilityHint, heritageStatus, manualReview }
 */
export function derivePlanningConstraintSummary(planningSignals) {
  if (!planningSignals || !planningSignals.ok) {
    return {
      constraintLevel: "unknown",
      flexibilityHint: "unknown",
      heritageStatus: "unknown",
      manualReviewRequired: true,
    };
  }

  const constraintLevel = planningSignals.planningConstraintLevel || "unknown";
  const flexibilityHint = planningSignals.redevelopmentFlexibilityHint || "unknown";

  // Heritage can only be flagged if overlays include HO-category overlays.
  // In Phase 0, HO is NOT imported, so default is "unknown".
  const hasHeritageOverlay = (planningSignals.overlays || []).some(
    (o) => o.category === "heritage"
  );
  const heritageStatus = hasHeritageOverlay ? "partial" : "unknown";

  const manualReviewRequired =
    planningSignals.manualReviewRequired || constraintLevel === "high" || heritageStatus === "partial";

  return { constraintLevel, flexibilityHint, heritageStatus, manualReviewRequired };
}

/**
 * Validate and cap a planning component score.
 * @param {number} score
 * @returns {number} — capped to [-15, 15]
 */
export function validatePlanningComponentScore(score) {
  if (typeof score !== "number" || isNaN(score)) return 0;
  return Math.max(-15, Math.min(15, Math.round(score)));
}

/**
 * Build a property_planning_cache record (plain object).
 * @param {object} params
 * @returns {object} — ready for INSERT
 */
export function buildPropertyPlanningCacheRecord(params) {
  const {
    propertyKey,
    address,
    suburb,
    state = "VIC",
    lat,
    lng,
    planningSignals,
    sourceMeta = {},
    ttlHours = 48,
  } = params;

  if (!propertyKey) {
    throw new Error("planning-derived: propertyKey is required");
  }

  const summary = derivePlanningConstraintSummary(planningSignals);
  const zone = planningSignals?.zone || null;
  const rawScore = planningSignals
    ? (planningSignals.ok
        ? calcComponentScore(planningSignals)
        : 0)
    : null;
  const componentScore = rawScore !== null ? validatePlanningComponentScore(rawScore) : null;

  const overlayCodes = (planningSignals?.overlays || []).map((o) => o.code);

  const expiresAt = ttlHours > 0
    ? new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
    : null;

  return {
    property_key: propertyKey,
    address: address || null,
    suburb: suburb || null,
    state,
    lat: lat != null ? lat : null,
    lng: lng != null ? lng : null,
    zone_code: zone?.code || null,
    zone_category: zone?.category || null,
    zone_flexibility: zone?.category
      ? inferFlex(zone.category)
      : null,
    overlay_codes: overlayCodes.length > 0 ? overlayCodes : null,
    planning_constraint_level: summary.constraintLevel,
    redevelopment_flexibility_hint: summary.flexibilityHint,
    planning_component_score: componentScore,
    heritage_status: summary.heritageStatus,
    manual_review_required: summary.manualReviewRequired,
    limitations: planningSignals?.limitations || [],
    source_key: sourceMeta.source_key || null,
    source_version: sourceMeta.source_version || null,
    derived_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
}

/**
 * Build a suburb_planning_summary record from a list of planning signals.
 * @param {object} params
 * @returns {object} — ready for INSERT
 */
export function buildSuburbPlanningSummaryRecord(params) {
  const {
    suburb,
    state = "VIC",
    lga,
    planningSignalsList = [],
    sourceMeta = {},
  } = params;

  if (!suburb) {
    throw new Error("planning-derived: suburb is required");
  }

  // Aggregate from multiple planning signals (1 per property in suburb)
  const zoneCodes = planningSignalsList
    .filter((ps) => ps.ok && ps.zone)
    .map((ps) => ps.zone.code);
  const dominantZone = zoneCodes.length > 0 ? modeString(zoneCodes) : null;
  const catInfo = dominantZone ? resolveZoneCategory(dominantZone) : null;

  // All overlay codes across all signals
  const allOverlayCodes = planningSignalsList
    .filter((ps) => ps.ok)
    .flatMap((ps) => (ps.overlays || []).map((o) => o.code));

  const uniqueOverlayCodes = [...new Set(allOverlayCodes)];

  const overlays = planningSignalsList
    .filter((ps) => ps.ok)
    .flatMap((ps) => ps.overlays || []);

  return {
    suburb,
    state,
    lga: lga || null,
    dominant_zone_code: dominantZone,
    dominant_zone_category: catInfo?.category || null,
    dominant_zone_flexibility: catInfo?.flexibility || null,
    overlay_count: uniqueOverlayCodes.length,
    overlay_codes: uniqueOverlayCodes.length > 0 ? uniqueOverlayCodes : null,
    has_design_overlay: overlays.some((o) => o.category === "design"),
    has_flood_overlay: overlays.some((o) =>
      ["flood", "floodway", "inundation"].includes(o.category)
    ),
    has_bushfire_overlay: overlays.some((o) => o.category === "bushfire"),
    has_environment_overlay: overlays.some((o) =>
      ["environmental-significance", "environmental-audit"].includes(o.category)
    ),
    has_development_plan_overlay: overlays.some((o) => o.category === "development-plan"),
    heritage_status: overlays.some((o) => o.category === "heritage") ? "partial" : "unknown",
    planning_constraint_level: deriveAggregateConstraint(planningSignalsList),
    redevelopment_flexibility_score: deriveAggregateFlexibility(planningSignalsList),
    manual_review_required: true,
    source_key: sourceMeta.source_key || null,
    source_version: sourceMeta.source_version || null,
    derived_at: new Date().toISOString(),
  };
}

// ── Internal helpers ──

function modeString(arr) {
  if (!arr.length) return null;
  const freq = {};
  let maxFreq = 0;
  let mode = arr[0];
  for (const s of arr) {
    freq[s] = (freq[s] || 0) + 1;
    if (freq[s] > maxFreq) {
      maxFreq = freq[s];
      mode = s;
    }
  }
  return mode;
}

function resolveZoneCategory(code) {
  const map = {
    GRZ: "residential", NRZ: "residential", RGZ: "residential",
    LDRZ: "residential", RLZ: "residential", MUZ: "mixed-use",
    C1Z: "commercial", C2Z: "commercial", CCZ: "commercial",
    IN1Z: "industrial", IN2Z: "industrial", IN3Z: "industrial",
    UGZ: "growth", PDZ: "growth", DZ: "mixed-use",
    FZ: "rural", TZ: "rural",
    SUZ: "special", PZ: "special",
  };
  // Try prefix
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (code.startsWith(key)) {
      return { category: map[key], flexibility: inferFlex(map[key]) };
    }
  }
  return { category: "unknown", flexibility: "unknown" };
}

function inferFlex(category) {
  const fav = ["residential", "mixed-use", "growth"];
  const constrained = ["rural", "public"];
  if (fav.includes(category)) return "favourable";
  if (constrained.includes(category)) return "constrained";
  return "mixed";
}

function calcComponentScore(planningSignals) {
  // Simplified version of computePlanningComponent for derived records
  let score = 0;
  const zone = planningSignals.zone;
  const overlays = planningSignals.overlays || [];
  const hint = planningSignals.redevelopmentFlexibilityHint;

  if (zone && ["residential", "mixed-use", "growth"].includes(zone.category)) {
    if (hint === "favourable") score += 12;
    else if (hint === "mixed") score += 6;
    else score += 3;
  }

  if (overlays.length > 0) {
    const highRisk = overlays.filter((o) => o.riskLevel === "high").length;
    const medRisk = overlays.filter((o) => o.riskLevel === "medium").length;
    score -= Math.min(15, highRisk * 8 + medRisk * 3);
  }

  return Math.max(-15, Math.min(15, score));
}

function deriveAggregateConstraint(list) {
  if (!list || list.length === 0) return "unknown";
  const levels = list
    .filter((ps) => ps.ok && ps.planningConstraintLevel)
    .map((ps) => ps.planningConstraintLevel);
  if (levels.length === 0) return "unknown";
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

function deriveAggregateFlexibility(list) {
  if (!list || list.length === 0) return null;
  const scores = list
    .filter((ps) => ps.ok && ps.zone)
    .map((ps) => calcComponentScore(ps));

  if (scores.length === 0) return null;
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return validatePlanningComponentScore(avg);
}
