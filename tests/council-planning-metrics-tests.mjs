import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  fetchPublicPlanningMetrics,
  normalizePlanningMetricArtifact,
  toPublicPlanningMetric,
} from "../lib/council-planning-metrics.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../data/validation/cranbourne-casey-planning-pipeline-2025.json", import.meta.url),
  "utf8",
));

test("normalizes a verified Casey aggregate without record-level data", () => {
  const metric = normalizePlanningMetricArtifact(fixture);
  assert.equal(metric.council, "City of Casey");
  assert.equal(metric.suburb, "cranbourne");
  assert.equal(metric.lodgedApplicationCount, 70);
  assert.equal(metric.uniqueProjectCount, 70);
  assert.equal(metric.sourceKey, "casey_planning_register");
  assert.equal("address" in metric, false);
});

test("rejects an unreconciled council export", () => {
  const invalid = structuredClone(fixture);
  invalid.quality.allCouncilGeographyRowsAccountedFor -= 1;
  assert.throws(
    () => normalizePlanningMetricArtifact(invalid),
    /reconciliation failed/,
  );
});

test("rejects impossible counts", () => {
  const invalid = structuredClone(fixture);
  invalid.summary.activeApplicationCount = 71;
  assert.throws(
    () => normalizePlanningMetricArtifact(invalid),
    /counts are inconsistent/,
  );
});

test("public response preserves limitations and avoids forecast semantics", () => {
  const publicMetric = toPublicPlanningMetric({
    council: "City of Casey",
    suburb: "cranbourne",
    state: "VIC",
    postcode: "3977",
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    lodged_application_count: 70,
    unique_project_count: 70,
    decision_recorded_count: 63,
    active_application_count: 7,
    source_key: "casey_planning_register",
    source_publisher: "City of Casey",
    source_url: "https://example.invalid",
    source_licence: "CC BY 3.0",
    source_retrieved_at: "2026-07-24T09:05:11.227Z",
    status_reference_date: "2026-07-24",
    geography_scope: "council_records_only",
    limitations: ["Applications are not dwelling counts"],
  });
  assert.equal(publicMetric.definitions.applicationsAreDwellingCounts, false);
  assert.equal(publicMetric.definitions.decisionsAreCompletions, false);
  assert.deepEqual(publicMetric.limitations, ["Applications are not dwelling counts"]);
});

test("public database query is suburb-scoped and returns normalized rows", async () => {
  let queryText = "";
  const sql = (strings, ...values) => {
    queryText = strings.join("?").toLowerCase();
    assert.deepEqual(values, ["Cranbourne"]);
    return Promise.resolve([{
      council: "City of Casey",
      suburb: "cranbourne",
      state: "VIC",
      postcode: "3977",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      lodged_application_count: 70,
      unique_project_count: 70,
      decision_recorded_count: 63,
      active_application_count: 7,
      source_key: "casey_planning_register",
      source_publisher: "City of Casey",
      source_url: "https://example.invalid",
      source_licence: "CC BY 3.0",
      source_retrieved_at: "2026-07-24T09:05:11.227Z",
      status_reference_date: "2026-07-24",
      geography_scope: "council_records_only",
      limitations: [],
    }]);
  };
  const result = await fetchPublicPlanningMetrics(sql, "Cranbourne");
  assert.match(queryText, /lower\(suburb\) = lower/);
  assert.equal(result[0].lodgedApplications, 70);
});
