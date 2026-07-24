import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../data/validation/${name}`, import.meta.url)));

test("Oakleigh 2025 BPC permit totals match the verified official extract", async () => {
  const result = await readJson("oakleigh-building-permits-2025.json");
  assert.equal(result.suburbs.length, 1);
  const row = result.suburbs[0];
  assert.deepEqual(
    {
      geography: [row.suburb, row.postcode, row.municipality],
      permits: row.permitCount,
      residential: row.domesticResidentialPermitCount,
      newPermitCount: row.newDwellingPermitCount,
      demolitionPermitCount: row.demolitionPermitCount,
      newDwellings: row.newDwellings,
      demolishedDwellings: row.demolishedDwellings,
      net: row.netAdditionalDwellings,
    },
    {
      geography: ["OAKLEIGH", "3166", "MONASH, CITY OF"],
      permits: 141,
      residential: 97,
      newPermitCount: 33,
      demolitionPermitCount: 27,
      newDwellings: 43,
      demolishedDwellings: 27,
      net: 16,
    },
  );
});

test("Oakleigh 2026 YTD BPC result is labelled as a partial period", async () => {
  const result = await readJson("oakleigh-building-permits-2026-ytd.json");
  assert.equal(result.filters.periodEnd, "2026-05-31");
  assert.deepEqual(
    Object.fromEntries(["permitCount", "newDwellings", "demolishedDwellings", "netAdditionalDwellings"].map((key) => [key, result.suburbs[0][key]])),
    { permitCount: 52, newDwellings: 13, demolishedDwellings: 4, netAdditionalDwellings: 9 },
  );
});

test("Oakleigh planning summary preserves record, project and dwelling distinctions", async () => {
  const result = await readJson("oakleigh-planning-pipeline-2025.json");
  assert.equal(result.filters.suburb, "OAKLEIGH");
  assert.equal(result.filters.postcode, "3166");
  assert.deepEqual(result.summary, {
    rawApplicationCount: 82,
    uniqueProjectCount: 81,
    amendmentCount: 10,
    quantifiedResidentialProjects: 15,
    grossProposedDwellings: 36,
    netProposedDwellings: 34,
    weightedNetPipeline: 26,
    unresolvedResidentialProjects: 2,
  });
  assert.equal(result.quality.recordLevelReuse, "Internal validation only until council reuse terms are confirmed");
});

test("Oakleigh publishable object labels the approved vacancy estimate and blocks legacy values", async () => {
  const result = await readJson("oakleigh-validated-metrics.json");
  assert.equal(result.geography.suburb, "OAKLEIGH");
  assert.equal(result.facts.medianHousePrice.value, 1311000);
  assert.equal(result.facts.housePriceGrowth.values.tenYearCagr.value, 5.04);
  assert.equal(result.modelInputs.rentalVacancy.value, 1.55);
  assert.equal(result.modelInputs.rentalVacancy.publishable, true);
  assert.match(result.modelInputs.rentalVacancy.note, /model estimate, not an observed suburb vacancy rate/i);
  assert.equal(result.facts.planningPipeline2025.publishable, true);
  assert.match(result.facts.planningPipeline2025.note, /not commencements or completions/i);
  assert.ok(result.blockedLegacyMetrics.some((item) => item.includes("14.72%")));
});

test("statewide permit output does not merge conflicting reported councils", async () => {
  const result = await readJson("victoria-building-permits-2025.json");
  const rows = result.suburbs.filter((row) => row.suburb === "OAKLEIGH" && row.postcode === "3166");
  assert.equal(rows.length, 2);
  const monash = rows.find((row) => row.municipality === "MONASH, CITY OF");
  const mismatch = rows.find((row) => row.municipality === "MOONEE VALLEY, CITY OF");
  assert.equal(monash.permitCount, 141);
  assert.equal(monash.netAdditionalDwellings, 16);
  assert.equal(mismatch.permitCount, 1);
  assert.ok(result.quality.municipalityConflicts.some((row) => row.suburb === "OAKLEIGH" && row.postcode === "3166"));
});
