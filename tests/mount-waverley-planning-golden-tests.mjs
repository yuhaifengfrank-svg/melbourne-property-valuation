import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../data/validation/${name}`, import.meta.url), "utf8"));

test("Mount Waverley planning summary preserves official record and model distinctions", async () => {
  const result = await readJson("mount-waverley-planning-pipeline-2025.json");
  assert.deepEqual(result.filters, {
    lodgedStart: "01/01/2025", lodgedEnd: "31/12/2025", suburb: "MOUNT WAVERLEY", postcode: "3149",
  });
  assert.deepEqual(result.summary, {
    rawApplicationCount: 227,
    uniqueProjectCount: 225,
    amendmentCount: 23,
    quantifiedResidentialProjects: 77,
    grossProposedDwellings: 176,
    netProposedDwellings: 176,
    weightedNetPipeline: 161.7,
    unresolvedResidentialProjects: 8,
  });
});

test("Mount Waverley planning quality gate has exact geography and independent cross-checks", async () => {
  const result = await readJson("mount-waverley-planning-pipeline-2025.json");
  assert.equal(result.quality.exactGeographyRows, 227);
  assert.equal(result.quality.wrongGeography, 0);
  assert.equal(result.quality.duplicateExactApplicationNumbers, 0);
  assert.equal(result.quality.monthlyScheduleCrossCheckCount, 5);
  assert.equal(result.quality.monthlyScheduleCrossCheckMismatchCount, 0);
  assert.equal(result.publication.publishable, true);
  assert.ok(result.publication.limitations.some((value) => value.includes("not a count of commenced or completed homes")));
});
