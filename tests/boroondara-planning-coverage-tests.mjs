import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expected = {
  "ashburton": [45, 45, 7, 18, true],
  "balwyn": [49, 49, 11, 26, true],
  "balwyn-north": [94, 94, 10, 22, true],
  "camberwell": [187, 187, 17, 40, true],
  "canterbury": [77, 77, 4, 24, true],
  "deepdene": [13, 13, 3, 4, true],
  "glen-iris": [67, 67, 5, 12, true],
  "hawthorn": [183, 183, 8, 41, true],
  "hawthorn-east": [69, 69, 3, 45, true],
  "kew": [155, 155, 11, 25, true],
  "kew-east": [48, 48, 4, 9, true],
  "surrey-hills": [65, 65, 2, 3, true],
};

for (const [slug, values] of Object.entries(expected)) {
  test(`${slug} has a privacy-safe, publication-gated Boroondara summary`, async () => {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.publication.publishable, true);
    assert.deepEqual([
      data.summary.registeredApplicationCount,
      data.summary.uniqueProjectCount,
      data.summary.quantifiedResidentialProjects,
      data.summary.statedProposedDwellings,
      data.publication.pagePublished,
    ], values);
    assert.equal(data.summary.statusWeightedPipeline, null);
    assert.equal(data.quality.missingApplicationNumber, 0);
    assert.equal(data.quality.missingRegisteredDate, 0);
    assert.equal(data.quality.missingDescription, 0);
    assert.equal(data.quality.wrongGeography, 0);
    assert.equal(data.quality.duplicateCanonicalApplicationNumbers, 0);
    assert.equal(data.quality.allCouncilCanonicalRowsAccountedFor, 1052);
    assert.match(data.quality.recordLevelReuse, /aggregate only/);
    assert.ok(data.publication.limitations.some((value) => value.includes("no status-weighted value")));
    assert.ok(data.publication.limitations.some((value) => value.includes("gross proposals")));
    assert.doesNotMatch(JSON.stringify(data), /\b\d+\s+(?:Street|Road|Avenue|Crescent|Grove)\b/i);

    if (!values[4]) return;
    const html = await readFile(
      new URL(`../public/suburb/${slug}-vic.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /AHV_PLANNING_PIPELINE_START/);
    assert.match(html, /City of Boroondara planning applications registered in 2025/);
    assert.match(html, new RegExp(`>\\s*${values[0]}\\s*<`));
    assert.match(html, /Duplicate report rows removed/);
    assert.match(html, /Not net additions or completed homes/);
    assert.match(html, /Current status is not shown/);
    assert.doesNotMatch(html, /Status-weighted pipeline/);
  });
}

test("partial-council suburbs state the limited geography", async () => {
  for (const slug of ["glen-iris", "surrey-hills"]) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.geography.councilCoverage, "part");
    assert.ok(data.publication.limitations.some((value) => value.includes("crosses council boundaries")));
    if (!data.publication.pagePublished) continue;
    const html = await readFile(
      new URL(`../public/suburb/${slug}-vic.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /Boroondara-council portion only/);
  }
});

test("all official canonical rows reconcile across the 12 localities", async () => {
  let total = 0;
  for (const slug of Object.keys(expected)) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    total += data.summary.registeredApplicationCount;
  }
  assert.equal(total, 1052);
});
