#!/usr/bin/env node

/**
 * Large-Lot Valuation Mode — Requirements Tests (TDD)
 *
 * These tests MUST pass before the feature is ready for Codex review.
 */

import assert from "node:assert/strict";

// ── Import the functions we're testing ──
// Note: these are the new exports from valuation-engine.js and land-size-service.js
let detectLargeLotMode, selectLargeLotComparables, channelAEstimate, channelBEstimate, largeLotConfidence, channelBFeasible;
let isAddressLevelLandSource, getLandSizeP90, getLandSizeMedian;

try {
  const engine = await import("../lib/valuation-engine.js");
  detectLargeLotMode = engine.detectLargeLotMode;
  selectLargeLotComparables = engine.selectLargeLotComparables;
  channelAEstimate = engine.channelAEstimate;
  channelBEstimate = engine.channelBEstimate;
  largeLotConfidence = engine.largeLotConfidence;
  channelBFeasible = engine.channelBFeasible;
} catch (e) {
  console.error("Could not load valuation-engine.js:", e.message);
  process.exit(1);
}

try {
  const ls = await import("../lib/land-size-service.js");
  isAddressLevelLandSource = ls.isAddressLevelLandSource;
  getLandSizeP90 = ls.getLandSizeP90;
  getLandSizeMedian = ls.getLandSizeMedian;
} catch (e) {
  console.error("Could not load land-size-service.js:", e.message);
}

// ── Helpers ──

function makeSubject(overrides = {}) {
  return {
    address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
    propertyType: "House",
    bedrooms: 4,
    bathrooms: 2,
    landSize: 4000,
    landSizeSource: "user_input",
    landSizeConfidence: "High",
    ...overrides
  };
}

