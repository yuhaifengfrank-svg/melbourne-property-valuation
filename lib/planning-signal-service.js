/**
 * planning-signal-service.js
 *
 * Read-only planning signal service.
 *
 * Architecture:
 *   1. First tries planning_cache (pre-computed 11m-grid snapshots, ~1.9MB)
 *   2. Falls back to real-time ST_Contains on vicplan_zones / vicplan_overlays
 *
 * This allows the 248 MB VicPlan tables to be removed from Production Neon
 * once all cache entries have been generated and validated.
 *
 * No geometry returned. No approval advice. No scoring formula here.
 */

const CATEGORY_MAP = {
  // Residential
  GRZ: { category: "residential", flexibility: "favourable" },
  NRZ: { category: "residential", flexibility: "constrained" },
  RGZ: { category: "residential", flexibility: "favourable" },
  LDRZ: { category: "residential", flexibility: "constrained" },
  RLZ: { category: "residential", flexibility: "constrained" },
  MUZ: { category: "mixed-use", flexibility: "favourable" },
  HCTZ: { category: "residential", flexibility: "favourable" },
  // Commercial
  C1Z: { category: "commercial", flexibility: "mixed" },
  C2Z: { category: "commercial", flexibility: "mixed" },
  B1Z: { category: "commercial", flexibility: "mixed" },
  B2Z: { category: "commercial", flexibility: "mixed" },
  B3Z: { category: "commercial", flexibility: "mixed" },
  ACZ: { category: "commercial", flexibility: "mixed" },
  CCZ: { category: "commercial", flexibility: "mixed" },
  // Industrial
  IN1Z: { category: "industrial", flexibility: "mixed" },
  IN2Z: { category: "industrial", flexibility: "mixed" },
  IN3Z: { category: "industrial", flexibility: "mixed" },
  // Growth / Future
  UGZ: { category: "growth", flexibility: "favourable" },
  PDZ: { category: "growth", flexibility: "favourable" },
  DZ: { category: "mixed-use", flexibility: "favourable" },
  // Public
  PPRZ: { category: "public", flexibility: "constrained" },
  PCRZ: { category: "public", flexibility: "constrained" },
  PUZ: { category: "public", flexibility: "constrained" },
  // Rural
  FZ: { category: "rural", flexibility: "constrained" },
  TZ: { category: "rural", flexibility: "mixed" },
  RAZ: { category: "rural", flexibility: "constrained" },
  RCZ: { category: "rural", flexibility: "constrained" },
  GWZ: { category: "rural", flexibility: "constrained" },
  GWAZ: { category: "rural", flexibility: "constrained" },
  // Special
  SUZ: { category: "special", flexibility: "mixed" },
  UFZ: { category: "special", flexibility: "constrained" },
  CA: { category: "public", flexibility: "constrained" },
  PZ: { category: "special", flexibility: "constrained" },
};

const OVERLAY_CATEGORY = {
  HO: { category: "heritage", risk: "high" },
  DDO: { category: "design", risk: "medium" },
  SLO: { category: "landscape", risk: "medium" },
  BMO: { category: "bushfire", risk: "high" },
  SBO: { category: "flood", risk: "high" },
  LSIO: { category: "inundation", risk: "medium" },
  FO: { category: "floodway", risk: "high" },
  EMO: { category: "erosion", risk: "medium" },
  EAO: { category: "environmental-audit", risk: "high" },
  ESO: { category: "environmental-significance", risk: "medium" },
  DPO: { category: "development-plan", risk: "medium" },
  IPO: { category: "incorporated-plan", risk: "medium" },
  PAO: { category: "public-acquisition", risk: "high" },
  PBO: { category: "bushfire", risk: "high" },
  BFO: { category: "built-form", risk: "medium" },
  DCPO: { category: "development-contributions", risk: "low" },
  CLPO: { category: "transport-project", risk: "medium" },
  AEO: { category: "airport-environs", risk: "medium" },
  BAO: { category: "buffer-area", risk: "medium" },
};

const ZONE_INTERPRETATIONS = {
  residential_favourable: "Residential zoning confirmed; standard residential controls may apply.",
  residential_constrained: "Lower-density residential controls may apply.",
  growth_favourable: "Higher-density residential growth intent may apply.",
  "mixed-use_favourable": "Mixed residential/commercial use context may apply.",
  commercial_mixed: "Commercial zone identified. Residential use may be restricted or require a permit.",
  industrial_mixed: "Non-residential zoning may materially affect residential assumptions.",
  public_constrained: "Public or institutional land — residential use generally not permitted.",
  rural_constrained: "Rural zone — residential development generally limited.",
  special_mixed: "Special use zone — specific planning controls apply.",
};

