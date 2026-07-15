import test from "node:test";
import assert from "node:assert/strict";

import { valueProperty } from "../lib/valuation-engine.js";
import { runValuation } from "../lib/valuation-service.js";

function comp(index, {
  distanceMeters,
  salePrice = 700000,
  saleDate = "2026-06-01",
  propertyType = "Unit",
  bedrooms = 2,
  bathrooms = 1,
  carSpaces = 1
} = {}) {
  return {
    address: `${index} Example Street, Oakleigh VIC`,
    salePrice,
    saleDate,
    propertyType,
    bedrooms,
    bathrooms,
    carSpaces,
    index,
    distanceMeters,
    sourceCount: 1,
    sourceUrl: `https://example.test/${index}`
  };
}

// ── B. Database candidate pool size ──

test("runValuation requests a 120-row database candidate pool with 365-day lookback", async () => {
  const calls = [];
  const dbSource = {
    async checkConnection() { return true; },
    async fetch(_subject, options) {
      calls.push({ maxResults: options.maxResults, maxAgeDays: options.maxAgeDays });
      // Return 3+ so the 730 fallback doesn't trigger
      return [
        comp(1, { distanceMeters: 200 }),
        comp(2, { distanceMeters: 300 }),
        comp(3, { distanceMeters: 400 })
      ];
    }
  };

  await runValuation({
    address: "Unit 1, 11 McIntosh Street",
    suburb: "Oakleigh",
    state: "VIC",
    propertyType: "Unit",
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1
  }, { dbSource, fetch: false });

  assert.ok(calls.length >= 1);
  assert.equal(calls[0].maxResults, 120);
  assert.equal(calls[0].maxAgeDays, 365);
});

// ── B. Engine accepts up to 24 comparables ──

test("engine accepts up to 24 comparables when 120 candidates available", () => {
  const distant = Array.from({ length: 96 }, (_, i) =>
    comp(i + 1, { distanceMeters: 50000 + i * 200, salePrice: 650000 })
  );
  const good = Array.from({ length: 30 }, (_, i) =>
    comp(i + 101, { distanceMeters: 200 + i * 30, salePrice: 700000 + i * 10000 })
  );

  const result = valueProperty({
    subject: { address: "Subject", propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: [...distant, ...good],
    asOfDate: "2026-07-15"
  });

  assert.equal(result.ok, true);
  assert.equal(result.acceptedComparables.length, 24);
  assert.ok(
    result.rejectedComparables.some(r => r.reasons.includes("candidate-rank-below-final-limit"))
  );
});

test("engine does not pad when fewer than 24 candidates available", () => {
  const few = Array.from({ length: 7 }, (_, i) =>
    comp(i + 1, { distanceMeters: 200 + i * 100, salePrice: 700000 })
  );

  const result = valueProperty({
    subject: { address: "Subject", propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: few,
    asOfDate: "2026-07-15"
  });

  assert.equal(result.ok, true);
  assert.equal(result.acceptedComparables.length, 7);
  assert.equal(result.acceptedComparables.length, few.length);
});

// ── B. 365-day insufficient fallback to 730 ──

test("runValuation widens to 730 days when 365-day results are fewer than 3", async () => {
  const calls = [];
  const dbSource = {
    async checkConnection() { return true; },
    async fetch(subject, options) {
      const call = { maxAgeDays: options.maxAgeDays, maxResults: options.maxResults };
      calls.push(call);
      if (options.maxAgeDays === 365) return [comp(1, { distanceMeters: 200 })];
      // 730 fallback
      return [comp(1, { distanceMeters: 200 }), comp(2, { distanceMeters: 500 })];
    }
  };

  await runValuation({
    address: "Unit 1, 11 McIntosh Street",
    suburb: "Oakleigh",
    state: "VIC",
    propertyType: "Unit",
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1
  }, { dbSource, fetch: false });

  assert.ok(calls.length >= 2);
  assert.equal(calls[0].maxAgeDays, 365);
  assert.equal(calls[1].maxAgeDays, 730);
});

test("runValuation does not widen when 365-day results are 3+", async () => {
  const calls = [];
  const dbSource = {
    async checkConnection() { return true; },
    async fetch(subject, options) {
      calls.push({ maxAgeDays: options.maxAgeDays });
      return [comp(1, { distanceMeters: 200 }), comp(2, { distanceMeters: 500 }), comp(3, { distanceMeters: 800 })];
    }
  };

  await runValuation({
    address: "Unit 1, 11 McIntosh Street",
    suburb: "Oakleigh",
    state: "VIC",
    propertyType: "Unit",
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1
  }, { dbSource, fetch: false });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxAgeDays, 365);
});

// ── B. Ranking produces the correct final set from 120 candidates ──

test("engine ranks 120 candidates before retaining final 24", () => {
  const far = Array.from({ length: 60 }, (_, i) =>
    comp(i + 1, { distanceMeters: 15000 + i * 200, salePrice: 500000 + i })
  );
  const near = Array.from({ length: 60 }, (_, i) =>
    comp(i + 101, { distanceMeters: 100 + i * 20, salePrice: 900000 + i })
  );

  const result = valueProperty({
    subject: { address: "Subject", propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: [...far, ...near],
    asOfDate: "2026-07-15"
  });

  assert.equal(result.ok, true);
  assert.equal(result.acceptedComparables.length, 24);
  // The nearest candidates should dominate
  const maxDist = Math.max(...result.acceptedComparables.map(r => r.distanceMeters ?? Infinity));
  assert.ok(maxDist < 1000, "all accepted comparables should be within ~1km with 24 slots");
});

// ── B. Ranking is independent of sale price ──

test("candidate ranking is independent of sale price", () => {
  const candidates = Array.from({ length: 40 }, (_, i) =>
    comp(i + 1, {
      distanceMeters: 100 + i * 100,
      salePrice: i % 2 === 0 ? 250000 : 2500000
    })
  );

  const run = rows => valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: rows,
    asOfDate: "2026-07-15"
  }).acceptedComparables.map(row => row.address);

  const reversedPrices = candidates.map(row => ({ ...row, salePrice: 2750000 - row.salePrice }));
  assert.deepEqual(run(candidates), run(reversedPrices));
});

