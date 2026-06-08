const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOMER_RANGE = 0.15;

// ── 锚点估值模型 ──
// Step 1: comparables 只做时间调整 → 锚点
// Step 2: 因子修正（地块、街道、房间、市场动量、数据质量）

const TYPE_COMPATIBILITY = {
  House: new Set(["House"]),
  Townhouse: new Set(["Townhouse"]),
  Villa: new Set(["Villa", "Townhouse"]),
  Unit: new Set(["Unit", "Apartment", "Villa"]),
  Apartment: new Set(["Apartment", "Unit"]),
  "Vacant land": new Set(["Vacant land", "Land"])
};

// ── 因子修正 cap 限额 ──
const FACTOR_CAPS = {
  landSizeAdj: { min: -0.05, max: 0.05 },
  streetQualityAdj: { min: -0.03, max: 0.03 },
  bedroomAdj: { min: -0.05, max: 0.05 },
  marketMomentum: { min: -0.05, max: 0.05 },
  dataQualityAdj: { min: -0.02, max: 0.02 }
};

// ── helper ──

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, precision = 0) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function cleanType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type.includes("vacant") || type === "land") return "Vacant land";
  if (type.includes("town")) return "Townhouse";
  if (type.includes("villa")) return "Villa";
  if (type.includes("apart")) return "Apartment";
  if (type === "unit") return "Unit";
  return "House";
}

function parseDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function monthsBetween(from, to) {
  return Math.max(0, (to.getTime() - from.getTime()) / (DAY_MS * 30.4375));
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedianWithKey(rows, key) {
  const sorted = [...rows].sort((a, b) => (a[key] || 0) - (b[key] || 0));
  const totalWeight = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= totalWeight / 2) return row[key] || 0;
  }
  return sorted.at(-1)?.[key] || 0;
}

function weightedMeanWithKey(rows, key) {
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return 0;
  return rows.reduce((sum, row) => sum + (row[key] || 0) * row.weight, 0) / totalWeight;
}

function isLuxuryHouse(subject) {
  return cleanType(subject.propertyType) === "House" && (
    subject.luxury === true
    || number(subject.expectedValue) >= 3000000
    || number(subject.landSize) >= 1200
    || number(subject.buildingArea) >= 400
  );
}

// ── 类型兼容 ──

function typeMatches(subjectType, comparableType) {
  const allowed = TYPE_COMPATIBILITY[subjectType] || new Set([subjectType]);
  return allowed.has(comparableType);
}

// ── Step 1: Comparable quality scoring ──

