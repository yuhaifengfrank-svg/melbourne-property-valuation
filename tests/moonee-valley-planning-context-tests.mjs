import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-moonee-valley-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes all 14 official Moonee Valley localities", () => {
  assert.deepEqual(writeArtifacts(), { areas: 14, medianDecisionDays: 79, decidedWithinRequiredTimePercent: 84.48, applicationsDecided: 786 });
  assert.equal(fs.readdirSync(path.join(ROOT, "data", "validation")).filter((name) => name.endsWith("-moonee-valley-planning-context-2025.json")).length, 14);
});

test("publishes exact 2024/25 statutory-planning measures", () => {
  const artifact = buildArtifact(["MOONEE PONDS", "3039", false]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 79);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 84.48);
  assert.equal(artifact.councilPlanningService.applicationsDecided, 786);
  assert.equal(artifact.geography.councilContextOnly, true);
});

test("cross-council locality is explicitly partial", () => {
  const artifact = buildArtifact(["FLEMINGTON", "3031", true]);
  assert.match(artifact.geography.note, /crosses council boundaries/i);
  assert.match(artifact.publication.limitations.join(" "), /Moonee Valley portion/i);
});

test("artifacts never republish register records or addresses", () => {
  writeArtifacts();
  for (const filename of fs.readdirSync(path.join(ROOT, "data", "validation")).filter((name) => name.endsWith("-moonee-valley-planning-context-2025.json"))) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "data", "validation", filename), "utf8"), /propertyNumber|streetAddress|applicationNumber/i);
  }
});
