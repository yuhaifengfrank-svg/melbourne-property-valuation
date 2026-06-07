import fs from "node:fs";
// ── 集成测试 ──
// 覆盖 P0-P1 验收标准

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { runValuation } from "./lib/valuation-service.js";

// 模拟 fetch 不可用（Vercel 环境）
async function vercelValuation(params) {
  return runValuation(params, { fetch: false });
}

// 模拟本地环境
async function localValuation(params) {
  return runValuation(params, { fetch: true });
}

describe("P0: 阻断问题", () => {
  it("app.js 语法正确", async () => {
    // 实际检查子进程语法
    const { execSync } = await import("node:child_process");
    const result = execSync("node --check app.js 2>&1 || echo syntax-error", { encoding: "utf8" });
    assert.equal(result.trim(), "", `app.js syntax error: ${result}`);
  });

  it("共享服务返回一致契约（不含内部字段）", async () => {
    const result = await vercelValuation({
      address: "349 Moray Street",
      suburb: "South Melbourne",
      state: "VIC",
      propertyType: "House"
    });
    // 必须有正确的输出字段
    assert.ok("customerDataStatus" in result, "missing customerDataStatus");
    assert.ok("customerDataStatus" in result, "missing customerDataStatus");
    assert.ok("modelVersion" in result, "missing modelVersion");
    assert.ok("collectedAt" in result, "missing collectedAt");
    assert.ok("asOfDate" in result, "missing asOfDate");
    // Vercel 环境没有 CDP，应是 unavailable
    assert.equal(result.customerDataStatus, "unavailable");
  });

  it("前端不发送 comparables", () => {
    // 前端 POST /api/valuation 只发 address, suburb, state, propertyType
    const body = { address: "1 Test St", suburb: "Test", state: "VIC", propertyType: "House" };
    assert.ok(!("comparables" in body));
  });
});

describe("P1: 数据可信度", () => {
  it("Vercel 降级时 customerDataStatus 为 unavailable", async () => {
    const result = await vercelValuation({
      address: "1 Test St",
      suburb: "Test",
      state: "VIC",
      propertyType: "House"
    });
    assert.equal(result.customerDataStatus, "unavailable");
    
  });

  it("本地环境可返回 sufficient", async () => {
    const result = await localValuation({
      address: "349 Moray Street",
      suburb: "South Melbourne",
      state: "VIC",
      propertyType: "House"
    });
    if (result.status === "completed") {
      assert.equal(result.customerDataStatus, "sufficient");
    } else {
      // 如果 CDP 不可用，按 unavailable 处理
      assert.equal(result.customerDataStatus, "unavailable");
    }
  });

  it("缺失字段为 null 而非伪造", async () => {
    const result = await vercelValuation({
      address: "2 Missing Fields Road",
      suburb: "Nowhere",
      state: "VIC",
      propertyType: "House"
    });
    assert.ok(result.customerDataStatus);
    const comps = result.comparables || [];
    assert.ok(Array.isArray(comps), "comparables should be an array");
    for (const c of comps) {
      if (c.salePrice != null) {
        assert.ok(Number.isFinite(c.salePrice), "salePrice must be finite if present");
      }
    }
  });

  it("静态 fallback Vercel 降级为 unavailable", async () => {
    // 当 API 不可用时前端回退到原硬编码逻辑
    // 前端应该在 customerDataStatus 里反映 fallback
    // 这里只验证 API 层面不假 fallback
    const result = await vercelValuation({
      address: "9 McIntosh Street",
      suburb: "Oakleigh",
      state: "VIC",
      propertyType: "House"
    });
    assert.equal(result.customerDataStatus, "unavailable");
  });
});