function scoreComparable(subject, comparable, asOfDate) {
  const subjectType = cleanType(subject.propertyType);
  const comparableType = cleanType(comparable.propertyType);
  const saleDate = parseDate(comparable.saleDate);
  const distance = number(comparable.distanceMeters);
  const ageMonths = saleDate ? monthsBetween(saleDate, asOfDate) : Infinity;
  const sourceCount = Math.max(1, Number(comparable.sourceCount) || (comparable.crossChecked ? 2 : 1));

  const scores = {
    propertyType: subjectType === comparableType ? 20 : typeMatches(subjectType, comparableType) ? 13 : 0,
    location: distance === null
      ? 5
      : distance <= 100 ? 18
        : distance <= 500 ? 16
          : distance <= 1000 ? 13
            : distance <= 2000 ? 9
              : distance <= 3000 ? 5
                : 0,
    recency: ageMonths <= 3 ? 18 : ageMonths <= 6 ? 16 : ageMonths <= 12 ? 13 : ageMonths <= 24 ? 8 : 3,
    size: 0,
    accommodation: 0,
    ageAndCondition: 0,
    streetAndOrientation: 0,
    sourceQuality: sourceCount >= 3 ? 5 : sourceCount === 2 ? 4 : 2
  };

  // size scoring (keep for quality, but won't affect adjustment)
  const subjectSize = subjectType === "House" || subjectType === "Vacant land"
    ? number(subject.landSize)
    : number(subject.internalArea) || number(subject.buildingArea);
  const compSize = subjectType === "House" || subjectType === "Vacant land"
    ? number(comparable.landSize)
    : number(comparable.internalArea) || number(comparable.buildingArea);
  if (subjectSize && compSize) {
    const difference = Math.abs(subjectSize / compSize - 1);
    scores.size = difference <= 0.1 ? 15 : difference <= 0.2 ? 12 : difference <= 0.35 ? 8 : difference <= 0.5 ? 4 : 0;
  } else {
    scores.size = 4;
  }

  // accommodation scoring
  const roomDifference = ["bedrooms", "bathrooms", "carSpaces"].reduce((sum, key) => {
    const subjectValue = number(subject[key]);
    const compValue = number(comparable[key]);
    return sum + (subjectValue === null || compValue === null ? 0.75 : Math.abs(subjectValue - compValue));
  }, 0);
  scores.accommodation = roomDifference <= 0.5 ? 10 : roomDifference <= 1.5 ? 8 : roomDifference <= 3 ? 5 : 1;

  // age/condition scoring
  const yearDifference = number(subject.yearBuilt) && number(comparable.yearBuilt)
    ? Math.abs(number(subject.yearBuilt) - number(comparable.yearBuilt))
    : null;
  const conditionDifference = Math.abs((number(subject.conditionScore) ?? 3) - (number(comparable.conditionScore) ?? 3));
  scores.ageAndCondition = yearDifference === null
    ? Math.max(2, 6 - conditionDifference * 2)
    : yearDifference <= 5 && conditionDifference <= 1 ? 8
      : yearDifference <= 15 && conditionDifference <= 1 ? 6
        : yearDifference <= 30 ? 4
          : 2;

  // street/orientation scoring
  const streetDifference = Math.abs((number(subject.microLocationScore) ?? 3) - (number(comparable.microLocationScore) ?? 3));
  scores.streetAndOrientation = streetDifference === 0 ? 6 : streetDifference === 1 ? 4 : streetDifference === 2 ? 2 : 0;

  return {
    total: Object.values(scores).reduce((sum, value) => sum + value, 0),
    scores,
    ageMonths: round(ageMonths, 1),
    sourceCount
  };
}

// ── Comparable validation ──

function validateComparable(subject, comparable, asOfDate) {
  const reasons = [];
  const salePrice = number(comparable.salePrice);
  const saleDate = parseDate(comparable.saleDate);
  const sourceUrl = String(comparable.sourceUrl || "").trim();
  const comparableType = cleanType(comparable.propertyType);
  const subjectType = cleanType(subject.propertyType);

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) reasons.push("missing-source-url");
  if (!salePrice || salePrice < 50000) reasons.push("missing-or-invalid-sold-price");
  if (!saleDate) reasons.push("missing-or-invalid-sale-date");
  if (saleDate && saleDate > asOfDate) reasons.push("future-sale-date");
  if (saleDate && monthsBetween(saleDate, asOfDate) > 60) reasons.push("sale-older-than-five-years");
  if (!typeMatches(subjectType, comparableType)) reasons.push("incompatible-property-type");
  if (comparable.priceWithheld === true || comparable.listingPrice === true) reasons.push("not-a-verifiable-settled-price");
  return reasons;
}

// ── Step 1: Time-only adjustment ──

function timeOnlyAdjustment(saleDate, asOfDate, annualMarketGrowthRate) {
  const ageMonths = saleDate ? monthsBetween(saleDate, asOfDate) : 0;
  return clamp((number(annualMarketGrowthRate) || 0) * (ageMonths / 12), -0.15, 0.15);
}

// ── Step 2: Anchor factor adjustments ──

