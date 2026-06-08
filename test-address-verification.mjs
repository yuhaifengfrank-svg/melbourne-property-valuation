/**
 * buildSubject Nominatim 核验 mock 测试
 *
 * 测试行为规范：
 * 1. 双方都有值且明确不同 → mismatch
 * 2. 字段缺失（地图未返回）→ unconfirmed，不报 mismatch，继续用客户输入
 * 3. Unit 地址地图无法核验 → unitStatus: unverified，可继续估值
 * 4. subject.address === canonicalAddress（effectiveAddress）
 */
import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const BASE = { address: "18 Moresby St", suburb: "Oakleigh South", state: "VIC" };

/**
 * Create a Nominatim response entry.
 * `overrides.address` sets fields that exist; any key omitted is truly absent.
 * Use `{ house_number: null }` or `null` to explicitly simulate field absence.
 */
function makeNomEntry(overrides = {}) {
  const addrOverrides = overrides.address || {};
  const addr = {};
  // Only set base fields that aren't in the override as null
  const baseKeys = ["house_number", "road", "suburb", "state", "postcode", "country"];
  for (const key of baseKeys) {
    if (key in addrOverrides) {
      const val = addrOverrides[key];
      if (val !== null && val !== undefined) addr[key] = val;
    } else {
      // Use default values
      const defaults = {
        house_number: "18", road: "Moresby Street", suburb: "Oakleigh South",
        state: "Victoria", postcode: "3167", country: "Australia"
      };
      addr[key] = defaults[key];
    }
  }
  return {
    lat: -37.9366, lon: 145.0983,
    display_name: "18 Moresby Street, Oakleigh South, Victoria 3167, Australia",
    boundingbox: ["-37.9380", "-37.9350", "145.0960", "145.1000"],
    osm_type: "way",
    address: addr
  };
}

function mockOk(suburbOverrides) {
  mock.reset();
  const entry = makeNomEntry(suburbOverrides ? { address: suburbOverrides } : {});
  globalThis.fetch = mock.fn(async () => ({
    ok: true, json: async () => [entry], status: 200
  }));
}

function mockOkPartial(partialOverrides) {
  mock.reset();
  const entry = makeNomEntry({ address: partialOverrides });
  globalThis.fetch = mock.fn(async () => ({
    ok: true, json: async () => [entry], status: 200
  }));
}

function mockEmpty() {
  mock.reset();
  globalThis.fetch = mock.fn(async () => ({ ok: true, json: async () => [], status: 200 }));
}

let buildSubject;

function verifyAddressCanonical(r, expectedCanonical) {
  assert.equal(r.address, r.canonicalAddress,
    `address (${r.address}) !== canonicalAddress (${r.canonicalAddress})`);
  if (expectedCanonical) {
    assert.equal(r.address, expectedCanonical,
      `address mismatch: got "${r.address}" expected "${expectedCanonical}"`);
  }
}

