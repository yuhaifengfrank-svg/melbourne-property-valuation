// ── 共享估值应用服务 ──
// dev-server.mjs 和 api/valuation.js 共用
// 统一采集 → 估值 → 响应编排逻辑

import { collectComparableResearch } from "./comparable-research-collector.js";
import { valueProperty } from "./valuation-engine.js";
import { DatabaseComparableSource } from "./db-comparable-source.js";
import { getSuburbSchoolProfile } from "./school-service.js";
import { getSuburbCensus } from "./census-service.js";
import { createRequire } from "module";
import { getLandSizeFactor, getLandSizeForSuburb, getLandSizeP90, getLandSizeMedian } from "./land-size-service.js";
import { checkHeritage } from "./heritage-service.js";

const _require = createRequire(import.meta.url);

// ── Hedonic Pricing Model（惰性加载）──
let _hedonicModel = null;
function getHedonicModel() {
  if (_hedonicModel === null) {
    try {
      _hedonicModel = _require("./hedonic-model.json");
    } catch (e) {
      _hedonicModel = false; // 标记不可用
    }
  }
  return _hedonicModel || null;
}

/**
 * 用 Hedonic Pricing Model 预测价格
 * log(price) = b0 + b1*bedrooms + b2*log(landSize) + suburb_log_adjustment
 */
function hedonicPredict(suburb, bedrooms, landSize) {
  const model = getHedonicModel();
  if (!model) return null;
  const suburbEff = model.suburbEffects?.[suburb];
  if (!suburbEff) return null;
  const { intercept, perBedroom, perLogLand } = model.globalCoefficients;
  const logLand = Math.log(Math.max(landSize || 100, 1));
  const b = parseInt(bedrooms) || 3;
  const logPred = intercept + perBedroom * b + perLogLand * logLand + suburbEff.logAdjustment;
  return Math.exp(logPred);
}

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
 * @param {boolean} [options.useDatabaseFallback] 旧参数，不再使用（DB 现已为第一数据源）
 * @param {*} [options.dbSource] 可注入的 DB source（测试用）
 * @returns {Promise<Object>} 统一响应
 */
