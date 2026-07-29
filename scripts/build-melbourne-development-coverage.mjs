#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "data", "validation");
const DATASET_ID = "development-activity-monitor";
const DATASET_URL = `https://data.melbourne.vic.gov.au/explore/dataset/${DATASET_ID}/`;
const API_ROOT = `https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/${DATASET_ID}`;
const writeArtifacts = process.argv.includes("--write-artifacts");

const AREA_MAP = new Map([
  ["Carlton", ["Carlton", "3053"]],
  ["Docklands", ["Docklands", "3008"]],
  ["East Melbourne", ["East Melbourne", "3002"]],
  ["Kensington", ["Kensington", "3031"]],
  ["Melbourne (CBD)", ["Melbourne", "3000"]],
  ["Melbourne CBD", ["Melbourne", "3000"]],
  ["Melbourne (Remainder)", ["Melbourne", "3000"]],
  ["North Melbourne", ["North Melbourne", "3051"]],
  ["Parkville", ["Parkville", "3052"]],
  ["Port Melbourne", ["Port Melbourne", "3207"]],
  ["South Yarra", ["South Yarra", "3141"]],
  ["Southbank", ["Southbank", "3006"]],
  ["West Melbourne", ["West Melbourne", "3003"]],
  ["West Melbourne (Industrial)", ["West Melbourne", "3003"]],
  ["West Melbourne (Residential)", ["West Melbourne", "3003"]],
]);
const VALID_STATUSES = new Set(["APPLIED", "APPROVED", "UNDER CONSTRUCTION", "COMPLETED"]);

const slug = (value) => String(value).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`City of Melbourne API returned HTTP ${response.status}`);
  return response.json();
}

async function fetchAllRows() {
  const rows = [];
  let expected = null;
  for (let offset = 0; expected === null || rows.length < expected; offset += 100) {
    const page = await fetchJson(`${API_ROOT}/records?limit=100&offset=${offset}`);
    expected = page.total_count;
    rows.push(...page.results);
  }
  if (rows.length !== expected) throw new Error("Development Activity Monitor row count mismatch");
  return rows;
}

export function buildMelbourneDevelopmentArtifacts(rows, metadata) {
  const groups = new Map();
  for (const row of rows) {
    const mapping = AREA_MAP.get(row.clue_small_area);
    if (!mapping) throw new Error(`Unmapped CLUE small area: ${row.clue_small_area}`);
    if (!VALID_STATUSES.has(row.status)) throw new Error(`Unsupported development status: ${row.status}`);
    const [suburb, postcode] = mapping;
    const key = `${suburb}|${postcode}`;
    if (!groups.has(key)) groups.set(key, { suburb, postcode, rows: [] });
    groups.get(key).rows.push(row);
  }

  const sourceRows = rows.length;
  const accountedRows = [...groups.values()].reduce((sum, group) => sum + group.rows.length, 0);
  if (sourceRows !== accountedRows) throw new Error("Development Activity Monitor reconciliation failed");

  const source = {
    key: "melbourne_development_activity_monitor",
    publisher: "City of Melbourne",
    url: DATASET_URL,
    licence: metadata.license,
    licenceUrl: metadata.license_url,
    dataProcessedAt: metadata.data_processed,
    sourceReport: "Development Activity Monitor — official open-data API",
  };
  const duplicateKeys = sourceRows - new Set(rows.map((row) => row.development_key)).size;
  const missingCoordinates = rows.filter((row) =>
    !Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))).length;

  return [...groups.values()].sort((a, b) => a.suburb.localeCompare(b.suburb)).map((group) => {
    const count = (status) => group.rows.filter((row) => row.status === status).length;
    const activeRows = group.rows.filter((row) => row.status !== "COMPLETED");
    const activeResidential = activeRows.filter((row) => Number(row.resi_dwellings) > 0);
    const planningReferenceCount = group.rows.filter((row) => {
      const value = String(row.town_planning_application ?? "").trim();
      return value && value !== "0";
    }).length;
    const summary = {
      totalProjectCount: group.rows.length,
      appliedProjectCount: count("APPLIED"),
      approvedProjectCount: count("APPROVED"),
      underConstructionProjectCount: count("UNDER CONSTRUCTION"),
      completedProjectCount: count("COMPLETED"),
      activeProjectCount: activeRows.length,
      activeResidentialProjectCount: activeResidential.length,
      activeResidentialDwellingCount: activeResidential.reduce(
        (sum, row) => sum + (Number(row.resi_dwellings) || 0),
        0,
      ),
      planningReferenceCount,
    };
    return {
      schemaVersion: "development-activity-summary-v1",
      source,
      geography: {
        council: "City of Melbourne",
        suburb: group.suburb,
        postcode: group.postcode,
        scope: "City of Melbourne CLUE small-area mapping",
        sourceSmallAreas: [...new Set(group.rows.map((row) => row.clue_small_area))].sort(),
      },
      quality: {
        sourceRows,
        exactGeographyRows: group.rows.length,
        allSourceRowsAccountedFor: accountedRows,
        duplicateDevelopmentKeys: duplicateKeys,
        missingCoordinates,
        recordLevelReuse: "Internal validation only; public output is aggregate only",
      },
      summary,
      publication: {
        publishable: true,
        grain: "Major development sites in the current City of Melbourne Development Activity Monitor snapshot",
        limitations: [
          "The Development Activity Monitor covers major development sites, not every planning application or building permit",
          "Applied, approved and under-construction are project status labels in the official dataset and may change",
          "Stated residential dwellings are project capacity in active major developments; they are not completed homes",
          "Project capacity is not proof of planning approval, construction commencement or completion",
          "CLUE small areas are mapped to public suburb labels; no property-level address is published",
        ],
      },
    };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metadataResponse = await fetchJson(API_ROOT);
  const rows = await fetchAllRows();
  const artifacts = buildMelbourneDevelopmentArtifacts(rows, metadataResponse.metas.default);

  if (writeArtifacts) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    for (const artifact of artifacts) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${slug(artifact.geography.suburb)}-melbourne-development-activity.json`),
        `${JSON.stringify(artifact, null, 2)}\n`,
      );
    }
  }

  console.log(JSON.stringify({
    mode: writeArtifacts ? "write-artifacts" : "check",
    sourceRows: rows.length,
    sourceDataProcessedAt: metadataResponse.metas.default.data_processed,
    suburbs: artifacts.length,
    accountedRows: artifacts.reduce((sum, item) => sum + item.quality.exactGeographyRows, 0),
    activeProjects: artifacts.reduce((sum, item) => sum + item.summary.activeProjectCount, 0),
    activeResidentialDwellings: artifacts.reduce(
      (sum, item) => sum + item.summary.activeResidentialDwellingCount,
      0,
    ),
  }, null, 2));
}
