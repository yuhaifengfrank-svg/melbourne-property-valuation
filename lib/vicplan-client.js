/**
 * vicplan-client.js — Vicmap Planning WFS 数据摄入
 *
 * 从 opendata.maps.vic.gov.au WFS 下载 Zone / Overlay 并存入 PostGIS
 *
 * 使用 sql.query() 做批次插入（sql.unsafe() 在此版本 @neondatabase/serverless 中无效）
 *
 * 使用:
 *   import { neon } from "@neondatabase/serverless";
 *   const sql = neon(process.env.DATABASE_URL);
 *   await fetchPlanZones(sql);
 *   await fetchPlanOverlays(sql);
 *   await fetchAllVicplan(sql);
 */

const WFS_BASE = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const PAGE_SIZE = 2000;
const DB_BATCH = 50;

function esc(val) {
  if (val == null) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escNum(val) {
  if (val == null) return "NULL";
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : "NULL";
}

function escDate(val) {
  if (val == null) return "NULL";
  return `${esc(val)}::timestamptz`;
}

function escGeom(geom) {
  return `ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(geom).replace(/'/g, "''")}'), 4326)`;
}

// ── WFS 分页下载 ──

async function fetchAllFeatures(typeName, pageSize = PAGE_SIZE) {
  let allFeatures = [];
  let startIndex = 0;
  let totalFeatures = Infinity;

  while (startIndex < totalFeatures) {
    const url = `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}&count=${pageSize}&startIndex=${startIndex}&outputFormat=application/json&srsName=EPSG:4326`;

    const resp = await fetch(url, {
      headers: { "User-Agent": "AusHomeValue/1.0 (property valuation system)" },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`WFS error ${resp.status} at startIndex=${startIndex}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    const features = data.features || [];
    totalFeatures = data.totalFeatures ?? features.length;

    allFeatures = allFeatures.concat(features);
    startIndex += pageSize;

    console.log(`[vicplan] Fetched ${allFeatures.length}/${totalFeatures} from ${typeName}`);

    await new Promise((r) => setTimeout(r, 100));
  }

  return { typeName, features: allFeatures, total: allFeatures.length };
}

// ── 批量 upsert ──

function toValueRow(f) {
  const p = f.properties || {};
  const cols = [
    p.pfi,
    esc(p.scheme_code),
    esc(p.lga_code),
    esc(p.lga),
    escNum(p.zone_num),
    esc(p.zone_status),
    esc(p.zone_code),
    esc(p.zone_description),
    escDate(p.gaz_begin_date),
    escNum(p.ufi),
    escGeom(f.geometry),
    "NOW()",
  ];
  return `(${cols.join(", ")})`;
}

async function batchedUpsert(sql, table, features) {
  let total = 0;
  const cols = "pfi, scheme_code, lga_code, lga, zone_num, zone_status, zone_code, zone_description, gaz_begin_date, ufi, geom, fetched_at";

  for (let i = 0; i < features.length; i += DB_BATCH) {
    const batch = features.slice(i, i + DB_BATCH);
    const valueRows = batch.map(toValueRow);

    const query = `
      INSERT INTO ${table} (${cols})
      VALUES ${valueRows.join(",\n")}
      ON CONFLICT (pfi) DO UPDATE SET
        scheme_code = EXCLUDED.scheme_code,
        lga_code = EXCLUDED.lga_code,
        lga = EXCLUDED.lga,
        zone_num = EXCLUDED.zone_num,
        zone_status = EXCLUDED.zone_status,
        zone_code = EXCLUDED.zone_code,
        zone_description = EXCLUDED.zone_description,
        gaz_begin_date = EXCLUDED.gaz_begin_date,
        ufi = EXCLUDED.ufi,
        geom = EXCLUDED.geom,
        fetched_at = NOW()
    `;

    try {
      await sql.query(query);
      total += batch.length;
    } catch (e) {
      console.error(`[vicplan] Batch error at ${total}–${total + batch.length}: ${e.message}`);
      // fallback: per-row
      for (const f of batch) {
        try {
          await sql.query(`
            INSERT INTO ${table} (${cols})
            VALUES (${toValueRow(f)})
            ON CONFLICT (pfi) DO UPDATE SET
              scheme_code = EXCLUDED.scheme_code,
              lga_code = EXCLUDED.lga_code,
              lga = EXCLUDED.lga,
              zone_num = EXCLUDED.zone_num,
              zone_status = EXCLUDED.zone_status,
              zone_code = EXCLUDED.zone_code,
              zone_description = EXCLUDED.zone_description,
              gaz_begin_date = EXCLUDED.gaz_begin_date,
              ufi = EXCLUDED.ufi,
              geom = EXCLUDED.geom,
              fetched_at = NOW()
          `);
          total++;
        } catch (e2) {
          const pfi = f.properties?.pfi;
          console.error(`[vicplan] Skipping pfi=${pfi}: ${e2.message}`);
        }
      }
    }

    if (total % 1000 === 0 || total === features.length) {
      console.log(`[vicplan] DB ${table}: ${total}/${features.length}`);
    }
  }

  return total;
}

// ── Zone 导入 ──

export async function fetchPlanZones(sql) {
  console.log("[vicplan] Fetching zones...");
  const { features } = await fetchAllFeatures("open-data-platform:plan_zone");
  console.log(`[vicplan] Downloaded ${features.length} zones, inserting...`);
  const count = await batchedUpsert(sql, "vicplan_zones", features);
  console.log(`[vicplan] ✓ ${count} zones upserted`);
  return { table: "vicplan_zones", count };
}

// ── Overlay 导入 ──

export async function fetchPlanOverlays(sql) {
  console.log("[vicplan] Fetching overlays...");
  const { features } = await fetchAllFeatures("open-data-platform:plan_overlay");
  console.log(`[vicplan] Downloaded ${features.length} overlays, inserting...`);
  const count = await batchedUpsert(sql, "vicplan_overlays", features);
  console.log(`[vicplan] ✓ ${count} overlays upserted`);
  return { table: "vicplan_overlays", count };
}

// ── 全量导入 ──

export async function fetchAllVicplan(sql) {
  const start = Date.now();
  const results = await Promise.all([
    fetchPlanZones(sql),
    fetchPlanOverlays(sql),
  ]);
  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`[vicplan] ✓ All done in ${elapsed}min: ${results.map(r => `${r.table}=${r.count}`).join(", ")}`);
  return results;
}
