import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildArtifact, writeArtifacts } from "../scripts/build-maribyrnong-planning-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publishes all nine official Maribyrnong localities", () => {
  assert.deepEqual(writeArtifacts(), {
    areas: 9,
    medianDecisionDays: 92,
    decidedWithinRequiredTimePercent: 73.66,
    applicationsReceived: 595,
    applicationsDecided: 615,
  });
  assert.equal(fs.readdirSync(path.join(ROOT, "data", "validation")).filter((name) => name.endsWith("-maribyrnong-planning-context-2024.json")).length, 9);
});

test("publishes exact audited 2023/24 statutory-planning measures", () => {
  const artifact = buildArtifact(["FOOTSCRAY", "3011"]);
  assert.equal(artifact.councilPlanningService.medianDecisionDays, 92);
  assert.equal(artifact.councilPlanningService.decidedWithinRequiredTimePercent, 73.66);
  assert.equal(artifact.councilPlanningService.applicationsReceived, 595);
  assert.equal(artifact.councilPlanningService.applicationsDecided, 615);
  assert.equal(artifact.councilPlanningService.periodEnd, "2024-06-30");
});

test("artifacts clearly prohibit suburb-level inference and address republication", () => {
  const artifact = buildArtifact(["YARRAVILLE", "3013"]);
  assert.match(artifact.geography.note, /not suburb-level/i);
  assert.match(artifact.publication.limitations.join(" "), /No address-level/i);
  assert.match(artifact.publication.limitations.join(" "), /2023\/24/i);
});

test("generated page shows the exact period and whole-council boundaries", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "suburb", "footscray-vic.html"), "utf8");
  assert.match(html, /Council median decision time/);
  assert.match(html, />92 days</);
  assert.match(html, /Decisions within required time/);
  assert.match(html, />73.66%</);
  assert.match(html, /Applications received by council/);
  assert.match(html, />595</);
  assert.match(html, /Planning decisions by council/);
  assert.match(html, />615</);
  assert.match(html, /period ending 2024-06-30/);
});
