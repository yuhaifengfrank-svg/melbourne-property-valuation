const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOMER_RANGE = 0.10;

// ── 宏观经济调整因子（隐式，不显示） ──
// 来自 ABS SEIFA + RBA 利率 + VicPlan landuse
// 通过 collectComparableResearch 返回的 publicData 注入

const SEIFA_SIGMA_MODIFIER = {
  10: -0.010,  9: -0.006,  8: -0.003,
  7: 0,
  6: 0.003,  5: 0.005,  4: 0.008,
  3: 0.010,  2: 0.012,  1: 0.015
};

const SIGMA_BY_TYPE = {
  Apartment: 0.035,
  Unit: 0.04,
  Villa: 0.04,
  Townhouse: 0.045,
  House: 0.05,
  "Vacant land": 0.06,
  LuxuryHouse: 0.08
};

const TYPE_COMPATIBILITY = {
  House: new Set(["House"]),
  Townhouse: new Set(["Townhouse"]),
  Villa: new Set(["Villa", "Townhouse"]),
  Unit: new Set(["Unit", "Apartment", "Villa"]),
  Apartment: new Set(["Apartment", "Unit"]),
  "Vacant land": new Set(["Vacant land", "Land"])
};

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

function ratioAdjustment(subjectValue, compValue, elasticity, cap) {
  const subject = number(subjectValue);
  const comparable = number(compValue);
  if (!subject || !comparable || subject <= 0 || comparable <= 0) return 0;
  return clamp(Math.log(subject / comparable) * elasticity, -cap, cap);
}

function ordinalAdjustment(subjectValue, compValue, step, cap) {
  const subject = number(subjectValue);
  const comparable = number(compValue);
  if (subject === null || comparable === null) return 0;
  return clamp((subject - comparable) * step, -cap, cap);
}

function weightedMedian(rows) {
  const sorted = [...rows].sort((a, b) => a.adjustedPrice - b.adjustedPrice);
  const totalWeight = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.weight;
    if (cumulative >= totalWeight / 2) return row.adjustedPrice;
  }
  return sorted.at(-1)?.adjustedPrice || 0;
}

function weightedMean(rows) {
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return 0;
  return rows.reduce((sum, row) => sum + row.adjustedPrice * row.weight, 0) / totalWeight;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function robustDispersion(rows, midpoint) {
  if (rows.length < 2 || !midpoint) return 0;
  const deviations = rows.map((row) => Math.abs(row.adjustedPrice - midpoint) / midpoint);
  return median(deviations) || 0;
}

function isLuxuryHouse(subject) {
  return cleanType(subject.propertyType) === "House" && (
    subject.luxury === true
    || number(subject.expectedValue) >= 3000000
    || number(subject.landSize) >= 1200
    || number(subject.buildingArea) >= 400
  );
}

function typeSigma(subject) {
  let sigma = SIGMA_BY_TYPE[cleanType(subject.propertyType)] || 0.05;
  if (isLuxuryHouse(subject)) sigma = SIGMA_BY_TYPE.LuxuryHouse;
  // ── SEIFA 区域稳定性修正 ──
  const seifaDecile = subject._seifaDecile;
  if (seifaDecile != null && SEIFA_SIGMA_MODIFIER[seifaDecile] !== undefined) {
    sigma += SEIFA_SIGMA_MODIFIER[seifaDecile];
  }
  return Math.max(0.02, sigma);
}

function typeMatches(subjectType, comparableType) {
  const allowed = TYPE_COMPATIBILITY[subjectType] || new Set([subjectType]);
  return allowed.has(comparableType);
}

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

  const roomDifference = ["bedrooms", "bathrooms", "carSpaces"].reduce((sum, key) => {
    const subjectValue = number(subject[key]);
    const compValue = number(comparable[key]);
    return sum + (subjectValue === null || compValue === null ? 0.75 : Math.abs(subjectValue - compValue));
  }, 0);
  scores.accommodation = roomDifference <= 0.5 ? 10 : roomDifference <= 1.5 ? 8 : roomDifference <= 3 ? 5 : 1;

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

  const streetDifference = Math.abs((number(subject.microLocationScore) ?? 3) - (number(comparable.microLocationScore) ?? 3));
  scores.streetAndOrientation = streetDifference === 0 ? 6 : streetDifference === 1 ? 4 : streetDifference === 2 ? 2 : 0;

  return {
    total: Object.values(scores).reduce((sum, value) => sum + value, 0),
    scores,
    ageMonths: round(ageMonths, 1),
    sourceCount
  };
}

