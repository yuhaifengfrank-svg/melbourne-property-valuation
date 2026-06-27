#!/usr/bin/env node
/**
 * update-land-size-stats.mjs
 *
 * Regenerates suburb_land_size_from_sales.json from the comparable_sales table,
 * filtered by property_type = 'House' only.
 *
 * Run after each cron-weekly.mjs cycle (or standalone).
 *
 * Usage: node scripts/update-land-size-stats.mjs [--output <path>]
 *
 * Default output: data/vicmap/suburb_land_size_from_sales.json
 */

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_OUTPUT = resolve(ROOT, "data/vicmap/suburb_land_size_from_sales.json");

export default async function updateLandSize(outputPath) {
  const { getSql } = await import("../api/_db.js");
  const sql = getSql();
  const OUTPUT = outputPath || DEFAULT_OUTPUT;

  console.log("[LandSizeStats] Fetching House-only land size stats from DB...");

  const rows = await sql`
    SELECT
      suburb,
      COUNT(*)::int AS count,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY land_size_sqm)::numeric AS median,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY land_size_sqm)::numeric AS q25,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY land_size_sqm)::numeric AS q75,
      MIN(land_size_sqm)::numeric AS min,
      MAX(land_size_sqm)::numeric AS max
    FROM comparable_sales
    WHERE
      property_type = 'House'
      AND land_size_sqm IS NOT NULL
      AND land_size_sqm >= 50
      AND land_size_sqm <= 10000
      AND sale_price IS NOT NULL
    GROUP BY suburb
    ORDER BY suburb
  `;

  console.log(`[LandSizeStats] Got ${rows.length} suburbs with House land size data.`);

  const output = {};
  for (const r of rows) {
    if (!r.suburb || !r.median) continue;
    if (r.count < 3) continue; // skip tiny samples
    output[r.suburb] = {
      source: "comparable_sales",
      median: Number(r.median),
      q25: Number(r.q25),
      q75: Number(r.q75),
      min: Number(r.min),
      max: Number(r.max),
      count: String(r.count),
    };
  }

  // Preserve the original JSON format (2-space indent)
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`[LandSizeStats] Written ${Object.keys(output).length} suburbs to ${OUTPUT}`);
  console.log(`[LandSizeStats] Done.`);
}

// ── CLI entry point (only runs when called directly) ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputArg = process.argv.find(a => a.startsWith("--output="));
  const OUTPUT = outputArg ? resolve(outputArg.split("=")[1]) : DEFAULT_OUTPUT;

  updateLandSize(OUTPUT).catch(err => {
    console.error("[LandSizeStats] Error:", err.message);
    process.exit(1);
  });
}