export async function runValuation(params, options = {}) {
  const {
  coordinates,
    address, suburb, state,
    bedrooms, bathrooms, carSpaces, landSize
  } = params || {};
  const rawPropertyType = params?.propertyType || "";

  // ── 地址格式反推类型（覆盖前端推断错误） ──
  // 前端 inferPropertyTypeFromAddress 可能把 5-7 Old Warrandyte Rd 误判为 Unit
  // 以下函数在地址确认不属于传入类型时做修正
  const propertyType = overridePropertyTypeFromAddress(address, rawPropertyType);

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

  // ── 地址核验：Nominatim 辅助核验 ──
  // Nominatim 作为辅助工具，不阻断估值。addressMismatch 仅在同一 suburb 内发现
  // 明确街道/门牌冲突时设置，但这不影响 DB 查询（DB 按 user-input suburb 查询）。
  // 保留 mismatch 信息供上层使用，但不阻断主流程。
  const collectorSubject = collectorResult.subject || {};
  const addressMismatch = collectorSubject.addressMismatch;

  // 地址核验通过后：使用 canonicalAddress 作为唯一地址
  // canonicalAddress 优先于原始输入，确保 API payload / subject / DB 查询一致
  const effectiveAddress = collectorSubject.canonicalAddress || address;
  const effectiveSuburb = collectorSubject.suburb || suburb || "";
  const effectiveState = collectorSubject.state || state || "VIC";

  // ── 自动 landSize 解析 ──
  // 如果用户/前端没有提供 landSize，尝试从 LGA residential proxy median 自动获取
  // 这能激活 Hedonic Model 和 land size factor 调整，大幅提升估值质量
  // 实现：suburb → school_locations → lga_code → land-size-service
  // ── Unit 强制忽略 landSize ──
  // Nominatim / CDP 解析 unit 地址时返回的是整个地块数据（landSize 409m²、bedrooms 等），
  // 对于 Unit 估值这完全是错误的。无论用户传什么样的 landSize，都不能用于 unit 估值。
  // 同理，collectorResult.subject.landSize 在后面处理时也会被跳过（见 filter-out-unit-land-size）。
  let autoResolvedLandSize = landSize ? parseInt(landSize) : undefined;
  const unitOverride = propertyType && propertyType.toLowerCase().trim() === 'unit';
  if (unitOverride) {
    autoResolvedLandSize = null;
  } else if (!autoResolvedLandSize && effectiveSuburb) {
    try {
      const landStats = getLandSizeForSuburb(effectiveSuburb, 'residential');
      if (landStats && landStats.median_area_m2) {
        autoResolvedLandSize = Math.round(landStats.median_area_m2);
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  }

  // ── 优先使用 DB 数据作为第一数据源 ──
  // DB 有周更采集的 comparable_sales，查询 50ms，无需启动浏览器
  // CDP 实时抓取作为补充（仅为 DB 不足时提供额外数据）
  let comps = [];
  let primaryMode = "unavailable";
  const subjectFromCollector = collectorResult.subject || {};

  // 测试注入：如果提供了 mockCollectorComparables，跳过 DB 和 CDP
  if (options.mockCollectorComparables && Array.isArray(options.mockCollectorComparables)) {
    comps = options.mockCollectorComparables;
  } else if (effectiveState) {
    const dbSource = injectedDbSource || getDbSource();
    const dbAvailable = await dbSource.checkConnection();
    if (dbAvailable) {
      const postcodeFromCollector = subjectFromCollector.postcode || "";
      const sa2FromCollector = subjectFromCollector.sa2Code || "";
      const dbRecs = await dbSource.fetch({
        suburb: effectiveSuburb,
        state: effectiveState,
        propertyType: propertyType,
        postcode: postcodeFromCollector,
        sa2Code: sa2FromCollector,
        coordinates: subjectFromCollector.coordinates ? {
          lat: subjectFromCollector.coordinates.lat,
          lon: subjectFromCollector.coordinates.lon
        } : (collectorResult.coordinates ? {
          lat: collectorResult.coordinates.lat,
          lon: collectorResult.coordinates.lon
        } : null)
      }, { maxResults });
      if (dbRecs.length > 0) {
        comps = dbRecs.map(r => ({
          ...r,
          _sourceMode: "database_verified"
        }));
        primaryMode = "database_verified";
      }
    }

    // ── DB 不足时，用 CDP 实时数据补充 ──
    // 只有 DB 结果少于 maxResults 时才触发浏览器抓取
    if (comps.length < maxResults && allowFetch !== false) {
      const cdpComps = (collectorResult.ok && collectorResult.comparables) ? collectorResult.comparables : [];
      if (cdpComps.length > 0) {
        const existingAddr = new Set(comps.map(c => c.address));
        for (const c of cdpComps) {
          if (!existingAddr.has(c.address) && comps.length < maxResults) {
            c._sourceMode = "live_collected";
            comps.push(c);
            existingAddr.add(c.address);
          }
        }
        if (!primaryMode || primaryMode === "unavailable") {
          primaryMode = "live_collected";
        } else {
          primaryMode = "hybrid_db_cdp";
        }
      } else if (!primaryMode || primaryMode === "unavailable") {
        // CDP 也没数据，但 collector 跑过了，标记为尝试过
        primaryMode = collectorResult.ok ? (allowFetch ? "live_collected" : "db_collected") : "unavailable";
      }
    } else if (comps.length > 0 && !primaryMode) {
      primaryMode = "database_verified";
    }
  } else {
    // 无 state，回退到 CDP
    comps = (collectorResult.ok && collectorResult.comparables) ? collectorResult.comparables : [];
    primaryMode = collectorResult.ok ? (allowFetch ? "live_collected" : "db_collected") : "unavailable";
  }

  // ── Unit 地址：清除 collector 返回的整块地数据 ──
  // Nominatim / CDP 解析 "Unit 1, 11 McIntosh St" 时返回的是 11 McIntosh St 的整块地信息，
  // 包括 landSize=409m²、bedrooms、bathrooms 等。这些数据对 Unit 估值完全错误，必须清理。
  // 同时保持 coordinates/postcode/suburb/state 等位置信息可用。
  // filter-out-unit-land-size（标记供 grep 追踪）
  if (unitOverride && subjectFromCollector) {
    subjectFromCollector.landSize = undefined;
    delete subjectFromCollector.bedrooms;
    delete subjectFromCollector.bathrooms;
    delete subjectFromCollector.carSpaces;
    delete subjectFromCollector.landSizeSource;
  }



  // 过滤未知类型的 comps（防止 Unknown 或 null 类型混入估值）
  comps = comps.filter(c => c.propertyType && c.propertyType !== 'Unknown' && c.propertyType !== 'Unknown' && c.propertyType !== null);

  const hasValidComps = comps.length > 0;
  const levelTag = comps.length >= 3 ? "a" : comps.length > 0 ? "b" : "z";

  // ── Large-Lot early detection ──
  // For House with landSize, always check if large-lot comparables exist in DB.
  // valueProperty internally decides whether to merge them based on
  // detectLargeLotMode. This runs regardless of hasValidComps so large-lot
  // comps are available alongside normal comps.
  let largeLotCompsForLevelC = [];
  let largeLotLandStatsForLevelC = null;
  if (propertyType === "House" && (landSize || autoResolvedLandSize) && effectiveState) {
    try {
      const med = getLandSizeForSuburb(effectiveSuburb, 'residential');
      const gm = await import("./land-size-service.js");
      const p90 = gm.getLandSizeP90 ? gm.getLandSizeP90(effectiveSuburb) : null;
      largeLotLandStatsForLevelC = { median: med?.median_area_m2 || null, p90 };
    } catch { /* silent */ }
  }

  if (largeLotLandStatsForLevelC && (landSize || autoResolvedLandSize) && effectiveState) {
    const { DatabaseComparableSource } = await import("./db-comparable-source.js");
    const dbSrc = injectedDbSource || new DatabaseComparableSource();
    const available = await dbSrc.checkConnection();
    if (available) {
      const subjLat = subjectFromCollector.coordinates?.lat || collectorResult.coordinates?.lat;
      const subjLon = subjectFromCollector.coordinates?.lon || collectorResult.coordinates?.lon;
      const fetched = await dbSrc.fetchLargeLot({
        suburb: effectiveSuburb, state: effectiveState,
        landSize: landSize || autoResolvedLandSize,
        coordinates: subjLat && subjLon ? { lat: Number(subjLat), lon: Number(subjLon) } : null
      }, { maxResults: 50 });
      if (fetched && fetched.length > 0) {
        const { detectLargeLotMode } = await import("./valuation-engine.js");
        const detection = detectLargeLotMode({
          propertyType, landSize: landSize || autoResolvedLandSize,
          bedrooms, bathrooms
        }, largeLotLandStatsForLevelC, () => true);
        if (detection.mode === "large_lot_house") {
          largeLotCompsForLevelC = fetched;
          for (const c of fetched) { c._largeLotComp = true; }
        }
      }
    }
  }

  if (!hasValidComps && !largeLotCompsForLevelC.length) {
    // ── Level C: Hedonic Model 优先，退化到 Suburb Median 兜底 ──
    const subjForMedian = collectorResult.subject || {};
    const subjBedrooms = subjForMedian.bedrooms || (parseInt(bedrooms) || null);
    const subjLandSize = subjForMedian.landSize || autoResolvedLandSize || null;

    // 尝试 Hedonic Model 估值（需要 bedrooms + landSize + suburb 在模型中）
    if (subjBedrooms && subjLandSize && effectiveSuburb) {
      const hedonicPrice = hedonicPredict(effectiveSuburb, subjBedrooms, subjLandSize);
      if (hedonicPrice !== null && hedonicPrice > 0) {
        const modelPrice = Math.round(hedonicPrice);
        const priceSpan = Math.round(modelPrice * 0.15);
        return {
          ok: true,
          status: "completed",
          dataTier: "model_led",
          valuationMethod: "hedonic_log_linear",
          valuation: {
            ok: true,
            estimate: {
              midpoint: modelPrice,
              low: Math.round(modelPrice * 0.85),
              high: Math.round(modelPrice * 1.15),
              anchor: Math.round(hedonicPrice),
              factorTotal: 0,
              factorAdjustments: []
            },
            confidence: {
              label: "Low-Medium",
              dataScore: 35,
              reasons: ["估值基于 hedonic pricing model（bedrooms + landSize + suburb 效应）"]
            },
            acceptedComparables: [],
            modelVersion: "2.0.0"
          },
          valuationMode: "standard_house",
          largeLotDetect: null,
          largeLotResult: null,
          subject: collectorResult.subject || {},
          comparables: [],
          customerDataStatus: "model_based",
          isFallback: true,
          fallbackLevel: "c",
          modelVersion: "2.0.0",
          collectedAt: new Date().toISOString(),
          asOfDate: new Date().toISOString().slice(0, 10),
          disclaimer: "本估值基于 Hedonic Pricing Model 生成。精度受限于训练数据量和特征完备性，仅供参考。"
        };
      }
    }

    // Level C 退化：Suburb Median + 因子调整
    const dbSource = injectedDbSource || getDbSource();
    const medianResult = await fetchMedianForProperty(effectiveSuburb, effectiveState, propertyType, dbSource);
    if (medianResult && medianResult.median_price) {
      const medianEstimate = estimateFromSuburbMedian({
        address: effectiveAddress,
      coordinates: subjectFromCollector.coordinates || (coordinates ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null),
        suburb: effectiveSuburb,
        state: effectiveState,
        propertyType: subjForMedian.propertyType || propertyType || "House",
        bedrooms: subjForMedian.bedrooms || (parseInt(bedrooms) || null),
        bathrooms: subjForMedian.bathrooms || (parseInt(bathrooms) || null),
        landSize: subjForMedian.landSize || autoResolvedLandSize || null
      }, medianResult);

      return {
        ok: true,
        status: "completed",
        dataTier: "median_led",
        valuationMethod: "suburb_median_with_factors",
        valuation: {
          ok: true,
          estimate: {
            midpoint: medianEstimate.estimate.midpoint,
            low: medianEstimate.estimate.low,
            high: medianEstimate.estimate.high,
            anchor: medianEstimate.estimate.anchor,
            factorTotal: medianEstimate.estimate.factorTotal,
            factorAdjustments: medianEstimate.estimate.factorAdjustments
          },
          confidence: medianEstimate.confidence,
          acceptedComparables: [],
          modelVersion: "1.0.0"
        },
        valuationMode: "standard_house",
        largeLotDetect: null,
        largeLotResult: null,
        subject: collectorResult.subject || {},
        comparables: [],
        customerDataStatus: "model_based",
        isFallback: true,
        fallbackLevel: "c",
        modelVersion: "1.0.0",
        collectedAt: new Date().toISOString(),
        asOfDate: new Date().toISOString().slice(0, 10),
        disclaimer: "本估值基于该区域同类房产的中位价格。由于本地址近期无可比成交记录，估值精度较低。仅供一般信息参考。"
      };
    }

    // 实在没数据
    return {
      ok: true,
      status: "no-comparables",
      valuation: null,
      dataTier: "none",
      valuationMethod: "none",
      message: "Could not collect comparable sales data for this address.",
      valuationMode: "standard_house",
      largeLotDetect: null,
      largeLotResult: null,
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

  // ── 查询学校 + Census 数据（估值前注入）──
  let avgIcsea = null, schoolCount = null;
  let censusIncome = null, censusMortgage = null, censusRent = null, censusPop = null;

  if (effectiveSuburb) {
    try {
      const schoolData = await getSuburbSchoolProfile(effectiveSuburb, effectiveState);
      if (schoolData) {
        avgIcsea = schoolData.avgIcsea ?? null;
        schoolCount = schoolData.schoolCount ?? null;
      }
    } catch { /* school data optional */ }
    let censusData;
    try {
      censusData = await getSuburbCensus(effectiveSuburb);
    } catch { censusData = null; }
    if (censusData) {
      censusIncome = censusData.median_household_income_weekly;
      censusMortgage = censusData.median_mortgage_monthly;
      censusRent = censusData.median_rent_weekly;
      censusPop = censusData.population;
      // SEIFA 已入库 census_sa2_data.seifa JSONB，直接用
      // 不再需要 abs-client 的实时 API 查询
      if (censusData.seifa?.irsad_decile != null) {
        subj._seifaDecile = censusData.seifa.irsad_decile;
      }
    }
  }

  // Large-lot land stats: use pre-computed if available, else compute
  const largeLotLandStats = largeLotLandStatsForLevelC || (() => {
    if (!effectiveSuburb || propertyType !== "House") return null;
    try {
      const med = getLandSizeForSuburb(effectiveSuburb, 'residential');
      // lazy getLandSizeP90
      return { median: med?.median_area_m2 || null, p90: null };
    } catch { return null; }
  })() || null;

  // Large-lot comparables: prefer pre-computed (from early detection), else inject via options or DB query
  let largeLotComps = largeLotCompsForLevelC.length ? largeLotCompsForLevelC : (options.largeLotComparables || []);
  if (largeLotLandStats && !largeLotComps.length && effectiveState && !largeLotCompsForLevelC.length) {
    try {
      const { DatabaseComparableSource } = await import("./db-comparable-source.js");
      const dbSrc = injectedDbSource || new DatabaseComparableSource();
      const available = await dbSrc.checkConnection();
      if (available) {
        const subjLat = subjectFromCollector.coordinates?.lat || collectorResult.coordinates?.lat;
        const subjLon = subjectFromCollector.coordinates?.lon || collectorResult.coordinates?.lon;
        const fetched = await dbSrc.fetchLargeLot({
          suburb: effectiveSuburb, state: effectiveState,
          landSize: subj.landSize || autoResolvedLandSize,
          coordinates: subjLat && subjLon ? { lat: Number(subjLat), lon: Number(subjLon) } : null
        }, { maxResults: 50 });
        if (fetched && fetched.length) {
          largeLotComps.push(...fetched);
        }
      }
    } catch (e) {
      console.warn("[runValuation] large-lot comps fetch error:", e.message);
    }
  }

  const valuation = valueProperty({
    publicData: {
      absProfile: collectorResult.absProfile || null,
      rbaRates: collectorResult.rbaRates || null,
      vicplan: collectorResult.vicplan || null
    },
    subject: {
      address: effectiveAddress,
      coordinates: subjectFromCollector.coordinates || (coordinates ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null),
      propertyType: subj.propertyType || propertyType || "House",
      bedrooms: subj.bedrooms || (parseInt(bedrooms) || null),
      bathrooms: subj.bathrooms || (parseInt(bathrooms) || null),
      carSpaces: subj.carSpaces || (parseInt(carSpaces) || null),
      landSize: subj.landSize || autoResolvedLandSize || null,
      landSizeSource: subj.landSizeSource || (landSize ? "user_input" : autoResolvedLandSize ? "lga_residential_proxy" : null), // 用户明确输入=user_input, 自动解析=lga_proxy
      landSizeConfidence: subj.landSizeConfidence || null,
      buildingArea: subj.buildingArea || null,
      internalArea: subj.internalArea || null,
      yearBuilt: subj.yearBuilt || null,
      estimatedLandValue: subj.estimatedLandValue || null,
      conditionScore: null,
      microLocationScore: null,
      streetQualityScore: null,  // 将在 valueProperty 中通过 street-quality-service 计算
      planningScore: null,
      riskScore: null,
      avgIcsea,
      _censusMedianHhIncomeWeekly: censusIncome,
      _censusMedianMortgageMonthly: censusMortgage,
    },
    comparables: comps,
    annualMarketGrowthRate: 0.03,
    largeLotLandStats,
    largeLotComparables: largeLotComps,
    isAddressLevelLandSource: (sbj) => {
      if (!sbj || !sbj.landSizeSource) return false;
      return ["user_input", "title_record", "listing_confirmed", "vicmap_parcel", "contract_of_sale", "survey_plan", "council_record"].includes(sbj.landSizeSource);
    }
  });

  const acc = (valuation.ok && valuation.estimate) ? (valuation.acceptedComparables || []) : [];
  const hasEstimate = valuation.ok && valuation.estimate;

  // ── 新估值模型（六五模型）──
  // ── State machine: classify dataTier + valuationMethod based on accepted comps ──
  let dataTier, valuationMethod, fallbackLevel;
  if (!hasEstimate) {
    dataTier = "none";
    valuationMethod = "none";
    fallbackLevel = "z";
  } else if (acc.length >= 3) {
    dataTier = "comparable_led";
    valuationMethod = "weighted_comparables";
    fallbackLevel = "a";
  } else if (acc.length >= 1) {
    dataTier = "hybrid";
    valuationMethod = "comparable_with_median_boostrap";
    fallbackLevel = "b";
  } else {
    dataTier = "median_led";
    valuationMethod = "suburb_median_with_factors";
    fallbackLevel = "c";
  }

  // ── Build enriched subject for snapshot storage ──
  // Uses the same field resolution as the valueProperty() call above
  // so bedrooms/bathrooms/carSpaces/landSize reflect actual inputs.
  const enrichedSubject = {
    address: effectiveAddress,
    suburb: subj.suburb || effectiveSuburb,
    state: subj.state || effectiveState,
    postcode: collectorResult.subject?.postcode || subjectFromCollector.postcode || "",
    propertyType: subj.propertyType || propertyType || "House",
    bedrooms: subj.bedrooms || (parseInt(bedrooms) || null),
    bathrooms: subj.bathrooms || (parseInt(bathrooms) || null),
    carSpaces: subj.carSpaces || (parseInt(carSpaces) || null),
    landSize: subj.landSize || autoResolvedLandSize || null,
    landSizeSource: subj.landSizeSource || (landSize ? "user_input" : autoResolvedLandSize ? "lga_residential_proxy" : null),
    buildingArea: subj.buildingArea || null,
    yearBuilt: subj.yearBuilt || null,
  };

  // ── Heritage status check ──
  let heritageResult = { flagged: false, sources: [], details: [], discount: 0, note: null };
  const heritageCoords = subjectFromCollector.coordinates || (coordinates ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null);
  if (heritageCoords?.lat && heritageCoords?.lon) {
    try {
      const db = injectedDbSource || (await import('./db-service.js')).default;
      heritageResult = await checkHeritage(db, heritageCoords.lat, heritageCoords.lon, collectorResult.vicplan);
    } catch (e) {
      console.warn('[runValuation] heritage check error:', e.message);
    }
  }

  return {
    ok: true,
    status: hasEstimate ? "completed" : "valuation-failed",
    dataTier,
    valuationMethod,
    isFallback: fallbackLevel !== "a",
    fallbackLevel: fallbackLevel,
    subject: {
      ...(collectorResult.subject || {}),
      address: enrichedSubject.address,
      coordinates: subjectFromCollector.coordinates || (coordinates ? { lat: Number(coordinates.lat), lon: Number(coordinates.lon) } : null),
      propertyType: enrichedSubject.propertyType,
      state: enrichedSubject.state,
      suburb: enrichedSubject.suburb,
      bedrooms: enrichedSubject.bedrooms,
      bathrooms: enrichedSubject.bathrooms,
      carSpaces: enrichedSubject.carSpaces,
      landSize: enrichedSubject.landSize,
      landSizeSource: enrichedSubject.landSizeSource,
      buildingArea: enrichedSubject.buildingArea,
      yearBuilt: enrichedSubject.yearBuilt,
    },
    valuationMode: valuation.valuationMode || "standard_house",
    largeLotDetect: valuation.largeLotDetect || null,
    largeLotResult: valuation.largeLotResult || null,
    modelVersion: "1.0.0",
    valuation: hasEstimate
      ? (() => {
          let est = {
            midpoint: valuation.estimate.midpoint,
            low: valuation.estimate.low,
            high: valuation.estimate.high,
            anchor: valuation.estimate.anchor,
            factorTotal: valuation.estimate.factorTotal,
            factorAdjustments: [...(valuation.estimate.factorAdjustments || [])],
            weightedMedian: valuation.estimate.weightedMedian,
            weightedMean: valuation.estimate.weightedMean,
            _newModelUsed: false
          };
          // ── Heritage discount (−20%) ──
          if (heritageResult.flagged && est.midpoint) {
            const discount = 0.20;
            est.midpoint = Math.round(est.midpoint * (1 - discount));
            est.low = Math.round(est.low * (1 - discount));
            est.high = Math.round(est.high * (1 - discount));
            est.anchor = Math.round(est.anchor * (1 - discount));
            est.weightedMedian = Math.round(est.weightedMedian * (1 - discount));
            est.weightedMean = Math.round(est.weightedMean * (1 - discount));
            est.factorTotal = (est.factorTotal || 0) - discount;
            est.factorAdjustments.push({
              name: "heritageDiscount",
              label: "遗产规划约束",
              value: -discount,
              detail: `受 ${heritageResult.sources.join(' + ')} 约束，估值下调 20%`
            });
          }
          return {
            ok: true,
            estimate: est,
            confidence: valuation.confidence,
            acceptedComparables: acc,
            modelVersion: valuation.modelVersion || "1.0.0"
          };
        })()
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
      if (fallbackLevel === 'c') return 'model_based';
      const dbTotal = comps.length;
      const crossVerified = acc.filter(c => c.verificationStatus === "cross_source_verified").length;
      const singleObserved = acc.filter(c => c.verificationStatus === "single_source_observed").length;
      if (crossVerified >= 1) return "sufficient";
      if (singleObserved >= 3 || dbTotal >= 3) return "limited";
      if (dbTotal >= 1) return "limited";
      return "unavailable";
    })(),
    disclaimer: "本估值基于评估时可获得的公开市场信息、房产特征及统计分析生成，仅供一般信息和研究参考。数据可能存在延迟、不完整或第三方记录差异。本报告并非正式估价、信贷决定、法律、税务或财务建议。作出交易或融资决定前，请咨询持牌专业人士。",
    collectedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    reasons: [
      "This estimate is generated from comparable sales data, public property records and suburb-level market analysis.",
      "Our valuation model applies multi-factor adjustments (property attributes, location, education, vacancy, supply constraints, census consistency) and is calibrated against thousands of accepted comparable sale transactions.",
      "Disclaimer: This is a free summary for general information and research purposes only. Not a formal valuation, credit decision, legal, tax or financial advice. Consult licensed professionals before making transaction or financing decisions."
    ],
    reasonsZh: [
      "本估值基于可比销售数据、公共产权记录及郊区级市场分析生成。",
      "我们的估值模型采用多因子调整（房产属性、位置、教育、空置率、供应限制、人口普查一致性），并经数千条可比交易校准。",
      "免责声明：本免费摘要仅供一般信息和研究参考，不构成正式估价、信贷决定、法律、税务或财务建议。作出交易或融资决定前，请咨询持牌专业人士。"
    ],
    heritage: {
      flagged: heritageResult.flagged,
      sources: heritageResult.sources,
      details: heritageResult.details,
      discountPercent: heritageResult.flagged ? 20 : 0,
      note: heritageResult.note
    }
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

/**
 * 地址格式反推类型
 * 当用户或前端传来的 propertyType 与地址格式明显矛盾时，覆盖为正确类型
 * 例如 5-7 Old Warrandyte Rd 被前端 inferPropertyTypeFromAddress 误判为 Unit
 * 但地址不包含 X/Y、unit/apartment 等信号，应强制转为 House
 */
function overridePropertyTypeFromAddress(address, incomingType) {
  if (!address || !incomingType) return incomingType || "House";
  // Normalize AU address conventions before signal detection:
  // "2-11 mcintosh st" = Unit 2, 11 McIntosh St => "2/11 mcintosh st"
  const prepped = address.toLowerCase()
    .replace(/[,\.]/g, " ")
    .replace(/\b(\d+)\s*-\s*(\d+)\b/g, "$1/$2")  // AU: "2-11" => "2/11"
    .replace(/\bunit\s*(\d+)\b/g, "unit $1")
    .replace(/\bapt\s*(\d+)\b/g, "apt $1")
    .replace(/\bapartment\s*(\d+)\b/g, "apartment $1")
    .replace(/\s+/g, " ")
    .trim();
  
  // 地址中有明确的 Unit 信号才允许用 Unit/Apartment 类型
  // 支持: 2/15, G01/88, 1202S/889, unit 2, apartment 12U, flat 3
  const hasUnitSignal = /\bunit\s+\d+\b|\bunit\b|[a-z\d]+\s*\/|\bflat\b|^[a-z\d]+\s*\//.test(prepped);
  const hasAptSignal = /\bapartment\b|\bapt\b/.test(prepped);
  const hasTownhouseSignal = /\btown(?:house)?\b/.test(prepped);
  const hasVillaSignal = /\bvilla\b/.test(prepped);
  const hasLandSignal = /\bvacant\s+land\b|\bland\s+only\b|\bdevelopment\s+site\b/i.test(prepped);

  // 如果传入了 Unit/Apartment 但地址没有对应信号 → 降级为 House
  if ((incomingType === "Unit" || incomingType === "Apartment") && !hasUnitSignal && !hasAptSignal) {
    return "House";
  }
  // 如果传入了 Townhouse/Villa 但地址没有对应信号 → 不阻断（可能是自然街区描述）
  // 如果传入了 Vacant land 但地址没有信号 → 降级为 House
  if (incomingType === "Vacant land" && !hasLandSignal) {
    return "House";
  }
  // 如果地址有明确的 Unit/Apartment 信号，即使前端默认选了 House，也应按 Unit 估值。
  if (incomingType === "House" && (hasUnitSignal || hasAptSignal)) {
    return "Unit";
  }
  // If the address explicitly names a townhouse or villa, do not keep the default House type.
  if (incomingType === "House" && hasTownhouseSignal) {
    return "Townhouse";
  }
  if (incomingType === "House" && hasVillaSignal) {
    return "Villa";
  }
  return incomingType;
}

/**
 * 从 DB 获取 suburb + propertyType 的中位价
 */
async function fetchMedianForProperty(suburb, state, propertyType, dbSource) {
  try {
    const available = await dbSource.checkConnection();
    if (!available) return null;
    const { getSql } = await import("../api/_db.js");
    const sql = getSql();
    if (!suburb || !propertyType) return null;
    if (propertyType === 'Unknown' || propertyType === 'Unknown') return null;
    const rows = await sql`
      SELECT
        COUNT(*)::integer as sale_count,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)::bigint as median_price,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sale_price)::bigint as q1_price,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sale_price)::bigint as q3_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bedrooms)::numeric(4,2) as median_bedrooms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bathrooms)::numeric(4,2) as median_bathrooms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY land_size_sqm)::integer as median_land_size
      FROM comparable_sales
      WHERE suburb ILIKE ${suburb}
        AND state = ${state}
        AND property_type ILIKE ${propertyType}
        AND verification_status IN ('cross_source_verified', 'single_source_observed')
        AND sale_price IS NOT NULL
        AND sale_date >= CURRENT_DATE - INTERVAL '3 years'
    `;
    if (rows && rows.length > 0 && rows[0].median_price) return rows[0];

    // Fallback 2: suburb_metrics table (pre-computed median)
    try {
      const col = propertyType === 'house' ? 'median_house_price' : 'median_unit_price';
      const raw = await sql(
        'SELECT ' + col + ' as median_price FROM suburb_metrics WHERE LOWER(suburb)=LOWER($1) AND state=$2 AND ' + col + ' IS NOT NULL LIMIT 1',
        [suburb.toLowerCase(), state]
      );
      const fb = Array.isArray(raw) ? raw[0] : raw;
      if (fb && fb.median_price) {
        return { sale_count: 0, median_price: Number(fb.median_price), q1_price: null, q3_price: null, median_bedrooms: null, median_bathrooms: null, median_land_size: null };
      }
    } catch (_) {}

    // Fallback 3: VIC state-wide median from comparable_sales (short window)
    try {
      const raw = await sql(
        "SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)::bigint as median_price FROM comparable_sales WHERE state=$1 AND property_type ILIKE $2 AND sale_price IS NOT NULL AND sale_date >= CURRENT_DATE - INTERVAL '3 months'",
        [state, propertyType]
      );
      const sr = Array.isArray(raw) ? raw[0] : raw;
      if (sr && sr.median_price) {
        return { sale_count: 0, median_price: Number(sr.median_price), q1_price: null, q3_price: null, median_bedrooms: null, median_bathrooms: null, median_land_size: null };
      }
    } catch (_) {}

    return null;
  } catch (e) {
    console.warn("[fetchMedianForProperty] error:", e.message);
    return null;
  }
}

/**
 * 基于 suburb 中位价 + 特征因子混合估值
 * 用 subject 特性对比该 type 的中位数做调整
 */
export function estimateFromSuburbMedian(subject, medianData) {
  if (!medianData || !medianData.median_price) {
    return {
      ok: false,
      status: "no-median-data",
      estimate: null,
      confidence: { label: "Low", dataScore: 0 }
    };
  }

  const basePrice = Number(medianData.median_price);
  const saleCount = Number(medianData.sale_count) || 1;
  const adjBedrooms = Number(medianData.median_bedrooms) || null;
  const adjBathrooms = Number(medianData.median_bathrooms) || null;
  const adjLandSize = Number(medianData.median_land_size) || null;

  let adjustments = [];
  let totalFactor = 0;

  // 卧室调整
  if (subject.bedrooms && adjBedrooms && adjBedrooms > 0) {
    const diff = subject.bedrooms - adjBedrooms;
    const factor = diff * 0.03;  // ±3% per bedroom
    adjustments.push({ name: "bedrooms", base: adjBedrooms, subject: subject.bedrooms, factor });
    totalFactor += factor;
  }

  // 卫生间调整
  if (subject.bathrooms && adjBathrooms && adjBathrooms > 0) {
    const diff = subject.bathrooms - adjBathrooms;
    const factor = diff * 0.015;  // ±1.5% per bathroom
    adjustments.push({ name: "bathrooms", base: adjBathrooms, subject: subject.bathrooms, factor });
    totalFactor += factor;
  }

  // 土地面积调整：优先用 Vicmap LGA 层级的 median land size
  // 如果 subject 有 landSize，优先对比 LGA median（更准确，基于 2.6M parcel 抽样）
  // 后备用 DB comparable_sales 的 median_land_size
  let landSizeAdj = false;
  if (subject.landSize && subject.suburb) {
    const lgaFactor = getLandSizeFactor(subject.suburb, subject.landSize, subject.propertyType);
    if (lgaFactor && lgaFactor.skip) {
      // Apartment/Unit — skip land size adjustment entirely
      landSizeAdj = true;
    } else if (lgaFactor && lgaFactor.factor !== undefined) {
      adjustments.push({ name: "land_size_vicmap", base: lgaFactor.lga_median, subject: subject.landSize, factor: lgaFactor.factor, detail: lgaFactor.detail });
      totalFactor += lgaFactor.factor;
      landSizeAdj = true;
    }
  }
  if (!landSizeAdj && subject.landSize && adjLandSize && adjLandSize > 0) {
    const ratio = subject.landSize / adjLandSize;
    // 使用对数调整：面积翻倍 ≈ +8%，减半 ≈ -8%
    const factor = Math.log(ratio) * 0.12;
    // 限制 ±25%
    const clamped = Math.max(-0.25, Math.min(0.25, factor));
    adjustments.push({ name: "land_size", base: adjLandSize, subject: subject.landSize, factor: clamped });
    totalFactor += clamped;
  }

  const midpoint = Math.round(basePrice * (1 + totalFactor));
  const priceSpan = medianData.q3_price && medianData.q1_price
    ? Math.round((Number(medianData.q3_price) - Number(medianData.q1_price)) / 2)
    : Math.round(basePrice * 0.15);

  // 置信度：按成交数量、spread 估算
  const cv = medianData.q3_price && medianData.q1_price && medianData.q1_price > 0
    ? (Number(medianData.q3_price) - Number(medianData.q1_price)) / (Number(medianData.q3_price) + Number(medianData.q1_price))
    : 0.3;
  let confLabel = "Low";
  let dataScore = Math.min(40, saleCount * 3);
  if (saleCount >= 20 && cv < 0.15) { confLabel = "Medium"; dataScore = Math.min(60, dataScore + 10); }
  else if (saleCount >= 10 && cv < 0.25) { confLabel = "Medium"; dataScore = Math.min(55, dataScore + 5); }
  else if (saleCount >= 5 && cv < 0.35) { confLabel = "Low-Medium"; dataScore = Math.min(50, dataScore + 5); }

  return {
    ok: true,
    status: "suburb-median-estimated",
    estimate: {
      midpoint,
      low: Math.max(midpoint - priceSpan, Math.round(midpoint * 0.82)),
      high: Math.round(midpoint + priceSpan),
      anchor: basePrice,
      factorTotal: totalFactor,
      factorAdjustments: adjustments
    },
    confidence: {
      label: confLabel,
      dataScore,
      reasons: [
        `Suburb median for ${subject.propertyType}: ${saleCount} sales in ${subject.suburb || ""}`,
        saleCount < 5 ? "Limited sales data, wider range applied" : ""
      ].filter(Boolean)
    },
    acceptedComparables: []
  };
}
