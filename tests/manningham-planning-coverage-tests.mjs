import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expected = {
  bulleen: [57, 13, 32, 27.4, "full"],
  doncaster: [150, 50, 128, 89.8, "full"],
  "doncaster-east": [148, 54, 143, 118.55, "full"],
  donvale: [65, 16, 39, 21.85, "full"],
  nunawading: [0, 0, 0, 0, "part"],
  "park-orchards": [45, 5, 5, 3.7, "full"],
  "ringwood-north": [1, 0, 0, 0, "part"],
  templestowe: [69, 13, 19, 17.7, "full"],
  "templestowe-lower": [83, 26, 59, 43.6, "full"],
  warrandyte: [47, 10, 10, 7.5, "full"],
  "warrandyte-south": [17, 0, 0, 0, "full"],
  "wonga-park": [45, 6, 6, 3.8, "full"],
};

for (const [slug, values] of Object.entries(expected)) {
  test(`${slug} has a privacy-safe Manningham aggregate`, async () => {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-manningham-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.deepEqual([
      data.summary.lodgedApplicationCount,
      data.summary.quantifiedResidentialProjects,
      data.summary.statedProposedDwellings,
      data.summary.statusWeightedProposedDwellings,
      data.geography.councilCoverage,
    ], values);
    assert.equal(data.summary.uniqueProjectCount, values[0]);
    assert.equal(data.quality.sourceRows, 727);
    assert.equal(data.quality.allCouncilGeographyRowsAccountedFor, 727);
    assert.equal(data.quality.missingApplicationNumber, 0);
    assert.equal(data.quality.missingLodgedDate, 0);
    assert.equal(data.quality.duplicateExactApplicationNumbers, 0);
    assert.match(data.quality.recordLevelReuse, /aggregate only/);
    assert.doesNotMatch(JSON.stringify(data), /\b\d+\s+(?:Street|Road|Avenue|Crescent|Grove)\b/i);
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_MANNINGHAM_PLANNING_START/);
    assert.match(html, /Manningham City Council planning applications lodged in 2025/);
    assert.match(html, /Not net additions or completed homes/);
  });
}

test("the one missing public description is disclosed and cannot enter yield extraction", async () => {
  const data = JSON.parse(await readFile(
    new URL("../data/validation/templestowe-lower-manningham-planning-pipeline-2025.json", import.meta.url),
    "utf8",
  ));
  assert.equal(data.quality.missingDescription, 1);
  assert.ok(data.publication.limitations.some((v) => v.includes("no public description")));
});

test("all 727 result rows reconcile across official Manningham localities", async () => {
  let total = 0;
  for (const slug of Object.keys(expected)) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-manningham-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    total += data.summary.lodgedApplicationCount;
  }
  assert.equal(total, 727);
});

test("partial suburbs disclose the Manningham-only geography", async () => {
  for (const slug of ["nunawading", "ringwood-north"]) {
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /Manningham-council portion only/);
  }
});
