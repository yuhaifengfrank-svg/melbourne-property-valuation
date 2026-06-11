// ── lib/personalised-opportunity-ranking.js ──
// Phase 1B: Independent pure-function scoring engine for personalised Top 10.
//
// RULES:
// - Base score + capped adjustments only
// - Cumulative adjustment never exceeds ±12 points
// - NO static/fabricated data
// - NO growth_3y or growth_1y in reasons/risk text
// - Data-source failures return 0 items, not fallback suburbs
// - state/budget/propertyType filters applied before ranking
//
// This module is called AFTER /api/opportunity (with strategy=smart)
// returns its raw results. This module re-ranks by user's goal.

/**
 * Rank suburbs by personalised criteria.
 * @param {Array} opportunities - Raw suburbs from /api/opportunity?strategy=smart
 * @param {Object} preferences - { goal, property_type, state, budget_min, budget_max }
 * @returns {Array} Top 10 with personalised scores
 */
export function rankPersonalised(opportunities, preferences) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return [];
  }

  const goal = (preferences.goal || "balanced").toLowerCase();
  const propertyType = (preferences.property_type || "").toLowerCase();
  const state = (preferences.state || "").toLowerCase();
  const budgetMin = Number(preferences.budget_min) || 0;
  const budgetMax = Number(preferences.budget_max) || Infinity;

  // Step 1: Filter by state, property type, budget
  let filtered = opportunities.filter((suburb) => {
    // State filter
    if (state && (suburb.state || "").toLowerCase() !== state) {
      return false;
    }

    // Property type filter — use the median price for the relevant type
    // If user chose "unit", check medianUnitPrice; for house, medianHousePrice
    if (propertyType === "unit" && budgetMax < Infinity) {
      const price = Number(suburb.medianUnitPrice) || 0;
      if (price > 0 && (price < budgetMin || price > budgetMax)) return false;
    } else if (propertyType === "house" && budgetMax < Infinity) {
      const price = Number(suburb.medianHousePrice) || 0;
      if (price > 0 && (price < budgetMin || price > budgetMax)) return false;
    }
    // townhouse — use house price as approximation
    else if (budgetMax < Infinity) {
      const price = Number(suburb.medianHousePrice) || 0;
      if (price > 0 && (price < budgetMin || price > budgetMax)) return false;
    }

    return true;
  });

  // Step 2: Score each filtered suburb
  const maxScore = Math.max(
    ...filtered.map((s) => Number(s.opportunityScore) || 0),
    1
  );

  const scored = filtered.map((suburb) => {
    const baseScore = Number(suburb.opportunityScore) || 0;

    const result = calculatePersonalisedScore(baseScore, suburb, {
      goal,
      maxScore,
    });

    return {
      suburb: suburb.suburb || "",
      state: suburb.state || "VIC",
      baseScore: Math.round(baseScore * 100) / 100,
      personalisedScore: Math.round(result.personalisedScore * 100) / 100,
      adjustment: Math.round(result.adjustment * 100) / 100,
      reason: generateReason(suburb, goal),
      risk: generateRisk(suburb),
      confidence: dataSourceConfidence(suburb),
      dataUpdated: suburb.dataUpdated || "",
      disclaimer:
        "The opportunity score is a relative ranking based on publicly available data and should not be used as financial advice.",
    };
  });

  // Step 3: Sort by personalised score descending, take top 10
  scored.sort((a, b) => b.personalisedScore - a.personalisedScore);
  return scored.slice(0, 10);
}

/**
 * Calculate personalised score.
 * adjustment is clamped to [-12, +12].
 *
 * @param {number} baseScore - Raw opportunity score (0-100)
 * @param {Object} suburb - Suburb metrics
 * @param {Object} opts - { goal, maxScore }
 * @returns {{ personalisedScore: number, adjustment: number }}
 */
export function calculatePersonalisedScore(baseScore, suburb, opts) {
  const goal = (opts.goal || "balanced").toLowerCase();
  const maxScore = opts.maxScore || 100;

  const rentalYield = Number(suburb.rentalYield) || 0;
  const schoolScore = Number(suburb.schoolScore) || 0;
  const comparableCount = Number(suburb.comparableCount) || 0;
  const vacancyRate = Number(suburb.vacancyRate) || 0;
  const supplyRatio = Number(suburb.supplyRatio) || 0;

  let adjustment = 0;

  // Goal bonus (capped per case)
  switch (goal) {
    case "growth": {
      // Use demand signals: low vacancy + low supply ratio + high comparable count
      const demandBonus =
        vacancyRate < 3 ? 2 : vacancyRate < 5 ? 1 : 0;
      const supplyBonus = supplyRatio > 0 && supplyRatio < 1 ? 1.5 : 0;
      const dataBonus = comparableCount >= 20 ? 0.5 : 0;
      adjustment += Math.min(demandBonus + supplyBonus + dataBonus, 4);
      break;
    }
    case "cashflow": {
      // Yield-driven: higher yield = higher bonus
      adjustment += Math.min(rentalYield * 2, 4);
      break;
    }
    case "school": {
      // School score importance
      adjustment += Math.min(schoolScore * 0.2, 4);
      break;
    }
    case "value": {
      // Value gap: lower score relative to max = more value opportunity
      const gap = maxScore > 0 ? (maxScore - baseScore) / maxScore : 0;
      adjustment += Math.min(gap * 3, 3);
      break;
    }
    case "balanced":
    default: {
      // Modest from each dimension
      adjustment += Math.min(rentalYield * 0.5 + schoolScore * 0.1, 3);
      break;
    }
  }

  // Yield adjustment (market reality — always applied)
  const yieldAdj = clamp(rentalYield / 5, -2, 2) - 0.4; // centre around 2% yield
  adjustment += yieldAdj;

  // Confidence adjustment
  if (comparableCount < 5) {
    adjustment -= 2;
  } else if (comparableCount < 10) {
    adjustment -= 1;
  }

  // Clamp cumulative adjustment to [-12, +12]
  adjustment = clamp(adjustment, -12, 12);

  const personalisedScore = baseScore + adjustment;

  return { personalisedScore, adjustment };
}

