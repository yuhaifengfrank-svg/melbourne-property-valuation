import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-port-phillip-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes 13 Port Phillip council-context artifacts", () => {
  const result = writeArtifacts();
  assert.deepEqual(result, { areas: 13, processedApplications: 266, processedWithinRequiredTime: 233 });
  const files = fs.readdirSync(path.join(ROOT, "data", "validation"))
    .filter((name) => name.endsWith("-port-phillip-planning-context-2025.json"));
  assert.equal(files.length, 13);
});

test("uses exact council-wide Q1 facts and labels their geography", () => {
  const artifact = buildArtifact(["ELWOOD", "3184", false]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 44);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 87.59);
  assert.equal(artifact.councilPlanningService.processedApplicationDecisions, 266);
  assert.equal(artifact.councilPlanningService.processedWithinRequiredTime, 233);
  assert.equal(artifact.geography.councilContextOnly, true);
  assert.match(artifact.publication.limitations.join(" "), /not suburb-level application counts/i);
});

test("cross-council suburbs are explicitly partial", () => {
  const artifact = buildArtifact(["SOUTHBANK", "3006", true]);
  assert.match(artifact.geography.note, /crosses council boundaries/i);
  assert.match(artifact.publication.limitations.join(" "), /Port Phillip portion/i);
});
