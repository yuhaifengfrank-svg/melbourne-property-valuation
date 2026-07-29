import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  fetchPublicDevelopmentMetrics,
  normalizeDevelopmentMetricArtifact,
  toPublicDevelopmentMetric,
} from "../lib/council-development-metrics.js";
import { buildMelbourneDevelopmentArtifacts } from "../scripts/build-melbourne-development-coverage.mjs";

const fixtures = fs.readdirSync(new URL("../data/validation/", import.meta.url))
  .filter((name) => name.endsWith("-melbourne-development-activity.json"))
  .sort();

test("publishes 11 City of Melbourne suburb aggregates with full reconciliation", () => {
  assert.equal(fixtures.length, 11);
  const artifacts = fixtures.map((name) => JSON.parse(fs.readFileSync(
    new URL(`../data/validation/${name}`, import.meta.url),
    "utf8",
  )));
  assert.equal(new Set(artifacts.map((item) => item.quality.sourceRows)).size, 1);
  assert.equal(artifacts.reduce(
    (sum, item) => sum + item.quality.exactGeographyRows,
    0,
  ), 1438);
  assert.equal(artifacts[0].quality.allSourceRowsAccountedFor, 1438);
});

test("normalizes official development activity without record-level addresses", () => {
  const artifact = JSON.parse(fs.readFileSync(
    new URL("../data/validation/docklands-melbourne-development-activity.json", import.meta.url),
    "utf8",
  ));
  const metric = normalizeDevelopmentMetricArtifact(artifact);
  assert.equal(metric.council, "City of Melbourne");
  assert.equal(metric.suburb, "docklands");
  assert.equal(metric.activeProjectCount, 36);
  assert.equal(metric.activeResidentialDwellingCount, 10589);
  assert.equal("streetAddress" in metric, false);
});

test("rejects inconsistent development status counts", () => {
  const artifact = JSON.parse(fs.readFileSync(
    new URL("../data/validation/carlton-melbourne-development-activity.json", import.meta.url),
    "utf8",
  ));
  artifact.summary.approvedProjectCount += 1;
  assert.throws(
    () => normalizeDevelopmentMetricArtifact(artifact),
    /counts are inconsistent/,
  );
});

test("maps legacy CLUE labels and preserves project semantics", () => {
  const rows = [
    {
      development_key: "A",
      clue_small_area: "Melbourne (CBD)",
      status: "APPROVED",
      resi_dwellings: 120,
      town_planning_application: "TP-1",
      latitude: -37.81,
      longitude: 144.96,
    },
    {
      development_key: "B",
      clue_small_area: "Melbourne CBD",
      status: "COMPLETED",
      resi_dwellings: 20,
      town_planning_application: "0",
      latitude: -37.81,
      longitude: 144.96,
    },
  ];
  const [artifact] = buildMelbourneDevelopmentArtifacts(rows, {
    license: "CC BY",
    license_url: "https://creativecommons.org/licenses/by/4.0/legalcode",
    data_processed: "2026-07-16T03:56:33+00:00",
  });
  assert.equal(artifact.geography.suburb, "Melbourne");
  assert.equal(artifact.summary.activeProjectCount, 1);
  assert.equal(artifact.summary.activeResidentialDwellingCount, 120);
  assert.equal(artifact.summary.completedProjectCount, 1);
});

test("public response labels major-development limitations explicitly", () => {
  const value = toPublicDevelopmentMetric({
    council: "City of Melbourne",
    suburb: "docklands",
    state: "VIC",
    postcode: "3008",
    snapshot_at: "2026-07-16T03:56:33Z",
    total_project_count: 202,
    active_project_count: 36,
    applied_project_count: 7,
    approved_project_count: 17,
    under_construction_project_count: 12,
    completed_project_count: 166,
    planning_reference_count: 86,
    active_residential_project_count: 27,
    active_residential_dwelling_count: 10589,
    source_key: "melbourne_development_activity_monitor",
    source_publisher: "City of Melbourne",
    source_url: "https://example.invalid",
    source_licence: "CC BY",
    geography_scope: "City of Melbourne CLUE small-area mapping",
    limitations: ["Major developments only"],
  });
  assert.equal(value.definitions.majorDevelopmentsOnly, true);
  assert.equal(value.definitions.projectCapacityIsCompletion, false);
  assert.equal(value.residentialPipeline.statedDwellings, 10589);
});

test("public database query is suburb-scoped", async () => {
  let queryText = "";
  const sql = (strings, ...values) => {
    queryText = strings.join("?").toLowerCase();
    assert.deepEqual(values, ["Docklands"]);
    return Promise.resolve([]);
  };
  assert.deepEqual(await fetchPublicDevelopmentMetrics(sql, "Docklands"), []);
  assert.match(queryText, /lower\(suburb\) = lower/);
});

test("suburb intelligence initializes dedicated development schema", () => {
  const handler = fs.readFileSync(
    new URL("../lib/suburb-intelligence-handler.js", import.meta.url),
    "utf8",
  );
  assert.match(handler, /ensureCouncilDevelopmentMetricsSchema/);
  assert.match(handler, /councilDevelopment/);
});

test("all 11 City of Melbourne suburb pages publish the development contract", () => {
  for (const filename of fixtures) {
    const slug = filename.replace("-melbourne-development-activity.json", "");
    const html = fs.readFileSync(
      new URL(`../public/suburb/${slug}-vic.html`, import.meta.url),
      "utf8",
    );
    assert.match(html, /AHV_MELBOURNE_DEVELOPMENT_START/);
    assert.match(html, /Major development sites only/);
    assert.match(html, /Project capacity only; not completed homes and does not predict future supply/);
    assert.doesNotMatch(html, /street_address|property_id/i);
  }
});

test("Suburb Research index exposes City of Melbourne coverage", () => {
  const html = fs.readFileSync(
    new URL("../public/suburb-research.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /<h2>City of Melbourne<\/h2>/);
  assert.match(html, /11个已核验区域/);
  assert.match(html, /\/suburb\/docklands-vic\.html/);
});