describe("buildSubject — Nominatim 核验", () => {

  before(() => {
    mockOk();
    const require = createRequire(import.meta.url);
    buildSubject = require("./lib/comparable-research-collector.js").buildSubject;
  });

  after(() => { delete globalThis.fetch; });

  // ────────────────────────────────────────────
  // I: happy path
  // ────────────────────────────────────────────
  it("I: 完全匹配 → verified, canonicalAddress, address===canonicalAddress", async () => {
    mockOk();
    const r = await buildSubject(BASE);
    assert.equal(r.valid, true);
    assert.equal(r.addressResolved, true);
    assert.equal(r.addressSource, "nominatim_verified");
    assert.equal(r.verification.status, "verified");
    assert.equal(r.verification.suburbExact, true);
    assert.equal(r.verification.stateMatch, true);
    assert.equal(r.verification.houseNumMatch, true);
    assert.equal(r.verification.roadMatch, true);
    assert.equal(r.suburb, "Oakleigh South");
    assert.equal(r.verification.unitStatus, "none");
    assert.equal(r.verification.unconfirmedFields.length, 0);
    assert.ok(r.canonicalAddress.includes("18 Moresby"));
    assert.ok(r.canonicalAddress.includes("Oakleigh South"));
    assert.ok(r.canonicalAddress.includes("VIC"));
    assert.ok(r.canonicalAddress.includes("3167"));
    assert.equal(r.addressMismatch, null);
    verifyAddressCanonical(r);
  });

  // ────────────────────────────────────────────
  // II: house number mismatch
  // ────────────────────────────────────────────
  it("II: 门牌号明确冲突（输入18 vs 地图15）→ mismatch", async () => {
    mockOk({ house_number: "15" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.houseNumMatch, false);
    assert.notEqual(r.addressMismatch, null);
    assert.ok(r.addressMismatch.message.includes("门牌号"));
    assert.equal(r.addressMismatch.inputHouseNum, "18");
    assert.equal(r.addressMismatch.verifiedHouseNum, "15");
  });

  // ────────────────────────────────────────────
  // III: suburb mismatch（Nominatim top result 在其他 suburb）
  // ────────────────────────────────────────────
  it("III: Nominatim top result 在 Chelsea 但输入 Oakleigh South → 不阻断，降级 unconfirmed", async () => {
    mockOk({ suburb: "Chelsea" });
    const r = await buildSubject(BASE);
    // 无候选匹配输入 suburb → unconfirmed，不 mismatch
    assert.equal(r.verification.status, "unconfirmed");
    assert.equal(r.verification.suburbExact, false);
    assert.equal(r.addressMismatch, null);
    assert.equal(r.suburb, "Oakleigh South"); // 保留客户输入
    assert.equal(r.addressResolved, true);
    assert.equal(r.addressSource, "user_input_fallback");
    assert.ok(r.verification.nominatimHint);
    assert.ok(r.verification.nominatimHint.message.includes("Chelsea"));
  });

  // ────────────────────────────────────────────
  // IV: state mismatch
  // ────────────────────────────────────────────
  it("IV: state 明确冲突（输入 VIC vs 地图 NSW）→ mismatch", async () => {
    mockOk({ state: "New South Wales" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.stateMatch, false);
    assert.equal(r.addressMismatch.inputState, "VIC");
    assert.equal(r.addressMismatch.verifiedState, "NSW");
  });

  // ────────────────────────────────────────────
  // V: Nominatim unavailable
  // ────────────────────────────────────────────
  it("V: Nominatim 不可用 → fallback, addressConfidence low", async () => {
    mockEmpty();
    const r = await buildSubject(BASE);
    assert.equal(r.addressResolved, true);
    assert.equal(r.addressSource, "user_input_fallback");
    assert.equal(r.verification.status, "unavailable");
    assert.equal(r.verification.addressConfidence, "low");
    assert.equal(r.suburb, "Oakleigh South");
    assert.equal(r.canonicalAddress, "18 Moresby St");
    assert.equal(r.address, "18 Moresby St");
    assert.equal(r.addressMismatch, null);
  });

  // ────────────────────────────────────────────
  // VI: Unit address
  // ────────────────────────────────────────────
  it("VI: Unit 3/18 → unitStatus unverified, 继续估值", async () => {
    mockOk();
    const r = await buildSubject({
      address: "Unit 3/18 Moresby St", suburb: "Oakleigh South", state: "VIC"
    });
    assert.equal(r.valid, true);
    assert.equal(r.verification.status, "verified");
    assert.equal(r.verification.unitStatus, "unverified");
    assert.equal(r.verification.houseNumMatch, true);
    assert.equal(r.verification.roadMatch, true);
    assert.ok(r.canonicalAddress.includes("Unit"));
    assert.ok(r.canonicalAddress.includes("18 Moresby"));
    assert.equal(r.addressMismatch, null);
    verifyAddressCanonical(r);
  });

  // ────────────────────────────────────────────
  // VII-XI: partial (missing fields)
  // Omitting fields by setting them to null in the mock
  // ────────────────────────────────────────────
  it("VII: 地图缺 house_number → partial, unconfirmedFields, 不 mismatch", async () => {
    mockOkPartial({ house_number: null, road: "Moresby Street", suburb: "Oakleigh South", state: "Victoria" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.equal(r.verification.addressConfidence, "medium");
    assert.ok(r.verification.unconfirmedFields.includes("house_number"));
    assert.equal(r.verification.houseNumMatch, false);
    assert.equal(r.addressMismatch, null);
    assert.equal(r.addressSource, "nominatim_verified");
    assert.equal(r.suburb, "Oakleigh South");
    verifyAddressCanonical(r);
  });

  it("VIII: 地图缺 road → partial, unconfirmedFields", async () => {
    mockOkPartial({ road: null, house_number: "18", suburb: "Oakleigh South", state: "Victoria" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.ok(r.verification.unconfirmedFields.includes("road"));
    assert.equal(r.verification.roadMatch, false);
    assert.equal(r.addressMismatch, null);
    verifyAddressCanonical(r);
  });

  it("IX: 地图缺 suburb → partial, 客户 suburb 保留", async () => {
    mockOkPartial({ suburb: null, house_number: "18", road: "Moresby Street", state: "Victoria" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.ok(r.verification.unconfirmedFields.includes("suburb"));
    assert.equal(r.verification.suburbExact, false);
    assert.equal(r.addressMismatch, null);
    assert.equal(r.suburb, "Oakleigh South"); // 保留客户输入
    verifyAddressCanonical(r);
  });

  it("X: 地图缺 state → partial, unconfirmedFields includes state", async () => {
    mockOkPartial({ state: null, house_number: "18", road: "Moresby Street", suburb: "Oakleigh South" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.ok(r.verification.unconfirmedFields.includes("state"));
    assert.equal(r.verification.stateMatch, false);
    assert.equal(r.addressMismatch, null);
    assert.equal(r.state, "VIC"); // 保留
    verifyAddressCanonical(r);
  });

  it("XI: 地图全部字段缺失 → partial, 客户输入全部保留", async () => {
    mockOkPartial({ house_number: null, road: null, suburb: null, state: null });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.equal(r.verification.addressConfidence, "medium");
    assert.equal(r.verification.unconfirmedFields.length, 4); // house_number, road, suburb, state
    assert.equal(r.addressMismatch, null);
    assert.equal(r.suburb, "Oakleigh South");
    assert.equal(r.state, "VIC");
    verifyAddressCanonical(r);
  });

  // ────────────────────────────────────────────
  // XII: road mismatch
  // ────────────────────────────────────────────
  it("XII: road 明确冲突（输入 Moresby St vs 地图 Somewhere Road）→ mismatch", async () => {
    mockOk({ road: "Somewhere Road" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.roadMatch, false);
    assert.notEqual(r.addressMismatch, null);
    assert.ok(r.addressMismatch.message.includes("街道"));
    // inputRoad is lowercase from normalizeAddress
    assert.ok(r.addressMismatch.inputRoad === "moresby" || r.addressMismatch.inputRoad === "Moresby");
    assert.equal(r.addressMismatch.verifiedRoad, "Somewhere Road");
  });

  // ────────────────────────────────────────────
  // XIII: Unit + missing fields
  // ────────────────────────────────────────────
  it("XIII: Unit 地址 + 地图缺 house_number → partial, unitStatus unverified", async () => {
    mockOkPartial({ house_number: null, road: "Moresby Street", suburb: "Oakleigh South", state: "Victoria" });
    const r = await buildSubject({
      address: "Unit 3/18 Moresby St", suburb: "Oakleigh South", state: "VIC"
    });
    assert.equal(r.verification.status, "partial");
    assert.equal(r.verification.unitStatus, "unverified");
    assert.ok(r.verification.unconfirmedFields.includes("house_number"));
    assert.equal(r.addressMismatch, null);
    assert.equal(r.address, r.canonicalAddress);
  });

  // ────────────────────────────────────────────
  // XIV-VX: edge cases
  // ────────────────────────────────────────────
  it("XIV: 非 Unit 地址 → unitStatus: none", async () => {
    mockOk();
    const r = await buildSubject(BASE);
    assert.equal(r.verification.unitStatus, "none");
  });

  it("XV: suburb 与地图匹配但 road 缺失 → partial, 不 mismatch", async () => {
    mockOkPartial({ road: null, suburb: "Oakleigh South", state: "Victoria", house_number: "18" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "partial");
    assert.ok(r.verification.unconfirmedFields.includes("road"));
    assert.equal(r.addressMismatch, null);
    assert.equal(r.suburb, "Oakleigh South"); // maps matches
    verifyAddressCanonical(r);
  });
});
