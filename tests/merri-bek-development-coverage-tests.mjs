import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMerriBekDevelopmentArtifacts,
} from "../scripts/build-merri-bek-development-coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = () => fs.readdirSync(path.join(ROOT, "data", "validation"))
  .filter((name) => name.endsWith("-merri-bek-development-activity.json"))
  .sort();

test("publishes 14 suburb aggregates from all 184 official RDM rows", () => {
  const files = fixtures();
  assert.equal(files.length, 14);
  const artifacts = files.map((name) => JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "validation", name),
    "utf8",
  )));
  assert.equal(artifacts.reduce((sum, item) => sum + item.quality.exactGeographyRows, 0), 184);
  assert.equal(new Set(artifacts.map((item) => item.quality.sourceRows)).size, 1);
  assert.equal(artifacts[0].quality.sourceRows, 184);
  assert.equal(new Set(artifacts.map((item) => item.quality.snapshotDate)).size, 1);
  assert.equal(artifacts[0].quality.snapshotDate, "2025-08-01");
});

test("normalizes case variants and preserves official project status semantics", () => {
  const csv = [
    "Project ID,Record No.,Address,Suburb,Status,Dwelling Type,Studio,1 Bedroom,2 Bedrooms,3 Bedrooms,4+ Bedrooms,Total  Dwellings,Car Spaces,Bike Spaces,Max. Storeys,Constructed Year,Status Date,Latitude,Longitude",
    "1,MPS/1,Hidden,Brunswick,Approved,Apartments,0,0,10,0,0,10,0,0,3,,1/08/2025,-37.7,144.9",
    "2,MPS/2,Hidden,BRUNSWICK,Under construction,Townhouses,0,0,0,6,0,6,0,0,2,,1/08/2025,-37.7,144.9",
  ].join("\n");
  const [artifact] = buildMerriBekDevelopmentArtifacts(csv);
  assert.equal(artifact.geography.suburb, "Brunswick");
  assert.equal(artifact.summary.totalProjectCount, 2);
  assert.equal(artifact.summary.approvedProjectCount, 1);
  assert.equal(artifact.summary.underConstructionProjectCount, 1);
  assert.equal(artifact.summary.activeResidentialDwellingCount, 16);
});

test("partial localities and five-dwelling threshold are explicit", () => {
  const artifact = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "validation", "fitzroy-north-merri-bek-development-activity.json"),
    "utf8",
  ));
  assert.equal(artifact.geography.councilCoverage, "partial");
  assert.match(artifact.geography.scope, /only projects recorded in the City of Merri-bek RDM/i);
  assert.match(artifact.publication.limitations.join(" "), /five or more dwellings/i);
  assert.match(artifact.publication.limitations.join(" "), /Merri-bek portion/i);
});

test("public artifacts contain no property-level identifiers", () => {
  for (const filename of fixtures()) {
    const text = fs.readFileSync(path.join(ROOT, "data", "validation", filename), "utf8");
    assert.doesNotMatch(text, /streetAddress|\"Address\"|\"Record No\\.\"|\"Latitude\"|\"Longitude\"/i);
  }
});

test("all generated pages expose the Merri-bek development contract", () => {
  for (const filename of fixtures()) {
    const slug = filename.replace("-merri-bek-development-activity.json", "");
    const html = fs.readFileSync(path.join(ROOT, "public", "suburb", `${slug}-vic.html`), "utf8");
    assert.match(html, /AHV_MERRI_BEK_DEVELOPMENT_START/);
    assert.match(html, /five or more dwellings/i);
    assert.match(html, /Project capacity only; not completed homes and does not predict future supply/);
    assert.doesNotMatch(html, /street_address|property_id|record no/i);
  }
});
