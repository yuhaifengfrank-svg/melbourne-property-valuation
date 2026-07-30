#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { ensureCouncilDevelopmentMetricsSchema } from "../api/_db.js";
import { normalizeDevelopmentMetricArtifact } from "../lib/council-development-metrics.js";
import { assertDatabaseEnvironment } from "../lib/database-environment.js";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"), quiet: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATION_DIR = path.join(ROOT, "data", "validation");
const COUNCIL = "Merri-bek City Council";
const writeDatabase = process.argv.includes("--write-database");
const files = fs.readdirSync(VALIDATION_DIR)
  .filter((name) => name.endsWith("-merri-bek-development-activity.json"))
  .sort();

if (!files.length) throw new Error("No Merri-bek development metric artifacts found");

const metrics = files.map((name) => normalizeDevelopmentMetricArtifact(
  JSON.parse(fs.readFileSync(path.join(VALIDATION_DIR, name), "utf8")),
));
if (metrics.some((metric) => metric.council !== COUNCIL)) {
  throw new Error("Unexpected council in Merri-bek development artifacts");
}
const sourceRows = new Set(metrics.map((metric) => metric.quality.sourceRows));
const accountedRows = metrics.reduce(
  (sum, metric) => sum + Number(metric.quality.exactGeographyRows || 0),
  0,
);
if (sourceRows.size !== 1 || accountedRows !== [...sourceRows][0]) {
  throw new Error("Merri-bek RDM aggregate reconciliation failed");
}

if (!writeDatabase) {
  console.log(JSON.stringify({
    mode: "dry-run",
    council: COUNCIL,
    records: metrics.length,
    sourceRows: [...sourceRows][0],
    accountedRows,
  }, null, 2));
  process.exit(0);
}

const sql = neon(assertDatabaseEnvironment());
await ensureCouncilDevelopmentMetricsSchema(sql);
for (const metric of metrics) {
  await sql`
    INSERT INTO council_development_metrics (
      council, suburb, state, postcode, snapshot_at,
      total_project_count, applied_project_count, approved_project_count,
      under_construction_project_count, completed_project_count,
      active_project_count, active_residential_project_count,
      active_residential_dwelling_count, planning_reference_count,
      source_key, source_publisher, source_url, source_licence,
      geography_scope, limitations, quality, updated_at
    ) VALUES (
      ${metric.council}, ${metric.suburb}, ${metric.state}, ${metric.postcode},
      ${metric.snapshotAt}, ${metric.totalProjectCount},
      ${metric.appliedProjectCount}, ${metric.approvedProjectCount},
      ${metric.underConstructionProjectCount}, ${metric.completedProjectCount},
      ${metric.activeProjectCount}, ${metric.activeResidentialProjectCount},
      ${metric.activeResidentialDwellingCount}, ${metric.planningReferenceCount},
      ${metric.sourceKey}, ${metric.sourcePublisher}, ${metric.sourceUrl},
      ${metric.sourceLicence}, ${metric.geographyScope},
      ${JSON.stringify(metric.limitations)}::jsonb,
      ${JSON.stringify(metric.quality)}::jsonb, NOW()
    )
    ON CONFLICT (
      LOWER(council), LOWER(suburb), COALESCE(postcode, ''),
      snapshot_at, source_key
    ) DO UPDATE SET
      total_project_count = EXCLUDED.total_project_count,
      applied_project_count = EXCLUDED.applied_project_count,
      approved_project_count = EXCLUDED.approved_project_count,
      under_construction_project_count = EXCLUDED.under_construction_project_count,
      completed_project_count = EXCLUDED.completed_project_count,
      active_project_count = EXCLUDED.active_project_count,
      active_residential_project_count = EXCLUDED.active_residential_project_count,
      active_residential_dwelling_count = EXCLUDED.active_residential_dwelling_count,
      planning_reference_count = EXCLUDED.planning_reference_count,
      source_publisher = EXCLUDED.source_publisher,
      source_url = EXCLUDED.source_url,
      source_licence = EXCLUDED.source_licence,
      geography_scope = EXCLUDED.geography_scope,
      limitations = EXCLUDED.limitations,
      quality = EXCLUDED.quality,
      updated_at = NOW()
  `;
}

const verified = await sql`
  SELECT COUNT(*)::int AS count,
         COALESCE(SUM((quality->>'exactGeographyRows')::int), 0)::int AS accounted
  FROM council_development_metrics
  WHERE LOWER(council) = LOWER(${COUNCIL})
    AND snapshot_at = ${metrics[0].snapshotAt}
`;
if (verified[0].count !== metrics.length || verified[0].accounted !== accountedRows) {
  throw new Error("Post-write Merri-bek RDM verification failed");
}
console.log(JSON.stringify({
  mode: "write-database",
  council: COUNCIL,
  records: verified[0].count,
  accountedRows: verified[0].accounted,
}, null, 2));
