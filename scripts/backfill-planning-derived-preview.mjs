#!/usr/bin/env node
/**
 * Phase 1 — Preview-only planning derived backfill.
 *
 * Purpose:
 *   Populate lightweight derived planning tables from VicPlan source tables:
 *   - suburb_planning_summary
 *   - data_source_registry
 *
 * Safety:
 *   - Dry-run by default.
 *   - --apply writes only after host guard passes.
 *   - Refuses the known production/main Neon endpoint.
 *   - No DROP/TRUNCATE/DELETE.
 *   - Does not log DATABASE_URL or row-level source data.
 *
 * Scope note:
 *   This is an LGA-level approximation for suburb summaries. It does not replace
 *   property-level point-in-polygon checks for paid reports.
 */

import { neon } from "@neondatabase/serverless";

const PROD_HOST_TOKEN = "ep-winter-band-a7qym6bq";
const SOURCE_VERSION = "vicplan_lga_approx_v1";
const REQUIRED_TABLE_COLUMNS = {
  vicplan_zones: ["lga", "zone_code"],
  vicplan_overlays: ["lga", "zone_code"],
  school_locations: ["state", "suburb", "lga_name"],
  comparable_sales: ["state", "suburb", "lat", "lon"],
  suburb_planning_summary: [
    "suburb",
    "state",
    "lga",
    "dominant_zone_code",
    "dominant_zone_category",
    "dominant_zone_flexibility",
    "overlay_count",
    "overlay_codes",
    "has_design_overlay",
    "has_flood_overlay",
    "has_bushfire_overlay",
    "has_environment_overlay",
    "has_development_plan_overlay",
    "heritage_status",
    "planning_constraint_level",
    "redevelopment_flexibility_score",
    "manual_review_required",
    "source_key",
    "source_version",
    "derived_at",
    "updated_at",
  ],
  data_source_registry: [
    "source_key",
    "source_name",
    "source_type",
    "source_version",
    "processed_at",
    "coverage_area",
    "row_count",
    "notes",
    "updated_at",
  ],
};

const DB_URL_SOURCE = process.env.DATABASE_URL;
if (!DB_URL_SOURCE) {
  console.error("DATABASE_URL is not configured");
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

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
  console.error(`BACKFILL_REFUSED code=${err.message || "INVALID_TARGET"}`);
  process.exit(1);
}

const sql = neon(DB_URL_SOURCE);

console.log("=".repeat(64));
console.log("  Phase 1 — Preview Planning Derived Backfill");
console.log("=".repeat(64));
console.log(`  Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
console.log(`  Target host: ${target.host}`);
console.log(`  Database: ${target.database}`);
console.log("=".repeat(64));

async function tableExists(tableName) {
  const rows = await sql`
    SELECT to_regclass(${`public.${tableName}`}) AS table_name
  `;
  return rows[0]?.table_name === tableName;
}

async function getColumns(tableName) {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `;
  return new Set(rows.map((row) => row.column_name));
}

async function requireSchema() {
  const required = Object.keys(REQUIRED_TABLE_COLUMNS);
  const missing = [];
  const missingColumns = [];
  for (const table of required) {
    if (!(await tableExists(table))) {
      missing.push(table);
      continue;
    }
    const columns = await getColumns(table);
    const requiredColumns = REQUIRED_TABLE_COLUMNS[table] || [];
    const absent = requiredColumns.filter((col) => !columns.has(col));
    if (absent.length) {
      missingColumns.push({ table, columns: absent });
    }
  }
  if (missing.length) {
    console.error(`MISSING_TABLES count=${missing.length} tables=${missing.join(",")}`);
    process.exit(1);
  }
  if (missingColumns.length) {
    for (const item of missingColumns) {
      console.error(`MISSING_COLUMNS table=${item.table} columns=${item.columns.join(",")}`);
    }
    process.exit(1);
  }
}

