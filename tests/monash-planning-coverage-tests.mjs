import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expected = {
  "ashwood": [37, 36, 17, 41, 34.0],
  "burwood": [13, 13, 3, 5, 3.0],
  "chadstone": [49, 49, 19, 43, 43.0],
  "clayton": [131, 129, 19, 64, 53.55],
  "glen-waverley": [206, 205, 55, 90, 80.0],
  "hughesdale": [37, 37, 14, 15, 12.0],
  "huntingdale": [21, 21, 4, 9, 7.4],
  "mulgrave": [105, 104, 34, 92, 84.4],
  "notting-hill": [20, 20, 7, 16, 16.0],
  "oakleigh-east": [34, 33, 10, 32, 32.0],
  "oakleigh-south": [31, 31, 8, 22, 22.0],
  "wheelers-hill": [74, 74, 20, 79, 79.0],
};

for (const [slug, values] of Object.entries(expected)) {
  test(`${slug} planning summary passes publication and page gates`, async () => {
    const data = JSON.parse(await readFile(new URL(`../data/validation/${slug}-planning-pipeline-2025.json`, import.meta.url), "utf8"));
    assert.equal(data.publication.publishable, true);
    assert.deepEqual([
      data.summary.rawApplicationCount,
      data.summary.uniqueProjectCount,
      data.summary.quantifiedResidentialProjects,
      data.summary.netProposedDwellings,
      data.summary.weightedNetPipeline,
    ], values);
    assert.equal(data.quality.missingApplicationNumber, 0);
    assert.equal(data.quality.missingLodgedDate, 0);
    assert.equal(data.quality.missingDescription, 0);
    assert.equal(data.quality.wrongGeography, 0);
    assert.equal(data.quality.duplicateExactApplicationNumbers, 0);
    assert.ok(data.quality.decemberScheduleApplicationCrossCheckCount >= 1);
    assert.match(data.quality.decemberScheduleCrossCheckScope, /Application-number existence only/);

    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_PLANNING_PIPELINE_START/);
    assert.match(html, /Planning pipeline/);
    assert.match(html, new RegExp(`>\\s*${values[0]}\\s*<`));
    assert.match(html, new RegExp(`>\\s*${values[1]}\\s*<`));
    assert.match(html, /not building permits, commencements or completions/i);
    assert.match(html, /model indicator, not a physical dwelling count/i);
    assert.doesNotMatch(html, /AHV_PLANNING_PIPELINE_START[\s\S]*?\b(?:Street|Road|Avenue|Crescent)\b[\s\S]*?AHV_PLANNING_PIPELINE_END/i);
  });
}

test("cross-council suburbs clearly limit the geography to the Monash portion", async () => {
  for (const slug of ["burwood", "chadstone", "oakleigh-south"]) {
    const data = JSON.parse(await readFile(new URL(`../data/validation/${slug}-planning-pipeline-2025.json`, import.meta.url), "utf8"));
    assert.equal(data.geography.councilCoverage, "part");
    assert.ok(data.publication.limitations.some((value) => value.includes("crosses council boundaries")));
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /Monash-council portion only/);
  }
});
