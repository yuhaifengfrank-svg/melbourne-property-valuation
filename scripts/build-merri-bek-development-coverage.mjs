#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "data", "validation");
const DATASET_URL = "https://www.merri-bek.vic.gov.au/building-and-business/planning-and-building/strategic-planning/residential-development-monitor/";
const CSV_URL = "https://www.merri-bek.vic.gov.au/globalassets/website-merri-bek/areas/building-business/planning-and-building/strategic-planning/residential-development-monitor/rdm_merri-bek.csv";
const NOTES_URL = "https://www.merri-bek.vic.gov.au/globalassets/website-merri-bek/areas/building-business/planning-and-building/strategic-planning/residential-development-monitor/250821---rdm-data-notes.pdf";
const SNAPSHOT_AT = "2025-08-01";
const writeArtifacts = process.argv.includes("--write-artifacts");
const inputArg = process.argv.find((argument) => argument.startsWith("--input="));

const POSTCODES = new Map([
  ["BRUNSWICK", "3056"],
  ["BRUNSWICK EAST", "3057"],
  ["BRUNSWICK WEST", "3055"],
  ["COBURG", "3058"],
  ["COBURG NORTH", "3058"],
  ["FAWKNER", "3060"],
  ["FITZROY NORTH", "3068"],
  ["GLENROY", "3046"],
  ["GOWANBRAE", "3043"],
  ["HADFIELD", "3046"],
  ["OAK PARK", "3046"],
  ["PASCOE VALE", "3044"],
  ["PASCOE VALE SOUTH", "3044"],
  ["TULLAMARINE", "3043"],
]);
const PARTIAL_LOCALITIES = new Set(["FITZROY NORTH", "TULLAMARINE"]);
const VALID_STATUSES = new Set(["APPROVED", "UNDER CONSTRUCTION", "CONSTRUCTED"]);

const slug = (value) => String(value).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const titleCase = (value) => String(value).toLowerCase()
  .replace(/\b\w/g, (character) => character.toUpperCase());
const normalized = (value) => String(value ?? "").trim().toUpperCase();

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((item) => item !== "")) rows.push(row);
  }
  return rows;
}

