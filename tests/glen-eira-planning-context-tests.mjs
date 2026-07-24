import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validation = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validation))
  .filter((file) => file.endsWith("-glen-eira-planning-context-2025.json"));

test("Glen Eira publishes 17 council-context summaries", () => {
  assert.equal(files.length, 17);
});

test("every summary labels council metrics and blocks restricted register reuse", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.geography.councilContextOnly, true);
    assert.equal(data.councilPlanningService.medianDecisionDays, 70);
    assert.equal(data.councilPlanningService.decidedWithinRequiredTimePercent, 80);
    assert.equal(data.councilPlanningService.periodEnd, "2025-06-30");
    assert.ok(data.publication.limitations.some((value) => value.includes("council-wide")));
    assert.ok(data.publication.limitations.some((value) => value.includes("not collected or republished")));
    assert.doesNotMatch(JSON.stringify(data), /application_number|street address|applicant/i);
    const slug = file.replace("-glen-eira-planning-context-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_GLEN_EIRA_PLANNING_CONTEXT_START/);
    assert.match(html, /Council-wide planning service facts/);
    assert.match(html, />70 days</);
    assert.match(html, />80%</);
  }
});

test("activity-centre signals appear only on reviewed suburbs", async () => {
  for (const slug of ["carnegie", "murrumbeena", "caulfield", "glen-huntly", "ormond", "bentleigh", "elsternwick", "moorabin"]) {
    const corrected = slug === "moorabin" ? "moorabbin" : slug;
    const data = JSON.parse(await readFile(
      new URL(`../data/validation/${corrected}-glen-eira-planning-context-2025.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(data.activityCentre.included, true);
  }
  const mckinnon = JSON.parse(await readFile(
    new URL("../data/validation/mckinnon-glen-eira-planning-context-2025.json", import.meta.url),
    "utf8",
  ));
  assert.equal(mckinnon.activityCentre.included, false);
});