const OVERLAY_INTERPRETATIONS = {
  heritage: "Heritage controls may affect redevelopment. Note: Heritage Overlay data is not fully covered in the current dataset.",
  design: "Built form or design constraints may apply.",
  landscape: "Landscape significance or vegetation protection controls may apply.",
  bushfire: "Bushfire planning controls may apply.",
  flood: "Flood or drainage-related controls may apply.",
  inundation: "Flood-related constraints may apply.",
  floodway: "Severe flood constraints — development heavily restricted.",
  erosion: "Erosion management controls may apply.",
  "environmental-audit": "Environmental audit may be required before redevelopment.",
  "environmental-significance": "Environmental constraints may apply.",
  "development-plan": "A development plan control applies. Manual planning review is required.",
  "incorporated-plan": "Site-specific development controls apply.",
  "public-acquisition": "Land may be subject to public acquisition.",
  "built-form": "Built form controls (height, setbacks) may apply.",
  "development-contributions": "Developer contribution requirements may apply.",
  "transport-project": "Transport project overlay — specific controls may apply.",
  "airport-environs": "Airport-related noise or building height controls may apply.",
  "buffer-area": "Buffer area controls may apply.",
};

/**
 * Extract the base prefix (letters only) from a zone/overlay code.
 * E.g., "GRZ1" → "GRZ", "DDO8" → "DDO", "IN1Z" → "IN1Z" (no stripping)
 * Actually for zone codes like IN1Z, the prefix is IN — treat carefully.
 * Best approach: match against CATEGORY_MAP keys.
 */
function resolveCategory(code, map) {
  if (!code || typeof code !== "string") return null;
  // Try exact match first
  if (map[code]) return map[code];
  // Try prefix: match longest key first
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (code.startsWith(key)) return map[key];
  }
  return null;
}

/**
 * Determine overall planning constraint level from zone + overlays.
 */
function determineConstraintLevel(zoneCategory, overlays) {
  if (!zoneCategory || zoneCategory.category === "public" || zoneCategory.category === "rural") {
    return "high";
  }
  // High risk overlays → high constraint
  const hasHighRisk = overlays.some((o) => o.riskLevel === "high");
  if (hasHighRisk) return "high";
  const hasMediumRisk = overlays.some((o) => o.riskLevel === "medium");
  if (hasMediumRisk) return "medium";
  // Zone flexibility
  if (zoneCategory.flexibility === "favourable") return "low";
  if (zoneCategory.flexibility === "constrained") return "medium";
  return "low";
}

/**
 * Determine redevelopment flexibility hint.
 */
function determineFlexibilityHint(zoneCategory, overlays, constraintLevel) {
  if (!zoneCategory) return "unknown";
  if (constraintLevel === "high") return "constrained";
  if (constraintLevel === "medium") return "mixed";
  if (zoneCategory.flexibility === "favourable") return "favourable";
  if (zoneCategory.flexibility === "constrained") return "mixed";
  return "unknown";
}

/**
 * Build conservative interpretation text for a zone.
 */
function buildZoneInterpretation(zoneCategory) {
  if (!zoneCategory) return "Zone category could not be determined.";
  const key = `${zoneCategory.category}_${zoneCategory.flexibility}`;
  return ZONE_INTERPRETATIONS[key] || "Planning zone identified. Specific controls may apply.";
}

/**
 * Build conservative interpretation text for an overlay.
 */
function buildOverlayInterpretation(overlayCode) {
  const catInfo = resolveCategory(overlayCode, OVERLAY_CATEGORY);
  if (!catInfo) return null;
  return OVERLAY_INTERPRETATIONS[catInfo.category] || "Overlay controls may apply.";
}

/**
 * Main function: query planning signals for a lat/lng point.
 *
 * @param {object} sql - Neon tagged-template SQL client
 * @param {number} lat
 * @param {number} lng
 * @returns {object} structured planning signal (see below)
 */