// ── B. Ranked-out candidates do not reduce confidence ──

test("valid candidates below the final rank do not reduce confidence", () => {
  const selected = Array.from({ length: 24 }, (_, i) =>
    comp(i + 1, { distanceMeters: 100 + i * 50, salePrice: 700000 + i })
  );
  const lowerRanked = Array.from({ length: 16 }, (_, i) =>
    comp(i + 101, { distanceMeters: 12000 + i, salePrice: 700000 + i })
  );

  const run = comparables => valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables,
    asOfDate: "2026-07-15"
  });

  const baseline = run(selected);
  const broadPool = run([...selected, ...lowerRanked]);

  assert.deepEqual(
    broadPool.acceptedComparables.map(row => row.address),
    baseline.acceptedComparables.map(row => row.address)
  );
  assert.equal(broadPool.confidence.dataScore, baseline.confidence.dataScore);
  assert.match(
    broadPool.confidence.reasons.join(" "),
    /valid candidates ranked below final/
  );
});

// ── A. Duplicate dedup: same address + same date, different prices ──

test("same address + same date + conflicting prices keep only one record", () => {
  const sameAddr = "1 Example Street, Oakleigh VIC";
  const sameDate = "2026-05-01";
  const lowPrice = comp(1, { distanceMeters: 800, salePrice: 500000, saleDate: sameDate });
  lowPrice.address = sameAddr;
  const highPrice = comp(2, { distanceMeters: 600, salePrice: 700000, saleDate: sameDate });
  highPrice.address = sameAddr;
  const other = comp(3, { distanceMeters: 900, salePrice: 600000 });

  const result = valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: [lowPrice, highPrice, other],
    asOfDate: "2026-07-15"
  });

  assert.equal(result.acceptedComparables.length, 2);
  // The better record (higher weight, closer distance) should be kept
  assert.equal(result.acceptedComparables.find(r => r.address === sameAddr).distanceMeters, 600);
  assert.equal(
    result.rejectedComparables.filter(r => r.reasons.includes("duplicate-comparable-transaction")).length,
    1
  );
  assert.equal(
    result.rejectedComparables.filter(r =>
      !r.reasons.some(rs => rs.startsWith("candidate-rank-below") || rs.includes("duplicate"))
    ).length,
    0
  );
  assert.match(result.confidence.reasons[0], /0 rejected/);
});