function anchorFactorAdjustments(anchor, subject, comparables, macro) {
  const factors = {};
  const applied = [];

  // ① 地块大小差异因子（±5%）
  const subjectLand = number(subject.landSize);
  const compLandValues = comparables.map(c => number(c.landSize)).filter(Boolean);
  const compLandMedian = median(compLandValues);
  if (subjectLand && compLandMedian && compLandMedian > 0) {
    const ratio = subjectLand / compLandMedian;
    factors.landSizeAdj = clamp(Math.log(ratio) * 0.08, FACTOR_CAPS.landSizeAdj.min, FACTOR_CAPS.landSizeAdj.max);
    applied.push({ name: "landSizeAdj", label: "地块大小", value: round(factors.landSizeAdj, 4), detail: `${subjectLand}sqm vs median ${Math.round(compLandMedian)}sqm` });
  } else {
    factors.landSizeAdj = 0;
    applied.push({ name: "landSizeAdj", label: "地块大小", value: 0, detail: "地块数据不足" });
  }

  // ② 街道质量因子（±3%）
  const subjectStreet = number(subject.streetQualityScore) ?? 3;
  const compStreetValues = comparables.map(c => number(c.streetQualityScore)).filter(v => v != null);
  const compStreetMedian = compStreetValues.length ? median(compStreetValues) : 3;
  factors.streetQualityAdj = clamp((subjectStreet - compStreetMedian) * 0.015, FACTOR_CAPS.streetQualityAdj.min, FACTOR_CAPS.streetQualityAdj.max);
  applied.push({ name: "streetQualityAdj", label: "街道质量", value: round(factors.streetQualityAdj, 4), detail: `subject ${subjectStreet} vs comp median ${compStreetMedian}` });

  // ③ 房间配置差异因子（±5%）
  const subjectBed = number(subject.bedrooms);
  const compBedValues = comparables.map(c => number(c.bedrooms)).filter(Boolean);
  const compBedMedian = compBedValues.length ? median(compBedValues) : null;
  if (subjectBed && compBedMedian) {
    factors.bedroomAdj = clamp((subjectBed - compBedMedian) * 0.02, FACTOR_CAPS.bedroomAdj.min, FACTOR_CAPS.bedroomAdj.max);
    applied.push({ name: "bedroomAdj", label: "卧室数", value: round(factors.bedroomAdj, 4), detail: `subject ${subjectBed}br vs comp median ${compBedMedian}br` });
  } else {
    factors.bedroomAdj = 0;
    applied.push({ name: "bedroomAdj", label: "卧室数", value: 0, detail: "房间数据不足" });
  }

  // ④ 市场动量因子（±5%）
  let momentum = 0;
  // RBA 高利率压制
  if (macro.cashRate != null && macro.cashRate > 4) {
    momentum += -(macro.cashRate - 4) * 0.01; // 4%→0, 4.35%→-0.35%, 5%→-1%
  }
  // ABS SEIFA 高收入区 → 正向
  const seifaDecile = subject._seifaDecile ?? null;
  if (seifaDecile != null) {
    if (seifaDecile >= 8) momentum += 0.015;  // 高收入区 +1.5%
    else if (seifaDecile >= 5) momentum += 0.005; // 中上收入区 +0.5%
    else momentum += -0.005; // 低收入区 -0.5%
  }
  // Income/rent ratio 负担压力
  if (macro.incomeRentRatio != null && macro.incomeRentRatio < 3) {
    momentum += Math.max(-0.02, (macro.incomeRentRatio - 3) * 0.005);
  }
  // VicPlan residential dominant
  if (macro.residentialDominant === false) momentum += -0.005;
  else if (macro.residentialDominant === true) momentum += 0.005;

  factors.marketMomentum = clamp(momentum, FACTOR_CAPS.marketMomentum.min, FACTOR_CAPS.marketMomentum.max);
  const momentumDetails = [];
  if (macro.cashRate != null) momentumDetails.push(`RBA ${macro.cashRate}%`);
  if (seifaDecile != null) momentumDetails.push(`SEIFA ${seifaDecile}/10`);
  if (macro.incomeRentRatio != null) momentumDetails.push(`I/R ${round(macro.incomeRentRatio, 2)}`);
  if (macro.residentialDominant != null) momentumDetails.push(macro.residentialDominant ? "住宅区" : "非住宅主导");
  applied.push({ name: "marketMomentum", label: "市场动量", value: round(factors.marketMomentum, 4), detail: momentumDetails.join(" · ") });

  // ⑤ 数据质量修正因子（±2%）
  const crossCheckedRatio = comparables.filter(c => c.sourceCount >= 2 || c.verificationStatus === "cross_source_verified").length / comparables.length;
  factors.dataQualityAdj = crossCheckedRatio >= 0.5 ? 0.01 : crossCheckedRatio >= 0.2 ? 0 : -0.01;
  const singleSourceCount = comparables.filter(c => c.verificationStatus === "single_source_observed").length;
  if (singleSourceCount === comparables.length) factors.dataQualityAdj = -0.02;
  applied.push({ name: "dataQualityAdj", label: "数据质量", value: round(factors.dataQualityAdj, 4), detail: `交叉验证 ${round(crossCheckedRatio * 100)}%` });

  const total = Object.values(factors).reduce((s, v) => s + v, 0);
  return { factors, total: clamp(total, -0.15, 0.15), applied };
}

