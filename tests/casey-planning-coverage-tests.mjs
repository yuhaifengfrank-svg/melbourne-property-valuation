import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validationDir = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validationDir))
  .filter((file) => file.endsWith("-casey-planning-pipeline-2025.json"))
  .sort();

test("Casey publishes all 29 official suburb-postcode aggregates", () => {
  assert.equal(files.length, 29);
});

test("all 997 Casey rows reconcile without exposing record-level addresses", async () => {
  let total = 0;
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validationDir), "utf8"));
    total += data.summary.lodgedApplicationCount;
    assert.equal(data.publication.publishable, true);
    assert.equal(data.source.licence, "CC BY 3.0");
    assert.equal(data.quality.sourceRows, 997);
    assert.equal(data.quality.allCouncilGeographyRowsAccountedFor, 997);
    assert.equal(data.quality.missingApplicationNumber, 0);
    assert.equal(data.quality.missingLodgedDate, 0);
    assert.equal(data.quality.missingDescription, 0);
    assert.equal(data.quality.duplicateExactApplicationNumbers, 0);
    assert.equal(data.summary.uniqueProjectCount, data.summary.lodgedApplicationCount);
    assert.match(data.quality.recordLevelReuse, /aggregate only/);
    assert.doesNotMatch(JSON.stringify(data), /\b\d+\s+(?:Street|Road|Avenue|Crescent|Grove|Drive|Court)\b/i);
    const slug = file.replace("-casey-planning-pipeline-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_CASEY_PLANNING_START/);
    assert.match(html, /City of Casey planning applications lodged in 2025/);
    assert.match(html, /Casey council records only/);
    assert.match(html, /Applications are not dwelling counts, commencements or completions/);
  }
  assert.equal(total, 997);
});

test("representative Casey pages contain the verified aggregate", async () => {
  for (const slug of ["berwick", "clyde-north", "cranbourne", "narre-warren"]) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-casey-planning-pipeline-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.ok(data.summary.lodgedApplicationCount > 0);
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, new RegExp(`>\\s*${data.summary.lodgedApplicationCount}\\s*<`));
  }
});