export function buildMerriBekDevelopmentArtifacts(csvText) {
  const parsed = parseCsv(csvText);
  const header = parsed.shift().map((value) => value.trim());
  const columns = Object.fromEntries(header.map((value, index) => [value, index]));
  for (const required of ["Project ID", "Suburb", "Status", "Dwelling Type", "Total  Dwellings", "Status Date", "Latitude", "Longitude"]) {
    if (!Number.isInteger(columns[required])) throw new Error(`Missing RDM column: ${required}`);
  }

  const rows = parsed.map((values) => Object.fromEntries(
    header.map((name, index) => [name, values[index] ?? ""]),
  ));
  const groups = new Map();
  for (const row of rows) {
    const suburb = normalized(row.Suburb);
    const status = normalized(row.Status);
    if (!POSTCODES.has(suburb)) throw new Error(`Unmapped Merri-bek RDM suburb: ${suburb}`);
    if (!VALID_STATUSES.has(status)) throw new Error(`Unsupported Merri-bek RDM status: ${status}`);
    if (!groups.has(suburb)) groups.set(suburb, []);
    groups.get(suburb).push({ ...row, _status: status });
  }
  const accountedRows = [...groups.values()].reduce((sum, values) => sum + values.length, 0);
  if (accountedRows !== rows.length) throw new Error("Merri-bek RDM row reconciliation failed");

  const projectIds = rows.map((row) => String(row["Project ID"]).trim()).filter(Boolean);
  const duplicateProjectIds = projectIds.length - new Set(projectIds).size;
  const missingCoordinates = rows.filter((row) =>
    !Number.isFinite(Number(row.Latitude)) || !Number.isFinite(Number(row.Longitude))).length;
  const statusDates = new Set(rows.map((row) => String(row["Status Date"]).trim()));
  if (statusDates.size !== 1 || !statusDates.has("1/08/2025")) {
    throw new Error("Unexpected Merri-bek RDM snapshot date");
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([suburb, groupRows]) => {
    const count = (status) => groupRows.filter((row) => row._status === status).length;
    const activeRows = groupRows.filter((row) => row._status !== "CONSTRUCTED");
    const dwellingCount = (values) => values.reduce(
      (sum, row) => sum + (Number(String(row["Total  Dwellings"]).replaceAll(",", "")) || 0),
      0,
    );
    const note = PARTIAL_LOCALITIES.has(suburb)
      ? "This locality crosses council boundaries; the aggregate covers only projects recorded in the City of Merri-bek RDM"
      : "Exact suburb label recorded in the City of Merri-bek RDM";
    return {
      schemaVersion: "development-activity-summary-v1",
      source: {
        key: "merri_bek_residential_development_monitor",
        publisher: "Merri-bek City Council",
        url: DATASET_URL,
        csvUrl: CSV_URL,
        notesUrl: NOTES_URL,
        dataProcessedAt: SNAPSHOT_AT,
        sourceReport: "Residential Development Monitor — official council CSV",
      },
      geography: {
        council: "Merri-bek City Council",
        suburb: titleCase(suburb),
        postcode: POSTCODES.get(suburb),
        scope: note,
        councilCoverage: PARTIAL_LOCALITIES.has(suburb) ? "partial" : "full",
      },
      quality: {
        sourceRows: rows.length,
        exactGeographyRows: groupRows.length,
        allSourceRowsAccountedFor: accountedRows,
        duplicateProjectIds,
        missingCoordinates,
        snapshotDate: SNAPSHOT_AT,
        recordLevelReuse: "Internal validation only; public output is aggregate only",
      },
      summary: {
        totalProjectCount: groupRows.length,
        appliedProjectCount: 0,
        approvedProjectCount: count("APPROVED"),
        underConstructionProjectCount: count("UNDER CONSTRUCTION"),
        completedProjectCount: count("CONSTRUCTED"),
        activeProjectCount: activeRows.length,
        activeResidentialProjectCount: activeRows.length,
        activeResidentialDwellingCount: dwellingCount(activeRows),
        totalTrackedDwellingCount: dwellingCount(groupRows),
        apartmentProjectCount: groupRows.filter((row) => normalized(row["Dwelling Type"]) === "APARTMENTS").length,
        townhouseProjectCount: groupRows.filter((row) => normalized(row["Dwelling Type"]) === "TOWNHOUSES").length,
        planningReferenceCount: groupRows.filter((row) => String(row["Record No."]).trim()).length,
      },
      publication: {
        publishable: true,
        grain: "City of Merri-bek Residential Development Monitor projects with five or more dwellings",
        limitations: [
          "The RDM includes permitted residential developments of five or more dwellings, not every planning application or building permit",
          "Approved, under construction and constructed are official RDM status estimates at 1 August 2025 and may change",
          "Stated dwellings are project capacity; active-pipeline dwellings are not completed homes and do not predict future prices",
          "The source is continuously updated, while this published aggregate is a dated snapshot",
          ...(PARTIAL_LOCALITIES.has(suburb)
            ? ["The suburb crosses council boundaries; the aggregate covers only the Merri-bek portion recorded in the RDM"]
            : []),
          "No property address, record number or coordinate is republished",
        ],
      },
    };
  });
}

async function readSource() {
  if (inputArg) return fs.readFileSync(path.resolve(inputArg.slice("--input=".length)), "utf8");
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`Merri-bek RDM CSV returned HTTP ${response.status}`);
  return response.text();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifacts = buildMerriBekDevelopmentArtifacts(await readSource());
  if (writeArtifacts) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    for (const artifact of artifacts) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${slug(artifact.geography.suburb)}-merri-bek-development-activity.json`),
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
    }
  }
  console.log(JSON.stringify({
    mode: writeArtifacts ? "write-artifacts" : "check",
    sourceRows: artifacts[0]?.quality.sourceRows || 0,
    snapshotAt: SNAPSHOT_AT,
    suburbs: artifacts.length,
    accountedRows: artifacts.reduce((sum, artifact) => sum + artifact.quality.exactGeographyRows, 0),
    activeProjects: artifacts.reduce((sum, artifact) => sum + artifact.summary.activeProjectCount, 0),
    activeResidentialDwellings: artifacts.reduce(
      (sum, artifact) => sum + artifact.summary.activeResidentialDwellingCount,
      0,
    ),
  }, null, 2));
}
