const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOMER_RANGE = 0.15;

// ── 锚点估值模型 v2 ──
// Step 1: comparables 只做时间调整 → 锚点
// Step 2: 因子修正（地块、街道、房间、市场动量、数据质量、高端修正）
// v2 fixes: outlier 检测 → insufficient-comparable-coverage
//           type 隔离增强, price bracket 过滤延伸

const TYPE_COMPATIBILITY = {
  House: new Set(["House"]),
  Townhouse: new Set(["Townhouse"]),
  Villa: new Set(["Villa", "Townhouse"]),
  Unit: new Set(["Unit", "Apartment", "Villa", "Townhouse"]),
  Apartment: new Set(["Apartment", "Unit"]),
  "Vacant land": new Set(["Vacant land", "Land"])
};

const FACTOR_CAPS = {
  landSizeAdj: { min: -0.05, max: 0.05 },
  streetQualityAdj: { min: -0.03, max: 0.03 },
  bedroomAdj: { min: -0.05, max: 0.05 },
  educationFactor: { min: -0.03, max: 0.08 },
  marketMomentum: { min: -0.05, max: 0.05 },
  dataQualityAdj: { min: -0.02, max: 0.02 },
  highEndOutlier: { min: 0, max: 0.10 },
  censusConsistency: { min: -0.03, max: 0.03 }
};

// ── helpers ──

function number(v) { if (v == null || v === "") return null; const p = Number(v); return Number.isFinite(p) ? p : null; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v, p = 0) { const f = 10 ** p; return Math.round(v * f) / f; }

function cleanType(v) {
  const t = String(v || "").trim().toLowerCase();
  if (t.includes("vacant") || t === "land") return "Vacant land";
  if (t.includes("town")) return "Townhouse";
  if (t.includes("villa")) return "Villa";
  if (t.includes("apart")) return "Apartment";
  if (t === "unit") return "Unit";
  return "House";
}

function parseDate(v) { const d = v instanceof Date ? v : new Date(v); return Number.isFinite(d.getTime()) ? d : null; }
function monthsBetween(from, to) { return Math.max(0, (to.getTime() - from.getTime()) / (DAY_MS * 30.4375)); }

