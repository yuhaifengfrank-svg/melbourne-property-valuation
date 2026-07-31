import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-maroondah-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes all 15 official Maroondah localities", () => {
  assert.deepEqual(writeArtifacts(), { areas: 15, medianDecisionDays: 29, decidedWithinRequiredTimePercent: 85.83 });
  assert.equal(fs.readdirSync(path.join(ROOT, "data", "validation")).filter((name) => name.endsWith("-maroondah-planning-context-2025.json")).length, 15);
});

test("publishes exact audited 2024/25 planning service measures", () => {
  const artifact = buildArtifact(["RINGWOOD", "3134"]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 29);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 85.83);
  assert.equal(artifact.councilPlanningService.periodEnd, "2025-06-30");
});

test("artifacts prohibit suburb counts and address republication", () => {
  const artifact = buildArtifact(["CROYDON", "3136"]);
  assert.match(artifact.geography.note, /not suburb-level/i);
  assert.match(artifact.publication.limitations.join(" "), /No address-level/i);
  assert.match(artifact.publication.limitations.join(" "), /cross council boundaries/i);
});

test("generated Ringwood page shows the council-wide facts", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "suburb", "ringwood-vic.html"), "utf8");
  assert.match(html, /Council median decision time/);
  assert.match(html, />29 days</);
  assert.match(html, /Decisions within required time/);
  assert.match(html, />85.83%</);
});