// ── Debug: comparables table ──

function robustDispersionSimple(rawPrices, midpoint) {
  if (rawPrices.length < 2 || !midpoint) return 0;
  const deviations = rawPrices.map(p => Math.abs(p - midpoint) / midpoint);
  return median(deviations) || 0;
}

// ── Confidence result ──

function confidenceResult(rows, rejectedRows, dispersion, macro) {
  const rowCount = rows.length;
  const coreRows = rows.filter((row) => row.qualityScore >= 80);
  const recentRows = rows.filter((row) => row.ageMonths <= 6);
  const crossCheckedRows = rows.filter((row) => row.sourceCount >= 2);
  const singleSourceRows = rows.filter((row) => row.verificationStatus === "single_source_observed");
  const averageScore = rowCount
    ? rows.reduce((sum, row) => sum + row.qualityScore, 0) / rowCount
    : 0;

  // 特征完整度
  let missingFields = 0;
  let totalFields = 0;
  for (const r of rows) {
    if (r.bedrooms == null) missingFields++; totalFields++;
    if (r.bathrooms == null) missingFields++; totalFields++;
    if (r.landSize == null) missingFields++; totalFields++;
    if (r.salePrice == null) missingFields++;
  }
  const fieldCompleteness = totalFields > 0 ? 1 - missingFields / totalFields : 0.5;

  // 离群程度
  const outlierPenalty = dispersion > 0.15 ? 0.6 : dispersion > 0.10 ? 0.8 : dispersion > 0.075 ? 0.9 : 1.0;

  // 单来源扣分
  const singleSourceRatio = rowCount > 0 ? singleSourceRows.length / rowCount : 0;
  const sourcePenalty = singleSourceRatio > 0.5
    ? 0.80
    : singleSourceRatio > 0
      ? 0.90
      : 1.0;

  // VicPlan 置信修正
  const vicplanBoost = (macro.residentialDominant === true) ? 5 :
                        (macro.residentialDominant === false) ? -3 : 0;

  // 连续型置信评分 (0-100)
  const countScore = clamp(rowCount * 10, 0, 35);
  const coreBonus = clamp(coreRows.length * 5, 0, 20);
  const recencyBonus = clamp(recentRows.length * 6, 0, 18);
  const crossBonus = clamp(crossCheckedRows.length * 5, 0, 15);
  const qualityBonus = clamp((averageScore - 50) * 0.4, 0, 15);
  const completenessBonus = fieldCompleteness * 5;
  const rejectionPenalty = Math.max(0, 10 - rejectedRows.length * 2);

  const rawScore = (countScore + coreBonus + recencyBonus + crossBonus + qualityBonus + completenessBonus + vicplanBoost) * outlierPenalty * sourcePenalty;
  const dataScore = clamp(Math.round(rawScore + rejectionPenalty), 0, 100);

  // 等级映射
  let label;
  if (dataScore >= 78 && crossCheckedRows.length >= 3) {
    label = "High";
  } else if (dataScore >= 65 && crossCheckedRows.length >= 2) {
    label = "Medium-High";
  } else if (dataScore >= 50) {
    label = "Medium";
  } else if (dataScore >= 30) {
    label = "Low-Medium";
  } else {
    label = "Low";
  }

  return {
    label,
    dataScore: round(dataScore),
    reasons: [
      `${rowCount} comparable sales accepted; ${rejectedRows.length} rejected.`,
      `${coreRows.length} core comparables scored 80 or above.`,
      `${recentRows.length} accepted sales occurred within six months.`,
      `${crossCheckedRows.length} accepted sales were confirmed by at least two sources.`,
      `Price dispersion is ${round(dispersion * 100, 1)}%.`,
      singleSourceRatio > 0 ? `${round(singleSourceRatio * 100)}% of comparables are single-source observed.` : null
    ].filter(Boolean)
  };
}

