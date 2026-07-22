#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-statewide-building-permit-summary.mjs <extract.json> <output.json>");
  process.exit(2);
}

const input = JSON.parse(await readFile(inputPath, "utf8"));
const metrics = ["permitCount", "domesticResidentialPermitCount", "dwellingActivityPermitCount", "newDwellingPermitCount", "demolitionPermitCount", "newDwellings", "demolishedDwellings", "netAdditionalDwellings"];
const grouped = new Map();
const rejected = [];

function suspiciousLocalityName(value) {
  return /^\d+$|^STREET$|\bAKA\b|\((?:POOL [A-Z]|[^)]*COLLEGE[^)]*|[^)]*FIT OUT[^)]*|[^)]*RESERVE[^)]*|E\d+)\)/i.test(value);
}

for (const row of input.suburbs || []) {
  const postcode = String(row.postcode || "").trim();
  if (!/^3\d{3}$/.test(postcode)) {
    rejected.push({ suburb: row.suburb, postcode, municipality: row.municipality, permitCount: row.permitCount, reason: "invalid_victorian_postcode" });
    continue;
  }
  if (suspiciousLocalityName(String(row.suburb || "").trim())) {
    rejected.push({ suburb: row.suburb, postcode, municipality: row.municipality, permitCount: row.permitCount, reason: "suspicious_locality_label" });
    continue;
  }
  const municipality = String(row.municipality || "").trim();
  const key = `${row.suburb}|${postcode}|${municipality}`;
  const current = grouped.get(key) || { suburb: row.suburb, postcode, municipality, ...Object.fromEntries(metrics.map((metric) => [metric, 0])) };
  for (const metric of metrics) current[metric] += Number(row[metric] || 0);
  grouped.set(key, current);
}

const suburbs = [...grouped.values()]
  .sort((a, b) => a.suburb.localeCompare(b.suburb) || a.postcode.localeCompare(b.postcode) || a.municipality.localeCompare(b.municipality));
const councilSets = new Map();
for (const row of suburbs) {
  const key = `${row.suburb}|${row.postcode}`;
  if (!councilSets.has(key)) councilSets.set(key, new Set());
  councilSets.get(key).add(row.municipality);
}
const municipalityConflicts = [...councilSets]
  .filter(([, municipalities]) => municipalities.size > 1)
  .map(([key, municipalities]) => {
    const [suburb, postcode] = key.split("|");
    return { suburb, postcode, municipalities: [...municipalities].sort(), reason: "multiple_reported_municipalities_requires_official_geography_check" };
  });
const result = {
  schemaVersion: "statewide-building-permit-summary-v1",
  source: input.source,
  filters: input.filters,
  definition: "BPC permits issued, grouped by exact suburb and postcode; not commencements or completions",
  quality: {
    sourceRows: input.quality?.sourceRows ?? null,
    suburbMunicipalityRows: suburbs.length,
    rejectedRowCount: rejected.length,
    rejectedRows: rejected,
    municipalityConflictCount: municipalityConflicts.length,
    municipalityConflicts,
    warning: "Rows remain separated by reported municipality. Conflicts require an official locality-LGA reference before a single suburb total is selected."
  },
  suburbs
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, suburbMunicipalityRows: suburbs.length, rejectedRowCount: rejected.length, municipalityConflictCount: municipalityConflicts.length }));
