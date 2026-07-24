import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validation = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validation))
  .filter((file) => file.endsWith("-bayside-planning-context-2025.json"));

test("Bayside publishes nine council-context summaries", () => {
  assert.equal(files.length, 9);
});

test("every summary labels the council-wide 2024-25 measure", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.geography.councilContextOnly, true);
    assert.equal(data.councilPlanningService.decidedWithinRequiredTimePercent, 77.49);
    assert.equal(data.councilPlanningService.targetPercent, 75);
    assert.equal(data.councilPlanningService.periodEnd, "2025-06-30");
    assert.ok(data.publication.limitations.some((value) => value.includes("council-wide")));
    assert.ok(data.publication.limitations.some((value) => value.includes("No suburb-level count")));
    assert.doesNotMatch(JSON.stringify(data), /application_number|street address|applicant/i);
    const slug = file.replace("-bayside-planning-context-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_BAYSIDE_PLANNING_CONTEXT_START/);
    assert.match(html, /Council-wide planning service facts/);
    assert.match(html, />77.49%</);
    assert.match(html, />75%</);
  }
});

test("activity-centre signal is limited to reviewed Bayside suburbs", async () => {
  for (const slug of ["brighton", "hampton", "sandringham"]) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-bayside-planning-context-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.activityCentre.included, true);
  }
  const beaumaris = JSON.parse(await readFile(
    new URL("../data/validation/beaumaris-bayside-planning-context-2025.json", import.meta.url),
    "utf8",
  ));
  assert.equal(beaumaris.activityCentre.included, false);
});

test("cross-council suburbs disclose the Bayside-only context", async () => {
  for (const slug of ["cheltenham", "highett"]) {
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${slug}-bayside-planning-context-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.geography.partialCouncil, true);
    assert.match(data.geography.note, /Bayside City Council context only/);
  }
});