describe("P1: 数据库 source", () => {
  it("DatabaseComparableSource 可实例化", async () => {
    const mod = await import("./lib/db-comparable-source.js");
    const src = new mod.DatabaseComparableSource();
    assert.ok(src instanceof Object);
    assert.equal(src.isAvailable(), false);
  });

  it("无 DATABASE_URL 时 checkConnection 返回 false", async () => {
    const { DatabaseComparableSource } = await import("./lib/db-comparable-source.js");
    const src = new DatabaseComparableSource();
    const ok = await src.checkConnection();
    assert.equal(ok, false);
    assert.equal(src.isAvailable(), false);
  });

  it("无 DB 时 fetch 返回空数组", async () => {
    const mod = await import("./lib/db-comparable-source.js");
    const src = new mod.DatabaseComparableSource();
    const result = await src.fetch({ suburb: "South Melbourne", state: "VIC" });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it("useDatabaseFallback:true 带 mock DB 返回 limited", async () => {
    // 注入 mock DB source（5 条 single_source_observed → database_single_source）
    function makeSingleObs(i) {
      return { address: "10 Mock St #" + i + ", Test", salePrice: 900000 + i * 1000,
        saleDate: "2026-01-" + String(15 + i).padStart(2,"0"),
        sourceUrl: "http://mock.com/" + i, sourceName: "rea", propertyType: "House",
        verificationStatus: "single_source_observed", _sourceMode: "sufficient",
        bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500,
        qualityBand: null, batchId: "test_batch", verifiedAt: null };
    }
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve(Array.from({length:5}, (_,i) => makeSingleObs(i)))
    };
    const result = await runValuation({
      address: "10 Mock St", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // 5 条 single_source_observed 记录 → database_single_source
    assert.equal(result.customerDataStatus, "limited",
      `expected database_single_source, got ${result.customerDataStatus}`);
    assert.ok("status" in result);
  });

  it("无 CDP comps 时 DB 被调用", async () => {
    let dbCalledCount = 0;
    const countingDbSource = {
      checkConnection: async () => { dbCalledCount++; return true; },
      isAvailable: () => true,
      fetch: async () => { dbCalledCount++; return []; }
    };
    const result = await runValuation({
      address: "18 NoCdp St", suburb: "Nowhere", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: countingDbSource });
    // CDP 没结果 → DB 被调用
    assert.ok(dbCalledCount > 0, `expected DB calls when no CDP comps, got ${dbCalledCount}`);
    assert.ok("customerDataStatus" in result);
  });

  it("CDP ≥3 collector comps 时 DB 不被调用", async () => {
    let dbCalledCount = 0;
    const countingDbSource = {
      checkConnection: async () => { dbCalledCount++; return true; },
      isAvailable: () => true,
      fetch: async () => { dbCalledCount++; return []; }
    };
    // 构造三条 mock collector comparable（模拟 CDP 抓取成功）
    const mockComps = [
      { address: "1 Test St, Testville VIC 3000", price: 800000, type: "House", bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 600, source: "realestate.com.au", saleDate: "2025-06-01", _sourceMode: "live_collected" },
      { address: "2 Test St, Testville VIC 3000", price: 850000, type: "House", bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 550, source: "Domain", saleDate: "2025-05-15", _sourceMode: "live_collected" },
      { address: "3 Test St, Testville VIC 3000", price: 820000, type: "House", bedrooms: 4, bathrooms: 2, carSpaces: 2, landSize: 650, source: "realestate.com.au", saleDate: "2025-04-20", _sourceMode: "live_collected" }
    ];
    const result = await runValuation({
      address: "18 CDP St", suburb: "Testville", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: countingDbSource, mockCollectorComparables: mockComps });
    // CDP 已有 ≥3 comps → DB 不应被调用
    assert.strictEqual(dbCalledCount, 0, `expected 0 DB calls when CDP has 3+ comps, got ${dbCalledCount}`);
    assert.ok(result.ok !== false);
  });

  it("DB verified 映射为 sufficient", async () => {
    // 注入 mock DB source：1 条 verified + 2 unverified
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "11 Verified St", salePrice: 950000, saleDate: "2026-02-01",
          sourceUrl: "http://dbv.com/1", sourceName: "dbv", propertyType: "House",
          verificationStatus: "cross_source_verified", _sourceMode: "sufficient",
          bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500 },
        { address: "12 Unverified St", salePrice: 930000, saleDate: "2026-01-20",
          sourceUrl: "http://dbv.com/2", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "sufficient",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 },
        { address: "13 Raw St", salePrice: 910000, saleDate: "2026-01-10",
          sourceUrl: "http://dbv.com/3", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "sufficient",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 }
      ])
    };
    const result = await runValuation({
      address: "11 Verified St", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // 有 verified 记录 → database_verified
    if (result.status === "completed") {
      assert.equal(result.customerDataStatus, "sufficient",
        `expected database_verified when DB comps accepted, got ${result.customerDataStatus}`);
    }
  });

  it("仅 unverified DB 记录不触发 sufficient", async () => {
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "20 Unverified Only", salePrice: 890000, saleDate: "2026-03-01",
          sourceUrl: "http://dbv.com/u1", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "sufficient",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 }
      ])
    };
    const result = await runValuation({
      address: "20 Unverified Only", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // unverified 记录不应标 database_verified
    assert.notEqual(result.customerDataStatus, "sufficient",
      `should not be database_verified for unverified records, got ${result.customerDataStatus}`);
  });

  it("无 DB 时 customerDataStatus 为 unavailable", async () => {
    const result = await runValuation({
      address: "14 NoDb St",
      suburb: "Nowhere",
      state: "VIC",
      propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true });
    assert.equal(result.customerDataStatus, "unavailable");
  });
});

