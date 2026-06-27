#!/usr/bin/env node
/**
 * rebuild-planning-cache.mjs
 *
 * Phase B.2 — 高密度重建 planning_cache。
 *
 * 策略：0.002° grid（≈220m），Melbourne metro 核心区。
 * 批量 SQL 查询减少 round trip。
 *
 * 运行:
 *   node scripts/rebuild-planning-cache.mjs
 *
 * 安全:
 *   - TRUNCATE + 重建（幂等）
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL required"); process.exit(1); }

// ── 纯函数 ──

const CATEGORY_MAP = {
  GRZ: { category: "residential", flexibility: "favourable" },
  NRZ: { category: "residential", flexibility: "constrained" },
  RGZ: { category: "residential", flexibility: "favourable" },
  LDRZ: { category: "residential", flexibility: "constrained" },
  RLZ: { category: "residential", flexibility: "constrained" },
  MUZ: { category: "mixed-use", flexibility: "favourable" },
  HCTZ: { category: "residential", flexibility: "favourable" },
  C1Z: { category: "commercial", flexibility: "mixed" },
  C2Z: { category: "commercial", flexibility: "mixed" },
  B1Z: { category: "commercial", flexibility: "mixed" },
  B2Z: { category: "commercial", flexibility: "mixed" },
  B3Z: { category: "commercial", flexibility: "mixed" },
  ACZ: { category: "commercial", flexibility: "mixed" },
  CCZ: { category: "commercial", flexibility: "mixed" },
  IN1Z: { category: "industrial", flexibility: "mixed" },
  IN2Z: { category: "industrial", flexibility: "mixed" },
  IN3Z: { category: "industrial", flexibility: "mixed" },
  UGZ: { category: "growth", flexibility: "favourable" },
  PDZ: { category: "growth", flexibility: "favourable" },
  DZ: { category: "mixed-use", flexibility: "favourable" },
  PPRZ: { category: "public", flexibility: "constrained" },
  PCRZ: { category: "public", flexibility: "constrained" },
  PUZ: { category: "public", flexibility: "constrained" },
  FZ: { category: "rural", flexibility: "constrained" },
  TZ: { category: "rural", flexibility: "mixed" },
  RAZ: { category: "rural", flexibility: "constrained" },
  RCZ: { category: "rural", flexibility: "constrained" },
  GWZ: { category: "rural", flexibility: "constrained" },
  GWAZ: { category: "rural", flexibility: "constrained" },
  SUZ: { category: "special", flexibility: "mixed" },
  UFZ: { category: "special", flexibility: "constrained" },
  CA: { category: "public", flexibility: "constrained" },
  PZ: { category: "special", flexibility: "constrained" },
};

const OVERLAY_CATEGORY = {
  HO: { category: "heritage", risk: "high" },
  DDO: { category: "design", risk: "medium" },
  SLO: { category: "landscape", risk: "medium" },
  BMO: { category: "bushfire", risk: "high" },
  SBO: { category: "flood", risk: "high" },
  LSIO: { category: "inundation", risk: "medium" },
  FO: { category: "floodway", risk: "high" },
  EMO: { category: "erosion", risk: "medium" },
  EAO: { category: "environmental-audit", risk: "high" },
  ESO: { category: "environmental-significance", risk: "medium" },
  DPO: { category: "development-plan", risk: "medium" },
  IPO: { category: "incorporated-plan", risk: "medium" },
  PAO: { category: "public-acquisition", risk: "high" },
  PBO: { category: "bushfire", risk: "high" },
  BFO: { category: "built-form", risk: "medium" },
  DCPO: { category: "development-contributions", risk: "low" },
  CLPO: { category: "transport-project", risk: "medium" },
  AEO: { category: "airport-environs", risk: "medium" },
  BAO: { category: "buffer-area", risk: "medium" },
};

const ZONE_PRECISION = {
  GRZ: { interpretation: "General residential zone - standard controls.", confidence: "moderate" },
  NRZ: { interpretation: "Neighbourhood residential zone - typically lower density.", confidence: "moderate" },
  RGZ: { interpretation: "Residential growth zone - higher density potential.", confidence: "moderate" },
  LDRZ: { interpretation: "Low density residential zone - large lot expectations.", confidence: "moderate" },
  MUZ: { interpretation: "Mixed-use zone - commercial/residential flexibility.", confidence: "moderate" },
  IN1Z: { interpretation: "General industrial zone - residential restricted.", confidence: "moderate" },
  C1Z: { interpretation: "Commercial 1 zone - neighbourhood activity centre.", confidence: "moderate" },
  UGZ: { interpretation: "Urban growth zone - future urban development.", confidence: "moderate" },
  PDZ: { interpretation: "Priority development zone - accelerated development intent.", confidence: "moderate" },
  DZ: { interpretation: "Development zone - planned development area.", confidence: "moderate" },
  PPRZ: { interpretation: "Public park and recreation zone - public land.", confidence: "moderate" },
  FZ: { interpretation: "Farming zone - agricultural/rural.", confidence: "moderate" },
  SUZ: { interpretation: "Special use zone - specific use controls.", confidence: "moderate" },
};

function resolveCategory(code, map) {
  if (!code) return null;
  if (map[code]) return map[code];
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of sorted) if (code.startsWith(key)) return map[key];
  return null;
}

function buildZoneResult(zone) {
  if (!zone) return null;
  const catInfo = resolveCategory(zone.zone_code, CATEGORY_MAP);
  const precisionKey = Object.keys(ZONE_PRECISION).find(k => zone.zone_code?.startsWith(k));
  const precision = ZONE_PRECISION[precisionKey] || { interpretation: "Planning zone identified.", confidence: "low" };
  return {
    code: zone.zone_code,
    name: zone.zone_description,
    category: catInfo?.category || "unknown",
    interpretation: precision.interpretation,
    confidence: precision.confidence,
    categoryInfo: catInfo,
  };
}

function buildOverlayResult(overlay) {
  if (!overlay) return null;
  const catInfo = resolveCategory(overlay.zone_code, OVERLAY_CATEGORY);
  return {
    code: overlay.zone_code,
    name: overlay.zone_description,
    category: catInfo?.category || "unknown",
    riskLevel: catInfo?.risk || "low",
  };
}

function determineConstraintLevel(zoneInfo, overlays) {
  if (!zoneInfo?.categoryInfo || ["public", "rural"].includes(zoneInfo.categoryInfo.category)) return "high";
  const hasHigh = overlays.some(o => o?.riskLevel === "high");
  if (hasHigh) return "high";
  const hasMed = overlays.some(o => o?.riskLevel === "medium");
  if (hasMed) return "medium";
  if (zoneInfo.categoryInfo.flexibility === "favourable") return "low";
  if (zoneInfo.categoryInfo.flexibility === "constrained") return "medium";
  return "low";
}

function determineFlexibilityHint(zoneInfo, overlays, constraint) {
  if (constraint === "high") return "constrained";
  if (zoneInfo?.categoryInfo?.flexibility === "favourable") return "favourable";
  return "mixed";
}

// ── 主流程 ──

async function main() {
  const sql = neon(DB_URL);

  // 参数
  const MIN_LAT = -38.2, MAX_LAT = -37.7;
  const MIN_LON = 144.8, MAX_LON = 145.3;
  const STEP = 0.002;
  const BATCH_SIZE = 200;

  // 生成 grid 点
  const allGridKeys = [];
  for (let lat = MIN_LAT; lat <= MAX_LAT + 0.0001; lat += STEP) {
    for (let lon = MIN_LON; lon <= MAX_LON + 0.0001; lon += STEP) {
      allGridKeys.push({
        lat: parseFloat(lat.toFixed(6)),
        lon: parseFloat(lon.toFixed(6)),
        key: `${lat.toFixed(4)}_${lon.toFixed(4)}`,
      });
    }
  }
  console.log(`[rebuild-cache] Metro grid: ${allGridKeys.length} points`);

  // TRUNCATE
  console.log(`[rebuild-cache] Truncating planning_cache...`);
  await sql`TRUNCATE planning_cache`;
  console.log(`[rebuild-cache] Truncated ✓`);

  let inserted = 0;
  let skippedNoZone = 0;

  for (let i = 0; i < allGridKeys.length; i += BATCH_SIZE) {
    const batch = allGridKeys.slice(i, i + BATCH_SIZE);

    // ── 批量查 zone ──
    const zoneParts = batch.map(p =>
      `SELECT ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326) as geom, '${p.key}' as key`
    );
    const zoneSQL = `
      WITH points AS (
        ${zoneParts.join('\n      UNION ALL\n      ')}
      )
      SELECT DISTINCT ON (p.key)
        p.key,
        z.zone_code,
        z.zone_description
      FROM points p
      LEFT JOIN vicplan_zones z ON ST_Contains(z.geom, p.geom)
      ORDER BY p.key
    `;
    let zoneRows;
    try {
      zoneRows = await sql.query(zoneSQL);
    } catch (e) {
      console.error(`  Zone batch query failed: ${e.message}`);
      continue;
    }

    // key → zone 映射
    const zoneMap = {};
    for (const r of zoneRows) {
      if (r.zone_code) zoneMap[r.key] = r;
    }

    // 只处理有 zone 的点
    const zoned = batch.filter(p => zoneMap[p.key]);

    // ── 批量查 overlay ──
    const overlayParts = zoned.map(p =>
      `SELECT ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326) as geom, '${p.key}' as key`
    );
    let overlayRows = [];
    if (overlayParts.length > 0) {
      const ovlSQL = `
        WITH points AS (
          ${overlayParts.join('\n      UNION ALL\n      ')}
        )
        SELECT p.key, o.zone_code, o.zone_description
        FROM points p
        JOIN vicplan_overlays o ON ST_Contains(o.geom, p.geom)
      `;
      try {
        overlayRows = await sql.query(ovlSQL);
      } catch (e) {
        console.error(`  Overlay batch query failed: ${e.message}`);
      }
    }

    // key → overlays 聚合
    const overlayMap = {};
    for (const r of overlayRows) {
      if (!overlayMap[r.key]) overlayMap[r.key] = [];
      overlayMap[r.key].push(r);
    }

    // ── 批量 INSERT ──
    const insertValues = [];
    for (const p of zoned) {
      const zoneRow = zoneMap[p.key];
      const zoneResult = buildZoneResult(zoneRow);
      if (!zoneResult) continue;

      const overlays = (overlayMap[p.key] || []).map(buildOverlayResult).filter(Boolean);
      const constraintLevel = determineConstraintLevel(zoneResult, overlays);
      const flexibilityHint = determineFlexibilityHint(zoneResult, overlays, constraintLevel);
      const overlaysJson = JSON.stringify(overlays.map(o => ({
        code: o.code, name: o.name, category: o.category, riskLevel: o.riskLevel,
      })));

      insertValues.push({
        key: p.key, lat: p.lat, lon: p.lon,
        zoneCode: zoneResult.code,
        zoneName: zoneResult.name,
        zoneCategory: zoneResult.category,
        zoneInterpretation: zoneResult.interpretation,
        zoneConfidence: zoneResult.confidence,
        overlaysJson,
        constraintLevel,
        flexibilityHint,
        manualReview: zoneResult.confidence === "low" || constraintLevel === "high",
      });
    }

    if (insertValues.length > 0) {
      // 用 sql.query 执行 VALUES INSERT
      const valCases = insertValues.map(v => {
        const ovl = v.overlaysJson.replace(/'/g, "''");
        return `('${v.key}', ${v.lat}, ${v.lon}, ` +
          `${v.zoneCode ? `'${v.zoneCode.replace(/'/g, "''")}'` : 'NULL'}, ` +
          `${v.zoneName ? `'${v.zoneName.replace(/'/g, "''")}'` : 'NULL'}, ` +
          `${v.zoneCategory ? `'${v.zoneCategory.replace(/'/g, "''")}'` : 'NULL'}, ` +
          `${v.zoneInterpretation ? `'${v.zoneInterpretation.replace(/'/g, "''")}'` : 'NULL'}, ` +
          `${v.zoneConfidence ? `'${v.zoneConfidence.replace(/'/g, "''")}'` : 'NULL'}, ` +
          `'${ovl}'::jsonb, ` +
          `'${v.constraintLevel}', '${v.flexibilityHint}', ${v.manualReview})`;
      });
      const insertSQL = `
        INSERT INTO planning_cache (lat_lon_key, latitude, longitude, zone_code, zone_name, zone_category, zone_interpretation, zone_confidence, overlays, constraint_level, flexibility_hint, manual_review_required)
        VALUES ${valCases.join(', ')}
        ON CONFLICT (lat_lon_key) DO NOTHING
      `;
      try {
        await sql.query(insertSQL);
      } catch (e) {
        console.error(`  INSERT batch failed: ${e.message}`);
      }
    }

    inserted += insertValues.length;
    skippedNoZone += batch.length - zoned.length;

    const pct = ((i + batch.length) / allGridKeys.length * 100).toFixed(1);
    console.log(`[rebuild-cache] ${i + batch.length}/${allGridKeys.length} (${pct}%) — inserted: ${inserted}, skipped(no-zone): ${skippedNoZone}`);
  }

  const finalCount = await sql`SELECT COUNT(*) as c FROM planning_cache`;
  console.log(`\n[rebuild-cache] ✅ Complete`);
  console.log(`[rebuild-cache] planning_cache rows: ${finalCount[0].c}`);
  console.log(`[rebuild-cache] Inserted this run: ${inserted}`);
  console.log(`[rebuild-cache] Skipped (no zone): ${skippedNoZone}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
