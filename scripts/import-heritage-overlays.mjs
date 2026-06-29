#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const apply = process.argv.includes("--apply");
const confirmProduction = process.argv.includes("--confirm-production");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const inputPath = resolve(inputArg ? inputArg.slice("--input=".length) : "data/artifacts/heritage_overlays_melbourne.geojson");
const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) throw new Error("DATABASE_URL is not configured");
if (apply && !confirmProduction) {
  throw new Error("Production import requires both --apply and --confirm-production");
}

const artifact = JSON.parse(await readFile(inputPath, "utf8"));
const features = Array.isArray(artifact.features) ? artifact.features : [];
const validFeatures = features.filter((feature) => {
  const p = feature?.properties || {};
  return p.pfi != null && String(p.zone_code || "").startsWith("HO") && feature?.geometry;
});

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  inputPath,
  sourceFeatures: features.length,
  validFeatures: validFeatures.length,
  bbox: artifact.metadata?.bbox || null,
}, null, 2));

if (!apply) process.exit(0);

const sql = neon(connectionString);
await sql.query(`
  CREATE TABLE IF NOT EXISTS heritage_overlays (
    pfi BIGINT PRIMARY KEY,
    scheme_code TEXT,
    lga_code TEXT,
    lga TEXT,
    zone_code TEXT NOT NULL,
    zone_description TEXT,
    geom geometry(MultiPolygon, 4326) NOT NULL,
    source_version TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);
await sql.query("CREATE INDEX IF NOT EXISTS idx_heritage_overlays_geom ON heritage_overlays USING GIST (geom)");
await sql.query("CREATE INDEX IF NOT EXISTS idx_heritage_overlays_zone_code ON heritage_overlays (zone_code)");

const batchSize = 50;
for (let offset = 0; offset < validFeatures.length; offset += batchSize) {
  const batch = validFeatures.slice(offset, offset + batchSize);
  const values = [];
  const tuples = batch.map((feature, index) => {
    const p = feature.properties;
    const base = index * 8;
    values.push(
      Number(p.pfi),
      p.scheme_code || null,
      p.lga_code || null,
      p.lga || null,
      p.zone_code,
      p.zone_description || null,
      JSON.stringify(feature.geometry),
      artifact.metadata?.generatedAt || new Date().toISOString(),
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},ST_Multi(ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON($${base + 7}),4326),0.00001)),'vicplan-ho-melbourne-v1',$${base + 8})`;
  });
  await sql.query(`
    INSERT INTO heritage_overlays
      (pfi,scheme_code,lga_code,lga,zone_code,zone_description,geom,source_version,fetched_at)
    VALUES ${tuples.join(",")}
    ON CONFLICT (pfi) DO UPDATE SET
      scheme_code=EXCLUDED.scheme_code,
      lga_code=EXCLUDED.lga_code,
      lga=EXCLUDED.lga,
      zone_code=EXCLUDED.zone_code,
      zone_description=EXCLUDED.zone_description,
      geom=EXCLUDED.geom,
      source_version=EXCLUDED.source_version,
      fetched_at=EXCLUDED.fetched_at
  `, values);
  console.log(`[heritage-import] ${Math.min(offset + batch.length, validFeatures.length)}/${validFeatures.length}`);
}

const result = await sql.query(`
  SELECT COUNT(*)::int AS rows,
         pg_total_relation_size('heritage_overlays')::bigint AS bytes,
         pg_size_pretty(pg_total_relation_size('heritage_overlays')) AS size
  FROM heritage_overlays
`);
console.log(JSON.stringify(result.rows?.[0] || result[0], null, 2));