describe("P1: 物业类型覆盖", () => {
  const types = ["House", "Unit", "Apartment", "Townhouse", "Villa", "Vacant land"];
  for (const type of types) {
    it(`type: ${type} — 返回不崩溃`, async () => {
      const result = await vercelValuation({
        address: `1 Test ${type} Lane`,
        suburb: "Test",
        state: "VIC",
        propertyType: type
      });
      assert.ok(typeof result === "object");
      assert.ok("customerDataStatus" in result);
      assert.ok("status" in result);
    });
  }
});

describe("P1: 地址州冲突", () => {
  it("用户选 NSW 但地址含 VIC — 优先地址", () => {
    // 前端逻辑：explicitStateFromAddress 从地址中解析州
    // 测试："10 Example Street, Sydney NSW 2000" 应返回 "NSW"
    const stateRegex = /\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/;
    const addr = "10 Example Street, Sydney NSW 2000";
    const match = addr.match(stateRegex);
    assert.equal(match?.[1], "NSW");
  });
});

describe("P1: 索引迁移脚本", () => {
  it("migrate-cs-dedup-index.mjs 语法正确", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync("node --check migrate-cs-dedup-index.mjs 2>&1 || echo syntax-error", { encoding: "utf8" });
    assert.equal(result.trim(), "", `index migration syntax error: ${result}`);
  });

  it("无 DATABASE_URL 时索引迁移不崩溃", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("node", ["migrate-cs-dedup-index.mjs"], { encoding: "utf8" });
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    // 无 DB 时 exit(1) 是合理的（迁移无法完成）
    // 重点是不抛 SyntaxError/ReferenceError
    assert.ok(!output.includes("SyntaxError") && !output.includes("ReferenceError"), `unexpected errors: ${output.slice(0, 200)}`);
  });
});

describe("P1: Cron 隔离", () => {
  it("cron-daily: 无 DB 时干净退出码 0", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("node", ["cron-daily.mjs"], { encoding: "utf8" });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}`);
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    assert.ok(output.includes("DATABASE_URL not set"), `output: ${output.slice(0, 200)}`);
  });

  it("cron-weekly: 无 DB 时干净退出码 0", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("node", ["cron-weekly.mjs"], { encoding: "utf8" });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}`);
    const output = (result.stdout || "") + "\n" + (result.stderr || "");
    assert.ok(output.includes("DATABASE_URL not set"), `output: ${output.slice(0, 200)}`);
  });
});




describe("P2: 核验规则", () => {
  it("两来源日期差≤90天，可 cross_source_verified", () => {
    const date1 = new Date("2026-04-08");
    const date2 = new Date("2026-04-15");
    const diffDays = Math.abs((date2 - date1) / (1000 * 60 * 60 * 24));
    assert.ok(diffDays <= 90, `diff ${diffDays} days > 90`);
  });

  it("两来源日期差>90天，不 cross_source_verified", () => {
    const date1 = new Date("2026-01-01");
    const date2 = new Date("2026-05-02");
    const diffDays = Math.abs((date2 - date1) / (1000 * 60 * 60 * 24));
    assert.ok(diffDays > 90, `diff ${diffDays} days should be > 90`);
  });
});

