import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const validation = new URL("../data/validation/", import.meta.url);
const files = (await readdir(validation)).filter((file) => file.endsWith("-kingston-planning-context-2025.json"));

test("Kingston publishes 22 council-context summaries", () => {
  assert.equal(files.length, 22);
});

test("every summary labels the council-wide 2024-25 measures and omits address data", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.equal(data.geography.councilContextOnly, true);
    assert.equal(data.councilPlanningService.medianDecisionDays, 84);
    assert.equal(data.councilPlanningService.decidedWithinRequiredTimePercent, 67.04);
    assert.equal(data.councilPlanningService.periodEnd, "2025-06-30");
    assert.ok(data.publication.limitations.some((value) => value.includes("council-wide")));
    assert.ok(data.publication.limitations.some((value) => value.includes("No address-level")));
    assert.doesNotMatch(JSON.stringify(data), /application_number|street address|applicant_name/i);
    const slug = file.replace("-kingston-planning-context-2025.json", "");
    const html = await readFile(new URL(`../public/suburb/${slug}-vic.html`, import.meta.url), "utf8");
    assert.match(html, /AHV_KINGSTON_PLANNING_CONTEXT_START/);
    assert.match(html, />84 days</);
    assert.match(html, />67.04%</);
  }
});

test("only Moorabbin and Mentone carry reviewed activity-centre signals", async () => {
  for (const file of files) {
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    const expected = file === "moorabbin-kingston-planning-context-2025.json"
      ? "pilot"
      : file === "mentone-kingston-planning-context-2025.json"
        ? "stage_2"
        : null;
    assert.equal(data.activityCentre.included, expected !== null);
    if (expected) assert.equal(data.activityCentre.programGroup, expected);
  }
});

test("cross-council suburbs disclose the Kingston-only geography", async () => {
  for (const slug of ["cheltenham", "highett", "moorabbin", "oakleigh-south"]) {
    const file = `${slug}-kingston-planning-context-2025.json`;
    const data = JSON.parse(await readFile(new URL(file, validation), "utf8"));
    assert.match(data.geography.note, /Kingston City Council only/);
    assert.ok(data.publication.limitations.some((value) => value.includes("Kingston portion")));
  }
});