export async function getPlanningSignals(sql, lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return {
      ok: false,
      source: "vicplan_zones_overlays",
      zone: null,
      overlays: [],
      planningConstraintLevel: "unknown",
      redevelopmentFlexibilityHint: "unknown",
      manualReviewRequired: true,
      limitations: ["Invalid coordinates provided.", "Heritage Overlay is not fully covered in the current dataset.", "Planning signals are not development approval advice."],
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    // ── Step 1: Try planning_cache (pre-computed, ~1.9 MB) ──
    // Use range match (±0.0015 degrees ≈ ~170m) instead of exact key match,
    // because Nominatim geocoding can return slightly different coordinates
    // depending on request origin (Vercel US-East vs local Melbourne).
    const cached = await sql`
      SELECT * FROM planning_cache
      WHERE ABS(latitude::numeric - ${lat}) < 0.003
        AND ABS(longitude::numeric - ${lng}) < 0.003
      ORDER BY ABS(latitude::numeric - ${lat}) + ABS(longitude::numeric - ${lng})
      LIMIT 1
    `;

    if (cached.length > 0) {
      const c = cached[0];
      let overlaysArr = [];
      try {
        if (typeof c.overlays === 'string') overlaysArr = JSON.parse(c.overlays);
        else if (c.overlays && Array.isArray(c.overlays)) overlaysArr = c.overlays;
        else if (c.overlays) overlaysArr = [c.overlays];
      } catch (_) { overlaysArr = []; }
      return {
        ok: c.zone_code != null,
        source: "planning_cache",
        zone: c.zone_code ? {
          code: c.zone_code,
          name: c.zone_name,
          category: c.zone_category,
          interpretation: c.zone_interpretation,
          confidence: c.zone_confidence,
        } : null,
        overlays: overlaysArr,
        planningConstraintLevel: c.constraint_level,
        redevelopmentFlexibilityHint: c.flexibility_hint,
        manualReviewRequired: c.manual_review_required,
        limitations: [
          "Heritage Overlay is not fully covered in the current dataset.",
          "Planning signals are not development approval advice.",
        ],
        fetchedAt: new Date().toISOString(),
      };
    }

    // ── Step 2: Fallback — real-time ST_Contains queries ──
    const zones = await sql`
      SELECT zone_code, zone_description, lga
      FROM vicplan_zones
      WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1
    `;

    const overlaysRaw = await sql`
      SELECT zone_code, zone_description
      FROM vicplan_overlays
      WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    `;

    const zoneResult = zones.length > 0 ? buildZoneResult(zones[0]) : null;
    const overlayResults = overlaysRaw.map(buildOverlayResult);
    const constraintLevel = determineConstraintLevel(
      zoneResult ? zoneResult.categoryInfo : null,
      overlayResults
    );
    const flexibilityHint = determineFlexibilityHint(
      zoneResult ? zoneResult.categoryInfo : null,
      overlayResults,
      constraintLevel
    );

    const limitations = [
      "Heritage Overlay is not fully covered in the current dataset.",
      "Planning signals are not development approval advice.",
    ];

    // ── Step 3: Write back to planning_cache for future hits ──
    if (zones.length > 0) {
      try {
        const z = zones[0];
        // Build lat_lon_key with 4-decimal precision
        const pad4 = (n) => { const s = Math.abs(n).toFixed(4); return (n < 0 ? '-' : '') + s.padStart(7, '0'); };
        const key = pad4(lat) + '_' + pad4(lng);
        const manualReview = overlaysRaw.length > 1;
        const overlaysJson = overlaysRaw.length > 0 ? JSON.stringify(overlaysRaw.map(o => ({code: o.zone_code, name: o.zone_description}))) : null;

        await sql`
          INSERT INTO planning_cache
            (lat_lon_key, latitude, longitude, zone_code, zone_name,
             constraint_level, flexibility_hint, overlays, manual_review_required, source_version)
          VALUES (
            ${key},
            ${lat},
            ${lng},
            ${z.zone_code},
            ${z.zone_description},
            ${constraintLevel},
            ${flexibilityHint},
            ${overlaysJson}::jsonb,
            ${manualReview},
            'auto-backfill-v1'
          )
          ON CONFLICT (lat_lon_key) DO NOTHING
        `;
      } catch (writeErr) {
        // Non-critical: cache write failure should not break the response
        console.error('[planning-signal-service] Cache write-back failed:', writeErr.message);
      }
    }

    return {
      ok: zones.length > 0,
      source: "vicplan_zones_overlays",
      zone: zoneResult ? {
        code: zoneResult.code,
        name: zoneResult.name,
        category: zoneResult.category,
        interpretation: zoneResult.interpretation,
        confidence: zoneResult.confidence,
      } : null,
      overlays: overlayResults,
      planningConstraintLevel: constraintLevel,
      redevelopmentFlexibilityHint: flexibilityHint,
      manualReviewRequired: zoneResult ? zoneResult.manualReviewRequired : true,
      limitations,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[planning-signal-service] Query error:", err.message);
    console.error(JSON.stringify({hasDb: !!process.env.DATABASE_URL, dbPrefix: (process.env.DATABASE_URL||'').substring(0,40)}));
    return {
      ok: false,
      source: "planning_cache_fallback",
      _error: err.message,
      zone: null,
      overlays: [],
      planningConstraintLevel: "unknown",
      redevelopmentFlexibilityHint: "unknown",
      manualReviewRequired: true,
      limitations: [
        "Planning data temporarily unavailable.",
        "Heritage Overlay is not fully covered in the current dataset.",
        "Planning signals are not development approval advice.",
      ],
      fetchedAt: new Date().toISOString(),
    };
  }
}

function buildZoneResult(row) {
  const catInfo = resolveCategory(row.zone_code, CATEGORY_MAP);
  return {
    code: row.zone_code,
    name: row.zone_description,
    category: catInfo ? catInfo.category : "unknown",
    interpretation: buildZoneInterpretation(catInfo),
    confidence: catInfo ? "medium" : "low",
    manualReviewRequired: !catInfo,
    categoryInfo: catInfo,
  };
}

function buildOverlayResult(row) {
  const catInfo = resolveCategory(row.zone_code, OVERLAY_CATEGORY);
  const interpretation = catInfo
    ? buildOverlayInterpretation(row.zone_code)
    : "Overlay identified. Specific controls may apply.";
  return {
    code: row.zone_code,
    name: row.zone_description,
    category: catInfo ? catInfo.category : "unknown",
    interpretation: interpretation || "Overlay controls may apply.",
    riskLevel: catInfo ? catInfo.risk : "medium",
  };
}

/**
 * Compute basic planning component for property_specific_score.
 * Returns a sub-score (-15 to +15).
 *
 * Rules:
 * - Zone flexibility bonus: +0 to +12
 * - Overlay constraint penalty: -0 to -15 (with additional unknown overlay penalty of -2)
 * - Missing data: confidence lowered, score 0
 * - Heritage limitation: always reduces confidence
 */
export function computePlanningComponent(planningSignals) {
  if (!planningSignals || !planningSignals.ok) {
    return { score: 0, confidence: "low", components: {} };
  }

  const { zone, overlays, planningConstraintLevel, redevelopmentFlexibilityHint } = planningSignals;
  let score = 0;
  const components = {};

  // Zone flexibility (max +15)
  if (zone && ["residential", "mixed-use", "growth"].includes(zone.category)) {
    switch (redevelopmentFlexibilityHint) {
      case "favourable":
        score += 12;
        components.zoneFlexibility = 12;
        break;
      case "mixed":
        score += 6;
        components.zoneFlexibility = 6;
        break;
      default:
        score += 3;
        components.zoneFlexibility = 3;
    }
  } else if (zone) {
    // Non-residential zone: lower score, but still some signal
    score += 2;
    components.zoneFlexibility = 2;
  }

  // Overlay constraint penalty (max -15)
  if (overlays && overlays.length > 0) {
    const highRisk = overlays.filter((o) => o.riskLevel === "high").length;
    const mediumRisk = overlays.filter((o) => o.riskLevel === "medium").length;
    const penalty = Math.min(15, highRisk * 8 + mediumRisk * 3);
    score -= penalty;
    components.overlayPenalty = -penalty;

    // If any overlay category is unknown, penalty
    const unknown = overlays.filter((o) => o.category === "unknown").length;
    if (unknown > 0) {
      score -= 2;
      components.unknownOverlayPenalty = -2;
    }
  }

  // Cap: -15 to +15
  score = Math.max(-15, Math.min(15, score));

  // Cap at 0 if used as bonus-only (no negative scores in absolute)
  // But for property_specific_score, negative should reduce the score
  // We'll keep raw range -15 to +15 and let caller normalize

  // Confidence
  let confidence = "medium";
  if (!zone || planningSignals.manualReviewRequired) {
    confidence = "low";
  }
  if (score >= 0 && score <= 5) confidence = "medium";
  if (score > 5 || score < -5) confidence = "medium";

  return {
    score, // range: -15 to +15
    confidence,
    components,
    propertyZoneCategory: zone?.category || "unknown",
    overlayCount: overlays?.length || 0,
  };
}

// Private: zone result with internal category info stripped before returning
export { buildZoneResult, buildOverlayResult, determineConstraintLevel, determineFlexibilityHint,
         ZONE_INTERPRETATIONS, OVERLAY_INTERPRETATIONS };