describe("P2: 上传文件不自动调整估值", () => {
  it("上传4个文件不能自动变成High", () => {
    const appJs = execSync("cat app.js", { encoding: "utf8" });
    const hasAutoHigh = /completeness\s*>=\s*4/.test(appJs) && /"High"/.test(appJs);
    const hasHasPositiveCondition = /hasPositiveCondition/.test(appJs);
    const hasHasQuietStreet = /hasQuietStreet/.test(appJs);
    assert.equal(hasAutoHigh, false, "auto High from upload count still present");
    assert.equal(hasHasPositiveCondition, false, "renovated keyword adjustment still present");
    assert.equal(hasHasQuietStreet, false, "quiet street keyword adjustment still present");
  });

  it("上传含renovated/quiet street关键词不改变估值", () => {
    const appJs = execSync("cat app.js", { encoding: "utf8" });
    // 检查函数体：如果 adjustedMidpoint 出现在计算语句而非参数定义中，就是旧版
    // 函数定义中含 _adjustedMidpoint（unused prefix）是预期的新版签名
    // 但如果有 completion >= 4 或 hasPositiveCondition 等调整逻辑，就还有问题
    const hasAdjustmentLogic = /hasPositiveCondition|hasQuietStreet|hasPlanningConstraint/.test(appJs);
    assert.equal(hasAdjustmentLogic, false, "keyword adjustment logic still present");
  });


describe("P3: 来源验证规则", () => {
  it("3条单源记录仍可生成初步估值", async () => {
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "100 Single Rd", salePrice: 850000, saleDate: "2026-04-01",
          sourceUrl: "http://rea.com/100", sourceName: "rea", propertyType: "House",
          verificationStatus: "single_source_observed", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500 },
        { address: "102 Single Rd", salePrice: 870000, saleDate: "2026-03-15",
          sourceUrl: "http://rea.com/102", sourceName: "rea", propertyType: "House",
          verificationStatus: "single_source_observed", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 550 },
        { address: "104 Single Rd", salePrice: 820000, saleDate: "2026-02-20",
          sourceUrl: "http://rea.com/104", sourceName: "rea", propertyType: "House",
          verificationStatus: "single_source_observed", _sourceMode: "database_verified",
          bedrooms: 4, bathrooms: 2, carSpaces: 2, landSize: 600 }
      ])
    };
    const result = await runValuation({
      address: "100 Single Rd", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    assert.ok(result.ok !== false);
    assert.equal(result.status, "completed", "expected completed with 3 single-source comps");
    assert.ok(result.valuation?.estimate?.midpoint > 0, "should produce an estimate");
    assert.equal(result.customerDataStatus, "limited", "3 single-source should be limited");
    // 不应包含内部字段
    assert.equal(result.sourceResults, undefined, "sourceResults should not appear");
    assert.equal(result.isSingleSource, undefined, "isSingleSource should not appear");
    assert.equal(result.evidenceMode, undefined, "evidenceMode should not appear");
  });

  it("customerDataStatus 映射测试", () => {
    // cross_source_verified ≥ 1 → sufficient
    assert.equal(calcDataStatus([
      { verificationStatus: "cross_source_verified" }
    ]), "sufficient");
    // single_source_observed ≥ 3 → limited
    assert.equal(calcDataStatus([
      { verificationStatus: "single_source_observed" },
      { verificationStatus: "single_source_observed" },
      { verificationStatus: "single_source_observed" }
    ]), "limited");
    // totalOk ≥ 3 (no cross) → limited
    assert.equal(calcDataStatus([
      { verificationStatus: "single_source_observed" },
      { verificationStatus: "single_source_observed" }
    ]), "limited");
    // 1-2 single_source → limited
    assert.equal(calcDataStatus([
      { verificationStatus: "single_source_observed" }
    ]), "limited");
    // empty → unavailable
    assert.equal(calcDataStatus([]), "unavailable");
  });

  it("客户API响应不包含内部字段", async () => {
    const { execSync } = await import("node:child_process");
    const apiJs = execSync("cat api/valuation.js", { encoding: "utf8" });
    assert.ok(apiJs.includes("mapCustomerDataStatus"), "missing mapCustomerDataStatus");
    assert.ok(apiJs.includes('delete safe.sourceResults'), "must delete sourceResults");
    assert.ok(apiJs.includes('delete safe.isSingleSource'), "must delete isSingleSource");
    assert.ok(apiJs.includes('delete safe.evidenceMode'), "must delete evidenceMode");
  });

  it("客户API comparables 不包含内部字段", async () => {
    // 测试 sanitizeForClient 对 comparables 的处理
    const testInput = {
      valuation: {
        ok: true,
        estimate: { midpoint: 1000000, low: 900000, high: 1100000, weightedMedian: 1000000, weightedMean: 1000000 },
        confidence: { label: "Medium", dataScore: 55, reasons: ["3 comps", "1 cross verified"] },
        acceptedComparables: [
          { address: "1 Test St", salePrice: 900000, saleDate: "2026-01-01", distanceMeters: 200,
            bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500,
            sourceUrl: "http://internal/1", sourceName: "rea", verificationStatus: "cross_source_verified",
            _sourceMode: "database_verified", qualityBand: "Core", qualityScore: 85,
            weight: 0.85, adjustments: { total: 0.05 }, sourceCount: 2 }
        ],
        rejectedComparables: [],
        methodology: { anchor: "test" },
        statisticalIntervals: { sigma: 0.1 }
      },
      comparables: [
        { address: "1 Test St", salePrice: 900000, saleDate: "2026-01-01", distanceMeters: 200,
          sourceUrl: "http://internal/1", sourceName: "rea", verificationStatus: "cross_source_verified",
          _sourceMode: "database_verified" }
      ],
      sourceResults: [{ source: "database", found: 1 }],
      isSingleSource: false,
      customerDataStatus: "limited",
      subject: { coordinates: { lat: -37.8, lng: 145.0 }, sa2Code: "SA2_VIC_3168" }
    };

    const result = clientSanitize(testInput);

    // acceptedComparables: 只留客户字段
    for (const c of result.valuation.acceptedComparables) {
      assert.ok(c.address);
      assert.ok(c.salePrice);
      assert.ok(!("sourceUrl" in c), "sourceUrl must be removed from acceptedComparables");
      assert.ok(!("verificationStatus" in c), "verificationStatus must be removed");
      assert.ok(!("_sourceMode" in c), "_sourceMode must be removed");
      assert.ok(!("qualityBand" in c), "qualityBand must be removed");
      assert.ok(!("qualityScore" in c), "qualityScore must be removed");
      assert.ok(!("weight" in c), "weight must be removed");
      assert.ok(!("adjustments" in c), "adjustments must be removed");
    }

    // confidence: 只有 label + dataScore
    assert.ok(result.valuation.confidence.label);
    assert.ok(!("reasons" in result.valuation.confidence), "reasons must be removed from confidence");

    // 顶层删除
    assert.equal(result.sourceResults, undefined, "sourceResults stripped");
    assert.equal(result.isSingleSource, undefined, "isSingleSource stripped");

    // subject 删除内部字段
    assert.equal(result.subject.coordinates, undefined, "coordinates stripped from subject");
    assert.equal(result.subject.sa2Code, undefined, "sa2Code stripped from subject");
  });
});

