import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-yarra-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes all 12 official Yarra localities", () => {
  assert.deepEqual(writeArtifacts(), {
    areas: 12,
    medianDecisionDays: 119,
    decidedWithinRequiredTimePercent: 46.63,
  });
  const files = fs.readdirSync(path.join(ROOT, "data", "validation"))
    .filter((name) => name.endsWith("-yarra-planning-context-2025.json"));
  assert.equal(files.length, 12);
});

test("publishes exact 2024/25 statutory-planning measures", () => {
  const artifact = buildArtifact(["RICHMOND", "3121", false]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 119);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 46.63);
  assert.equal(artifact.councilPlanningService.periodEnd, "2025-06-30");
  assert.equal(artifact.geography.councilContextOnly, true);
  assert.match(artifact.publication.limitations.join(" "), /not suburb-level application counts/i);
});

test("cross-council localities are explicitly partial", () => {
  const artifact = buildArtifact(["ALPHINGTON", "3078", true]);
  assert.match(artifact.geography.note, /crosses council boundaries/i);
  assert.match(artifact.publication.limitations.join(" "), /Yarra portion/i);
});

test("artifacts never republish register addresses", () => {
  writeArtifacts();
  const files = fs.readdirSync(path.join(ROOT, "data", "validation"))
    .filter((name) => name.endsWith("-yarra-planning-context-2025.json"));
  for (const filename of files) {
    const text = fs.readFileSync(path.join(ROOT, "data", "validation", filename), "utf8");
    assert.doesNotMatch(text, /propertyNumber|streetAddress|applicationNumber/i);
  }
});