// ═══════════════════════════════════════════
//  Main entry point
// ═══════════════════════════════════════════

export function valueProperty(input) {
  const subject = { ...(input.subject || {}), propertyType: cleanType(input.subject?.propertyType) };
  const publicData = input.publicData || {};
  const absProfile = publicData.absProfile;
  const rbaRates = publicData.rbaRates;
  const vicplan = publicData.vicplan;

  // 注入 SEIFA
  if (absProfile?.ok && absProfile.seifa?.decileAustralia != null) {
    subject._seifaDecile = absProfile.seifa.decileAustralia;
  }

  const macro = {
    cashRate: rbaRates?.cashRate ?? null,
    incomeRentRatio: (absProfile?.ok && absProfile.medians?.medianRent)
      ? (absProfile.medians?.medianHouseholdIncome || 0) / absProfile.medians.medianRent
      : null,
    residentialDominant: (vicplan?.ok && vicplan.features?.buildingCount > 0)
      ? (vicplan.features.landuseTypes || []).some(l => l.type === "residential")
      : null
  };

  // 动态年化增长率
  let effectiveGrowthRate = number(input.annualMarketGrowthRate) || 0;
  if (macro.cashRate != null && macro.cashRate > 4) {
    effectiveGrowthRate = Math.max(effectiveGrowthRate - (macro.cashRate - 4) * 0.005, -0.02);
  }

  const comparables = Array.isArray(input.comparables) ? input.comparables : [];
  const asOfDate = parseDate(input.asOfDate) || new Date();
  const accepted = [];
  const rejected = [];

  // ── Phase 1: Validate & Score ──
  comparables.forEach((comparable, index) => {
    const rejectionReasons = validateComparable(subject, comparable, asOfDate);
    if (rejectionReasons.length) {
      rejected.push({ index, address: comparable.address || "Unknown", sourceUrl: comparable.sourceUrl || "", reasons: rejectionReasons });
      return;
    }

    const quality = scoreComparable(subject, comparable, asOfDate);
    if (quality.total < 50) {
      rejected.push({ index, address: comparable.address || "Unknown", sourceUrl: comparable.sourceUrl, reasons: ["quality-score-below-50"], qualityScore: quality.total });
      return;
    }

    // 只做 time adjustment
    const timeAdj = timeOnlyAdjustment(parseDate(comparable.saleDate), asOfDate, effectiveGrowthRate);
    const salePrice = number(comparable.salePrice);
    const timeAdjustedPrice = salePrice * (1 + timeAdj);

    accepted.push({
      index,
      address: comparable.address,
      sourceUrl: comparable.sourceUrl,
      secondarySourceUrls: comparable.secondarySourceUrls || [],
      salePrice,
      timeAdjustedPrice: Math.round(timeAdjustedPrice),
      saleDate: parseDate(comparable.saleDate).toISOString().slice(0, 10),
      propertyType: cleanType(comparable.propertyType),
      distanceMeters: number(comparable.distanceMeters),
      ageMonths: quality.ageMonths,
      sourceCount: quality.sourceCount,
      qualityScore: quality.total,
      bedrooms: comparable.bedrooms ?? null,
      bathrooms: comparable.bathrooms ?? null,
      carSpaces: comparable.carSpaces ?? null,
      landSize: comparable.landSize ?? null,
      verificationStatus: comparable.verificationStatus || "unverified",
      _sourceMode: comparable._sourceMode || null,
      qualityBand: quality.total >= 80 ? "Core" : quality.total >= 65 ? "Supporting" : "Context",
      qualityBreakdown: quality.scores,
      timeAdjustment: round(timeAdj, 5),
      weight: round((quality.total / 100) ** 2 * (quality.sourceCount >= 2 ? 1.08 : 1), 5)
    });
  });

  if (!accepted.length) {
    return {
      ok: false,
      status: "insufficient-verifiable-comparables",
      subject: (() => { const s = { ...subject }; delete s._seifaDecile; return s; })(),
      acceptedComparables: [],
      rejectedComparables: rejected,
      estimate: null,
      confidence: { label: "Low", dataScore: 0, sigma: null, reasons: ["No comparable passed validation checks."] }
    };
  }

  // ── Phase 2: Anchor ──
  // Anchor = weighted median × 0.7 + weighted mean × 0.3 of timeAdjustedPrice
  const medianEstimate = weightedMedianWithKey(accepted, "timeAdjustedPrice");
  const meanEstimate = weightedMeanWithKey(accepted, "timeAdjustedPrice");
  const anchor = Math.round(medianEstimate * 0.7 + meanEstimate * 0.3);

  // ── Phase 3: Factor adjustments on anchor ──
  const factorResults = anchorFactorAdjustments(anchor, subject, accepted, macro);
  const finalMidpoint = Math.round(anchor * (1 + factorResults.total));

  // ── Phase 4: Range (sigma based on raw dispersion + data quality) ──
  const rawPrices = accepted.map(c => c.timeAdjustedPrice);
  const rawDispersion = robustDispersionSimple(rawPrices, anchor);
  // sigma = max(dispersion, typeBaseline) × (1 - dataQualityBonus)
  const reductionFactor = Math.min(0.3, (1 - factorResults.factors.dataQualityAdj) * 0.15);
  // 直接基于 dispersion，不用预定义的 typeSigma
  const sigma = Math.max(rawDispersion, 0.025) * (1 - reductionFactor);
  const customerHalfRange = Math.min(MAX_CUSTOMER_RANGE, sigma * 3);

  // ── Confidence ──
  const confidence = confidenceResult(accepted, rejected, rawDispersion, macro);

  return {
    ok: true,
    status: "estimated",
    asOfDate: asOfDate.toISOString().slice(0, 10),
    subject: (() => { const s = { ...subject }; delete s._seifaDecile; return s; })(),
    methodology: {
      anchor: "Step 1: Time-adjusted weighted median×0.7 + mean×0.3 from comparable sales.",
      factorAdjustments: "Step 2: Anchor-based factor corrections (block size, street quality, bedrooms, market momentum, data quality).",
      customerRangeCap: MAX_CUSTOMER_RANGE
    },
    estimate: {
      midpoint: finalMidpoint,
      anchor,
      low: Math.round(finalMidpoint * (1 - customerHalfRange)),
      high: Math.round(finalMidpoint * (1 + customerHalfRange)),
      customerHalfRange: round(customerHalfRange, 5),
      sigma: round(sigma, 5),
      weightedMedian: Math.round(medianEstimate),
      weightedMean: Math.round(meanEstimate),
      factorAdjustments: factorResults.applied,
      factorTotal: round(factorResults.total, 4)
    },
    confidence,
    acceptedComparables: accepted.sort((a, b) => b.weight - a.weight),
    rejectedComparables: rejected
  };
}

export const valuationModelDefaults = {
  maxCustomerRange: MAX_CUSTOMER_RANGE,
  factorCaps: FACTOR_CAPS
};
