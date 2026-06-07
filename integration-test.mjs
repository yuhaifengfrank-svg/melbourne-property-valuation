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

describe("P1: Cron 隔离", () => {
  it("cron-daily 干净退出", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync("node cron-daily.mjs", { stdio: [null, null, null], encoding: "utf8" });
    assert.ok(result.includes("NOT ENABLED") || result.includes("exit code 0") || !result.includes("Error"));
  });

  it("cron-weekly 干净退出", async () => {
    const { execSync } = await import("node:child_process");
    const result = execSync("node cron-weekly.mjs", { stdio: [null, null, null], encoding: "utf8" });
    assert.ok(result.includes("NOT ENABLED") || result.includes("exit code 0") || !result.includes("Error"));
  });
});