async function collectStats() {
  const [
    zones,
    overlays,
    mappedPairs,
    schoolPairs,
    comparablePairs,
    existingSummary,
    existingRegistry,
    dominantLgas,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM vicplan_zones`,
    sql`SELECT COUNT(*)::int AS count FROM vicplan_overlays`,
    sql`
      WITH school_suburbs AS (
        SELECT DISTINCT
          upper(trim(suburb)) AS suburb,
          'VIC' AS state,
          upper(trim(lga_name)) AS lga
        FROM school_locations
        WHERE state = 'VIC'
          AND suburb IS NOT NULL
          AND lga_name IS NOT NULL
      ),
      comp_centroids AS (
        SELECT
          upper(trim(suburb)) AS suburb,
          'VIC' AS state,
          AVG(lat)::float AS lat,
          AVG(lon)::float AS lon
        FROM comparable_sales
        WHERE state = 'VIC'
          AND suburb IS NOT NULL
          AND lat IS NOT NULL
          AND lon IS NOT NULL
        GROUP BY upper(trim(suburb))
      ),
      comp_suburbs AS (
        SELECT DISTINCT
          c.suburb,
          c.state,
          upper(trim(z.lga)) AS lga
        FROM comp_centroids c
        JOIN vicplan_zones z
          ON ST_Contains(z.geom, ST_SetSRID(ST_Point(c.lon, c.lat), 4326))
        WHERE z.lga IS NOT NULL
      ),
      mapped AS (
        SELECT suburb, state, lga FROM school_suburbs
        UNION
        SELECT suburb, state, lga FROM comp_suburbs
      )
      SELECT COUNT(*)::int AS count FROM mapped
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT upper(trim(suburb)) AS suburb, upper(trim(lga_name)) AS lga
        FROM school_locations
        WHERE state = 'VIC'
          AND suburb IS NOT NULL
          AND lga_name IS NOT NULL
      ) s
    `,
    sql`
      WITH comp_centroids AS (
        SELECT
          upper(trim(suburb)) AS suburb,
          AVG(lat)::float AS lat,
          AVG(lon)::float AS lon
        FROM comparable_sales
        WHERE state = 'VIC'
          AND suburb IS NOT NULL
          AND lat IS NOT NULL
          AND lon IS NOT NULL
        GROUP BY upper(trim(suburb))
      )
      SELECT COUNT(DISTINCT c.suburb)::int AS count
      FROM comp_centroids c
      JOIN vicplan_zones z
        ON ST_Contains(z.geom, ST_SetSRID(ST_Point(c.lon, c.lat), 4326))
      WHERE z.lga IS NOT NULL
    `,
    sql`SELECT COUNT(*)::int AS count FROM suburb_planning_summary`,
    sql`SELECT COUNT(*)::int AS count FROM data_source_registry`,
    sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT upper(trim(lga)) AS lga
        FROM vicplan_zones
        WHERE lga IS NOT NULL
      ) z
    `,
  ]);

  return {
    zones: zones[0]?.count || 0,
    overlays: overlays[0]?.count || 0,
    mappedPairs: mappedPairs[0]?.count || 0,
    schoolPairs: schoolPairs[0]?.count || 0,
    comparablePairs: comparablePairs[0]?.count || 0,
    existingSummary: existingSummary[0]?.count || 0,
    existingRegistry: existingRegistry[0]?.count || 0,
    dominantLgas: dominantLgas[0]?.count || 0,
  };
}

function printStats(stats) {
  console.log("\n--- Input / target scope ---");
  console.log(`vicplan_zones rows:          ${stats.zones}`);
  console.log(`vicplan_overlays rows:       ${stats.overlays}`);
  console.log(`Mapped VIC suburb/LGA pairs: ${stats.mappedPairs}`);
  console.log(`  from schools:              ${stats.schoolPairs}`);
  console.log(`  from comparable points:    ${stats.comparablePairs}`);
  console.log(`VicPlan LGAs with zones:     ${stats.dominantLgas}`);
  console.log("\n--- Existing derived rows ---");
  console.log(`suburb_planning_summary:     ${stats.existingSummary}`);
  console.log(`data_source_registry:        ${stats.existingRegistry}`);
}