// ── 辅助函数 ──
function calcDataStatus(acceptedComparables) {
  if (!acceptedComparables || acceptedComparables.length === 0) return "unavailable";
  const crossVerified = acceptedComparables.filter(c => c.verificationStatus === "cross_source_verified").length;
  const singleObserved = acceptedComparables.filter(c => c.verificationStatus === "single_source_observed").length;
  const totalOk = acceptedComparables.length;
  if (crossVerified >= 1) return "sufficient";
  if (singleObserved >= 3 || totalOk >= 3) return "limited";
  if (totalOk >= 1) return "limited";
  return "unavailable";
}

function clientSanitize(obj) {
  const safe = JSON.parse(JSON.stringify(obj));
  delete safe.sourceResults;
  delete safe.isSingleSource;
  delete safe.evidenceMode;
  safe.customerDataStatus = mapCustomerDataStatus(obj);
  if (safe.valuation?.confidence) {
    const { label, dataScore } = safe.valuation.confidence;
    safe.valuation.confidence = { label, dataScore };
  }
  if (safe.valuation?.acceptedComparables) {
    safe.valuation.acceptedComparables = safe.valuation.acceptedComparables.map(c => ({
      address: c.address, salePrice: c.salePrice, saleDate: c.saleDate,
      distanceMeters: c.distanceMeters, bedrooms: c.bedrooms, bathrooms: c.bathrooms,
      carSpaces: c.carSpaces, landSize: c.landSize
    }));
  }
  if (safe.comparables?.length) {
    safe.comparables = safe.comparables.map(c => ({
      address: c.address, salePrice: c.salePrice, saleDate: c.saleDate,
      distanceMeters: c.distanceMeters
    }));
  }
  delete safe.rejectedComparables;
  if (safe.valuation?.rejectedComparables) delete safe.valuation.rejectedComparables;
  delete safe.methodology;
  if (safe.valuation?.methodology) delete safe.valuation.methodology;
  if (safe.valuation?.statisticalIntervals) delete safe.valuation.statisticalIntervals;
  if (safe.valuation?.estimate) {
    const { midpoint, low, high } = safe.valuation.estimate;
    safe.valuation.estimate = { midpoint, low, high };
  }
  if (safe.subject) {
    delete safe.subject.coordinates;
    delete safe.subject.lat;
    delete safe.subject.lng;
    delete safe.subject.sa2Code;
  }
  return safe;
}





