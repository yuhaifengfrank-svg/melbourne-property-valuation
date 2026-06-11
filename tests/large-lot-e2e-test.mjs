// ── Large-Lot E2E Integration Test ──
// Tests the full runValuation → valueProperty chain with large-lot detection
// Uses injected mocks to avoid DB/CDP dependency (DATABASE_URL not configured
// locally). In production/deployment, MockDbSource is replaced by a real DB
// connection — see api/valuation.js and lib/db-comparable-source.js for the
// production flow. Donvale results have been validated via unit tests (Test 12).

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mock the DB source so we don't need DATABASE_URL
class MockDbSource {
  async checkConnection() { return true; }
  async fetch() { return []; }
  async fetchLargeLot(subj, opts) {
    return [
      {
        address: "1 One Tree Hill, Donvale VIC 3111",
        suburb: "Donvale", state: "VIC",
        salePrice: 2415000,
        saleDate: "2025-06-01",
        bedrooms: 4, bathrooms: 2, carSpaces: 2,
        landSize: 3986,
        propertyType: "House",
        lat: -37.785, lon: 145.180,
        distanceMeters: 1210,
        ageMonths: 12,
        verificationStatus: "cross_source_verified",
        sourceCount: 2,
        _largeLotTier: "L1"
      },
      {
        address: "1 Utrecht Court, Donvale VIC 3111",
        suburb: "Donvale", state: "VIC",
        salePrice: 2360000,
        saleDate: "2025-07-01",
        bedrooms: 6, bathrooms: 3, carSpaces: 4,
        landSize: 4232,
        propertyType: "House",
        lat: -37.788, lon: 145.190,
        distanceMeters: 1480,
        ageMonths: 11,
        verificationStatus: "cross_source_verified",
        sourceCount: 2,
        _largeLotTier: "L1"
      },
      {
        address: "25 Beckett Road, Donvale VIC 3111",
        suburb: "Donvale", state: "VIC",
        salePrice: 2785000,
        saleDate: "2025-08-01",
        bedrooms: 5, bathrooms: 2, carSpaces: 2,
        landSize: 4301,
        propertyType: "House",
        lat: -37.775, lon: 145.200,
        distanceMeters: 2980,
        ageMonths: 10,
        verificationStatus: "cross_source_verified",
        sourceCount: 2,
        _largeLotTier: "L1"
      }
    ];
  }
}