// ── A. Duplicate dedup: different unit numbers, same date, NOT a duplicate ──

test("different unit numbers with same sale date are NOT duplicates", () => {
  const comps = [
    {
      address: "1/1 Example Street, Oakleigh VIC",
      salePrice: 500000,
      saleDate: "2026-05-01",
      propertyType: "Unit",
      bedrooms: 2, bathrooms: 1, carSpaces: 1,
      distanceMeters: 800, sourceCount: 1,
      index: 1, sourceUrl: "https://example.test/1"
    },
    {
      address: "2/1 Example Street, Oakleigh VIC",
      salePrice: 550000,
      saleDate: "2026-05-01",
      propertyType: "Unit",
      bedrooms: 2, bathrooms: 1, carSpaces: 1,
      distanceMeters: 800, sourceCount: 1,
      index: 2, sourceUrl: "https://example.test/2"
    },
    // A third unrelated comp
    {
      ...comp(3, { distanceMeters: 900 }),
      address: "5/2 Other Street, Oakleigh VIC",
    }
  ];

  const result = valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: comps,
    asOfDate: "2026-07-15"
  });

  assert.equal(result.acceptedComparables.length, 3);
  assert.equal(
    result.rejectedComparables.filter(r => r.reasons.includes("duplicate-comparable-transaction")).length,
    0,
    "different unit prefixes should not be treated as duplicates"
  );
});

// ── C. Unit type compatibility ──

test("accepted comparables are all Unit/Townhouse/Villa, no Apartment or House", () => {
  const comps = [
    // allowed types
    {
      ...comp(1, { distanceMeters: 200 }),
      address: "1/1 Test Street", propertyType: "Unit"
    },
    {
      ...comp(2, { distanceMeters: 400 }),
      address: "1/2 Test Street", propertyType: "Townhouse"
    },
    {
      ...comp(3, { distanceMeters: 600 }),
      address: "1/3 Test Street", propertyType: "Villa"
    },
    // excluded types
    {
      ...comp(4, { distanceMeters: 300 }),
      address: "4 Test Street", propertyType: "House"
    },
    {
      ...comp(5, { distanceMeters: 500 }),
      address: "5 Test Street", propertyType: "Apartment"
    },
    // another good one
    {
      ...comp(6, { distanceMeters: 800 }),
      address: "1/6 Test Street", propertyType: "Unit"
    }
  ];

  const result = valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: comps,
    asOfDate: "2026-07-15"
  });

  const accepted = result.acceptedComparables;
  for (const row of accepted) {
    assert.ok(
      ["Unit", "Townhouse", "Villa"].includes(row.propertyType),
      `unexpected propertyType: ${row.propertyType}`
    );
  }
  assert.equal(accepted.filter(r => r.propertyType === "Apartment").length, 0);
  assert.equal(accepted.filter(r => r.propertyType === "House").length, 0);
  assert.ok(
    result.rejectedComparables.some(r => r.reasons.includes("incompatible-property-type"))
  );
});

// ── Large-lot mode unchanged ──

test("large-lot mode skips duplicate dedup and accepts all candidates", () => {
  const same = Array.from({ length: 5 }, (_, i) => ({
    index: 1000 + i,
    distanceMeters: 500,
    salePrice: 800000 + i * 10000,
    saleDate: "2026-04-01",
    landSize: 2000,
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 2,
    address: `1 Large Lot Street, Oakleigh VIC`,
    propertyType: "House",
    sourceCount: 1,
    sourceUrl: `https://example.test/ll${i}`
  }));

  const result = valueProperty({
    subject: {
      propertyType: "House",
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      landSize: 2500
    },
    comparables: same,
    asOfDate: "2026-07-15",
    isAddressLevelLandSource: () => true,
    largeLotComparables: []
  });

  // large-lot mode should keep all rows
  assert.equal(result.acceptedComparables.length, 5);
  assert.equal(
    result.rejectedComparables.filter(r => r.reasons.includes("duplicate-comparable-transaction")).length,
    0,
    "large-lot mode must skip duplicate dedup"
  );
});
