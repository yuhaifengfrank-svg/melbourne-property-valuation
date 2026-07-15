import test from "node:test";
import assert from "node:assert/strict";

import { valueProperty } from "../lib/valuation-engine.js";
import { runValuation } from "../lib/valuation-service.js";

function comp(index, { distanceMeters, salePrice = 700000 } = {}) {
  return {
    address: `${index} Example Street, Oakleigh VIC`,
    salePrice,
    saleDate: "2026-06-01",
    propertyType: "Unit",
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1,
    distanceMeters,
    sourceCount: 1,
    sourceUrl: `https://example.test/${index}`
  };
}

test("runValuation requests a 60-row database candidate pool", async () => {
  let requestedMaxResults = null;
  const dbSource = {
    async checkConnection() { return true; },
    async fetch(_subject, options) {
      requestedMaxResults = options.maxResults;
      return [comp(1, { distanceMeters: 200 })];
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

  assert.equal(requestedMaxResults, 60);
});

test("engine ranks the candidate pool before retaining the final 12", () => {
  const farRecent = Array.from({ length: 12 }, (_, index) =>
    comp(index + 1, { distanceMeters: 12000 + index, salePrice: 500000 + index })
  );
  const nearby = Array.from({ length: 8 }, (_, index) =>
    comp(index + 101, { distanceMeters: 100 + index * 50, salePrice: 900000 + index })
  );

  const result = valueProperty({
    subject: {
      address: "Unit 1, 11 McIntosh Street",
      propertyType: "Unit",
      bedrooms: 2,
      bathrooms: 1,
      carSpaces: 1
    },
    comparables: [...farRecent, ...nearby],
    asOfDate: "2026-07-15"
  });

  assert.equal(result.ok, true);
  assert.equal(result.acceptedComparables.length, 12);
  assert.equal(
    result.acceptedComparables.filter(row => row.distanceMeters < 1000).length,
    8,
    "all higher-quality nearby candidates should survive the final cut"
  );
  assert.equal(
    result.rejectedComparables.filter(row => row.reasons.includes("candidate-rank-below-top-12")).length,
    8
  );
});

test("candidate ranking is independent of sale price", () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    comp(index + 1, {
      distanceMeters: 100 + index * 100,
      salePrice: index % 2 === 0 ? 250000 : 2500000
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

test("valid candidates below the final rank do not reduce confidence", () => {
  const selected = Array.from({ length: 12 }, (_, index) =>
    comp(index + 1, { distanceMeters: 100 + index * 50, salePrice: 700000 + index })
  );
  const lowerRanked = Array.from({ length: 8 }, (_, index) =>
    comp(index + 101, { distanceMeters: 12000 + index, salePrice: 700000 + index })
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
    /8 valid candidates ranked below final selection/
  );
});

test("duplicate representations of one transaction are counted once", () => {
  const first = comp(1, { distanceMeters: 1800, salePrice: 868000 });
  const better = {
    ...comp(2, { distanceMeters: 700, salePrice: 868000 }),
    address: first.address,
    saleDate: first.saleDate
  };
  const other = comp(3, { distanceMeters: 900, salePrice: 810000 });

  const result = valueProperty({
    subject: { propertyType: "Unit", bedrooms: 2, bathrooms: 1, carSpaces: 1 },
    comparables: [first, better, other],
    asOfDate: "2026-07-15"
  });

  assert.equal(result.acceptedComparables.length, 2);
  assert.equal(result.acceptedComparables.filter(row => row.address === first.address).length, 1);
  assert.equal(result.acceptedComparables.find(row => row.address === first.address).distanceMeters, 700);
  assert.equal(
    result.rejectedComparables.filter(row => row.reasons.includes("duplicate-comparable-transaction")).length,
    1
  );
  assert.match(result.confidence.reasons.join(" "), /1 duplicate transactions removed/);
  assert.match(result.confidence.reasons[0], /0 rejected/);
});