function validateComparable(subject, comparable, asOfDate) {
  const reasons = [];
  const salePrice = number(comparable.salePrice);
  const saleDate = parseDate(comparable.saleDate);
  const sourceUrl = String(comparable.sourceUrl || "").trim();
  const subjectType = cleanType(subject.propertyType);
  const comparableType = cleanType(comparable.propertyType);

  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) reasons.push("missing-source-url");
  if (!salePrice || salePrice < 50000) reasons.push("missing-or-invalid-sold-price");
  if (!saleDate) reasons.push("missing-or-invalid-sale-date");
  if (saleDate && saleDate > asOfDate) reasons.push("future-sale-date");
  if (saleDate && monthsBetween(saleDate, asOfDate) > 60) reasons.push("sale-older-than-five-years");
  if (!typeMatches(subjectType, comparableType)) reasons.push("incompatible-property-type");
  if (comparable.priceWithheld === true || comparable.listingPrice === true) reasons.push("not-a-verifiable-settled-price");

  return reasons;
}

function adjustmentComponents(subject, comparable, asOfDate, annualMarketGrowthRate, macro = {}) {
  const subjectType = cleanType(subject.propertyType);
  const saleDate = parseDate(comparable.saleDate);
  const ageMonths = monthsBetween(saleDate, asOfDate);
  const time = clamp((number(annualMarketGrowthRate) || 0) * (ageMonths / 12), -0.15, 0.15);

  let size = 0;
  if (subjectType === "House") {
    size += ratioAdjustment(subject.landSize, comparable.landSize, 0.35, 0.08);
    size += ratioAdjustment(subject.buildingArea, comparable.buildingArea, 0.22, 0.05);
  } else if (subjectType === "Vacant land") {
    size += ratioAdjustment(subject.landSize, comparable.landSize, 0.65, 0.12);
  } else {
    size += ratioAdjustment(
      number(subject.internalArea) || number(subject.buildingArea),
      number(comparable.internalArea) || number(comparable.buildingArea),
      0.55,
      0.10
    );
    size += ratioAdjustment(subject.outdoorArea, comparable.outdoorArea, 0.08, 0.02);
  }
  size = clamp(size, -0.10, 0.10);

  const accommodation = clamp(
    ordinalAdjustment(subject.bedrooms, comparable.bedrooms, 0.018, 0.045)
    + ordinalAdjustment(subject.bathrooms, comparable.bathrooms, 0.012, 0.03)
    + ordinalAdjustment(subject.carSpaces, comparable.carSpaces, 0.01, 0.025),
    -0.07,
    0.07
  );

  const condition = clamp(
    ordinalAdjustment(subject.conditionScore, comparable.conditionScore, 0.018, 0.045)
    + ordinalAdjustment(comparable.yearBuilt, subject.yearBuilt, 0.0008, 0.025),
    -0.06,
    0.06
  );

  const microLocation = clamp(
    ordinalAdjustment(subject.microLocationScore, comparable.microLocationScore, 0.012, 0.04)
    + ordinalAdjustment(subject.orientationScore, comparable.orientationScore, 0.006, 0.015)
    + ordinalAdjustment(subject.streetQualityScore, comparable.streetQualityScore, 0.008, 0.025),
    -0.05,
    0.05
  );

  const planningAndRisk = clamp(
    ordinalAdjustment(subject.planningScore, comparable.planningScore, 0.012, 0.04)
    + ordinalAdjustment(comparable.riskScore, subject.riskScore, 0.012, 0.04),
    -0.06,
    0.06
  );

  const strataAndBuilding = subjectType === "Townhouse" || subjectType === "Villa" || subjectType === "Unit" || subjectType === "Apartment"
    ? clamp(
      ordinalAdjustment(comparable.bodyCorporateScore, subject.bodyCorporateScore, 0.008, 0.025)
      + ordinalAdjustment(subject.buildingPositionScore, comparable.buildingPositionScore, 0.01, 0.03)
      + ordinalAdjustment(subject.viewScore, comparable.viewScore, 0.01, 0.03)
      + ordinalAdjustment(subject.floorLevel, comparable.floorLevel, 0.003, 0.02),
      -0.06,
      0.06
    )
    : 0;

  // ── 宏观经济调整因子（隐式，不暴露） ──
  // RBA 现金利率影响：高利率压制购买力，对时间调整施加额外修正
  // 当利率 > 4%，每超1% 对 total 扣 -0.01/yr
  const cashRate = macro.cashRate;
  let macroEconomic = 0;
  if (cashRate != null && cashRate > 4) {
    macroEconomic += -(cashRate - 4) * 0.008 * (ageMonths / 12);
  }
  // ABS 中位收入 vs 中位租金比例：income/rent < 3 提示负担压力
  if (macro.incomeRentRatio != null && macro.incomeRentRatio < 3) {
    macroEconomic += Math.max(-0.02, (macro.incomeRentRatio - 3) * 0.005);
  }
  // VicPlan landuse：非住宅主导区域，降低调整幅度
  if (macro.residentialDominant === false) {
    macroEconomic += -0.005;
  }
  macroEconomic = clamp(macroEconomic, -0.04, 0.02);

  const uncappedTotal = time + size + accommodation + condition + microLocation + planningAndRisk + strataAndBuilding + macroEconomic;
  return {
    time,
    size,
    accommodation,
    condition,
    microLocation,
    planningAndRisk,
    strataAndBuilding,
    total: clamp(uncappedTotal, -0.15, 0.15),
    wasCapped: Math.abs(uncappedTotal) > 0.15
  };
}

