import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validation = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validation)).filter((file) => file.endsWith("-banyule-planning-context-2025.json"));

test("Banyule publishes 21 council-context summaries", () => {
  assert.equal(files.length, 21);
});

test("every summary labels the council-wide 2024-25 measures and register restriction", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.geography.councilContextOnly, true);
    assert.equal(data.councilPlanningService.medianDecisionDays, 17);
    assert.equal(data.councilPlanningService.decidedWithinRequiredTimePercent, 87.64);
    assert.equal(data.councilPlanningService.periodEnd, "2025-06-30");
    assert.ok(data.publication.limitations.some((value) => value.includes("council-wide")));
    assert.ok(data.publication.limitations.some((value) => value.includes("not collected or republished")));
    assert.doesNotMatch(JSON.stringify(data), /application_number|street address|applicant_name/i);
    const slug = file.replace("-banyule-planning-context-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_BANYULE_PLANNING_CONTEXT_START/);
    assert.match(html, />17 days</);
    assert.match(html, />87.64%</);
  }
});

test("only Heidelberg carries the reviewed activity-centre signal", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.activityCentre.included, file === "heidelberg-banyule-planning-context-2025.json");
  }
});