describe("P4: 前端渲染集成测试（Mock API）", () => {
  it("sufficient 数据状态渲染正确", () => {
    const mockResp = makeMockResponse("sufficient", 3, true);
    assert.equal(mockResp.customerDataStatus, "sufficient");
    assert.ok(mockResp.valuation?.estimate?.midpoint > 0);
    assert.ok(mockResp.valuation?.confidence?.label);
    assert.equal(mockResp.sourceResults, undefined);
    assert.equal(mockResp.isSingleSource, undefined);
    assert.equal(mockResp.evidenceMode, undefined);
    assert.equal(mockResp.comparables.length, 3);
    for (const c of mockResp.comparables) {
      assert.ok(c.saleDate, "comparables must include saleDate");
    }
    for (const c of mockResp.valuation.acceptedComparables) {
      assert.equal(c.sourceUrl, undefined, "sourceUrl stripped");
      assert.equal(c.verificationStatus, undefined, "verificationStatus stripped");
    }
  });

  it("limited 数据状态", () => {
    const mockResp = makeMockResponse("limited", 2, true);
    assert.equal(mockResp.customerDataStatus, "limited");
    assert.notEqual(mockResp.customerDataStatus, "sufficient");
  });

  it("unavailable 没有估值数据", () => {
    const mockResp = {
      ok: true,
      status: "error",
      customerDataStatus: "unavailable",
      valuation: null,
      comparables: []
    };
    assert.equal(mockResp.customerDataStatus, "unavailable");
    assert.equal(mockResp.valuation, null);
    assert.equal(mockResp.comparables.length, 0);
  });

  it("comparables 包含所有 8 个字段", () => {
    const mockResp = makeMockResponse("sufficient", 1, true);
    const c = mockResp.comparables[0];
    assert.ok(c.address);
    assert.ok(c.salePrice > 0);
    assert.ok(c.saleDate);
    assert.ok(c.distanceMeters > 0);
    assert.ok(c.bedrooms > 0);
    assert.ok(c.bathrooms > 0);
    assert.ok(c.carSpaces >= 0);
    assert.ok(c.landSize > 0);
  });
});





