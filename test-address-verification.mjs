/**
 * buildSubject Nominatim 核验 mock 测试
 *
 * Nominatim API 返回格式：
 * [{ lat, lon, display_name, boundingbox, osm_type,
 *    address: { house_number, road, suburb, state, postcode, country } }]
 *
 * verifyAddress() 提取：entry.address.suburb/road/house_number/state/postcode
 */
import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const BASE = { address: "18 Moresby St", suburb: "Oakleigh South", state: "VIC" };

function makeNomEntry(overrides = {}) {
  const addrOverrides = overrides.address || {};
  return {
    lat: -37.9366,
    lon: 145.0983,
    display_name: "18 Moresby Street, Oakleigh South, Victoria 3167, Australia",
    boundingbox: ["-37.9380", "-37.9350", "145.0960", "145.1000"],
    osm_type: "way",
    address: {
      house_number: "18",
      road: "Moresby Street",
      suburb: "Oakleigh South",
      state: "Victoria",
      postcode: "3167",
      country: "Australia",
      ...addrOverrides
    },
    ...overrides,
    // Don't let overrides clobber address
    address: {
      house_number: "18",
      road: "Moresby Street",
      suburb: "Oakleigh South",
      state: "Victoria",
      postcode: "3167",
      country: "Australia",
      ...addrOverrides
    }
  };
}

function mockOk(addrOverrides) {
  mock.reset();
  const entry = makeNomEntry(addrOverrides ? { address: addrOverrides } : {});
  globalThis.fetch = mock.fn(async () => ({
    ok: true,
    json: async () => [entry],
    status: 200
  }));
}

function mockEmpty() {
  mock.reset();
  globalThis.fetch = mock.fn(async () => ({
    ok: true,
    json: async () => [],
    status: 200
  }));
}

let buildSubject;

describe("buildSubject — Nominatim 核验", () => {

  before(() => {
    mockOk(); // default to get module loaded
    const require = createRequire(import.meta.url);
    buildSubject = require("./lib/comparable-research-collector.js").buildSubject;
  });

  after(() => { delete globalThis.fetch; });

  it("I: 正确地址 → verified, canonicalAddress 正确", async () => {
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
    assert.ok(r.canonicalAddress.includes("18 Moresby"));
    assert.ok(r.canonicalAddress.includes("Oakleigh South"));
    assert.ok(r.canonicalAddress.includes("VIC"));
    assert.ok(r.canonicalAddress.includes("3167"));
    assert.equal(r.addressMismatch, null);
  });

  it("II: 错误门牌 → mismatch", async () => {
    mockOk({ house_number: "15" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.houseNumMatch, false);
    assert.notEqual(r.addressMismatch, null);
    assert.ok(r.addressMismatch.message.includes("门牌号"));
    assert.equal(r.addressMismatch.inputHouseNum, "18");
    assert.equal(r.addressMismatch.verifiedHouseNum, "15");
  });

  it("III: 错误 suburb → mismatch（精确匹配）", async () => {
    mockOk({ suburb: "Chelsea" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.suburbExact, false);
    assert.equal(r.addressMismatch.inputSuburb, "Oakleigh South");
    assert.equal(r.addressMismatch.verifiedSuburb, "Chelsea");
  });

  it("IV: 错误 state → mismatch", async () => {
    mockOk({ state: "New South Wales" });
    const r = await buildSubject(BASE);
    assert.equal(r.verification.status, "mismatch");
    assert.equal(r.verification.stateMatch, false);
    assert.equal(r.addressMismatch.inputState, "VIC");
    assert.equal(r.addressMismatch.verifiedState, "NSW");
  });

  it("V: Nominatim 不可用 → fallback", async () => {
    mockEmpty();
    const r = await buildSubject(BASE);
    assert.equal(r.addressResolved, true);
    assert.equal(r.addressSource, "user_input_fallback");
    assert.equal(r.suburb, "Oakleigh South");
    assert.equal(r.canonicalAddress, "18 Moresby St");
    assert.equal(r.addressMismatch, null);
  });

  it("VI: Unit 3/18 Moresby → unit 前缀保留", async () => {
    mockOk();
    const r = await buildSubject({
      address: "Unit 3/18 Moresby St",
      suburb: "Oakleigh South",
      state: "VIC"
    });
    assert.equal(r.valid, true);
    assert.equal(r.verification.status, "verified");
    assert.equal(r.verification.houseNumMatch, true);
    assert.equal(r.verification.roadMatch, true);
    assert.ok(r.canonicalAddress.includes("Unit"));
    assert.ok(r.canonicalAddress.includes("18 Moresby"));
  });
});
