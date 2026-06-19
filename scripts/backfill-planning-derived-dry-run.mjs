#!/usr/bin/env node
/**
 * scripts/backfill-planning-derived-dry-run.mjs — Phase 0
 *
 * Read-only dry-run script.
 * Counts records and estimates backfill scope for:
 *   - suburb_planning_summary
 *   - property_planning_cache
 *
 * Does NOT write to the database.
 * Does NOT read DATABASE_URL into logs (only checks process.env).
 * --apply flag is explicitly rejected in Phase 0.
 */

import { neon } from "@neondatabase/serverless";

const DB_URL_SOURCE = process.env.DATABASE_URL;
if (!DB_URL_SOURCE) {
  console.error("❌ DATABASE_URL is not configured");
  process.exit(1);
}

const args = process.argv.slice(2);
const hasApply = args.includes("--apply");
const isDryRun = !hasApply;

if (hasApply) {
  console.log("=".repeat(60));
  console.log("  Phase 0: --apply is DISABLED");
  console.log("  No database writes permitted in Phase 0.");
  console.log("  Re-run without --apply for dry-run stats only.");
  console.log("=".repeat(60));
  process.exit(0);
}

console.log("=".repeat(60));
console.log("  Phase 0 — Dry Run: Planning Derived Backfill Estimate");
console.log("=".repeat(60));
console.log("  Mode: DRY RUN — no database writes\n");

const sql = neon(DB_URL_SOURCE);

async function run() {
  try {
    // ── 1. System info ──
    const dbInfo = await sql`SELECT version() AS v`;
    console.log(`  Database: ${dbInfo[0]?.v?.split(",")[0] || "unknown"}`);

    // ── 2. Suburb count from vicplan_zones (no PostGIS spatial join) ──
    const zoneCounts = await sql`
      SELECT COUNT(DISTINCT lga) AS lga_count,
             COUNT(*) AS total_zone_features
      FROM vicplan_zones
    `;

    // ── 3. Unique LGA / suburb references ──
    const lgaRows = await sql`
      SELECT lga, COUNT(*) AS feature_count
      FROM vicplan_zones
      WHERE lga IS NOT NULL
      GROUP BY lga
      ORDER BY feature_count DESC
    `;

    // ── 4. Zone code distribution ──
    const zoneDist = await sql`
      SELECT LEFT(zone_code, 3) AS zone_prefix, COUNT(*) AS cnt
      FROM vicplan_zones
      GROUP BY zone_prefix
      ORDER BY cnt DESC
    `;

    // ── 5. Overlay statistics ──
    const overlayStats = await sql`
      SELECT COUNT(*) AS total_overlay_features FROM vicplan_overlays
    `;
    const overlayDist = await sql`
      SELECT LEFT(zone_code, 3) AS overlay_prefix, COUNT(*) AS cnt
      FROM vicplan_overlays
      GROUP BY overlay_prefix
      ORDER BY cnt DESC
      LIMIT 10
    `;

    // ── 6. Check existing derived tables ──
    const existingSummary = await sql`
      SELECT COUNT(*) AS cnt FROM suburb_planning_summary
    `;

    const existingCache = await sql`
      SELECT COUNT(*) AS cnt FROM property_planning_cache
    `;

    const existingReg = await sql`
      SELECT COUNT(*) AS cnt FROM data_source_registry
    `;

    // ── 7. Suburb uniqueness potential (approximate) ──
    // Intersect known suburb list to estimate summary row count
    const suburbCounts = await sql`
      SELECT COUNT(*) AS suburb_lga_pairs
      FROM (
        SELECT DISTINCT suburb, lga
        FROM school_locations
        WHERE state = 'VIC'
      ) pairs
    `;

    const zoneSuburbEstimate = await sql`
      SELECT COUNT(DISTINCT lga) AS unique_lgas
      FROM vicplan_zones
    `;

    console.log("\n─── Statistics ───\n");
    console.log(`  vicplan_zones features:        ${padNum(zoneCounts[0]?.total_zone_features || 0)}`);
    console.log(`  vicplan_zones unique LGAs:     ${padNum(zoneCounts[0]?.lga_count || 0)}`);
    console.log(`  vicplan_overlays features:     ${padNum(overlayStats[0]?.total_overlay_features || 0)}`);
    console.log(`  School locations (VIC suburb pairs): ${padNum(suburbCounts[0]?.suburb_lga_pairs || 0)}`);
    console.log(`  vicplan_zones LGAs (estimate):        ${padNum(zoneSuburbEstimate[0]?.unique_lgas || 0)}`);

    console.log("\n─── Existing Derived Tables ───\n");
    console.log(`  suburb_planning_summary:       ${padNum(existingSummary[0]?.cnt || 0)} rows`);
    console.log(`  property_planning_cache:       ${padNum(existingCache[0]?.cnt || 0)} rows`);
    console.log(`  data_source_registry:          ${padNum(existingReg[0]?.cnt || 0)} rows`);

    console.log("\n─── Top Zone Prefixes ───\n");
    for (const z of zoneDist.slice(0, 10)) {
      console.log(`  ${z.zone_prefix?.padEnd(6) || "NULL".padEnd(6)} ${padNum(z.cnt)}`);
    }

    console.log("\n─── Top Overlay Prefixes (10) ───\n");
    for (const o of overlayDist) {
      console.log(`  ${o.overlay_prefix?.padEnd(6) || "NULL".padEnd(6)} ${padNum(o.cnt)}`);
    }

    console.log("\n─── LGA Distribution (top 15) ───\n");
    for (const l of lgaRows.slice(0, 15)) {
      console.log(`  ${l.lga?.padEnd(24) || "NULL".padEnd(24)} ${padNum(l.feature_count)}`);
    }

    console.log("\n─── Estimated Scope ───\n");
    const estSuburbs = Math.max(
      suburbCounts[0]?.suburb_lga_pairs || 0,
      zoneSuburbEstimate[0]?.unique_lgas || 0
    );
    console.log(`  Estimated suburb_planning_summary rows:   ~${padNum(estSuburbs)}`);
    console.log(`  (full suburban aggregation requires spatial join across vicplan_zones)`);
    console.log(`  property_planning_cache rows:             to be built on-demand at valuation time`);
    console.log(`  data_source_registry seeding:             ~${padNum(6)} entries planned (vicplan_zones, vicplan_overlays, cpi, building, labour, rba)`);

    console.log(`\n${"─".repeat(60)}`);
    console.log("  DRY RUN COMPLETE — 0 database writes");
    console.log(`${"─".repeat(60)}\n`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    // Do not await sql.end() for neon/serverless
  }
}

function padNum(n) {
  return String(n).padStart(8);
}

run();
