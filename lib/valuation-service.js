// ── 共享估值应用服务 ──
// dev-server.mjs 和 api/valuation.js 共用
// 统一采集 → 估值 → 响应编排逻辑

import { collectComparableResearch } from "./comparable-research-collector.js";
import { valueProperty } from "./valuation-engine.js";
import { DatabaseComparableSource } from "./db-comparable-source.js";

// 单例数据库 source（惰性初始化）
let _dbSource = null;
function getDbSource() {
  if (!_dbSource) _dbSource = new DatabaseComparableSource();
  return _dbSource;
}

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
  const useDatabaseFallback = options.useDatabaseFallback === true;

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
      bedrooms: bedrooms ? parseInt(bedrooms) : undefined,
      bathrooms: bathrooms ? parseInt(bathrooms) : undefined,
      carSpaces: carSpaces ? parseInt(carSpaces) : undefined,
      landSize: landSize ? parseInt(landSize) : undefined
    },
    { fetch: allowFetch }
  );

  let comps = (collectorResult.ok && collectorResult.comparables) ? collectorResult.comparables : [];
  let primaryMode = collectorResult.ok ? (allowFetch ? "live_collected" : "db_collected") : "unavailable";

  // ── CDP 无结果或不足（<3 comps）时尝试数据库 source ──
  // useDatabaseFallback 不覆盖已有实时结果
  if (comps.length < 3 && state && (useDatabaseFallback || allowFetch === false)) {
    const dbSource = getDbSource();
    const dbAvailable = await dbSource.checkConnection();
    if (dbAvailable) {
      const dbRecs = await dbSource.fetch({
        suburb: suburb || "",
        state: state || "VIC",
        propertyType: propertyType
      }, { maxResults: 12 });
      if (dbRecs.length > 0) {
        comps = dbRecs;
        primaryMode = "database_verified";
        // collectorResult 追加来源信息
        collectorResult.sourceResults = collectorResult.sourceResults || [];
        collectorResult.sourceResults.push({
          source: "database",
          found: dbRecs.length,
          mode: "database_verified"
        });
      }
    }
  }

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
      bedrooms: subj.bedrooms || (parseInt(bedrooms) || null),
      bathrooms: subj.bathrooms || (parseInt(bathrooms) || null),
      carSpaces: subj.carSpaces || (parseInt(carSpaces) || null),
      landSize: subj.landSize || (parseInt(landSize) || null),
      conditionScore: null,
      microLocationScore: null,
      streetQualityScore: streetQualityFromAddress(address) || null,
      planningScore: null,
      riskScore: null
    },
    comparables: comps,
    annualMarketGrowthRate: 0.03
  });

  const acc = (valuation.ok && valuation.estimate) ? (valuation.acceptedComparables || []) : [];
  const hasEstimate = valuation.ok && valuation.estimate;

  return {
    ok: true,
    status: hasEstimate ? "completed" : "valuation-failed",
    isFallback: false,
    subject: {
      ...(collectorResult.subject || {}),
      address: subj.address || address,
      propertyType: subj.propertyType || propertyType || "House",
      state: subj.state || state || "VIC",
      suburb: subj.suburb || suburb || ""
    },
    modelVersion: "1.0.0",
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
          acceptedComparables: acc,
          modelVersion: valuation.modelVersion || "1.0.0"
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
    // evidenceMode 标签含义：
    //   live_verified        — 实时 CDP 抓取 + 至少 3 个被接受 comps
    //   database_verified    — 从数据库读取已验证记录
    //   research_only        — 有一些 comps 但来源不够充分
    //   unavailable          — 无法获取任何 data
    evidenceMode: (() => {
      if (!hasEstimate) return "unavailable";
      // 数据库来源：只有已验证记录才标 database_verified
      if (primaryMode === "database_verified") {
        // 检查是否有至少一条已确认的 verified 记录
        const hasVerified = comps.some(c => c.verificationStatus === "verified");
        if (hasVerified) return "database_verified";
        return "research_only";
      }
      if (!allowFetch) return "research_only";
      // 验证必须跨来源：至少 2 个不同域名
      const crossVerified = acc.filter(c => {
        const url = c.sourceUrl || "";
        const hasDualSource = c.sourceCount >= 2;
        const hasCoreUrl = c.qualityBand === "Core" && url.startsWith("http");
        return hasDualSource || hasCoreUrl;
      });
      const uniqueDomains = new Set();
      crossVerified.forEach(c => {
        try { uniqueDomains.add(new URL(c.sourceUrl).hostname); } catch { /* ignore */ }
      });
      if (crossVerified.length >= 3 && uniqueDomains.size >= 2) return "live_verified";
      if (acc.length > 0) return "research_only";
      return "unavailable";
    })(),
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
