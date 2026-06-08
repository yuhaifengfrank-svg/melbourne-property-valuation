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
  Unit: new Set(["Unit", "Apartment", "Villa"]),
  Apartment: new Set(["Apartment", "Unit"]),
  "Vacant land": new Set(["Vacant land", "Land"])
};

const FACTOR_CAPS = {
  landSizeAdj: { min: -0.05, max: 0.05 },
  streetQualityAdj: { min: -0.03, max: 0.03 },
  bedroomAdj: { min: -0.05, max: 0.05 },
  marketMomentum: { min: -0.05, max: 0.05 },
  dataQualityAdj: { min: -0.02, max: 0.02 },
  highEndOutlier: { min: 0, max: 0.10 }
};

// ── helpers ──

function number(v) { const p = Number(v); return Number.isFinite(p) ? p : null; }
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
    propertyType: subjectType === compType ? 20 : typeMatches(subjectType, compType) ? 13 : 0,
    location: dist === null ? 5 : dist <= 100 ? 18 : dist <= 500 ? 16 : dist <= 1000 ? 13 : dist <= 2000 ? 9 : dist <= 3000 ? 5 : 0,
    recency: ageM <= 3 ? 18 : ageM <= 6 ? 16 : ageM <= 12 ? 13 : ageM <= 24 ? 8 : 3,
    size: 0, accommodation: 0, ageAndCondition: 0, streetAndOrientation: 0,
    sourceQuality: srcCount >= 3 ? 5 : srcCount === 2 ? 4 : 2
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
  scores.streetAndOrientation = std === 0 ? 6 : std === 1 ? 4 : std === 2 ? 2 : 0;

  return { total: Object.values(scores).reduce((s,v) => s+v, 0), scores, ageMonths: round(ageM, 1), sourceCount: srcCount };
}

function validateComparable(subject, comp, asOfDate) {
  const r = [];
  const p = number(comp.salePrice);
  const sd = parseDate(comp.saleDate);
  const su = String(comp.sourceUrl || "").trim();
  if (!su || !/^https?:\/\//i.test(su)) r.push("missing-source-url");
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

  // ⑤ 数据质量（±2%）
  const crRatio = comparables.filter(c => c.sourceCount >= 2 || c.verificationStatus === "cross_source_verified").length / comparables.length;
  factors.dataQualityAdj = crRatio >= 0.5 ? 0.01 : crRatio >= 0.2 ? 0 : -0.01;
  if (comparables.every(c => c.verificationStatus === "single_source_observed")) factors.dataQualityAdj = -0.02;
  applied.push({ name: "dataQualityAdj", label: "数据质量", value: round(factors.dataQualityAdj, 4), detail: `交叉验证 ${round(crRatio*100)}%` });

  // ⑥ 高端 outlier 修正（0 ~ +10%）
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
      qualityBand: quality.total >= 80 ? "Core" : quality.total >= 65 ? "Supporting" : "Context",
      qualityBreakdown: quality.scores,
      timeAdjustment: round(tAdj, 5),
      weight: round((quality.total / 100) ** 2 * (quality.sourceCount >= 2 ? 1.08 : 1), 5)
    });
  }

  // ── Minimum comparables: always produce estimate, degrade confidence if <2 ──
  if (accepted.length < 1) {
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
    estimate: {
      midpoint: finalMidpoint, anchor,
      low: Math.round(finalMidpoint * (1 - customerHalfRange)),
      high: Math.round(finalMidpoint * (1 + customerHalfRange)),
      customerHalfRange: round(customerHalfRange, 5),
      sigma: round(sigma, 5),
      weightedMedian: Math.round(medEst), weightedMean: Math.round(meanEst),
      factorAdjustments: factorResults.applied,
      factorTotal: round(factorResults.total, 4)
    },
    confidence,
    acceptedComparables: accepted.sort((a,b) => b.weight - a.weight),
    rejectedComparables: rejected
  };
}

export const valuationModelDefaults = { maxCustomerRange: MAX_CUSTOMER_RANGE, factorCaps: FACTOR_CAPS };
