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
  const maxResults = 12;
  // 可注入的 DB source（测试用）
  const injectedDbSource = options.dbSource || null;

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

  // ── 地址核验：Nominatim 核验结果作为唯一 canonical address ──
  // 如果 suburb 或 state 明确冲突，直接返回 mismatch，不继续估值
  const collectorSubject = collectorResult.subject || {};
  if (collectorSubject.addressMismatch) {
    return {
      ok: false,
      status: "address-mismatch",
      error: collectorSubject.addressMismatch.message,
      mismatch: collectorSubject.addressMismatch,
      valuation: null,
      subject: collectorSubject,
      customerDataStatus: "unavailable",
      isFallback: false,
      modelVersion: "1.0.0",
      collectedAt: new Date().toISOString(),
      asOfDate: new Date().toISOString().slice(0, 10)
    };
  }

  // 地址核验通过后：使用 canonicalAddress 作为唯一地址
  // canonicalAddress 优先于原始输入，确保 API payload / subject / DB 查询一致
  const effectiveAddress = collectorSubject.canonicalAddress || address;
  const effectiveSuburb = collectorSubject.suburb || suburb || "";
  const effectiveState = collectorSubject.state || state || "VIC";

  let comps = (collectorResult.ok && collectorResult.comparables) ? collectorResult.comparables : [];
  // 测试注入：如果提供了 mockCollectorComparables，优先使用（模拟 CDP 有结果）
  if (options.mockCollectorComparables && Array.isArray(options.mockCollectorComparables)) {
    comps = options.mockCollectorComparables;
  }
  let primaryMode = collectorResult.ok ? (allowFetch ? "live_collected" : "db_collected") : "unavailable";
  const subjectFromCollector = collectorResult.subject || {};

  // ── CDP 无结果或不足（<3 comps）时尝试数据库 source ──
  // useDatabaseFallback 不覆盖已有实时结果
  if (comps.length < 3 && effectiveState && (useDatabaseFallback || allowFetch === false)) {
    const dbSource = injectedDbSource || getDbSource();
    const dbAvailable = await dbSource.checkConnection();
    if (dbAvailable) {
      // 使用 collector 已解析的 postcode（Nominatim 验证结果优先于输入地址正则）
      const postcodeFromCollector = subjectFromCollector.postcode || "";
      // SA2 代码：从 collector 解析的 subject 读取（如果有 SA2 映射表则从此注入）
      // 目前 db-comparable-source.fetch 内部会在 suburb+postcode 不足时尝试 sa2Code
      const sa2FromCollector = subjectFromCollector.sa2Code || "";
      const dbRecs = await dbSource.fetch({
        suburb: effectiveSuburb,
        state: effectiveState,
        propertyType: propertyType,
        postcode: postcodeFromCollector,
        sa2Code: sa2FromCollector
      }, { maxResults });
      if (dbRecs.length > 0) {
        // 合并：保留已有浏览器结果，插入新增 DB 结果
        // 主来源仍是数据库（数据库有验证记录）
        const existingAddr = new Set(comps.map(c => c.address));
        for (const dbc of dbRecs) {
          if (!existingAddr.has(dbc.address) && comps.length < maxResults) {
            dbc._sourceMode = "database_verified";
            comps.push(dbc);
          }
        }
        primaryMode = "database_verified";
        // collectorResult 追加来源信息
        // sourceResults kept server-side only
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
      customerDataStatus: "unavailable",
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
      address: subj.address || effectiveAddress || address,
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
      state: subj.state || effectiveState,
      suburb: subj.suburb || effectiveSuburb
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
          acceptedComparables: acc,
          modelVersion: valuation.modelVersion || "1.0.0"
        }
      : null,
    comparables: acc.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      carSpaces: c.carSpaces,
      landSize: c.landSize,
      distanceMeters: c.distanceMeters
    })),
    customerDataStatus: (() => {
      if (!hasEstimate) return "unavailable";
      const crossVerified = acc.filter(c => c.verificationStatus === "cross_source_verified").length;
      const singleObserved = acc.filter(c => c.verificationStatus === "single_source_observed").length;
      const totalOk = acc.length;
      if (crossVerified >= 1) return "sufficient";
      if (singleObserved >= 3 || totalOk >= 3) return "limited";
      if (totalOk >= 1) return "limited";
      return "unavailable";
    })(),
    disclaimer: "本估值基于评估时可获得的公开市场信息、房产特征及统计分析生成，仅供一般信息和研究参考。数据可能存在延迟、不完整或第三方记录差异。本报告并非正式估价、信贷决定、法律、税务或财务建议。作出交易或融资决定前，请咨询持牌专业人士。",
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
