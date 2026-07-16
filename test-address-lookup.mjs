import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
const $fs = fs;

/**
 * 加载 app.js 代码到沙箱，mock globalThis.
 * 返回一个对象，包含 { buildEnteredAddress, suburbFromAddress, normalizeSuburbName, toTitleCase, looksLikeStreetOnly }
 * 以及 byId/getEnteredSuburb/getSelectedState/... 等 mock 工具
 */
function createSandbox(mocks = {}) {
  const dom = {
    byId: mocks.byId || ((id) => ({ value: "" })),
    getEnteredSuburb: mocks.getEnteredSuburb || (() => ""),
    getSelectedState: mocks.getSelectedState || (() => "VIC"),
    explicitStateFromAddress: mocks.explicitStateFromAddress || (() => null),
    toTitleCase: mocks.toTitleCase || ((s) => String(s).replace(/\b\w/g, c => c.toUpperCase())),
  };

  const ctx = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: () => {} },
    global: {},
    globalThis: {},
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    window: {
      matchMedia: () => ({ matches: false }),
      scrollToSection: () => {},
      scrollTo: () => {},
      URL: { createObjectURL: () => "blob:", revokeObjectURL: () => {} },
    },
    byId: dom.byId,
    getEnteredSuburb: dom.getEnteredSuburb,
    getSelectedState: dom.getSelectedState,
    explicitStateFromAddress: dom.explicitStateFromAddress,
    toTitleCase: dom.toTitleCase,
    language: "zh",
    currentValuation: null,
    selectedLvr: 0,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout,
    clearTimeout,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    console: { log: () => {} },
  });

  // Also set on globalThis
  ctx.globalThis = ctx;

  // Load app.js
  const appCode = $fs.readFileSync("public/app.js", "utf8");

  // Extract just the key functions we need (skip event listeners and byId usage at top-level)
  // We'll run the relevant functions by extracting them
  const fnsToExtract = [
    "buildEnteredAddress",
    "suburbFromAddress",
    "looksLikeStreetOnly",
    "normalizeSuburbName",
    "normalizeAddress",
    "toTitleCase",
  ];

  const extracted = {};
  for (const fn of fnsToExtract) {
    const re = new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`, "m");
    const m = appCode.match(re);
    if (m) {
      try {
        const script = new vm.Script(m[0]);
        script.runInContext(ctx);
        extracted[fn] = ctx[fn];
      } catch (e) {
        console.error(`Failed to extract ${fn}:`, e.message);
      }
    }
  }

  // Also expose mock functions
  return {
    ...extracted,
    _sandbox: ctx,
    setById: (id, value) => {
      ctx.byId = (id2) => id2 === id ? { value } : { value: "" };
    },
    setGetEnteredSuburb: (fn) => { ctx.getEnteredSuburb = fn; },
  };
}

describe("地址解析 - 真实函数执行测试", () => {
  it("场景1: 只输入街道 18 Moresby St + Suburb=Oakleigh South → canonical='18 Moresby St, Oakleigh South, VIC'", () => {
    const sbox = createSandbox({
      byId: (id) => {
        if (id === "address") return { value: "18 Moresby St" };
        if (id === "suburb") return { value: "Oakleigh South" };
        return { value: "" };
      },
      getEnteredSuburb: () => "Oakleigh South",
      getSelectedState: () => "VIC",
      explicitStateFromAddress: () => null,
    });

    assert.ok(sbox.buildEnteredAddress, "buildEnteredAddress must be extractable");

    const result = sbox.buildEnteredAddress();
    assert.strictEqual(result.canonicalAddress, "18 Moresby St, Oakleigh South, VIC",
      "street-only + suburb dropdown should produce full address");
    assert.strictEqual(result.effectiveSuburb, "Oakleigh South",
      "effectiveSuburb should come from dropdown when no inline suburb");
  });

  it("场景2: 地址含 Oakleigh South + Suburb=Oakleigh South → 不重复", () => {
    const sbox = createSandbox({
      byId: (id) => {
        if (id === "address") return { value: "18 Moresby St, Oakleigh South" };
        if (id === "suburb") return { value: "Oakleigh South" };
        return { value: "" };
      },
      getEnteredSuburb: () => "Oakleigh South",
      getSelectedState: () => "VIC",
      explicitStateFromAddress: () => null,
    });

    assert.ok(sbox.buildEnteredAddress, "buildEnteredAddress must be extractable");

    const result = sbox.buildEnteredAddress();
    assert.strictEqual(result.canonicalAddress, "18 Moresby St, Oakleigh South, VIC",
      "address already has suburb -> no duplicate suburb");
    assert.strictEqual(result.effectiveSuburb, "Oakleigh South",
      "effectiveSuburb = inline suburb");
  });

  it("场景3: 地址含 Oakleigh South + Suburb=Oakleigh → 以地址为准，canonical/payload/subject 一致", () => {
    const sbox = createSandbox({
      byId: (id) => {
        if (id === "address") return { value: "18 Moresby St, Oakleigh South" };
        if (id === "suburb") return { value: "Oakleigh" };
        return { value: "" };
      },
      getEnteredSuburb: () => "Oakleigh",
      getSelectedState: () => "VIC",
      explicitStateFromAddress: () => null,
    });

    const result = sbox.buildEnteredAddress();
    assert.strictEqual(result.canonicalAddress, "18 Moresby St, Oakleigh South, VIC",
      "conflict -> address suburb wins; no duplicate");
    assert.strictEqual(result.effectiveSuburb, "Oakleigh South",
      "effectiveSuburb = inline suburb (address is authoritative)");

    // 验证 API payload 一致性：use effectiveSuburb for payload
    const normalizedForApi = sbox.normalizeSuburbName(result.effectiveSuburb);
    assert.strictEqual(normalizedForApi.toLowerCase(), "oakleigh south",
      "API payload would send oakleigh south, matching canonical address");
    // 验证 subject.suburb 也一致
    assert.strictEqual(
      result.effectiveSuburb.toLowerCase(),
      "oakleigh south",
      "propertySuburb in valuation result would be oakleigh south"
    );
  });

  it("场景4: suburbFromAddress 区分 street suffix 和 actual suburb", () => {
    const sbox = createSandbox();
    assert.ok(sbox.suburbFromAddress, "suburbFromAddress must be extractable");

    // 只输街道 → 返回空
    assert.strictEqual(sbox.suburbFromAddress("18 Moresby St"), "",
      "street-only should return empty suburb");
    assert.strictEqual(sbox.suburbFromAddress("11 McIntosh Road"), "",
      "road-only should return empty suburb");

    // 含 suburb → 提取正确
    assert.strictEqual(sbox.suburbFromAddress("18 Moresby St, Oakleigh South").toLowerCase(), "oakleigh south",
      "comma-separated suburb extracted correctly");
    assert.strictEqual(sbox.suburbFromAddress("18 Moresby St, Oakleigh South, VIC").toLowerCase(), "oakleigh south",
      "comma with state still extracts suburb");
    assert.strictEqual(sbox.suburbFromAddress("Unit 2, 11 McIntosh St, Oakleigh").toLowerCase(), "oakleigh",
      "unit number comma-separated works");
  });

  it("场景5: buildEnteredAddress with Unit + no state dropdown", () => {
    const sbox = createSandbox({
      byId: (id) => {
        if (id === "address") return { value: "Unit 2, 11 McIntosh St, Oakleigh" };
        if (id === "suburb") return { value: "" };
        return { value: "" };
      },
      getEnteredSuburb: () => "",
      getSelectedState: () => "VIC",
      explicitStateFromAddress: () => null,
    });

    const result = sbox.buildEnteredAddress();
    assert.ok(result.canonicalAddress.includes("Oakleigh"),
      "address with inline suburb should include it");
    assert.strictEqual(result.effectiveSuburb, "Oakleigh",
      "effectiveSuburb from inline");
  });
});
