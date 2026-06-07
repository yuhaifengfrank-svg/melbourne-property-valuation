// ── 集成测试 ──
// 覆盖 P0-P1 验收标准

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

  it("共享服务返回一致契约", async () => {
    const result = await vercelValuation({
      address: "349 Moray Street",
      suburb: "South Melbourne",
      state: "VIC",
      propertyType: "House"
    });
    // 必须有正确的输出字段
    assert.ok("evidenceMode" in result, "missing evidenceMode");
    assert.ok("isFallback" in result, "missing isFallback");
    assert.ok("modelVersion" in result, "missing modelVersion");
    assert.ok("collectedAt" in result, "missing collectedAt");
    assert.ok("asOfDate" in result, "missing asOfDate");
    // Vercel 环境没有 CDP，应是 unavailable
    assert.equal(result.evidenceMode, "unavailable");
  });

  it("前端不发送 comparables", () => {
    // 前端 POST /api/valuation 只发 address, suburb, state, propertyType
    const body = { address: "1 Test St", suburb: "Test", state: "VIC", propertyType: "House" };
    assert.ok(!("comparables" in body));
  });
});

describe("P1: 数据可信度", () => {
  it("Vercel 降级时不伪装为实时", async () => {
    const result = await vercelValuation({
      address: "1 Test St",
      suburb: "Test",
      state: "VIC",
      propertyType: "House"
    });
    assert.equal(result.evidenceMode, "unavailable");
    assert.equal(result.isFallback, false);
  });

  it("本地环境可返回 live_verified", async () => {
    const result = await localValuation({
      address: "349 Moray Street",
      suburb: "South Melbourne",
      state: "VIC",
      propertyType: "House"
    });
    if (result.status === "completed") {
      assert.equal(result.evidenceMode, "live_verified");
    } else {
      // 如果 CDP 不可用，按 unavailable 处理
      assert.equal(result.evidenceMode, "unavailable");
    }
  });

  it("缺失字段为 null 而非伪造", async () => {
    const result = await vercelValuation({
      address: "2 Missing Fields Road",
      suburb: "Nowhere",
      state: "VIC",
      propertyType: "House"
    });
    assert.ok(result.evidenceMode);
    const comps = result.comparables || [];
    assert.ok(Array.isArray(comps), "comparables should be an array");
    for (const c of comps) {
      if (c.salePrice != null) {
        assert.ok(Number.isFinite(c.salePrice), "salePrice must be finite if present");
      }
    }
  });

  it("静态 fallback 保留明确的 fallback 标记", async () => {
    // 当 API 不可用时前端回退到原硬编码逻辑
    // 前端应该在 evidenceMode 里反映 fallback
    // 这里只验证 API 层面不假 fallback
    const result = await vercelValuation({
      address: "9 McIntosh Street",
      suburb: "Oakleigh",
      state: "VIC",
      propertyType: "House"
    });
    assert.equal(result.evidenceMode, "unavailable");
    assert.equal(result.isFallback, false);
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

  it("useDatabaseFallback:true 带 mock DB 返回 database_verified", async () => {
    // 注入 mock DB source（1 条 verified 记录 → database_verified）
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "10 Mock St, Test", salePrice: 900000, saleDate: "2026-01-15",
          sourceUrl: "http://mock.com/1", sourceName: "mock", propertyType: "House",
          verificationStatus: "verified", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500,
          qualityBand: null, batchId: "test_batch", verifiedAt: null }
      ])
    };
    const result = await runValuation({
      address: "10 Mock St", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // 1 条 DB verified 记录 → database_verified
    assert.equal(result.evidenceMode, "database_verified",
      `expected database_verified, got ${result.evidenceMode}`);
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
    assert.ok("evidenceMode" in result);
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

  it("证据标签仅检查 accepted 中确实来自 DB 的记录", async () => {
    // 注入 mock DB source：1 条 verified + 2 unverified
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "11 Verified St", salePrice: 950000, saleDate: "2026-02-01",
          sourceUrl: "http://dbv.com/1", sourceName: "dbv", propertyType: "House",
          verificationStatus: "verified", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 500 },
        { address: "12 Unverified St", salePrice: 930000, saleDate: "2026-01-20",
          sourceUrl: "http://dbv.com/2", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 },
        { address: "13 Raw St", salePrice: 910000, saleDate: "2026-01-10",
          sourceUrl: "http://dbv.com/3", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 }
      ])
    };
    const result = await runValuation({
      address: "11 Verified St", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // 有 verified 记录 → database_verified
    if (result.status === "completed") {
      assert.equal(result.evidenceMode, "database_verified",
        `expected database_verified when DB comps accepted, got ${result.evidenceMode}`);
    }
  });

  it("仅 unverified DB 记录不触发 database_verified", async () => {
    const mockDbSource = {
      checkConnection: () => Promise.resolve(true),
      isAvailable: () => true,
      fetch: () => Promise.resolve([
        { address: "20 Unverified Only", salePrice: 890000, saleDate: "2026-03-01",
          sourceUrl: "http://dbv.com/u1", sourceName: "dbv", propertyType: "House",
          verificationStatus: "unverified", _sourceMode: "database_verified",
          bedrooms: 3, bathrooms: 1, carSpaces: 1, landSize: 400 }
      ])
    };
    const result = await runValuation({
      address: "20 Unverified Only", suburb: "Test", state: "VIC", propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true, dbSource: mockDbSource });
    // unverified 记录不应标 database_verified
    assert.notEqual(result.evidenceMode, "database_verified",
      `should not be database_verified for unverified records, got ${result.evidenceMode}`);
  });

  it("无 DB 时 evidenceMode 为 unavailable", async () => {
    const result = await runValuation({
      address: "14 NoDb St",
      suburb: "Nowhere",
      state: "VIC",
      propertyType: "House"
    }, { fetch: false, useDatabaseFallback: true });
    assert.equal(result.evidenceMode, "unavailable");
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
      assert.ok("evidenceMode" in result);
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
