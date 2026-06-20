#!/usr/bin/env node
/**
 * Preview-only VicPlan source import.
 *
 * Purpose:
 *   Create and populate the raw VicPlan source tables needed by the derived
 *   planning layer in the isolated Preview database.
 *
 * Safety:
 *   - Requires DATABASE_URL.
 *   - Refuses the known production/main Neon endpoint.
 *   - Default mode is diagnose-only.
 *   - Writes only with explicit --create-schema / --import-* flags.
 *   - No DROP / TRUNCATE / DELETE.
 *   - Does not log DATABASE_URL or row-level source data.
 */

import { neon } from "@neondatabase/serverless";
import { fetchPlanZones, fetchPlanOverlays } from "../lib/vicplan-client.js";

const PROD_HOST_TOKEN = "ep-winter-band-a7qym6bq";
const DB_URL_SOURCE = process.env.DATABASE_URL;
if (!DB_URL_SOURCE) {
  console.error("DATABASE_URL is not configured");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const CREATE_SCHEMA = args.has("--create-schema");
const IMPORT_ZONES = args.has("--import-zones") || args.has("--import-all");
const IMPORT_OVERLAYS = args.has("--import-overlays") || args.has("--import-all");

function parseTarget(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("INVALID_DATABASE_URL");
  }
  if (!parsed.hostname.includes("neon.tech")) {
    throw new Error("REFUSING_NON_NEON_DATABASE");
  }
  if (parsed.hostname.includes(PROD_HOST_TOKEN)) {
    throw new Error("REFUSING_PRODUCTION_MAIN_DATABASE");
  }
  return {
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, "") || "unknown",
  };
}

let target;
try {
  target = parseTarget(DB_URL_SOURCE);
} catch (err) {
  console.error(`VICPLAN_IMPORT_REFUSED code=${err.message || "INVALID_TARGET"}`);
  process.exit(1);
}

const sql = neon(DB_URL_SOURCE);

console.log("=".repeat(64));
console.log("  Preview VicPlan Source Import");
console.log("=".repeat(64));
console.log(`  Mode: ${CREATE_SCHEMA || IMPORT_ZONES || IMPORT_OVERLAYS ? "WRITE" : "DIAGNOSE"}`);
console.log(`  Target host: ${target.host}`);
console.log(`  Database: ${target.database}`);
console.log("=".repeat(64));

async function sourceStatus() {
  const rows = await sql`
    SELECT
      to_regclass('public.vicplan_zones') AS vicplan_zones,
      to_regclass('public.vicplan_overlays') AS vicplan_overlays
  `;
  const counts = { zones: null, overlays: null };
  if (rows[0]?.vicplan_zones) {
    const zoneRows = await sql`SELECT COUNT(*)::int AS count FROM vicplan_zones`;
    counts.zones = zoneRows[0]?.count ?? 0;
  }
  if (rows[0]?.vicplan_overlays) {
    const overlayRows = await sql`SELECT COUNT(*)::int AS count FROM vicplan_overlays`;
    counts.overlays = overlayRows[0]?.count ?? 0;
  }
  return {
    tables: rows[0],
    counts,
  };
}

function printStatus(label, status) {
  console.log(`${label}:`);
  console.log(`  vicplan_zones:    ${status.tables?.vicplan_zones || "missing"} rows=${status.counts.zones ?? "n/a"}`);
  console.log(`  vicplan_overlays: ${status.tables?.vicplan_overlays || "missing"} rows=${status.counts.overlays ?? "n/a"}`);
}

async function createSourceSchema() {
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
  await sql`
    CREATE TABLE IF NOT EXISTS vicplan_zones (
      pfi              TEXT PRIMARY KEY,
      scheme_code      TEXT,
      lga_code         TEXT,
      lga              TEXT,
      zone_num         NUMERIC,
      zone_status      TEXT,
      zone_code        TEXT,
      zone_description TEXT,
      gaz_begin_date   TIMESTAMPTZ,
      ufi              NUMERIC,
      geom             geometry(Geometry, 4326),
      fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS vicplan_overlays (
      pfi              TEXT PRIMARY KEY,
      scheme_code      TEXT,
      lga_code         TEXT,
      lga              TEXT,
      zone_num         NUMERIC,
      zone_status      TEXT,
      zone_code        TEXT,
      zone_description TEXT,
      gaz_begin_date   TIMESTAMPTZ,
      ufi              NUMERIC,
      geom             geometry(Geometry, 4326),
      fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpz_geom ON vicplan_zones USING GIST (geom)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpo_geom ON vicplan_overlays USING GIST (geom)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpz_lga ON vicplan_zones (lga)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpo_lga ON vicplan_overlays (lga)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpz_zone_code ON vicplan_zones (zone_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vpo_zone_code ON vicplan_overlays (zone_code)`;
}

async function run() {
  const before = await sourceStatus();
  printStatus("Before", before);

  if (CREATE_SCHEMA) {
    console.log("\nCreating Preview VicPlan source schema...");
    await createSourceSchema();
  }

  if (IMPORT_ZONES) {
    console.log("\nImporting VicPlan zones into Preview...");
    await fetchPlanZones(sql);
  }

  if (IMPORT_OVERLAYS) {
    console.log("\nImporting VicPlan overlays into Preview with topology-preserving simplification...");
    await fetchPlanOverlays(sql);
  }

  const after = await sourceStatus();
  printStatus("\nAfter", after);

  if (!CREATE_SCHEMA && !IMPORT_ZONES && !IMPORT_OVERLAYS) {
    console.log("\nDIAGNOSE_OK — no writes performed.");
    console.log("Use --create-schema before --import-zones / --import-overlays / --import-all.");
  } else {
    console.log("\nVICPLAN_SOURCE_PREVIEW_OK");
  }
}

run().catch((err) => {
  console.error(`VICPLAN_IMPORT_FAILED code=${err?.code || "unknown"}`);
  process.exit(1);
});