describe("Large-Lot E2E: full runValuation chain", () => {
  it("should detect large-lot mode for Donvale with user-provided landSize", async () => {
    const { runValuation } = await import("../lib/valuation-service.js");
    const mockDb = new MockDbSource();

    const result = await runValuation({
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      suburb: "Donvale",
      state: "VIC",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000
    }, {
      fetch: false,
      useDatabaseFallback: true,
      dbSource: mockDb,
      mockCollectorComparables: []  // No CDP results, rely on DB
    });

    assert.ok(result, "runValuation should return a result");
    assert.equal(result.valuationMode, "large_lot_house",
      "valuationMode should be large_lot_house when user provides landSize=4000 for a House");

    assert.ok(result.largeLotDetect, "largeLotDetect should be present");
    assert.ok(result.largeLotResult, "largeLotResult should be present");

    // Primary estimate should use large-lot midpoint
    assert.ok(result.valuation?.estimate?.midpoint, "estimate.midpoint should exist");
    const est = result.valuation.estimate.midpoint;
    assert.ok(est >= 2000000 && est <= 2800000,
      `large-lot estimate $${est.toLocaleString()} should be in $2.0M-$2.8M range`);

    // Verify the range
    assert.ok(result.valuation.estimate.low >= 1400000, "low should be reasonable");
    assert.ok(result.valuation.estimate.high >= 1800000, "high should be reasonable");
  });

  it("should NOT detect large_lot_house for House without user landSize", async () => {
    const { runValuation } = await import("../lib/valuation-service.js");
    const mockDb = new MockDbSource();

    const result = await runValuation({
      address: "1 Main Street, Donvale VIC 3111",
      suburb: "Donvale",
      state: "VIC",
      propertyType: "House",
      bedrooms: 3,
      bathrooms: 2
    }, {
      fetch: false,
      useDatabaseFallback: true,
      dbSource: mockDb,
      mockCollectorComparables: []
    });

    // Without user landSize, large_lot_house should NOT trigger
    // (auto-resolved LGA median for Donvale is ~800m², not large enough)
    assert.notEqual(result.valuationMode, "large_lot_house",
      "House without explicit landSize should NOT get large_lot_house mode");
  });

  it("should use large-lot estimate as primary when mode is active", async () => {
    const { runValuation } = await import("../lib/valuation-service.js");
    const mockDb = new MockDbSource();

    const result = await runValuation({
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      suburb: "Donvale",
      state: "VIC",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000,
      coordinates: { lat: -37.78, lon: 145.19 }  // Provide coordinates to avoid experimental downgrade
    }, {
      fetch: false,
      useDatabaseFallback: true,
      dbSource: mockDb,
      mockCollectorComparables: []
    });

    // The large-lot estimate IS the primary estimate
    const mid = result.valuation.estimate.midpoint;
    const llMid = result.largeLotResult.combinedMidpoint;
    assert.equal(mid, llMid,
      "primary estimate midpoint should equal largeLotResult.combinedMidpoint");

    // Verify experimental flag when < 3 comps? Actually we have 3 comps, so no flag
    assert.ok(!result.largeLotResult.experimental,
      "3 comps should NOT produce experimental flag");
  });

  it("should produce experimental flag with only 1 large-lot comp", async () => {
    const { valueProperty } = await import("../lib/valuation-engine.js");
    
    const subject = {
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000,
      landSizeSource: "user_input",
      landSizeConfidence: "High",
      coordinates: { lat: -37.78, lon: 145.19 }
    };

    const singleComp = [{
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
      yearBuilt: 1980
    }];

    const result = valueProperty({
      subject, comparables: [],
      largeLotLandStats: { median: 800, p90: 1200 },
      largeLotComparables: singleComp,
      isAddressLevelLandSource: (s) => s.landSizeSource === "user_input"
    });

    assert.ok(result.largeLotResult, "largeLotResult should exist");
    assert.equal(result.valuationMode, "large_lot_house", "mode should be large_lot_house");
    assert.ok(result.largeLotResult.experimental, 
      "should have experimental flag with 1 comp");
    assert.ok(result.largeLotResult.experimental.includes("实验"),
      "experimental flag should be in Chinese");
  });

  it("should not produce experimental flag with 3 large-lot comps", async () => {
    const { valueProperty } = await import("../lib/valuation-engine.js");
    
    const subject = {
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000,
      landSizeSource: "user_input",
      landSizeConfidence: "High",
      coordinates: { lat: -37.78, lon: 145.19 }
    };

    const threeComps = [
      { address: "1 One Tree Hill", salePrice: 2415000, saleDate: "2025-06-01",
        propertyType: "House", landSize: 3986, bedrooms: 4, bathrooms: 2,
        distanceMeters: 1210, ageMonths: 12, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1980 },
      { address: "1 Utrecht Court", salePrice: 2360000, saleDate: "2025-07-01",
        propertyType: "House", landSize: 4232, bedrooms: 6, bathrooms: 3,
        distanceMeters: 1480, ageMonths: 11, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1990 },
      { address: "25 Beckett Road", salePrice: 2785000, saleDate: "2025-08-01",
        propertyType: "House", landSize: 4301, bedrooms: 5, bathrooms: 2,
        distanceMeters: 2980, ageMonths: 10, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1985 }
    ];

    const result = valueProperty({
      subject, comparables: [],
      largeLotLandStats: { median: 800, p90: 1200 },
      largeLotComparables: threeComps,
      isAddressLevelLandSource: (s) => s.landSizeSource === "user_input"
    });

    assert.ok(result.largeLotResult, "largeLotResult should exist");
    assert.equal(result.valuationMode, "large_lot_house");
    assert.ok(!result.largeLotResult.experimental,
      "3 comps should NOT produce experimental flag");
  });

  it("should include large-lot comps in acceptedComparables and set dataTier", async () => {
    const { runValuation } = await import("../lib/valuation-service.js");
    const mockDb = new MockDbSource();

    const result = await runValuation({
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      suburb: "Donvale",
      state: "VIC",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000
    }, {
      fetch: false,
      useDatabaseFallback: true,
      dbSource: mockDb,
      mockCollectorComparables: []
    });

    // acceptedComparables should contain the large-lot comps
    assert.ok(result.valuation?.acceptedComparables, "acceptedComparables should exist");
    assert.ok(result.valuation.acceptedComparables.length >= 3,
      `expected at least 3 accepted comps, got ${result.valuation.acceptedComparables.length}`);

    // dataTier should be comparable_led when >= 3 comps
    assert.equal(result.dataTier, "comparable_led",
      "dataTier should be comparable_led with 3+ large-lot comps");

    // customerDataStatus should reflect cross-verified comps
    assert.ok(result.customerDataStatus, "customerDataStatus should exist");
    assert.equal(result.customerDataStatus, "sufficient",
      "3 cross-verified comps should produce sufficient customerDataStatus");
  });

  it("should include _largeLotComp flag in acceptedComparables entries", async () => {
    const { valueProperty } = await import("../lib/valuation-engine.js");

    const subject = {
      address: "5-7 Old Warrandyte Road, Donvale VIC 3111",
      propertyType: "House",
      bedrooms: 4,
      bathrooms: 2,
      landSize: 4000,
      landSizeSource: "user_input",
      landSizeConfidence: "High",
      coordinates: { lat: -37.78, lon: 145.19 }
    };

    const threeComps = [
      { address: "1 One Tree Hill", salePrice: 2415000, saleDate: "2025-06-01",
        propertyType: "House", landSize: 3986, bedrooms: 4, bathrooms: 2,
        distanceMeters: 1210, ageMonths: 12, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1980 },
      { address: "1 Utrecht Court", salePrice: 2360000, saleDate: "2025-07-01",
        propertyType: "House", landSize: 4232, bedrooms: 6, bathrooms: 3,
        distanceMeters: 1480, ageMonths: 11, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1990 },
      { address: "25 Beckett Road", salePrice: 2785000, saleDate: "2025-08-01",
        propertyType: "House", landSize: 4301, bedrooms: 5, bathrooms: 2,
        distanceMeters: 2980, ageMonths: 10, sourceCount: 2,
        verificationStatus: "cross_source_verified", conditionScore: 3, yearBuilt: 1985 }
    ];

    const result = valueProperty({
      subject, comparables: [],
      largeLotLandStats: { median: 800, p90: 1200 },
      largeLotComparables: threeComps,
      isAddressLevelLandSource: (s) => s.landSizeSource === "user_input"
    });

    assert.ok(result.acceptedComparables, "acceptedComparables should exist");
    const llInAccepted = result.acceptedComparables.filter(c => c._largeLotComp);
    assert.equal(llInAccepted.length, 3,
      `expected 3 large-lot comps in accepted, got ${llInAccepted.length}`);
  });
});
