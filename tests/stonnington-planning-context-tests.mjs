import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validation = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validation))
  .filter((file) => file.endsWith("-stonnington-planning-context-2025.json"));

test("Stonnington publishes nine council-context summaries", () => {
  assert.equal(files.length, 9);
});

test("every summary labels the council-wide 2024-25 measures", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.geography.councilContextOnly, true);
    assert.equal(data.councilPlanningService.medianDecisionDays, 57);
    assert.equal(data.councilPlanningService.decidedWithinRequiredTimePercent, 78.05);
    assert.equal(data.councilPlanningService.applicationsReceived, 1273);
    assert.equal(data.councilPlanningService.periodEnd, "2025-06-30");
    assert.ok(data.publication.limitations.some((value) => value.includes("council-wide")));
    assert.ok(data.publication.limitations.some((value) => value.includes("not dwelling")));
    assert.doesNotMatch(JSON.stringify(data), /application_number|street address|applicant/i);
    const slug = file.replace("-stonnington-planning-context-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_STONNINGTON_PLANNING_CONTEXT_START/);
    assert.match(html, />57 days</);
    assert.match(html, />78.05%</);
    assert.match(html, />1,273</);
  }
});

test("activity-centre and cross-council signals are explicit", async () => {
  for (const slug of ["armadale", "glen-iris", "malvern", "malvern-east", "prahran", "south-yarra", "toorak", "windsor"]) {
    const data = JSON.parse(await readFile(new URL(`../data/validation/${slug}-stonnington-planning-context-2025.json`, import.meta.url), "utf8"));
    assert.equal(data.activityCentre.included, true);
  }
  for (const slug of ["glen-iris", "south-yarra", "windsor"]) {
    const data = JSON.parse(await readFile(new URL(`../data/validation/${slug}-stonnington-planning-context-2025.json`, import.meta.url), "utf8"));
    assert.equal(data.geography.partialCouncil, true);
    assert.match(data.geography.note, /Stonnington context only/);
  }
});