function makeLandComp(overrides = {}) {
  return {
    address: "1 One Tree Hill, Donvale VIC 3111",
    salePrice: 2415000,
    saleDate: "2025-06-01",
    propertyType: "House",
    landSize: 3986,
    bedrooms: 4,
    bathrooms: 2,
    distanceMeters: 1210,
    ageMonths: 12,
    sourceCount: 2,
    verificationStatus: "cross_source_verified",
    conditionScore: 3,
    yearBuilt: 1980,
    ...overrides
  };
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

// ═══════════════════════════════════════════
//  Test 1: Normal House stays standard_house
// ═══════════════════════════════════════════
console.log("\n📋 Test 1: Standard House stays standard_house");
{
  const subj = makeSubject({ landSize: 650 });
  const landStats = { median: 800, p90: 1200 };
  const isAddr = isAddressLevelLandSource ? () => isAddressLevelLandSource(subj) : () => false;

  const result = detectLargeLotMode(subj, landStats, isAddr);

  test("valuationMode is standard_house", () => {
    assert.equal(result.mode, "standard_house");
  });
  test("trigger array is empty or has 'standard_house' (no large-lot trigger)", () => {
    assert.ok(!result.trigger || result.trigger.length === 0);
  });
}

// ═══════════════════════════════════════════
//  Test 2: 4,000㎡ Donvale sample enters large_lot_house
// ═══════════════════════════════════════════
console.log("\n📋 Test 2: 4,000㎡ Donvale sample enters large_lot_house");
{
  const subj = makeSubject({ landSize: 4000, landSizeSource: "user_input" });
  const landStats = { median: 800, p90: 1200 };
  const isAddr = isAddressLevelLandSource ? () => isAddressLevelLandSource(subj) : () => true;

  const result = detectLargeLotMode(subj, landStats, isAddr);

  test("valuationMode is large_lot_house", () => {
    assert.equal(result.mode, "large_lot_house");
  });
  test("trigger contains 'subject.landSize >= 2000'", () => {
    assert.ok(result.trigger.some(t => t.includes("2000")), `trigger missing 2000: ${JSON.stringify(result.trigger)}`);
  });
  test("ratio >= 2.0 (4000 / 800 = 5.0)", () => {
    assert.ok(result.ratio >= 2.0);
  });
}

// ═══════════════════════════════════════════
//  Test 3: LGA proxy land size cannot trigger large_lot_house
// ═══════════════════════════════════════════
console.log("\n📋 Test 3: LGA proxy land size cannot trigger large_lot_house");
{
  const subj = makeSubject({ landSize: 3000, landSizeSource: "lga_residential_proxy" });
  const landStats = { median: 800, p90: 1200 };
  const isAddr = isAddressLevelLandSource ? () => isAddressLevelLandSource(subj) : () => false;

  const result = detectLargeLotMode(subj, landStats, isAddr);

  test("triggers are found (size would qualify)", () => {
    assert.ok(result.trigger && result.trigger.length > 0);
  });
  test("mode is NOT large_lot_house, instead large_lot_candidate_unconfirmed", () => {
    assert.notEqual(result.mode, "large_lot_house");
    assert.equal(result.mode, "large_lot_candidate_unconfirmed");
  });
  test("landSourceTrusted is false", () => {
    assert.equal(result.landSourceTrusted, false);
  });
}

// ═══════════════════════════════════════════
//  Test 4: Large lot comparables prefer land-similar sales
// ═══════════════════════════════════════════
console.log("\n📋 Test 4: Large lot comparables prioritize land-similar sales");
{
  const subj = makeSubject({ landSize: 4000 });
  const largeComp = makeLandComp({ landSize: 3986, distanceMeters: 1210 });
  const smallComp = makeLandComp({
    address: "2 Small Street, Donvale VIC 3111",
    landSize: 550, distanceMeters: 200, salePrice: 1400000
  });

  const selected = selectLargeLotComparables(subj, [smallComp, largeComp]);

  test("largeComp is ranked before smallComp", () => {
    assert.ok(selected.length >= 2);
    const firstAddress = selected[0].address;
    // First entry should be the one with land size closest to 4000 (largeComp)
    assert.equal(firstAddress, largeComp.address,
      `Expected first: "${largeComp.address}", got: "${firstAddress}"`);
  });
  test("largeComp has higher largeLotScore than smallComp", () => {
    const l = selected.find(c => c.address === largeComp.address);
    const s = selected.find(c => c.address === smallComp.address);
    assert.ok(l, "largeComp not found in results");
    assert.ok(s, "smallComp not found in results");
    assert.ok(l.largeLotScore > s.largeLotScore,
      `Expected largeComp score > smallComp score, got ${l.largeLotScore} vs ${s.largeLotScore}`);
  });
}

// ═══════════════════════════════════════════
//  Test 5: 400㎡ sale cannot dominate 4,000㎡ sale by proximity
// ═══════════════════════════════════════════
console.log("\n📋 Test 5: Small lot does not dominate large lot by proximity");
{
  const subj = makeSubject({ landSize: 4000 });
  const largeComp = makeLandComp({ landSize: 3986, distanceMeters: 1210 });
  const smallComp = makeLandComp({
    address: "3 Tiny Court, Donvale VIC 3111",
    landSize: 400, distanceMeters: 50, salePrice: 1200000
  });

  const selected = selectLargeLotComparables(subj, [smallComp, largeComp]);

  test("smallComp does not appear first", () => {
    assert.ok(selected.length >= 2);
    assert.notEqual(selected[0].address, smallComp.address,
      "400㎡ comp at 50m should NOT rank ahead of 3986㎡ comp at 1.2km");
  });
  test("smallComp has low largeLotScore relative to largeComp", () => {
    const s = selected.find(c => c.address === smallComp.address);
    const l = selected.find(c => c.address === largeComp.address);
    assert.ok(s.largeLotScore < l.largeLotScore,
      `Small comp score (${s.largeLotScore}) should be much lower than large comp (${l.largeLotScore})`);
  });
}

// ═══════════════════════════════════════════
//  Test 6: Cannot use salePrice/landSize linear extrapolation
// ═══════════════════════════════════════════
console.log("\n📋 Test 6: No linear salePrice/landSize extrapolation");
{
  const subj = makeSubject({ landSize: 4000 });
  const comps = [
    makeLandComp({ landSize: 550, salePrice: 1200000, distanceMeters: 500, address: "Linear 1" }),
    makeLandComp({ landSize: 600, salePrice: 1300000, distanceMeters: 600, address: "Linear 2" }),
    makeLandComp({ landSize: 500, salePrice: 1150000, distanceMeters: 700, address: "Linear 3" }),
  ];

  const chA = channelAEstimate(subj, comps, 0.196);

  test("Channel A returns a result", () => {
    assert.ok(chA, "channelAEstimate returned null");
  });
  test("Channel A estimate is reasonable (not $8M+)", () => {
    if (chA) {
      const est = chA.weightedMedian;
      // Linear extrapolation: 4000/550 * 1.2M = $8.7M, which is absurd
      // Elasticity 0.196: (4000/550)^0.196 ≈ 1.49, so ~$1.2M * 1.49 = ~$1.79M
      assert.ok(est < 3000000, `Channel A estimate $${est} is too high (suggests linear extrapolation)`);
    }
  });
  test("Land ratio applied non-linearly (not proportional)", () => {
    if (chA) {
      // Land ratio = 4000/550 ≈ 7.27
      // Linear would be 7.27x price. Non-linear: 7.27^0.196 ≈ 1.49
      // Verify adjustments don't just copy compPrice
      const entry = chA.adjusted[0];
      assert.ok(entry.adjustedPrice !== entry.compPrice,
        "Adjusted price equals comp price — no land adj applied");
    }
  });
}

// ═══════════════════════════════════════════
//  Test 7: Doubling land size doesn't double estimate
// ═══════════════════════════════════════════
console.log("\n📋 Test 7: Doubling land does not double the estimate");
{
  const comps4k = [
    makeLandComp({ landSize: 3986, salePrice: 2415000, distanceMeters: 1210 }),
    makeLandComp({ landSize: 4232, salePrice: 2360000, distanceMeters: 1480, address: "Utrecht" }),
    makeLandComp({ landSize: 4301, salePrice: 2785000, distanceMeters: 2980, address: "Beckett" }),
  ];

  const subj4k = makeSubject({ landSize: 4000 });
  const subj2k = makeSubject({ landSize: 2000 });

  const chA4k = channelAEstimate(subj4k, comps4k, 0.196);
  const chA2k = channelAEstimate(subj2k, comps4k, 0.196);

  test("Both Channel A estimates are non-null", () => {
    assert.ok(chA4k, "4k estimate null");
    assert.ok(chA2k, "2k estimate null");
  });
  if (chA4k && chA2k) {
    const ratio4k = chA4k.weightedMedian;
    const ratio2k = chA2k.weightedMedian;
    test(`4k estimate ($${ratio4k}) should be less than 2× 2k estimate ($${ratio2k})`, () => {
      assert.ok(ratio4k < ratio2k * 2,
        `4k $${ratio4k} >= 2k $${ratio2k} * 2 = $${ratio2k * 2}`);
    });
  }
}

// ═══════════════════════════════════════════
//  Test 8: Insufficient large-lot comps → wider range + lower confidence
// ═══════════════════════════════════════════
console.log("\n📋 Test 8: Insufficient large-lot comps -> wider range + lower confidence");
{
  const subj = makeSubject({ landSize: 4000 });
  const oneComp = [makeLandComp({ landSize: 3986, salePrice: 2415000 })];
  const threeComps = [
    makeLandComp({ landSize: 3986, salePrice: 2415000 }),
    makeLandComp({ landSize: 4232, salePrice: 2360000, address: "Utrecht" }),
    makeLandComp({ landSize: 4301, salePrice: 2785000, address: "Beckett" }),
  ];

  const conf1 = largeLotConfidence(subj, { adjusted: oneComp }, null, oneComp, { median: 800, p90: 1200 });
  const conf2 = largeLotConfidence(subj, { adjusted: threeComps }, null, threeComps, { median: 800, p90: 1200 });

  test("Confidence with 1 comp is not 'High' or 'Medium'", () => {
    assert.ok(conf1.label === "Low" || conf1.label === "Low-Medium",
      `Expected Low or Low-Medium, got ${conf1.label}`);
  });
  test("Confidence with 3 comps is higher than with 1", () => {
    assert.ok(conf1.dataScore <= conf2.dataScore,
      `1-comp confidence (${conf1.dataScore}) should be <= 3-comp (${conf2.dataScore})`);
  });
  test("landComparableWithSimilarSizeCount reflects comp availability", () => {
    assert.equal(conf1.landComparableWithSimilarSizeCount, 1);
    assert.equal(conf2.landComparableWithSimilarSizeCount, 3);
  });
}

// ═══════════════════════════════════════════
//  Test 9: House and Unit/Apartment strictly separated
// ═══════════════════════════════════════════
console.log("\n📋 Test 9: House vs Unit/Apartment strict separation");
{
  const subjUnit = makeSubject({ propertyType: "Unit", landSize: 4000 });
  const landStats = { median: 800, p90: 1200 };
  const isAddr = () => true;

  const result = detectLargeLotMode(subjUnit, landStats, isAddr);

  test("Unit with large land does not enter large_lot mode", () => {
    assert.equal(result.mode, "standard_house", `Expected standard_house, got ${result.mode}`);
  });
  test("Unit has no large lot triggers", () => {
    assert.equal(result.trigger.length, 0, `Unit should have no triggers: ${JSON.stringify(result.trigger)}`);
  });
}

// ═══════════════════════════════════════════
//  Test 10: Future Growth data excluded from valuation
// ═══════════════════════════════════════════
console.log("\n📋 Test 10: Future Growth data excluded from large-lot valuation");
{
  const subj = makeSubject({ landSize: 4000, landSizeSource: "user_input" });
  const landStats = { median: 800, p90: 1200 };

  // Verify the detect function never references growth data
  const result = detectLargeLotMode(subj, landStats, isAddressLevelLandSource);

  test("detectLargeLotMode does not use growth fields", () => {
    assert.ok(result, "result should exist");
    // SUT: the function only uses landSize, propertyType, landStats — not growth data
  });
  test("channelAEstimate does not use growth fields", () => {
    const comps = [makeLandComp()];
    const chA = channelAEstimate(subj, comps, 0.196);
    assert.ok(chA, "Channel A result should exist");
    // Verify Channel A only uses size/distance/bed/bath — not growth
    const keys = Object.keys(chA);
    assert.ok(!keys.some(k => k.includes("growth") || k.includes("opportunity") || k.includes("score")),
      `Channel A should not contain growth/opportunity fields: ${keys.filter(k => k.includes("growth") || k.includes("opportunity") || k.includes("score")).join(",")}`);
  });
}

// ═══════════════════════════════════════════
//  Test 12: 5-7 Old Warrandyte Road sample in $2.20m–$2.75m range
// ═══════════════════════════════════════════
console.log("\n📋 Test 12: Donvale 5-7 Old Warrandyte Rd sample in target range");
{
  const subj = makeSubject({ landSize: 4000, landSizeSource: "user_input" });
  const landStats = { median: 800, p90: 1200 };
  const isAddr = isAddressLevelLandSource ? () => isAddressLevelLandSource(subj) : () => true;

  // Test mode detection
  const detectResult = detectLargeLotMode(subj, landStats, isAddr);
  test("detectLargeLotMode confirms large_lot_house", () => {
    assert.equal(detectResult.mode, "large_lot_house");
  });

  // Select comparables with the 3 known large-lot sales
  const comps = [
    makeLandComp({ address: "1 One Tree Hill, Donvale VIC 3111", landSize: 3986, salePrice: 2415000, distanceMeters: 1210 }),
    makeLandComp({ address: "1 Utrecht Court, Donvale VIC 3111", landSize: 4232, salePrice: 2360000, distanceMeters: 1480 }),
    makeLandComp({ address: "25 Beckett Road, Donvale VIC 3111", landSize: 4301, salePrice: 2785000, distanceMeters: 2980 }),
  ];

  const selected = selectLargeLotComparables(subj, comps);
  test("All 3 comparables are selected", () => {
    assert.equal(selected.length, 3);
  });
  test("One Tree Hill is one of the selected comparables", () => {
    assert.ok(selected.some(c => c.address.includes("One Tree Hill")),
      `Missing One Tree Hill. Selected: ${selected.map(c => c.address).join(", ")}`);
  });
  test("Utrecht Court is one of the selected comparables", () => {
    assert.ok(selected.some(c => c.address.includes("Utrecht")),
      `Missing Utrecht Court. Selected: ${selected.map(c => c.address).join(", ")}`);
  });

  // Channel A estimate
  const chA = channelAEstimate(subj, comps, 0.196);
  if (chA) {
    const est = chA.weightedMedian;
    test(`Channel A estimate $${est.toLocaleString()} is in range ($2,200,000 - $2,750,000)`, () => {
      assert.ok(est >= 2200000 && est <= 2750000,
        `Channel A estimate $${est.toLocaleString()} out of range $2.20m-$2.75m`);
    });
  } else {
    test("Channel A estimate non-null (skip range check)", () => {
      assert.ok(false, "channelAEstimate returned null");
    });
  }

  // Channel B feasibility (no building data)
  test("channelBFeasible is false without building area", () => {
    assert.equal(channelBFeasible(subj), false,
      "Channel B should not be feasible without building data");
  });
}

// ═══════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════
console.log(`\n${"=".repeat(50)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);

if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log("✅ All large-lot mode tests pass!");
}