/**
 * Generate a reason string for the suburb.
 * NEVER uses growth_3y, growth_1y, or fabricated data.
 *
 * @param {Object} suburb - Suburb metrics
 * @param {string} goal - User's investment goal
 * @returns {string}
 */
export function generateReason(suburb, goal) {
  const rentalYield = Number(suburb.rentalYield) || 0;
  const schoolScore = Number(suburb.schoolScore) || 0;
  const vacancyRate = Number(suburb.vacancyRate) || 0;
  const supplyRatio = Number(suburb.supplyRatio) || 0;
  const comparableCount = Number(suburb.comparableCount) || 0;
  const medianHousePrice = Number(suburb.medianHousePrice) || 0;
  const medianUnitPrice = Number(suburb.medianUnitPrice) || 0;
  const medianPrice =
    medianHousePrice > 0
      ? medianHousePrice
      : medianUnitPrice > 0
      ? medianUnitPrice
      : 0;
  const priceDisplay =
    medianPrice > 0 ? `$${Math.round(medianPrice / 1000)}K` : "";

  switch (goal) {
    case "growth":
      return `Strong underlying demand signals${
        vacancyRate > 0 && vacancyRate < 3
          ? ` — low vacancy (${vacancyRate.toFixed(1)}%)`
          : ""
      }${
        supplyRatio > 0 && supplyRatio < 1
          ? ", limited new supply"
          : supplyRatio > 0 && supplyRatio > 1.2
          ? ", elevated new supply"
          : ""
      }${
        comparableCount >= 20 ? " with strong market data" : ""
      }`;
    case "cashflow":
      return `${rentalYield.toFixed(1)}% rental yield${
        rentalYield > 3
          ? " — above average for this market"
          : rentalYield > 2
          ? " — in line with market average"
          : " — below market average"
      }${priceDisplay ? `, median ${priceDisplay}` : ""}`;
    case "school":
      return `School catchment score ${schoolScore.toFixed(
        0
      )}/100 — ${
        schoolScore >= 70
          ? "above median"
          : schoolScore >= 50
          ? "at median"
          : "below median"
      }${priceDisplay ? `, median ${priceDisplay}` : ""}`;
    case "value":
      return `Relative value opportunity${
        priceDisplay ? ` — median ${priceDisplay}` : ""
      }${vacancyRate > 0 ? `, vacancy ${vacancyRate.toFixed(1)}%` : ""}`;
    case "balanced":
    default:
      return `Balanced fundamentals${
        rentalYield > 0 ? ` with ${rentalYield.toFixed(1)}% yield` : ""
      }${
        schoolScore > 0 ? ` and school score ${schoolScore.toFixed(0)}` : ""
      }`;
  }
}

/**
 * Generate a risk string for the suburb.
 * NEVER uses growth_3y or growth_1y.
 *
 * @param {Object} suburb - Suburb metrics
 * @returns {string}
 */
export function generateRisk(suburb) {
  const risks = [];
  const rentalYield = Number(suburb.rentalYield) || 0;
  const vacancyRate = Number(suburb.vacancyRate) || 0;
  const supplyRatio = Number(suburb.supplyRatio) || 0;
  const comparableCount = Number(suburb.comparableCount) || 0;

  if (rentalYield > 0 && rentalYield < 2.5) {
    risks.push("Low rental yield may indicate weak rental demand");
  }
  if (vacancyRate > 5) {
    risks.push("Above-average vacancy rate");
  }
  if (supplyRatio > 1.2) {
    risks.push("New supply may outpace demand");
  }
  if (comparableCount > 0 && comparableCount < 5) {
    risks.push("Limited market data — approach with caution");
  }
  if (risks.length === 0) {
    risks.push("Standard market risk profile");
  }
  return risks.join(" · ");
}

/**
 * Determine data source confidence level.
 */
export function dataSourceConfidence(suburb) {
  const count = Number(suburb.comparableCount) || 0;
  if (count >= 20) return "High";
  if (count >= 10) return "Medium";
  if (count > 0) return "Low";
  return "Very Low";
}

/**
 * Clamp a number between min and max.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