function confidenceResult(rows, rejectedRows, dispersion, sigma, vicplan = {}) {
  const rowCount = rows.length;
  const coreRows = rows.filter((row) => row.qualityScore >= 80);
  const recentRows = rows.filter((row) => row.ageMonths <= 6);
  const crossCheckedRows = rows.filter((row) => row.sourceCount >= 2);
  const singleSourceRows = rows.filter((row) => row.verificationStatus === "single_source_observed");
  const averageScore = rowCount
    ? rows.reduce((sum, row) => sum + row.qualityScore, 0) / rowCount
    : 0;

  // ── 特征完整度：bedrooms/bathrooms/landSize/buildingArea 字段缺失比例 ──
  let missingFields = 0;
  let totalFields = 0;
  for (const r of rows) {
    if (r.bedrooms == null) missingFields++; totalFields++;
    if (r.bathrooms == null) missingFields++; totalFields++;
    if (r.landSize == null) missingFields++; totalFields++;
    if (r.salePrice == null) missingFields++;
  }
  const fieldCompleteness = totalFields > 0 ? 1 - missingFields / totalFields : 0.5;

  // ── 离群程度：dispersion 标准差系数 ──
  const outlierPenalty = dispersion > 0.15 ? 0.6 : dispersion > 0.10 ? 0.8 : dispersion > 0.075 ? 0.9 : 1.0;

  // ── 单来源扣分：有 single_source_observed 按比例计算 ──
  const singleSourceRatio = rowCount > 0 ? singleSourceRows.length / rowCount : 0;
  const sourcePenalty = singleSourceRatio > 0.5
    ? 0.80              // 多数单来源：-20%
    : singleSourceRatio > 0
      ? 0.90            // 部分单来源：-10%
      : 1.0;            // 完全交叉核验：无扣分

  // ── VicPlan landuse 置信修正 ──
  const vicplanBoost = (vicplan.residentialDominant === true) ? 5 :
                        (vicplan.residentialDominant === false) ? -3 : 0;

  // ── 连续型置信评分 (0-100) ──
  // 基础分：comparable 数量
  const countScore = clamp(rowCount * 10, 0, 35);

  // 核心 comps 加分
  const coreBonus = clamp(coreRows.length * 5, 0, 20);

  // 新鲜度加分
  const recencyBonus = clamp(recentRows.length * 6, 0, 18);

  // 交叉核验加分
  const crossBonus = clamp(crossCheckedRows.length * 5, 0, 15);

  // 平均质量
  const qualityBonus = clamp((averageScore - 50) * 0.4, 0, 15);

  // 特征完整度
  const completenessBonus = fieldCompleteness * 5;

  // 离群扣分（乘数）
  // 单来源扣分（乘数）
  // 被排除扣分
  const rejectionPenalty = Math.max(0, 10 - rejectedRows.length * 2);

  const rawScore = (countScore + coreBonus + recencyBonus + crossBonus + qualityBonus + completenessBonus + vicplanBoost) * outlierPenalty * sourcePenalty;
  const dataScore = clamp(Math.round(rawScore + rejectionPenalty), 0, 100);

  // ── 等级映射（连续评分 → 离散标签） ──
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
    modelSigma: sigma,
    reasons: [
      `${rowCount} comparable sales accepted; ${rejectedRows.length} rejected.`,
      `${coreRows.length} core comparables scored 80 or above.`,
      `${recentRows.length} accepted sales occurred within six months.`,
      `${crossCheckedRows.length} accepted sales were confirmed by at least two sources.`,
      `Robust adjusted-price dispersion is ${round(dispersion * 100, 1)}%.`,
      singleSourceRatio > 0 ? `${round(singleSourceRatio * 100)}% of comparables are single-source observed.` : null
    ].filter(Boolean)
  };
}

