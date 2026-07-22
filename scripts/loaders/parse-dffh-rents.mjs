#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_SHEETS = new Map([
  ["3 bedroom house", 3],
  ["4 bedroom house", 4],
]);

function periodToIso(label) {
  const match = /^(Mar|Jun|Sep|Dec)\s+(\d{4})$/i.exec(String(label || "").trim());
  if (!match) return null;
  const monthDay = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" }[match[1].toLowerCase()];
  return `${match[2]}-${monthDay}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseDffhSheet(rows, { bedrooms, targetPeriod = "2025-09-30" }) {
  if (![3, 4].includes(Number(bedrooms))) throw new Error("Only 3-bedroom and 4-bedroom house sheets are supported");
  const periods = rows[1] || [];
  const measures = rows[2] || [];
  const targetColumn = periods.findIndex((period, index) => periodToIso(period) === targetPeriod && measures[index] === "Median");
  if (targetColumn < 0) throw new Error(`DFFH period not found: ${targetPeriod}`);
  const countColumn = targetColumn - 1;

  return rows.slice(3).map((row) => {
    const geography = String(row[1] || "").trim();
    const median = numberOrNull(row[targetColumn]);
    const count = numberOrNull(row[countColumn]);
    if (!geography || median == null) return null;
    return {
      geography,
      geographyType: geography.includes("-") ? "combined_suburb" : "suburb",
      propertyType: "house",
      bedrooms,
      metricKey: `house_rent_${bedrooms}br`,
      value: median,
      unit: "AUD/week",
      periodEnd: targetPeriod,
      sampleSize: count,
      sourceKey: "dffh_moving_annual_rents",
      kind: "fact",
      publicationEligibleAsSuburbFact: !geography.includes("-"),
    };
  }).filter(Boolean);
}

export async function parseWorkbook(filePath, targetPeriod = "2025-09-30") {
  const imported = await import("xlsx");
  const XLSX = imported.default || imported;
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  return [...SUPPORTED_SHEETS].flatMap(([sheetName, bedrooms]) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Required DFFH sheet missing: ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
    return parseDffhSheet(rows, { bedrooms, targetPeriod });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: node scripts/loaders/parse-dffh-rents.mjs <xlsx> [YYYY-MM-DD]");
  const rows = await parseWorkbook(path.resolve(filePath), process.argv[3] || "2025-09-30");
  console.log(JSON.stringify({ rows: rows.length, observations: rows }, null, 2));
}
