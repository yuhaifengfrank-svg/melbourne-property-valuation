import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-darebin-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes all 13 official Darebin localities", () => {
  assert.deepEqual(writeArtifacts(), {
    areas: 13,
    medianDecisionDays: 104,
    decidedWithinRequiredTimePercent: 55.77,
  });
  const files = fs.readdirSync(path.join(ROOT, "data", "validation"))
    .filter((name) => name.endsWith("-darebin-planning-context-2025.json"));
  assert.equal(files.length, 13);
});

test("publishes exact 2024/25 statutory-planning measures", () => {
  const artifact = buildArtifact(["PRESTON", "3072", false]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 104);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 55.77);
  assert.equal(artifact.councilPlanningService.periodEnd, "2025-06-30");
  assert.equal(artifact.geography.councilContextOnly, true);
  assert.match(artifact.publication.limitations.join(" "), /not suburb-level application counts/i);
});

test("cross-council localities are explicitly partial", () => {
  const artifact = buildArtifact(["ALPHINGTON", "3078", true]);
  assert.match(artifact.geography.note, /crosses council boundaries/i);
  assert.match(artifact.publication.limitations.join(" "), /Darebin portion/i);
});

test("artifacts never republish register records or addresses", () => {
  writeArtifacts();
  const files = fs.readdirSync(path.join(ROOT, "data", "validation"))
    .filter((name) => name.endsWith("-darebin-planning-context-2025.json"));
  for (const filename of files) {
    const text = fs.readFileSync(path.join(ROOT, "data", "validation", filename), "utf8");
    assert.doesNotMatch(text, /propertyNumber|streetAddress|applicationNumber/i);
  }
});
