// ── 共享估值应用服务 ──
// dev-server.mjs 和 api/valuation.js 共用
// 统一采集 → 估值 → 响应编排逻辑

import { collectComparableResearch } from "./comparable-research-collector.js";
import { valueProperty } from "./valuation-engine.js";

/**
 * 执行完整估值链路：采集 → 估值 → 构建响应
 *
 * @param {Object} params
 * @param {string} params.address
 * @param {string} [params.suburb]
 * @param {string} [params.state]
 * @param {string} [params.propertyType]
 * @param {number} [params.bedrooms]
 * @param {number} [params.bathrooms]
 * @param {number} [params.carSpaces]
 * @param {number} [params.landSize]
 * @param {Object} [options]
 * @param {boolean} [options.fetch=true] 允许实时网络采集
 * @returns {Promise<Object>} 统一响应
 */
export async function runValuation(params, options = {}) {
  const {
    address, suburb, state, propertyType,
    bedrooms, bathrooms, carSpaces, landSize
  } = params || {};

  if (!address) {
    return {
      ok: false,
      status: "missing-address",
      error: "Address is required",
      valuation: null,
      subject: {},
      evidenceMode: "unavailable",
      isFallback: false,
      modelVersion: "1.0.0",
      collectedAt: new Date().toISOString(),
      asOfDate: new Date().toISOString().slice(0, 10)
    };
  }

  // 采集 comparable + 公共数据
  const allowFetch = options.fetch !== false;
  const collectorResult = await collectComparableResearch(
    {
      address,
      suburb: suburb || undefined,
      state: state || undefined,
      propertyType: propertyType || undefined,
      bedrooms: parseInt(bedrooms) || 3,
      bathrooms: parseInt(bathrooms) || 2,
      carSpaces: parseInt(carSpaces) || 2,
      landSize: parseInt(landSize) || 400
    },
    { fetch: allowFetch }
  );

  const comps = (collectorResult.ok && collectorResult.comparables) ? collectorResult.comparables : [];
  const hasValidComps = comps.length > 0;

  if (!hasValidComps) {
    return {
      ok: true,
      status: "no-comparables",
      valuation: null,
      message: "Could not collect comparable sales data for this address.",
      subject: collectorResult.subject || {},
      sourceResults: collectorResult.sourceResults || [],
      evidenceMode: "unavailable",
      isFallback: false,
      modelVersion: "1.0.0",
      collectedAt: new Date().toISOString(),
      asOfDate: new Date().toISOString().slice(0, 10)
    };
  }

  const subj = collectorResult.subject || {};
  const firstComp = comps[0] || {};

  // 估值
  const valuation = valueProperty({
    publicData: {
      absProfile: collectorResult.absProfile || null,
      rbaRates: collectorResult.rbaRates || null,
      vicplan: collectorResult.vicplan || null
    },
    subject: {
      address: subj.address || address,
      propertyType: subj.propertyType || propertyType || "House",
      bedrooms: parseInt(bedrooms) || firstComp.bedrooms || 3,
      bathrooms: parseInt(bathrooms) || firstComp.bathrooms || 2,
      carSpaces: parseInt(carSpaces) || firstComp.carSpaces || 2,
      landSize: parseInt(landSize) || firstComp.landSize || 400,
      conditionScore: 3,
      microLocationScore: 3,
      streetQualityScore: streetQualityFromAddress(address),
      planningScore: 3,
      riskScore: 2
    },
    comparables: comps,
    annualMarketGrowthRate: 0.03
  });

  const acc = (valuation.ok && valuation.estimate) ? (valuation.acceptedComparables || []) : [];
  const hasEstimate = valuation.ok && valuation.estimate;

  return {
    ok: true,
    status: hasEstimate ? "completed" : "valuation-failed",
    subject: {
      ...(collectorResult.subject || {}),
      address: subj.address || address,
      propertyType: subj.propertyType || propertyType || "House",
      state: subj.state || state || "VIC",
      suburb: subj.suburb || suburb || ""
    },
    valuation: hasEstimate
      ? {
          ok: true,
          estimate: {
            midpoint: valuation.estimate.midpoint,
            low: valuation.estimate.low,
            high: valuation.estimate.high
          },
          confidence: valuation.confidence,
          statisticalIntervals: valuation.statisticalIntervals,
          acceptedComparables: acc
        }
      : null,
    comparables: acc.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      adjustedPrice: c.adjustedPrice,
      qualityBand: c.qualityBand,
      qualityScore: c.qualityScore,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      carSpaces: c.carSpaces,
      landSize: c.landSize,
      distanceMeters: c.distanceMeters
    })),
    sourceResults: collectorResult.sourceResults || [],
    evidenceMode: hasEstimate ? "live_verified" : "unavailable",
    isFallback: false,
    modelVersion: "1.0.0",
    collectedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10)
  };
}

function streetQualityFromAddress(address) {
  const a = (address || "").toLowerCase();
  if (/\b(close|place|court|way|loop|circuit|parade|garden|grove|green|view|vista|ridge|crest|heights|chase|vale|meadow|park)$/.test(a)) return 5;
  if (/\b(avenue|ave|crescent|cres|drive|dr|terrace|terr|walk|lane|rise|gate|glen|dell|bend|nook|lea|field|brook|dene|side)$/.test(a)) return 4;
  if (/\b(street|st|road|way|broadway)$/.test(a)) return 3;
  if (/\b(highway|hwy|motorway|freeway|expressway|by-pass|bypass)$/.test(a)) return 2;
  return 3;
}