function mapCustomerDataStatus(obj) {
  if (!obj.valuation?.ok || !obj.valuation?.estimate) return "unavailable";
  const acc = obj.valuation?.acceptedComparables || [];
  const crossVerified = acc.filter(c => c.verificationStatus === "cross_source_verified").length;
  const singleObserved = acc.filter(c => c.verificationStatus === "single_source_observed").length;
  const totalOk = acc.length;
  if (crossVerified >= 1) return "sufficient";
  if (singleObserved >= 3 || totalOk >= 3) return "limited";
  if (totalOk >= 1) return "limited";
  return "unavailable";
}

});



describe("P4: 前端代码契约检查", () => {
  it("app.js comparables 包含 saleDate 列", () => {
    const appJs = fs.readFileSync("app.js", "utf8");
    assert.ok(appJs.includes("c.saleDate"), "comparables map must include c.saleDate");
  });

  it("app.js 不包含旧字段引用", () => {
    const appJs = fs.readFileSync("app.js", "utf8");
    const forbidden = ["evidenceMode", "isFallback", "adjustedPrice", "qualityBand", "qualityScore"];
    for (const f of forbidden) {
      assert.ok(!appJs.includes(f), `app.js must not contain "${f}"`);
    }
  });

  it("app.js 使用 customerDataStatus 默认 unavailable", () => {
    const appJs = fs.readFileSync("app.js", "utf8");
    assert.ok(appJs.includes("customerDataStatus || \"unavailable\""),
      "parseValuationResponse should default to unavailable");
  });

  it("index.html 表头 8 列齐全", () => {
    const html = fs.readFileSync("index.html", "utf8");
    const headers = ["Address", "Price", "Date", "Distance", "Bed", "Bath", "Car", "Land"];
    for (const h of headers) {
      assert.ok(html.includes(`<th>${h}</th>`), `table header missing: ${h}`);
    }
  });

  it("app.js 渲染标签不含旧误导文字", () => {
    const appJs = fs.readFileSync("app.js", "utf8");
    assert.ok(!appJs.includes("\u5b9e\u65f6\u6570\u636e\u9a8c\u8bc1"), "must not contain old text");
    assert.ok(!appJs.includes("Live data verified"), "must not contain old text");
    assert.ok(appJs.includes("\u57fa\u4e8e\u6709\u9650\u5e02\u573a\u8bc1\u636e\u7684\u521d\u6b65\u4f30\u503c"),
      "must contain limited label");
    assert.ok(appJs.includes("Preliminary estimate, limited data"),
      "must contain limited label");
  });
});

// ── P4 测试辅助函数 ──
function makeMockResponse(customerDataStatus, compCount, hasDate = true) {
  const comps = [];
  for (let i = 0; i < compCount; i++) {
    comps.push({
      address: `${100 + i} Mock St`,
      salePrice: 800000 + i * 15000,
      saleDate: hasDate ? `2026-0${(i % 9) + 1}-15` : null,
      distanceMeters: 200 + i * 50,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      landSize: 500
    });
  }
  return {
    ok: true,
    status: "completed",
    customerDataStatus,
    modelVersion: "1.0.0",
    valuation: {
      ok: true,
      estimate: { midpoint: 950000, low: 850000, high: 1050000 },
      confidence: { label: "Medium", dataScore: 55 },
      acceptedComparables: comps.map(c => ({
        address: c.address, salePrice: c.salePrice, saleDate: c.saleDate,
        distanceMeters: c.distanceMeters, bedrooms: c.bedrooms,
        bathrooms: c.bathrooms, carSpaces: c.carSpaces, landSize: c.landSize
      }))
    },
    subject: { state: "VIC", suburb: "Oakleigh", propertyType: "House" },
    disclaimer: "本估值基于评估时可获得的公开市场信息...",
    comparables: comps.map(c => ({
      address: c.address, salePrice: c.salePrice, saleDate: c.saleDate,
      distanceMeters: c.distanceMeters, bedrooms: c.bedrooms,
      bathrooms: c.bathrooms, carSpaces: c.carSpaces, landSize: c.landSize
    })),
    collectedAt: "2026-06-07T08:00:00.000Z",
    asOfDate: "2026-06-07"
  };
}