function median(vals) {
  const s = vals.filter(Number.isFinite).sort((a,b) => a-b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

function weightedMedianWithKey(rows, key) {
  const s = [...rows].sort((a,b) => (a[key]||0) - (b[key]||0));
  const tw = s.reduce((sum, r) => sum + r.weight, 0);
  let c = 0;
  for (const r of s) { c += r.weight; if (c >= tw / 2) return r[key] || 0; }
  return s.at(-1)?.[key] || 0;
}

function weightedMeanWithKey(rows, key) {
  const tw = rows.reduce((s, r) => s + r.weight, 0);
  if (!tw) return 0;
  return rows.reduce((s, r) => s + (r[key]||0) * r.weight, 0) / tw;
}

function typeMatches(subjectType, compType) {
  const a = TYPE_COMPATIBILITY[subjectType] || new Set([subjectType]);
  return a.has(compType);
}

// ── Scoring ──

function scoreComparable(subject, comp, asOfDate) {
  const subjectType = cleanType(subject.propertyType);
  const compType = cleanType(comp.propertyType);
  const sd = parseDate(comp.saleDate);
  const dist = number(comp.distanceMeters);
  const ageM = sd ? monthsBetween(sd, asOfDate) : Infinity;
  const srcCount = Math.max(1, Number(comp.sourceCount) || (comp.crossChecked ? 2 : 1));

    const scores = {
    propertyType: subjectType === compType ? 18 : typeMatches(subjectType, compType) ? 15 : 0,
    location: dist === null ? 5 : dist <= 100 ? 20 : dist <= 500 ? 16 : dist <= 1000 ? 12 : dist <= 2000 ? 8 : dist <= 3000 ? 4 : 0,
    recency: ageM <= 3 ? 16 : ageM <= 6 ? 14 : ageM <= 12 ? 11 : ageM <= 24 ? 6 : 2,
    size: 0, accommodation: 0, ageAndCondition: 0, streetAndOrientation: 0,
    sourceQuality: srcCount >= 3 ? 5 : srcCount === 2 ? 3 : 1
  };

  const subSize = (subjectType === "House" || subjectType === "Vacant land")
    ? number(subject.landSize) : number(subject.internalArea) || number(subject.buildingArea);
  const cmpSize = (subjectType === "House" || subjectType === "Vacant land")
    ? number(comp.landSize) : number(comp.internalArea) || number(comp.buildingArea);
  if (subSize && cmpSize) {
    const diff = Math.abs(subSize / cmpSize - 1);
    scores.size = diff <= 0.1 ? 15 : diff <= 0.2 ? 12 : diff <= 0.35 ? 8 : diff <= 0.5 ? 4 : 0;
  } else scores.size = 4;

  const roomDiff = ["bedrooms","bathrooms","carSpaces"].reduce((s,k) => {
    const sv = number(subject[k]), cv = number(comp[k]);
    return s + (sv === null || cv === null ? 0.75 : Math.abs(sv - cv));
  }, 0);
  scores.accommodation = roomDiff <= 0.5 ? 10 : roomDiff <= 1.5 ? 8 : roomDiff <= 3 ? 5 : 1;

  const yd = number(subject.yearBuilt) && number(comp.yearBuilt)
    ? Math.abs(number(subject.yearBuilt) - number(comp.yearBuilt)) : null;
  const cd = Math.abs((number(subject.conditionScore) ?? 3) - (number(comp.conditionScore) ?? 3));
  scores.ageAndCondition = yd === null
    ? Math.max(2, 6 - cd * 2) : yd <= 5 && cd <= 1 ? 8 : yd <= 15 && cd <= 1 ? 6 : yd <= 30 ? 4 : 2;

  const std = Math.abs((number(subject.microLocationScore) ?? 3) - (number(comp.microLocationScore) ?? 3));
    scores.streetAndOrientation = std === 0 ? 8 : std === 1 ? 5 : std === 2 ? 3 : 0;

  return { total: Object.values(scores).reduce((s,v) => s+v, 0), scores, ageMonths: round(ageM, 1), sourceCount: srcCount };
}

function validateComparable(subject, comp, asOfDate) {
  const r = [];
  const p = number(comp.salePrice);
  const sd = parseDate(comp.saleDate);
  // 仅对非 DB 来源（如浏览器采集）要求 sourceUrl；DB 里自然没有 source_url 的记录仍可使用
  const su = String(comp.sourceUrl || "").trim();
  const isDbSource = comp.verificationStatus || comp.sourceName || comp.batchId;
  if (!isDbSource && (!su || !/^https?:\/\//i.test(su))) r.push("missing-source-url");
  if (!p || p < 50000) r.push("missing-or-invalid-sold-price");
  if (!sd) r.push("missing-or-invalid-sale-date");
  if (sd && sd > asOfDate) r.push("future-sale-date");
  if (sd && monthsBetween(sd, asOfDate) > 60) r.push("sale-older-than-five-years");
  if (!typeMatches(cleanType(subject.propertyType), cleanType(comp.propertyType))) r.push("incompatible-property-type");
  if (comp.priceWithheld === true || comp.listingPrice === true) r.push("not-a-verifiable-settled-price");
  return r;
}

function timeOnlyAdjustment(sd, asOfDate, g) {
  const am = sd ? monthsBetween(sd, asOfDate) : 0;
  return clamp((number(g) || 0) * (am / 12), -0.15, 0.15);
}

// ── Step 2: Factor adjustments ──

function anchorFactorAdjustments(anchor, subject, comparables, macro) {
  const factors = {};
  const applied = [];

  // ① 地块大小（±5%）
  const subLand = number(subject.landSize);
  const compLands = comparables.map(c => number(c.landSize)).filter(Boolean);
  const compLandMed = median(compLands);
  if (subLand && compLandMed && compLandMed > 0) {
    const ratio = subLand / compLandMed;
    factors.landSizeAdj = clamp(Math.log(ratio) * 0.08, FACTOR_CAPS.landSizeAdj.min, FACTOR_CAPS.landSizeAdj.max);
    applied.push({ name: "landSizeAdj", label: "地块大小", value: round(factors.landSizeAdj, 4), detail: `${subLand}sqm vs median ${Math.round(compLandMed)}sqm` });
  } else {
    factors.landSizeAdj = 0;
    applied.push({ name: "landSizeAdj", label: "地块大小", value: 0, detail: "地块数据不足" });
  }

  // ② 街道质量（±3%）
  const subStr = number(subject.streetQualityScore) ?? 3;
  const compStrs = comparables.map(c => number(c.streetQualityScore)).filter(v => v != null);
  const compStrMed = compStrs.length ? median(compStrs) : 3;
  factors.streetQualityAdj = clamp((subStr - compStrMed) * 0.015, FACTOR_CAPS.streetQualityAdj.min, FACTOR_CAPS.streetQualityAdj.max);
  applied.push({ name: "streetQualityAdj", label: "街道质量", value: round(factors.streetQualityAdj, 4), detail: `subject ${subStr} vs comp median ${compStrMed}` });

  // ③ 卧室数（±5%）
  const subBed = number(subject.bedrooms);
  const compBeds = comparables.map(c => number(c.bedrooms)).filter(Boolean);
  const compBedMed = compBeds.length ? median(compBeds) : null;
  if (subBed && compBedMed) {
    factors.bedroomAdj = clamp((subBed - compBedMed) * 0.02, FACTOR_CAPS.bedroomAdj.min, FACTOR_CAPS.bedroomAdj.max);
    applied.push({ name: "bedroomAdj", label: "卧室数", value: round(factors.bedroomAdj, 4), detail: `subject ${subBed}br vs comp median ${compBedMed}br` });
  } else {
    factors.bedroomAdj = 0;
    applied.push({ name: "bedroomAdj", label: "卧室数", value: 0, detail: "房间数据不足" });
  }

  // ④ 市场动量（±5%）
  let momentum = 0;
  if (macro.cashRate != null && macro.cashRate > 4)
    momentum += -(macro.cashRate - 4) * 0.01;
  const seifaDecile = subject._seifaDecile ?? null;
  if (seifaDecile != null) {
    if (seifaDecile >= 8) momentum += 0.015;
    else if (seifaDecile >= 5) momentum += 0.005;
    else momentum += -0.005;
  }
  if (macro.incomeRentRatio != null && macro.incomeRentRatio < 3)
    momentum += Math.max(-0.02, (macro.incomeRentRatio - 3) * 0.005);
  if (macro.residentialDominant === false) momentum += -0.005;
  else if (macro.residentialDominant === true) momentum += 0.005;
  factors.marketMomentum = clamp(momentum, FACTOR_CAPS.marketMomentum.min, FACTOR_CAPS.marketMomentum.max);
  const md = [];
  if (macro.cashRate != null) md.push(`RBA ${macro.cashRate}%`);
  if (seifaDecile != null) md.push(`SEIFA ${seifaDecile}/10`);
  if (macro.incomeRentRatio != null) md.push(`I/R ${round(macro.incomeRentRatio,2)}`);
  if (macro.residentialDominant != null) md.push(macro.residentialDominant ? "住宅区" : "非住宅主导");
  applied.push({ name: "marketMomentum", label: "市场动量", value: round(factors.marketMomentum, 4), detail: md.join(" · ") });

  // ⑥ 教育评分（-3% ~ +8%）
  // ICSEA 全澳中位数 1000，以 1000 为基准
  // 正常区间（<1150）：每 ±50 分调 ±1%
  // 优秀区间（1150-1199, P95+）：调 +5% ~ +6.5%
  // 顶尖区间（1200+）：调 +8%
  const subIcsea = number(subject.avgIcsea);
  if (subIcsea) {
    if (subIcsea >= 1200) {
      factors.educationFactor = 0.08;
      applied.push({ name: "educationFactor", label: "教育评分", value: round(factors.educationFactor, 4), detail: `ICSEA ${subIcsea} [顶尖]` });
    } else if (subIcsea >= 1150) {
      const t = (subIcsea - 1150) / 50;  // 0 ~ 1
      factors.educationFactor = clamp(0.05 + t * 0.015, 0.05, 0.065);
      applied.push({ name: "educationFactor", label: "教育评分", value: round(factors.educationFactor, 4), detail: `ICSEA ${subIcsea} [优秀]` });
    } else {
      const diff = subIcsea - 1000;
      factors.educationFactor = clamp(diff * 0.0002, FACTOR_CAPS.educationFactor.min, 0.05);
      applied.push({ name: "educationFactor", label: "教育评分", value: round(factors.educationFactor, 4), detail: `ICSEA ${subIcsea} vs 1000 基准` });
    }
  } else {
    factors.educationFactor = 0;
    applied.push({ name: "educationFactor", label: "教育评分", value: 0, detail: "无学校数据" });
  }

  // ⑤ 数据质量（±2%）
  const crRatio = comparables.filter(c => c.sourceCount >= 2 || c.verificationStatus === "cross_source_verified").length / comparables.length;
  factors.dataQualityAdj = crRatio >= 0.5 ? 0.01 : crRatio >= 0.2 ? 0 : -0.01;
  if (comparables.every(c => c.verificationStatus === "single_source_observed")) factors.dataQualityAdj = -0.02;
  applied.push({ name: "dataQualityAdj", label: "数据质量", value: round(factors.dataQualityAdj, 4), detail: `交叉验证 ${round(crRatio*100)}%` });

  // ⑦ 高端 outlier 修正（0 ~ +10%）
  const compMaxPrice = Math.max(...comparables.map(c => c.timeAdjustedPrice));
  const compMinPrice = Math.min(...comparables.map(c => c.timeAdjustedPrice));
  const compMedianPrice = median(comparables.map(c => c.timeAdjustedPrice));
  const subPriceSignal = number(subject.expectedValue) || number(subject.estimatedSalePrice) || null;

  let highEndAdj = 0;
  let hreasons = [];

  if (subPriceSignal && compMedianPrice > 0) {
    const signalRatio = subPriceSignal / compMedianPrice;
    if (signalRatio >= 1.6) {
      highEndAdj = Math.min(0.08, (signalRatio - 1.0) * 0.04);
      hreasons.push(`subject预期/中位比=${signalRatio.toFixed(2)}x`);
    } else if (signalRatio >= 1.3) {
      highEndAdj = (signalRatio - 1.0) * 0.03;
      hreasons.push(`subject预期/中位比=${signalRatio.toFixed(2)}x`);
    }
    if (compMinPrice > 0 && compMaxPrice / compMinPrice > 2.5) {
      highEndAdj = Math.max(0, highEndAdj - 0.02);
      hreasons.push("comp跨度大(>2.5x)，修正降低");
    }
  }

  const compPriceSpread = compMaxPrice > 0 && compMedianPrice > 0 ? compMaxPrice / compMedianPrice : 1;
  if (compPriceSpread > 2.5) {
    highEndAdj = Math.min(highEndAdj, 0.04);
  }

  factors.highEndOutlier = clamp(highEndAdj, FACTOR_CAPS.highEndOutlier.min, FACTOR_CAPS.highEndOutlier.max);
  applied.push({ name: "highEndOutlier", label: "高端修正", value: round(factors.highEndOutlier, 4), detail: hreasons.join(" · ") || "无明确信号" });

  // ⑧ Census 一致性因子（-3% ~ +3%）
  // 比较中位房价与 Census 中位家庭收入+房贷的合理关系
  // 价格收入比 (PIR) = 中位房价 / 中位家庭年收入
  // 墨尔本合理范围：5-9x。偏低=低估，偏高=高估
  const cIncome = number(subject._censusMedianHhIncomeWeekly);
  const cMortgage = number(subject._censusMedianMortgageMonthly);
  const cmpHousePrice = median(comparables.map(c => c.timeAdjustedPrice));
  let censusAdj = 0;
  let cdetails = [];
  if (cIncome && cmpHousePrice > 0) {
    const annualIncome = cIncome * 52;
    const pir = cmpHousePrice / annualIncome;
    cdetails.push(`PIR ${round(pir,1)}x`);
    if (pir < 4) {
      // 极低 PIR：房价相对收入非常「便宜」→ 可能被低估
      censusAdj = clamp((4 - pir) * 0.01, 0, 0.03);
      cdetails.push(`低于合理范围(4-9x)，向上修正`);
    } else if (pir > 9) {
      // 极高 PIR：房价相对收入非常高 → 可能被高估
      censusAdj = clamp((9 - pir) * 0.005, -0.03, 0);
      cdetails.push(`高于合理范围(4-9x)，向下修正`);
    } else if (pir >= 4 && pir <= 5.5) {
      // 偏低但仍然合理 → 轻微向上
      censusAdj = 0.01;
      cdetails.push(`PIR偏低但仍合理`);
    } else if (pir >= 8) {
      // 偏高但仍然合理 → 轻微向下
      censusAdj = -0.01;
      cdetails.push(`PIR偏高但仍合理`);
    } else {
      cdetails.push(`PIR在合理范围(4-9x)`);
    }

    // 额外信号：房贷收入比 (Mortgage-to-Income ratio)
    // 如果中位房贷月供超过家庭月收入 40%，说明该区房贷负担重→估值有下行压力
    if (cMortgage && cIncome) {
      const mti = cMortgage / (cIncome * 4.33); // 月供 / 月收入
      cdetails.push(`MTI ${round(mti,2)}x`);
      if (mti > 0.5) {
        censusAdj += -0.01;
        cdetails.push(`房贷负担重(>50%收入)`);
      }
    }
  } else {
    cdetails.push("无 Census 收入数据");
  }
  factors.censusConsistency = clamp(censusAdj, FACTOR_CAPS.censusConsistency.min, FACTOR_CAPS.censusConsistency.max);
  applied.push({ name: "censusConsistency", label: "Census 一致性", value: round(factors.censusConsistency, 4), detail: cdetails.join(" · ") });

  const total = Object.values(factors).reduce((s, v) => s + v, 0);
  return { factors, total: clamp(total, -0.15, 0.15), applied };
}

function robustDispersionSimple(prices, midpoint) {
  if (prices.length < 2 || !midpoint) return 0;
  return median(prices.map(p => Math.abs(p - midpoint) / midpoint)) || 0;
}

function confidenceResult(rows, rejectedRows, dispersion, macro) {
  const rowCount = rows.length;
  const coreRows = rows.filter(r => r.qualityScore >= 80);
  const recentRows = rows.filter(r => r.ageMonths <= 6);
  const crossCheckedRows = rows.filter(r => r.sourceCount >= 2);
  const singleSourceRows = rows.filter(r => r.verificationStatus === "single_source_observed");
  const avgScore = rowCount ? rows.reduce((s, r) => s + r.qualityScore, 0) / rowCount : 0;

  let missing = 0, total = 0;
  for (const r of rows) {
    if (r.bedrooms == null) missing++; total++;
    if (r.bathrooms == null) missing++; total++;
    if (r.landSize == null) missing++; total++;
    if (r.salePrice == null) missing++;
  }
  const fieldC = total > 0 ? 1 - missing / total : 0.5;
  const oPenalty = dispersion > 0.15 ? 0.6 : dispersion > 0.10 ? 0.8 : dispersion > 0.075 ? 0.9 : 1.0;
  const ssRatio = rowCount > 0 ? singleSourceRows.length / rowCount : 0;
  const sPenalty = ssRatio > 0.5 ? 0.80 : ssRatio > 0 ? 0.90 : 1.0;
  const vpBoost = (macro.residentialDominant === true) ? 5 : (macro.residentialDominant === false) ? -3 : 0;

  const countS = clamp(rowCount * 10, 0, 35);
  const coreB = clamp(coreRows.length * 5, 0, 20);
  const recB = clamp(recentRows.length * 6, 0, 18);
  const crossB = clamp(crossCheckedRows.length * 5, 0, 15);
  const qualB = clamp((avgScore - 50) * 0.4, 0, 15);
  const compB = fieldC * 5;
  const rejP = Math.max(0, 10 - rejectedRows.length * 2);

  const raw = (countS + coreB + recB + crossB + qualB + compB + vpBoost) * oPenalty * sPenalty;
  const dataScore = clamp(Math.round(raw + rejP), 0, 100);

  let label;
  if (dataScore >= 78 && crossCheckedRows.length >= 3) label = "High";
  else if (dataScore >= 65 && crossCheckedRows.length >= 2) label = "Medium-High";
  else if (dataScore >= 50) label = "Medium";
  else if (dataScore >= 30) label = "Low-Medium";
  else label = "Low";

  return { label, dataScore: round(dataScore),
    reasons: [`${rowCount} accepted; ${rejectedRows.length} rejected.`, `${coreRows.length} core >= 80.`, `${recentRows.length} ≤6mo.`, `${crossCheckedRows.length} cross-sourced.`, `Dispersion ${round(dispersion*100,1)}%.`, ssRatio>0 ? `${round(ssRatio*100)}% single-source.` : null].filter(Boolean) };
}

// ═══════════════════════════════════════════
//  Large-Lot Valuation Mode
// ═══════════════════════════════════════════

/**
 * Detect whether the subject qualifies for Large-Lot Valuation Mode.
 *
 * Conditions (all must be met):
 * 1. propertyType = House
 * 2. Land size from an address-level source (user_input, title, vicmap, etc.)
 * 3. At least one of:
 *    a. subject.landSize >= 2,000㎡
 *    b. subject.landSize >= local P90
 *    c. subject.landSize / local median >= 2.0
 *
 * If land source is NOT address-level, it can still be a candidate
 * but will NOT enter full large_lot_house mode.
 *
 * @param {Object} subject
 * @param {Object} [landStats] - { median, p90 } from local land-size data
 * @param {Function} [isAddressLevelSource] - callback to check land source
 * @returns {{ mode: string, trigger: string[], localMedian: number|null, localP90: number|null, ratio: number|null }}
 */
export function detectLargeLotMode(subject, landStats, isAddressLevelSource) {
  const result = {
    mode: "standard_house",
    trigger: [],
    localMedian: null,
    localP90: null,
    ratio: null
  };

  // Condition 1: House only
  if (cleanType(subject.propertyType) !== "House") return result;

  const landSize = number(subject.landSize);
  if (!landSize || landSize <= 0) return result;

  // Check land source trustworthiness
  const isAddressLevel = isAddressLevelSource ? isAddressLevelSource(subject) : false;
  result.landSourceTrusted = isAddressLevel;

  // Local statistics
  const localMedian = landStats?.median ?? null;
  const localP90 = landStats?.p90 ?? null;
  result.localMedian = localMedian;
  result.localP90 = localP90;
  result.ratio = localMedian ? landSize / localMedian : null;

  // Evaluate triggers
  const triggers = [];
  if (landSize >= 2000) triggers.push("subject.landSize >= 2000");
  if (localP90 && landSize >= localP90) triggers.push("subject.landSize >= local P90");
  if (localMedian && (landSize / localMedian) >= 2.0) triggers.push("landSize / localMedian >= 2.0");

  if (triggers.length === 0) {
    // Not a large lot
    return { ...result, mode: "standard_house", trigger: [] };
  }

  result.trigger = triggers;

  if (isAddressLevel) {
    result.mode = "large_lot_house";
  } else {
    result.mode = "large_lot_candidate_unconfirmed";
  }

  return result;
}

/**
 * Select comparable sales for Large-Lot Mode, prioritizing land-size similarity.
 * Returns up to 12 best matches.
 *
 * @param {Object} subject
 * @param {Array} comparables - All available large-lot comparable records
 * @param {number} [landElasticity=0.196]
 * @returns {Object[]} Selected comparables with largeLotWeight
 */
export function selectLargeLotComparables(subject, comparables, landElasticity = 0.196) {
  if (!comparables.length) return [];
  const subLand = number(subject.landSize) || 1;
  const subBed = number(subject.bedrooms) || 3;
  const subBath = number(subject.bathrooms) || 2;
  const subYb = number(subject.yearBuilt);
  const subCond = number(subject.conditionScore) ?? 3;

  // Score each comp for large-lot relevance
  const scored = comparables.map(c => {
    const cLand = number(c.landSize) || 1;
    const landRatio = cLand / subLand;
    const landScore = landRatio >= 0.65 && landRatio <= 1.50 ? 30
      : landRatio >= 0.50 && landRatio <= 2.00 ? 20
      : 5;

    const dist = number(c.distanceMeters);
    const distScore = dist === null ? 10
      : dist <= 500 ? 25
      : dist <= 1000 ? 22
      : dist <= 2000 ? 18
      : dist <= 3000 ? 14
      : dist <= 5000 ? 8
      : 3;

    const ageM = number(c.ageMonths);
    const recency = ageM === null ? 10
      : ageM <= 6 ? 25
      : ageM <= 12 ? 20
      : ageM <= 24 ? 15
      : ageM <= 36 ? 10
      : 5;

    const cBeds = number(c.bedrooms) || subBed;
    const cBaths = number(c.bathrooms) || subBath;
    const bedDiff = Math.abs(cBeds - subBed);
    const bathDiff = Math.abs(cBaths - subBath);
    const accomScore = bedDiff <= 1 && bathDiff <= 1 ? 15
      : bedDiff <= 2 ? 10
      : 5;

    const ybDiff = subYb && c.yearBuilt ? Math.abs(subYb - c.yearBuilt) : 0;
    const condDiff = Math.abs((number(c.conditionScore) ?? 3) - subCond);
    const conditionScore = ybDiff <= 10 && condDiff <= 1 ? 15
      : ybDiff <= 20 ? 10
      : 5;

    const largeLotScore = landScore + distScore + recency + accomScore + conditionScore;

    return { ...c, largeLotScore, landRatio };
  });

  // Sort: large-lot similarity first, then proximity, then recency
  scored.sort((a, b) => {
    // Primary: land ratio closeness to 1.0 (prefer similar size over everything)
    const aRatioDiff = Math.abs((a.landRatio || 1) - 1);
    const bRatioDiff = Math.abs((b.landRatio || 1) - 1);
    if (aRatioDiff !== bRatioDiff) return aRatioDiff - bRatioDiff;
    // Secondary: distance
    return (a.distanceMeters || Infinity) - (b.distanceMeters || Infinity);
  });

  return scored.slice(0, 12);
}

/**
 * Channel A: Large-Lot Comparable Total-Price Method
 * Non-linear land size adjustment via elasticity.
 *
 * adjustedPrice = compPrice × distAdj × (subLand/compLand)^landElasticity × accomAdj × conditionAdj
 */
export function channelAEstimate(subject, comparables, landElasticity = 0.196) {
  if (!comparables.length) return null;
  const subLand = number(subject.landSize) || 1;
  const subBed = number(subject.bedrooms) || 3;
  const subBath = number(subject.bathrooms) || 2;
  const subYb = number(subject.yearBuilt);
  const subCond = number(subject.conditionScore) ?? 3;

  const adjusted = comparables.map(c => {
    const cLand = number(c.landSize) || subLand;
    const cPrice = number(c.salePrice) || 0;
    if (!cPrice) return null;

    // Distance adjustment (direction-aware: closer is better, further is worse)
    const dist = number(c.distanceMeters);
    let distAdj;
    if (dist === null) { distAdj = 1.0; }
    else {
      // Melbourne large lots are sparse — 1km diff is minor, use gentle gradient
      // Only adjust downward for >3km, symmetrically adjust upward for <1km
      const distFactor = Math.max(-0.06, Math.min(0.06, (1000 - dist) / 100000));
      distAdj = 1.0 + distFactor;
    }

    const ageM = number(c.ageMonths) || 0;

    // Time adjustment: disabled for large-lot Channel A.
    // The primary valuation path already handles time adjustment via
    // effectiveGrowthRate. A flat 0.3%/month discount for old sales is
    // unjustified without a market-aware time index, so timeAdj = 1.0.
    const timeAdj = 1.0;
    const landRatio = subLand / cLand;
    const landAdj = Math.pow(landRatio, landElasticity);

    // Accommodation adjustment (bidirectional: more rooms = premium, fewer = discount)
    const cBeds = number(c.bedrooms) || subBed;
    const cBaths = number(c.bathrooms) || subBath;
    const bedDiff = cBeds - subBed;
    const bathDiff = cBaths - subBath;
    // ±2% per bedroom difference, ±1.5% per bathroom
    const bedFactor = -bedDiff * 0.02;   // negative diff (comp has fewer) → +adjustment
    const bathFactor = -bathDiff * 0.015;
    const accomAdj = 1.0 + clamp(bedFactor + bathFactor, -0.06, 0.06);

    // Condition adjustment (bidirectional)
    // If comp condition (5) > subject condition (3), condDiff = +2.
    // A better-condition comp means the subject is WORSE than the comp,
    // so the subject's price should be adjusted DOWN relative to the comp.
    // Formula: adjust DOWN when comp has better condition.
    const condDiff = (number(c.conditionScore) ?? 3) - subCond;
    const condAdj = 1.0 - clamp(condDiff * 0.02, -0.06, 0.06);

    // Total adjustment: ONLY land, accommodation, condition, time
    // Distance affects WEIGHT only, not price
    const totalAdj = timeAdj * landAdj * accomAdj * condAdj;

    // Weight: land similarity dominant, distance & recency as secondary
    const landRatioComp = (cLand / subLand);
    const landSimWeight = landRatioComp >= 0.80 && landRatioComp <= 1.25 ? 1.2
      : landRatioComp >= 0.65 && landRatioComp <= 1.50 ? 1.0
      : 0.6;
    const distW = dist === null ? 0.5 : Math.exp(-dist / 4000);
    const recW = Math.exp(-ageM / 24);  // ageM in months, halve weight every ~17 months
    const weight = landSimWeight * distW * recW;

    return {
      compPrice: cPrice,
      adjustedPrice: Math.round(cPrice * totalAdj),
      adjustments: { distAdj, timeAdj, landAdj, accomAdj, condAdj, totalAdj },
      landRatio: cLand / subLand,
      weight
    };
  }).filter(Boolean);

  if (!adjusted.length) return null;

  // Weighted median
  const sorted = adjusted.filter(a => a).sort((a, b) => a.adjustedPrice - b.adjustedPrice);
  const totalWeight = sorted.reduce((s, a) => s + a.weight, 0);
  let cumulative = 0;
  let weightedMedian = sorted[sorted.length - 1]?.adjustedPrice || 0;
  for (const a of sorted) {
    cumulative += a.weight;
    if (cumulative >= totalWeight / 2) {
      weightedMedian = a.adjustedPrice;
      break;
    }
  }

  // Weighted mean
  const weightedMean = sorted.reduce((s, a) => s + a.adjustedPrice * a.weight, 0) / totalWeight;

  return { adjusted, weightedMedian: Math.round(weightedMedian), weightedMean: Math.round(weightedMean) };
}

/**
 * Channel B: Land + Improvements Method
 * Requires land value estimate and building data.
 * Falls back to Channel A if insufficient data.
 */
export function channelBEstimate(subject, comparables, landValueEstimate) {
  // Land value from comparable vacant land or assessed site value
  const landValue = number(landValueEstimate);
  if (!landValue) return null;

  // Improvement value: depreciated replacement cost
  const buildingArea = number(subject.buildingArea) || number(subject.internalArea);
  const yearBuilt = number(subject.yearBuilt);
  const bedrooms = number(subject.bedrooms) || 3;
  const bathrooms = number(subject.bathrooms) || 2;

  if (!buildingArea) return null;  // Can't estimate improvement value without building size

  // Replacement cost (very rough estimate for Melbourne):
  // $2,000–$3,500/sqm depending on quality
  const baseRate = yearBuilt && yearBuilt < 1960 ? 2500
    : yearBuilt && yearBuilt < 1990 ? 2800
    : yearBuilt && yearBuilt < 2010 ? 3000
    : yearBuilt ? 3300
    : 2800;  // unknown age

  const replacementCost = buildingArea * baseRate;

  // Age/condition depreciation
  const effectiveAge = yearBuilt ? Math.max(0, 2026 - yearBuilt) : 40;
  const annualDepreciation = 0.015;  // 1.5%/year straight line
  const maxDepreciation = 0.50;  // cap at 50%
  const depreciation = Math.min(maxDepreciation, effectiveAge * annualDepreciation);

  const improvementValue = Math.round(replacementCost * (1 - depreciation));
  const channelBEstimate = landValue + improvementValue;

  // Safety: Channel B should not exceed 3x the smallest large comp
  const minCompPrice = comparables.length
    ? Math.min(...comparables.map(c => number(c.salePrice) || Infinity))
    : Infinity;

  return {
    landValue: Math.round(landValue),
    improvementValue,
    replacementCost,
    depreciation: round(depreciation, 4),
    channelBEstimate: Math.round(channelBEstimate),
    cappedEstimate: minCompPrice < Infinity
      ? Math.min(Math.round(channelBEstimate), Math.round(minCompPrice * 3))
      : Math.round(channelBEstimate)
  };
}

/**
 * Compute whether Channel B data is sufficient.
 */
export function channelBFeasible(subject) {
  const buildingArea = number(subject.buildingArea) || number(subject.internalArea);
  const landValue = number(subject.estimatedLandValue);
  // We need either building area + some land value signal
  return !!(buildingArea && (landValue || subject.landSize));
}

/**
 * Compute large-lot confidence score.
 */
export function largeLotConfidence(subject, channelAResult, channelBResult, largeLotComps, landStats) {
  // Count large-lot comparables
  const landCompCount = largeLotComps.filter(c => {
    const ratio = number(c.landSize) && number(subject.landSize)
      ? number(c.landSize) / number(subject.landSize)
      : 0;
    return ratio >= 0.65 && ratio <= 1.50;
  }).length;

  const medianDist = largeLotComps.length
    ? median(largeLotComps.map(c => number(c.distanceMeters)).filter(Boolean))
    : null;

  const medianSizeRatio = largeLotComps.length
    ? median(largeLotComps.map(c => number(c.landSize) && number(subject.landSize)
        ? number(c.landSize) / number(subject.landSize)
        : null).filter(Boolean))
    : null;

  // Determine fallback tier
  const fallbackTier = largeLotComps.length >= 3 ? "L1"
    : largeLotComps.length >= 1 ? "L2"
    : "L3";

  // Score factors
  const compCountScore = Math.min(35, landCompCount * 12);
  const distScore = medianDist && medianDist <= 2000 ? 20
    : medianDist && medianDist <= 5000 ? 12
    : 5;
  const sizeRatioScore = medianSizeRatio && medianSizeRatio >= 0.80 && medianSizeRatio <= 1.25 ? 20
    : medianSizeRatio && medianSizeRatio >= 0.50 && medianSizeRatio <= 2.00 ? 12
    : 5;
  const planningDataAvailable = subject.planningDataAvailable ? 15 : 0;
  const buildingDataAvailable = subject.buildingDataAvailable ? 10 : 0;

  const rawScore = compCountScore + distScore + sizeRatioScore + planningDataAvailable + buildingDataAvailable;
  const dataScore = Math.min(100, rawScore);

  let label;
  if (dataScore >= 80 && landCompCount >= 3) label = "Medium-High";
  else if (dataScore >= 60 && landCompCount >= 2) label = "Medium";
  else if (dataScore >= 35 && landCompCount >= 1) label = "Low-Medium";
  else label = "Low";

  return {
    label,
    dataScore,
    landComparableCount: largeLotComps.length,
    landComparableWithSimilarSizeCount: landCompCount,
    landComparableMedianDistance: medianDist ? Math.round(medianDist) : null,
    landComparableMedianSizeRatio: medianSizeRatio ? round(medianSizeRatio, 3) : null,
    planningDataAvailable: !!subject.planningDataAvailable,
    buildingDataAvailable: !!subject.buildingDataAvailable,
    largeLotFallbackTier: fallbackTier
  };
}

// ── Coverage check: does subject fit within comp pool? ──

function coverageCheck(subject, accepted, anchor) {
  // If subject has a price signal (expectedValue or estimatedSalePrice),
  // check if the comp pool can actually cover it
  const subPriceSignal = number(subject.expectedValue) || number(subject.estimatedSalePrice) || null;
  if (!subPriceSignal || accepted.length < 3) return { ok: true };

  const compPrices = accepted.map(c => c.timeAdjustedPrice);
  const compMin = Math.min(...compPrices);
  const compMax = Math.max(...compPrices);
  const compMed = median(compPrices);

  // Case 1: subject is way above comp pool (luxury/institutional property in mid-range suburb)
  // comp median < $1m and subject > 2x comp median → can't cover
  if (compMed && subPriceSignal > compMed * 2 && compMax / compMed < 1.5) {
    // comps are tightly clustered and subject is far above them
    return { ok: false, reason: "subject-price-signal-far-above-comparable-pool",
      detail: `Subject estimated ~$${subPriceSignal.toLocaleString()}, comp median ~$${(compMed||0).toLocaleString()}, ratio ${(subPriceSignal/(compMed||1)).toFixed(2)}x` };
  }

  // Case 2: subject is way below comp pool (cheap property in expensive area)
  if (compMed && subPriceSignal < compMed * 0.4) {
    return { ok: false, reason: "subject-price-signal-far-below-comparable-pool",
      detail: `Subject estimated ~$${subPriceSignal.toLocaleString()}, comp median ~$${(compMed||0).toLocaleString()}, ratio ${(subPriceSignal/(compMed||1)).toFixed(2)}x` };
  }

  // Case 3: anchor is very far from subject signal (> 60% difference)
  if (anchor > 0) {
    const anchorRatio = subPriceSignal / anchor;
    if (anchorRatio > 1.6 || anchorRatio < 0.55) {
      return { ok: false, reason: "anchor-mismatches-subject-signal",
        detail: `Subject ~$${subPriceSignal.toLocaleString()}, anchor $${anchor.toLocaleString()}, ratio ${anchorRatio.toFixed(2)}x` };
    }
  }

  return { ok: true };
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

  if (absProfile?.ok && absProfile.seifa?.decileAustralia != null)
    subject._seifaDecile = absProfile.seifa.decileAustralia;

  const macro = {
    cashRate: rbaRates?.cashRate ?? null,
    incomeRentRatio: (absProfile?.ok && absProfile.medians?.medianRent)
      ? (absProfile.medians?.medianHouseholdIncome || 0) / absProfile.medians.medianRent : null,
    residentialDominant: (vicplan?.ok && vicplan.features?.buildingCount > 0)
      ? (vicplan.features.landuseTypes || []).some(l => l.type === "residential") : null
  };

  let effectiveGrowthRate = number(input.annualMarketGrowthRate) || 0;
  if (macro.cashRate != null && macro.cashRate > 4)
    effectiveGrowthRate = Math.max(effectiveGrowthRate - (macro.cashRate - 4) * 0.005, -0.02);

  const comparables = Array.isArray(input.comparables) ? input.comparables : [];
  const asOfDate = parseDate(input.asOfDate) || new Date();

  // ── Large-Lot Detection (run BEFORE scoring loop) ──
  // Inject large-lot comparables so they are scored and land in acceptedComparables.
  const largeLotLandStats = input.largeLotLandStats || null;
  const isLandSourceTrusted = input.isAddressLevelLandSource || (() => false);
  const largeLotDetect = detectLargeLotMode(subject, largeLotLandStats, isLandSourceTrusted);
  const largeLotComps = input.largeLotComparables || [];

  // When large_lot_house mode is active, merge large-lot comparables into the
  // main comparables list BEFORE scoring, so they flow through the normal
  // accepted-comparable pipeline.
  if (largeLotDetect.mode === "large_lot_house" && largeLotComps.length > 0) {
    const selectedLargeComps = selectLargeLotComparables(subject, largeLotComps);
    const existingAddrs = new Set(comparables.map(c => c.address));
    for (const llc of selectedLargeComps) {
      if (!existingAddrs.has(llc.address)) {
        llc._largeLotComp = true;
        comparables.push(llc);
        existingAddrs.add(llc.address);
      }
    }
  }

  const accepted = [];
  const rejected = [];

  // ── Phase 1: Validate & Score ──
  for (let i = 0; i < comparables.length; i++) {
    const c = comparables[i];
    const rej = validateComparable(subject, c, asOfDate);
    if (rej.length) {
      rejected.push({ index: i, address: c.address || "Unknown", sourceUrl: c.sourceUrl || "", reasons: rej });
      continue;
    }
    const quality = scoreComparable(subject, c, asOfDate);
    if (quality.total < 50) {
      rejected.push({ index: i, address: c.address || "Unknown", sourceUrl: c.sourceUrl, reasons: ["quality-score-below-50"], qualityScore: quality.total });
      continue;
    }
    const tAdj = timeOnlyAdjustment(parseDate(c.saleDate), asOfDate, effectiveGrowthRate);
    const sp = number(c.salePrice);
    accepted.push({
      index: i, address: c.address, sourceUrl: c.sourceUrl,
      secondarySourceUrls: c.secondarySourceUrls || [],
      salePrice: sp, timeAdjustedPrice: Math.round(sp * (1 + tAdj)),
      saleDate: parseDate(c.saleDate).toISOString().slice(0, 10),
      propertyType: cleanType(c.propertyType), distanceMeters: number(c.distanceMeters),
      ageMonths: quality.ageMonths, sourceCount: quality.sourceCount,
      qualityScore: quality.total,
      bedrooms: c.bedrooms ?? null, bathrooms: c.bathrooms ?? null, carSpaces: c.carSpaces ?? null,
      landSize: c.landSize ?? null,
      verificationStatus: c.verificationStatus || "unverified",
      _sourceMode: c._sourceMode || null,
      _largeLotComp: c._largeLotComp || false,
      qualityBand: quality.total >= 80 ? "Core" : quality.total >= 65 ? "Supporting" : "Context",
      qualityBreakdown: quality.scores,
      timeAdjustment: round(tAdj, 5),
      weight: round((quality.total / 100) ** 2 * (quality.sourceCount >= 2 ? 1.08 : 1), 5)
    });
  }

  // ── Minimum comparables: always produce estimate, degrade confidence if <2 ──
  if (accepted.length < 1 && (!largeLotDetect || largeLotDetect.mode !== "large_lot_house")) {
    return { ok: false, status: "insufficient-verifiable-comparables",
      subject: (() => { const s = { ...subject }; delete s._seifaDecile; return s; })(),
      acceptedComparables: accepted, rejectedComparables: rejected,
      estimate: null,
      confidence: { label: "Low", dataScore: 0, sigma: null, reasons: ["No verifiable comparables."] } };
  }
  const fewComps = accepted.length < 3;

  // ── Phase 2: Anchor ──
  const medEst = weightedMedianWithKey(accepted, "timeAdjustedPrice");
  const meanEst = weightedMeanWithKey(accepted, "timeAdjustedPrice");
  const anchor = Math.round(medEst * 0.7 + meanEst * 0.3);

  // ── Phase 2b: Coverage check ──
  // Check if comp pool covers subject's price range.
  // Don't reject — degrade confidence and widen range instead.
  const coverage = coverageCheck(subject, accepted, anchor);
  const poorCoverage = !coverage.ok;
  const coverageDetail = poorCoverage ? coverage.detail : null;

  // ── Phase 3: Factors ──
  const factorResults = anchorFactorAdjustments(anchor, subject, accepted, macro);
  const finalMidpoint = Math.round(anchor * (1 + factorResults.total));

  // ── Phase 4: Range ──
  const rawPrices = accepted.map(c => c.timeAdjustedPrice);
  const rawDispersion = robustDispersionSimple(rawPrices, anchor);
  const reductionFactor = Math.min(0.3, (1 - factorResults.factors.dataQualityAdj) * 0.15);
  let sigma = Math.max(rawDispersion, 0.025) * (1 - reductionFactor);
  // Widen range when coverage is poor or comps are few
  if (poorCoverage) sigma = Math.max(sigma, 0.12);
  if (fewComps) sigma = Math.max(sigma, 0.10);
  const customerHalfRange = Math.min(MAX_CUSTOMER_RANGE, sigma * 3);

  // ── Confidence ──
  const confidence = confidenceResult(accepted, rejected, rawDispersion, macro);

  // ── Large-Lot Combined Estimate ──
  // largeLotDetect, selectedLargeComps already computed above.
  // Here we compute the combined Channel A + B estimate.
  let largeLotResult = null;
  let channelAResult = null;
  let channelBResult = null;
  let largeLotConf = null;

  if (largeLotDetect && largeLotDetect.mode === "large_lot_house" && input.largeLotComparables?.length > 0) {
    // Re-select from the original large-lot comparables, not the merged ones
    const selectedLargeComps = selectLargeLotComparables(subject, input.largeLotComparables);

    if (selectedLargeComps.length > 0) {
      // Channel A: Non-linear land total-price method (initial weight 70%)
      channelAResult = channelAEstimate(subject, selectedLargeComps);

      // Channel B: Land + Improvements (initial weight 30%)
      const landValueEstimate = number(subject.estimatedLandValue);
      const bFeasible = channelBFeasible(subject);
      if (bFeasible && landValueEstimate) {
        channelBResult = channelBEstimate(subject, selectedLargeComps, landValueEstimate);
      }

      // Dynamic weights
      let weightA = 0.70;
      let weightB = 0.30;
      if (!channelBResult) {
        weightA = 1.0;
        weightB = 0.0;
      }

      const chAEst = channelAResult ? channelAResult.weightedMedian : null;
      const chBEst = channelBResult ? channelBResult.channelBEstimate : null;

      let combinedMidpoint = null;
      if (chAEst && chBEst) {
        combinedMidpoint = Math.round(chAEst * weightA + chBEst * weightB);
      } else if (chAEst) {
        combinedMidpoint = chAEst;
      }

      if (combinedMidpoint) {
        largeLotConf = largeLotConfidence(subject, channelAResult, channelBResult, selectedLargeComps, largeLotLandStats);

        // Check if coordinates were available for distance-aware scoring
        const coordinatesAvailable = input.subject?.coordinates?.lat != null;

        // Wider range for limited comparable large lots
        let llSigma = 0.10;
        if (largeLotConf.landComparableWithSimilarSizeCount < 3) {
          llSigma = 0.15;
        }
        if (largeLotConf.landComparableWithSimilarSizeCount < 1) {
          llSigma = 0.20;
        }

        const experimentalReasons = [];
        if (selectedLargeComps.length < 3) {
          experimentalReasons.push(`仅 ${selectedLargeComps.length} 个大块地可比`);
        }
        if (!coordinatesAvailable) {
          experimentalReasons.push("无精确坐标，距离评级降级");
        }
        const experimentalLabel = experimentalReasons.length > 0
          ? `⚠️ 实验性结果 — ${experimentalReasons.join("；")}`
          : null;

        largeLotResult = {
          valuationMode: "large_lot_house",
          channelAWeight: weightA,
          channelBWeight: weightB,
          channelA: channelAResult ? {
            weightedMedian: channelAResult.weightedMedian,
            weightedMean: channelAResult.weightedMean,
            comparableCount: channelAResult.adjusted.length,
            landElasticity: 0.196
          } : null,
          channelB: channelBResult ? {
            landValue: channelBResult.landValue,
            improvementValue: channelBResult.improvementValue,
            replacementCost: channelBResult.replacementCost,
            depreciation: channelBResult.depreciation
          } : null,
          combinedMidpoint,
          range: {
            low: Math.round(combinedMidpoint * (1 - llSigma)),
            high: Math.round(combinedMidpoint * (1 + llSigma))
          },
          confidence: largeLotConf,
          comparableCount: selectedLargeComps.length,
          experimental: experimentalLabel
        };
      }
    }
  }

  return {
    ok: true, status: "estimated",
    asOfDate: asOfDate.toISOString().slice(0, 10),
    subject: (() => { const s = { ...subject }; delete s._seifaDecile; return s; })(),
    methodology: {
      anchor: "Step 1: Time-adjusted weighted median×0.7 + mean×0.3 from comparable sales.",
      factorAdjustments: "Step 2: Anchor-based factor corrections (block size, street quality, bedrooms, market momentum, data quality, high-end price signal).",
      customerRangeCap: MAX_CUSTOMER_RANGE,
      coverageCheck: "Subject price signal vs comparable pool coverage; widens range when mismatch exceeds +/-60%."
    },
    coverageIssue: poorCoverage ? coverageDetail : null,
    estimate: largeLotResult && largeLotResult.combinedMidpoint
      ? {
          midpoint: largeLotResult.combinedMidpoint,
          anchor: largeLotResult.combinedMidpoint,
          low: largeLotResult.range.low,
          high: largeLotResult.range.high,
          customerHalfRange: round((largeLotResult.range.high - largeLotResult.range.low) / (2 * largeLotResult.combinedMidpoint), 5),
          sigma: round((largeLotResult.range.high - largeLotResult.combinedMidpoint) / largeLotResult.combinedMidpoint, 5),
          weightedMedian: Math.round(largeLotResult.channelA?.weightedMedian || largeLotResult.combinedMidpoint),
          weightedMean: Math.round(largeLotResult.channelA?.weightedMean || largeLotResult.combinedMidpoint),
          factorAdjustments: [
            { name: "largeLotMode", label: "大块地估值模式", value: 0, detail: `Combined ChA(${round(largeLotResult.channelAWeight*100)}%) + ChB(${round(largeLotResult.channelBWeight*100)}%)` },
            { name: "landElasticity", label: "土地弹性系数", value: 0, detail: `β=${largeLotResult.channelA?.landElasticity || 0.196}` }
          ],
          factorTotal: 0
        }
      : {
          midpoint: finalMidpoint, anchor,
          low: Math.round(finalMidpoint * (1 - customerHalfRange)),
          high: Math.round(finalMidpoint * (1 + customerHalfRange)),
          customerHalfRange: round(customerHalfRange, 5),
          sigma: round(sigma, 5),
          weightedMedian: Math.round(medEst), weightedMean: Math.round(meanEst),
          factorAdjustments: factorResults.applied,
          factorTotal: round(factorResults.total, 4)
        },
    confidence: largeLotResult ? {
      ...confidence,
      label: largeLotResult.confidence?.label || confidence.label,
      dataScore: largeLotResult.confidence?.dataScore ?? confidence.dataScore,
      reasons: [
        ...(largeLotResult.confidence?.reasons || []),
        `Large-lot mode: ${largeLotResult.comparableCount} comps selected (${largeLotResult.confidence?.landComparableWithSimilarSizeCount || 0} similar-size)`,
        largeLotResult.comparableCount < 3 ? "⚠️ 样本量太少，本估值为实验性结果，仅供内部参考。" : null
      ].filter(Boolean)
    } : confidence,
    valuationMode: largeLotDetect?.mode || "standard_house",
    largeLotDetect: largeLotDetect.mode !== "standard_house" ? largeLotDetect : null,
    largeLotResult,
    acceptedComparables: accepted.sort((a,b) => b.weight - a.weight),
    rejectedComparables: rejected
  };
}

export const valuationModelDefaults = { maxCustomerRange: MAX_CUSTOMER_RANGE, factorCaps: FACTOR_CAPS };
