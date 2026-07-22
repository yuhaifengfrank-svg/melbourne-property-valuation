#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResearchTask, TARGET_DATA_CUTOFF } from "../lib/suburb-market-data-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(root, "_orch/data/artifacts/suburb_metrics.json");

function readRows() {
  const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.records || parsed.rows || parsed.data || [];
}

export function auditCoverage(rows) {
  const tasks = [];
  const suburbs = new Set(rows.map((row) => String(row.suburb || row.suburb_name || "").trim()).filter(Boolean));
  for (const suburb of suburbs) {
    for (const bedrooms of [3, 4]) {
      tasks.push(createResearchTask({ suburb, metric: `house_rent_${bedrooms}br`, propertyType: "house", bedrooms }));
    }
    tasks.push(createResearchTask({ suburb, metric: "rental_vacancy" }));
  }
  return {
    targetAsOf: TARGET_DATA_CUTOFF,
    sourceArtifact: path.relative(root, artifactPath),
    suburbCount: suburbs.size,
    requiredMetricCount: tasks.length,
    directCurrentRentFacts: 0,
    directCurrentVacancyFacts: 0,
    reason: "Legacy median_house_rent and vacancy_rate fields do not satisfy the new metric definitions.",
    tasks,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = auditCoverage(readRows());
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Target cutoff: ${report.targetAsOf}`);
    console.log(`Suburbs found: ${report.suburbCount}`);
    console.log(`Free-source research tasks required: ${report.requiredMetricCount}`);
    console.log(report.reason);
  }
}