export function valueProperty(input) {
  const subject = { ...(input.subject || {}), propertyType: cleanType(input.subject?.propertyType) };
  // ── 公共数据注入（来自 collectComparableResearch 的 publicData） ──
  const publicData = input.publicData || {};
  const absProfile = publicData.absProfile;
  const rbaRates = publicData.rbaRates;
  const vicplan = publicData.vicplan;

  // 将 SEIFA decile 注入 subject（影响 typeSigma，不暴露）
  let seifaDecile = null;
  if (absProfile?.ok && absProfile.seifa?.decileAustralia != null) {
    subject._seifaDecile = absProfile.seifa.decileAustralia;
    seifaDecile = absProfile.seifa.decileAustralia;
  }

  // 宏观经济调整参数
  const macro = {
    cashRate: rbaRates?.cashRate ?? null,
    incomeRentRatio: (absProfile?.ok && absProfile.medians?.medianRent)
      ? (absProfile.medians?.medianHouseholdIncome || 0) / absProfile.medians.medianRent
      : null,
    residentialDominant: (vicplan?.ok && vicplan.features?.buildingCount > 0)
      ? (vicplan.features.landuseTypes || []).some(l => l.type === "residential")
      : null
  };

  // 动态年化增长率：RBA 高利率环境压制
  let effectiveGrowthRate = number(input.annualMarketGrowthRate) || 0;
  if (macro.cashRate != null && macro.cashRate > 4) {
    effectiveGrowthRate = Math.max(effectiveGrowthRate - (macro.cashRate - 4) * 0.005, -0.02);
  }
  const comparables = Array.isArray(input.comparables) ? input.comparables : [];
  const asOfDate = parseDate(input.asOfDate) || new Date();
  const accepted = [];
  const rejected = [];

  comparables.forEach((comparable, index) => {
    const rejectionReasons = validateComparable(subject, comparable, asOfDate);
    if (rejectionReasons.length) {
      rejected.push({
        index,
        address: comparable.address || "Unknown",
        sourceUrl: comparable.sourceUrl || "",
        reasons: rejectionReasons
      });
      return;
    }

    const quality = scoreComparable(subject, comparable, asOfDate);
    if (quality.total < 50) {
      rejected.push({
        index,
        address: comparable.address || "Unknown",
        sourceUrl: comparable.sourceUrl,
        reasons: ["quality-score-below-50"],
        qualityScore: quality.total
      });
      return;
    }

    const adjustments = adjustmentComponents(subject, comparable, asOfDate, effectiveGrowthRate, macro);
    const salePrice = number(comparable.salePrice);
    const adjustedPrice = salePrice * (1 + adjustments.total);
    accepted.push({
      index,
      address: comparable.address,
      sourceUrl: comparable.sourceUrl,
      secondarySourceUrls: comparable.secondarySourceUrls || [],
      salePrice,
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
      qualityBand: quality.total >= 80 ? "Core" : quality.total >= 65 ? "Supporting" : "Context",
      // 保留来源验证信息（用于 evidenceMode 标签）
      verificationStatus: comparable.verificationStatus || "unverified",
      _sourceMode: comparable._sourceMode || null,
      qualityBreakdown: quality.scores,
      adjustments: Object.fromEntries(
        Object.entries(adjustments)
          .filter(([key]) => key !== 'macroEconomic' && key !== 'wasCapped')
          .map(([key, value]) => [key, typeof value === "number" ? round(value, 5) : value])
      ),
      adjustedPrice: Math.round(adjustedPrice),
      weight: round((quality.total / 100) ** 2 * (quality.sourceCount >= 2 ? 1.08 : 1), 5)
    });
  });

  if (!accepted.length) {
    return {
      ok: false,
      status: "insufficient-verifiable-comparables",
      subject,
      acceptedComparables: [],
      rejectedComparables: rejected,
      estimate: null,
      confidence: {
        label: "Low",
        dataScore: 0,
        modelSigma: typeSigma(subject),
        reasons: ["No comparable passed the source, sold-price, date, type and quality checks."]
      }
    };
  }

  const medianEstimate = weightedMedian(accepted);
  const meanEstimate = weightedMean(accepted);
  const midpoint = Math.round(medianEstimate * 0.7 + meanEstimate * 0.3);
  const dispersion = robustDispersion(accepted, midpoint);
  const sigma = typeSigma(subject);
  const confidence = confidenceResult(accepted, rejected, dispersion, sigma, macro);
  const customerHalfRange = Math.min(MAX_CUSTOMER_RANGE, Math.max(sigma, dispersion * 1.4826));

  return {
    ok: true,
    status: "estimated",
    asOfDate: asOfDate.toISOString().slice(0, 10),
    subject: (() => {
      const s = { ...subject };
      delete s._seifaDecile;
      return s;
    })(),
    methodology: {
      anchor: "Quality-weighted blend of adjusted comparable median (70%) and mean (30%).",
      customerRangeCap: MAX_CUSTOMER_RANGE,
      externalPortalEstimates: "Cross-check only; excluded from the independent estimate."
    },
    estimate: {
      midpoint,
      low: Math.round(midpoint * (1 - customerHalfRange)),
      high: Math.round(midpoint * (1 + customerHalfRange)),
      customerHalfRange: round(customerHalfRange, 5),
      weightedMedian: Math.round(medianEstimate),
      weightedMean: Math.round(meanEstimate)
    },
    statisticalIntervals: {
      sigma,
      oneSigma: {
        coverage: 0.68,
        low: Math.round(midpoint * (1 - sigma)),
        high: Math.round(midpoint * (1 + sigma))
      },
      twoSigma: {
        coverage: 0.95,
        low: Math.round(midpoint * (1 - sigma * 2)),
        high: Math.round(midpoint * (1 + sigma * 2))
      },
      threeSigma: {
        coverage: 0.997,
        low: Math.round(midpoint * (1 - sigma * 3)),
        high: Math.round(midpoint * (1 + sigma * 3))
      },
      note: "Sigma values are initial model assumptions until calibrated with settled-sale backtesting."
    },
    confidence,
    acceptedComparables: accepted.sort((a, b) => b.weight - a.weight),
    rejectedComparables: rejected
  };
}

export const valuationModelDefaults = {
  maxCustomerRange: MAX_CUSTOMER_RANGE,
  sigmaByType: { ...SIGMA_BY_TYPE }
};

// ── 私有常量导出（供外部读取检测） ──
export const SEIFA_SIGMA_ADJUSTMENT = { ...SEIFA_SIGMA_MODIFIER };
