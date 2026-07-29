#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { assertDatabaseEnvironment } from "../lib/database-environment.js";
import { normalizePlanningMetricArtifact } from "../lib/council-planning-metrics.js";
import { ensureDataLayerFoundationSchema } from "../api/_db.js";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATION_DIR = path.join(ROOT, "data", "validation");
const writeDatabase = process.argv.includes("--write-database");
const files = fs.readdirSync(VALIDATION_DIR)
  .filter((name) => name.endsWith("-casey-planning-pipeline-2025.json"))
  .sort();

if (!files.length) throw new Error("No Casey planning metric artifacts found");

const metrics = files.map((name) => normalizePlanningMetricArtifact(
  JSON.parse(fs.readFileSync(path.join(VALIDATION_DIR, name), "utf8")),
));

const totalSourceRows = new Set(metrics.map((metric) => metric.quality.sourceRows));
const accounted = metrics.reduce(
  (sum, metric) => sum + Number(metric.quality.exactGeographyRows || 0),
  0,
);
if (totalSourceRows.size !== 1 || accounted !== [...totalSourceRows][0]) {
  throw new Error("Casey aggregate reconciliation failed");
}

if (!writeDatabase) {
  console.log(JSON.stringify({
    mode: "dry-run",
    council: "City of Casey",
    records: metrics.length,
    sourceRows: [...totalSourceRows][0],
    accountedRows: accounted,
  }, null, 2));
  process.exit(0);
}

const sql = neon(assertDatabaseEnvironment());
await ensureDataLayerFoundationSchema(sql);
for (const metric of metrics) {
  await sql`
    INSERT INTO council_planning_metrics (
      council, suburb, state, postcode, period_start, period_end,
      lodged_application_count, unique_project_count,
      decision_recorded_count, active_application_count,
      source_key, source_publisher, source_url, source_licence,
      source_retrieved_at, status_reference_date, geography_scope,
      limitations, quality, updated_at
    ) VALUES (
      ${metric.council}, ${metric.suburb}, ${metric.state}, ${metric.postcode},
      ${metric.periodStart}, ${metric.periodEnd},
      ${metric.lodgedApplicationCount}, ${metric.uniqueProjectCount},
      ${metric.decisionRecordedCount}, ${metric.activeApplicationCount},
      ${metric.sourceKey}, ${metric.sourcePublisher}, ${metric.sourceUrl},
      ${metric.sourceLicence}, ${metric.sourceRetrievedAt},
      ${metric.statusReferenceDate}, ${metric.geographyScope},
      ${JSON.stringify(metric.limitations)}::jsonb,
      ${JSON.stringify(metric.quality)}::jsonb, NOW()
    )
    ON CONFLICT (
      LOWER(council), LOWER(suburb), COALESCE(postcode, ''),
      period_start, period_end, source_key
    ) DO UPDATE SET
      lodged_application_count = EXCLUDED.lodged_application_count,
      unique_project_count = EXCLUDED.unique_project_count,
      decision_recorded_count = EXCLUDED.decision_recorded_count,
      active_application_count = EXCLUDED.active_application_count,
      source_publisher = EXCLUDED.source_publisher,
      source_url = EXCLUDED.source_url,
      source_licence = EXCLUDED.source_licence,
      source_retrieved_at = EXCLUDED.source_retrieved_at,
      status_reference_date = EXCLUDED.status_reference_date,
      geography_scope = EXCLUDED.geography_scope,
      limitations = EXCLUDED.limitations,
      quality = EXCLUDED.quality,
      updated_at = NOW()
  `;
}

const verified = await sql`
  SELECT COUNT(*)::int AS count,
         COALESCE(SUM(lodged_application_count), 0)::int AS lodged
  FROM council_planning_metrics
  WHERE LOWER(council) = LOWER(${"City of Casey"})
    AND period_start = ${"2025-01-01"}
    AND period_end = ${"2025-12-31"}
`;
if (verified[0].count !== metrics.length || verified[0].lodged !== accounted) {
  throw new Error("Post-write Casey verification failed");
}
console.log(JSON.stringify({
  mode: "write-database",
  council: "City of Casey",
  records: verified[0].count,
  lodgedApplications: verified[0].lodged,
}, null, 2));