async function applyBackfill() {
  const processedAt = new Date().toISOString();

  const registryQueries = [
    sql`
      INSERT INTO data_source_registry (
        source_key, source_name, source_type, source_version,
        processed_at, coverage_area, row_count, notes, updated_at
      )
      SELECT
        'vicplan_zones',
        'VicPlan zones',
        'gis',
        ${SOURCE_VERSION},
        ${processedAt},
        'Victoria',
        COUNT(*)::int,
        'Stored in Neon source layer; derived suburb summary uses LGA approximation.',
        ${processedAt}
      FROM vicplan_zones
      ON CONFLICT (source_key) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_type = EXCLUDED.source_type,
        source_version = EXCLUDED.source_version,
        processed_at = EXCLUDED.processed_at,
        coverage_area = EXCLUDED.coverage_area,
        row_count = EXCLUDED.row_count,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
    `,
    sql`
      INSERT INTO data_source_registry (
        source_key, source_name, source_type, source_version,
        processed_at, coverage_area, row_count, notes, updated_at
      )
      SELECT
        'vicplan_overlays',
        'VicPlan overlays',
        'gis',
        ${SOURCE_VERSION},
        ${processedAt},
        'Victoria',
        COUNT(*)::int,
        'Stored in Neon source layer; Heritage Overlay data remains limited unless HO-specific source is imported.',
        ${processedAt}
      FROM vicplan_overlays
      ON CONFLICT (source_key) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_type = EXCLUDED.source_type,
        source_version = EXCLUDED.source_version,
        processed_at = EXCLUDED.processed_at,
        coverage_area = EXCLUDED.coverage_area,
        row_count = EXCLUDED.row_count,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
    `,
    sql`
      INSERT INTO data_source_registry (
        source_key, source_name, source_type, source_version,
        processed_at, coverage_area, notes, updated_at
      )
      VALUES (
        'suburb_planning_summary',
        'Suburb planning summary derived table',
        'planning',
        ${SOURCE_VERSION},
        ${processedAt},
        'Victoria',
        'Derived from VicPlan zones and overlays. Uses LGA-level approximation; point-level planning checks remain authoritative for individual properties.',
        ${processedAt}
      )
      ON CONFLICT (source_key) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_type = EXCLUDED.source_type,
        source_version = EXCLUDED.source_version,
        processed_at = EXCLUDED.processed_at,
        coverage_area = EXCLUDED.coverage_area,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
    `,
  ];

  const summaryQuery = sql`
    WITH school_suburbs AS (
      SELECT DISTINCT
        initcap(lower(trim(suburb))) AS suburb,
        'VIC' AS state,
        upper(trim(lga_name)) AS lga
      FROM school_locations
      WHERE state = 'VIC'
        AND suburb IS NOT NULL
        AND lga_name IS NOT NULL
    ),
    comp_centroids AS (
      SELECT
        initcap(lower(trim(suburb))) AS suburb,
        'VIC' AS state,
        AVG(lat)::float AS lat,
        AVG(lon)::float AS lon
      FROM comparable_sales
      WHERE state = 'VIC'
        AND suburb IS NOT NULL
        AND lat IS NOT NULL
        AND lon IS NOT NULL
      GROUP BY initcap(lower(trim(suburb)))
    ),
    comp_suburbs AS (
      SELECT DISTINCT ON (c.suburb, c.state)
        c.suburb,
        c.state,
        upper(trim(z.lga)) AS lga
      FROM comp_centroids c
      JOIN vicplan_zones z
        ON ST_Contains(z.geom, ST_SetSRID(ST_Point(c.lon, c.lat), 4326))
      WHERE z.lga IS NOT NULL
      ORDER BY c.suburb, c.state, upper(trim(z.lga))
    ),
    suburb_lga AS (
      SELECT suburb, state, lga FROM school_suburbs
      UNION
      SELECT suburb, state, lga FROM comp_suburbs
    ),
    zone_features AS (
      SELECT
        upper(trim(lga)) AS lga,
        upper(trim(zone_code)) AS zone_code,
        COUNT(*)::int AS feature_count
      FROM vicplan_zones
      WHERE lga IS NOT NULL
        AND zone_code IS NOT NULL
      GROUP BY upper(trim(lga)), upper(trim(zone_code))
    ),
    dominant_zone AS (
      SELECT DISTINCT ON (lga)
        lga,
        zone_code,
        CASE
          WHEN zone_code LIKE 'GRZ%' OR zone_code LIKE 'NRZ%' OR zone_code LIKE 'RGZ%' OR zone_code LIKE 'LDRZ%' OR zone_code LIKE 'RLZ%' THEN 'residential'
          WHEN zone_code LIKE 'MUZ%' OR zone_code LIKE 'DZ%' THEN 'mixed-use'
          WHEN zone_code LIKE 'UGZ%' OR zone_code LIKE 'PDZ%' THEN 'growth'
          WHEN zone_code LIKE 'C1Z%' OR zone_code LIKE 'C2Z%' OR zone_code LIKE 'CCZ%' THEN 'commercial'
          WHEN zone_code LIKE 'IN1Z%' OR zone_code LIKE 'IN2Z%' OR zone_code LIKE 'IN3Z%' THEN 'industrial'
          WHEN zone_code LIKE 'FZ%' OR zone_code LIKE 'TZ%' THEN 'rural'
          WHEN zone_code LIKE 'PZ%' OR zone_code LIKE 'PUZ%' THEN 'public'
          ELSE 'unknown'
        END AS zone_category,
        CASE
          WHEN zone_code LIKE 'GRZ%' OR zone_code LIKE 'NRZ%' OR zone_code LIKE 'RGZ%' OR zone_code LIKE 'LDRZ%' OR zone_code LIKE 'RLZ%' OR zone_code LIKE 'MUZ%' OR zone_code LIKE 'UGZ%' OR zone_code LIKE 'PDZ%' THEN 'favourable'
          WHEN zone_code LIKE 'FZ%' OR zone_code LIKE 'TZ%' OR zone_code LIKE 'PZ%' OR zone_code LIKE 'PUZ%' THEN 'constrained'
          ELSE 'mixed'
        END AS zone_flexibility
      FROM zone_features
      ORDER BY lga, feature_count DESC, zone_code ASC
    ),
    overlay_features AS (
      SELECT
        upper(trim(lga)) AS lga,
        upper(trim(zone_code)) AS overlay_code,
        CASE
          WHEN upper(trim(zone_code)) LIKE 'DDO%' THEN 'design'
          WHEN upper(trim(zone_code)) LIKE 'SBO%' OR upper(trim(zone_code)) LIKE 'LSIO%' OR upper(trim(zone_code)) LIKE 'FO%' OR upper(trim(zone_code)) LIKE 'FWO%' THEN 'flood'
          WHEN upper(trim(zone_code)) LIKE 'BMO%' THEN 'bushfire'
          WHEN upper(trim(zone_code)) LIKE 'ESO%' OR upper(trim(zone_code)) LIKE 'EAO%' OR upper(trim(zone_code)) LIKE 'VPO%' THEN 'environment'
          WHEN upper(trim(zone_code)) LIKE 'DPO%' OR upper(trim(zone_code)) LIKE 'DCPO%' THEN 'development-plan'
          WHEN upper(trim(zone_code)) LIKE 'HO%' THEN 'heritage'
          ELSE 'other'
        END AS overlay_category
      FROM vicplan_overlays
      WHERE lga IS NOT NULL
        AND zone_code IS NOT NULL
    ),
    overlay_lga AS (
      SELECT
        lga,
        COUNT(DISTINCT overlay_code)::int AS overlay_count,
        array_agg(DISTINCT overlay_code ORDER BY overlay_code) AS overlay_codes,
        BOOL_OR(overlay_category = 'design') AS has_design_overlay,
        BOOL_OR(overlay_category = 'flood') AS has_flood_overlay,
        BOOL_OR(overlay_category = 'bushfire') AS has_bushfire_overlay,
        BOOL_OR(overlay_category = 'environment') AS has_environment_overlay,
        BOOL_OR(overlay_category = 'development-plan') AS has_development_plan_overlay,
        BOOL_OR(overlay_category = 'heritage') AS has_heritage_overlay
      FROM overlay_features
      GROUP BY lga
    ),
    derived AS (
      SELECT
        s.suburb,
        s.state,
        s.lga,
        dz.zone_code,
        dz.zone_category,
        dz.zone_flexibility,
        COALESCE(ol.overlay_count, 0) AS overlay_count,
        ol.overlay_codes,
        COALESCE(ol.has_design_overlay, false) AS has_design_overlay,
        COALESCE(ol.has_flood_overlay, false) AS has_flood_overlay,
        COALESCE(ol.has_bushfire_overlay, false) AS has_bushfire_overlay,
        COALESCE(ol.has_environment_overlay, false) AS has_environment_overlay,
        COALESCE(ol.has_development_plan_overlay, false) AS has_development_plan_overlay,
        CASE WHEN COALESCE(ol.has_heritage_overlay, false) THEN 'partial' ELSE 'unknown' END AS heritage_status,
        CASE
          WHEN COALESCE(ol.has_flood_overlay, false) OR COALESCE(ol.has_bushfire_overlay, false) OR COALESCE(ol.has_environment_overlay, false) THEN 'high'
          WHEN COALESCE(ol.overlay_count, 0) > 0 OR dz.zone_flexibility = 'constrained' THEN 'medium'
          WHEN dz.zone_code IS NULL THEN 'unknown'
          ELSE 'low'
        END AS planning_constraint_level,
        GREATEST(-15, LEAST(15,
          CASE dz.zone_flexibility
            WHEN 'favourable' THEN 10
            WHEN 'mixed' THEN 3
            WHEN 'constrained' THEN -8
            ELSE 0
          END
          - CASE WHEN COALESCE(ol.has_flood_overlay, false) THEN 5 ELSE 0 END
          - CASE WHEN COALESCE(ol.has_bushfire_overlay, false) THEN 5 ELSE 0 END
          - CASE WHEN COALESCE(ol.has_environment_overlay, false) THEN 4 ELSE 0 END
          - CASE WHEN COALESCE(ol.has_development_plan_overlay, false) THEN 2 ELSE 0 END
        ))::int AS redevelopment_flexibility_score
      FROM suburb_lga s
      LEFT JOIN dominant_zone dz ON dz.lga = s.lga
      LEFT JOIN overlay_lga ol ON ol.lga = s.lga
    )
    INSERT INTO suburb_planning_summary (
      suburb, state, lga,
      dominant_zone_code, dominant_zone_category, dominant_zone_flexibility,
      overlay_count, overlay_codes,
      has_design_overlay, has_flood_overlay, has_bushfire_overlay,
      has_environment_overlay, has_development_plan_overlay,
      heritage_status, planning_constraint_level, redevelopment_flexibility_score,
      manual_review_required, source_key, source_version, derived_at, updated_at
    )
    SELECT
      suburb, state, lga,
      zone_code, zone_category, zone_flexibility,
      overlay_count, overlay_codes,
      has_design_overlay, has_flood_overlay, has_bushfire_overlay,
      has_environment_overlay, has_development_plan_overlay,
      heritage_status, planning_constraint_level, redevelopment_flexibility_score,
      true, 'suburb_planning_summary', ${SOURCE_VERSION}, ${processedAt}, ${processedAt}
    FROM derived
    ON CONFLICT (suburb, state) DO UPDATE SET
      lga = EXCLUDED.lga,
      dominant_zone_code = EXCLUDED.dominant_zone_code,
      dominant_zone_category = EXCLUDED.dominant_zone_category,
      dominant_zone_flexibility = EXCLUDED.dominant_zone_flexibility,
      overlay_count = EXCLUDED.overlay_count,
      overlay_codes = EXCLUDED.overlay_codes,
      has_design_overlay = EXCLUDED.has_design_overlay,
      has_flood_overlay = EXCLUDED.has_flood_overlay,
      has_bushfire_overlay = EXCLUDED.has_bushfire_overlay,
      has_environment_overlay = EXCLUDED.has_environment_overlay,
      has_development_plan_overlay = EXCLUDED.has_development_plan_overlay,
      heritage_status = EXCLUDED.heritage_status,
      planning_constraint_level = EXCLUDED.planning_constraint_level,
      redevelopment_flexibility_score = EXCLUDED.redevelopment_flexibility_score,
      manual_review_required = EXCLUDED.manual_review_required,
      source_key = EXCLUDED.source_key,
      source_version = EXCLUDED.source_version,
      derived_at = EXCLUDED.derived_at,
      updated_at = EXCLUDED.updated_at
  `;

  await sql.transaction([...registryQueries, summaryQuery]);
}

async function run() {
  await requireSchema();
  const before = await collectStats();
  printStats(before);

  if (!APPLY) {
    console.log("\nDRY_RUN_OK — no writes performed.");
    console.log("Run with --apply to populate Preview derived tables.");
    return;
  }

  console.log("\nApplying derived backfill to Preview...");
  await applyBackfill();
  const after = await collectStats();
  printStats(after);
  console.log("\nMIGRATION_012_DERIVED_BACKFILL_PREVIEW_OK");
}

run().catch((err) => {
  console.error(`BACKFILL_FAILED code=${err?.code || "unknown"}`);
  process.exit(1);
});
