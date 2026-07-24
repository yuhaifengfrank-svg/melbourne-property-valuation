import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expected = {
  "balwyn-north": [4, 4, 1, 3, 1.05, "part"],
  "blackburn": [164, 162, 12, 29, 26.55, "full"],
  "blackburn-north": [60, 59, 5, 13, 11, "full"],
  "blackburn-south": [73, 72, 5, 10, 7.3, "full"],
  "box-hill": [89, 83, 5, 15, 11.1, "full"],
  "box-hill-north": [111, 108, 10, 30, 12.5, "full"],
  "box-hill-south": [73, 72, 10, 21, 13.1, "full"],
  "burwood": [88, 84, 5, 10, 8.2, "part"],
  "burwood-east": [56, 56, 6, 12, 9, "full"],
  "forest-hill": [69, 69, 6, 13, 13, "full"],
  "mitcham": [135, 131, 11, 33, 15.95, "full"],
  "mont-albert": [37, 37, 4, 10, 9, "part"],
  "mont-albert-north": [51, 50, 4, 12, 6.6, "full"],
  "nunawading": [88, 87, 3, 8, 6.05, "part"],
  "surrey-hills": [28, 26, 2, 8, 4.1, "part"],
  "vermont": [42, 41, 5, 52, 7, "part"],
  "vermont-south": [45, 44, 3, 52, 21.45, "full"],
};

for (const [slug, values] of Object.entries(expected)) {
  test(`${slug} has a privacy-safe, publication-gated Whitehorse summary`, async () => {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-whitehorse-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.publication.publishable, true);
    assert.deepEqual([
      data.summary.lodgedApplicationCount,
      data.summary.uniqueProjectCount,
      data.summary.quantifiedResidentialProjects,
      data.summary.statedProposedDwellings,
      data.summary.statusWeightedProposedDwellings,
      data.geography.councilCoverage,
    ], values);
    assert.equal(data.quality.sourceRows, 1220);
    assert.equal(data.quality.excludedDummyRows, 6);
    assert.equal(data.quality.excludedMissingLocationRows, 1);
    assert.equal(data.quality.missingApplicationNumber, 0);
    assert.equal(data.quality.missingLodgedDate, 0);
    assert.equal(data.quality.missingDescription, 0);
    assert.equal(data.quality.wrongGeography, 0);
    assert.equal(data.quality.duplicateExactApplicationNumbers, 0);
    assert.equal(data.quality.allCouncilGeographyRowsAccountedFor, 1213);
    assert.match(data.quality.recordLevelReuse, /aggregate only/);
    assert.ok(data.publication.limitations.some((value) => value.includes("gross proposals")));
    assert.ok(data.publication.limitations.some((value) => value.includes("model indicator")));
    assert.doesNotMatch(JSON.stringify(data), /\b\d+\s+(?:Street|Road|Avenue|Crescent|Grove)\b/i);

    const html = await readFile(
      new URL(`../public/suburb/${slug}-vic.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /AHV_WHITEHORSE_PLANNING_START/);
    assert.match(html, /Whitehorse City Council planning applications lodged in 2025/);
    assert.match(html, new RegExp(`>\\s*${values[0]}\\s*<`));
    assert.match(html, /Not net additions or completed homes/);
    assert.match(html, /Model indicator, not a physical dwelling count/);
  });
}

test("partial-council suburbs state the limited geography", async () => {
  for (const slug of ["balwyn-north", "burwood", "mont-albert", "nunawading", "surrey-hills", "vermont"]) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-whitehorse-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.geography.councilCoverage, "part");
    assert.ok(data.publication.limitations.some((value) => value.includes("crosses council boundaries")));
    const html = await readFile(
      new URL(`../public/suburb/${slug}-vic.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /Whitehorse-council portion only/);
  }
});

test("all official geography rows reconcile across the 17 localities", async () => {
  let total = 0;
  for (const slug of Object.keys(expected)) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-whitehorse-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    total += data.summary.lodgedApplicationCount;
  }
  assert.equal(total, 1213);
  assert.equal(total + 6 + 1, 1220);
});

test("overlapping suburb pages preserve previously published council sections", async () => {
  const balwynNorth = await readFile(
    new URL("../public/suburb/balwyn-north-vic.html", import.meta.url),
    "utf8",
  );
  const burwood = await readFile(
    new URL("../public/suburb/burwood-vic.html", import.meta.url),
    "utf8",
  );
  const surreyHills = await readFile(
    new URL("../public/suburb/surrey-hills-vic.html", import.meta.url),
    "utf8",
  );
  assert.match(balwynNorth, /AHV_PLANNING_PIPELINE_START/);
  assert.match(balwynNorth, /City of Boroondara planning applications registered in 2025/);
  assert.match(burwood, /City of Monash planning applications lodged in 2025/);
  assert.match(surreyHills, /AHV_PLANNING_PIPELINE_START/);
  assert.match(surreyHills, /City of Boroondara planning applications registered in 2025/);
});
