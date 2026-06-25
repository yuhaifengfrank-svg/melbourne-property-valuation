#!/usr/bin/env node
/**
 * build-planning-cache.mjs
 *
 * Phase B.1+B.2: 预计算 planning cache。
 *
 * 遍历 comparable_sales 中所有有坐标的记录 (4dp ≈ 11m 精度去重)，
 * 对每个坐标点跑 ST_Contains 查询 vicplan_zones / vicplan_overlays，
 * 跑完纯函数处理，写入 planning_cache 表。
 *
 * 之后 API 先查 planning_cache，miss 才走实时 ST_Contains。
 *
 * 安全：
 *   - 只读 comparable_sales, vicplan_zones, vicplan_overlays
 *   - 只写 planning_cache (INSERT ON CONFLICT)
 *   - 不会修改已有数据
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const BATCH_SIZE = 20;   // 每次处理的坐标点数
const PAGE_SIZE = 100;   // 每页从 comparable_sales 取多少

// ── 纯函数（从 planning-signal-service.js 复制的核心逻辑）──

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
  GRZ: { interpretation: "General residential zone — standard controls.", confidence: "moderate" },
  NRZ: { interpretation: "Neighbourhood residential zone — typically lower density.", confidence: "moderate" },
  RGZ: { interpretation: "Residential growth zone — higher density potential.", confidence: "moderate" },
  LDRZ: { interpretation: "Low density residential zone — large lot expectations.", confidence: "moderate" },
  MUZ: { interpretation: "Mixed-use zone — commercial/residential flexibility.", confidence: "moderate" },
  IN1Z: { interpretation: "General industrial zone — residential restricted.", confidence: "moderate" },
  IN2Z: { interpretation: "Industrial 2 zone — specialised industrial uses.", confidence: "moderate" },
  IN3Z: { interpretation: "Industrial 3 zone — light industrial.", confidence: "moderate" },
  C1Z: { interpretation: "Commercial 1 zone — neighbourhood activity centre.", confidence: "moderate" },
  UGZ: { interpretation: "Urban growth zone — future urban development.", confidence: "moderate" },
  PDZ: { interpretation: "Priority development zone — accelerated development intent.", confidence: "moderate" },
  DZ: { interpretation: "Development zone — planned development area.", confidence: "moderate" },
  PPRZ: { interpretation: "Public park and recreation zone — public land.", confidence: "moderate" },
  FZ: { interpretation: "Farming zone — agricultural/rural.", confidence: "moderate" },
  SUZ: { interpretation: "Special use zone — specific use controls.", confidence: "moderate" },
};

function resolveCategory(code, map) {
  if (!code || typeof code !== "string") return null;
  if (map[code]) return map[code];
  const sorted = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (code.startsWith(key)) return map[key];
  }
  return null;
}

function buildZoneResult(zone) {
  if (!zone) return null;
  const catInfo = resolveCategory(zone.zone_code, CATEGORY_MAP);
  const precision = ZONE_PRECISION[zone.zone_code] || ZONE_PRECISION[
    Object.keys(ZONE_PRECISION).find(k => zone.zone_code?.startsWith(k))
  ];
  return {
    code: zone.zone_code,
    name: zone.zone_description,
    category: catInfo?.category || "unknown",
    interpretation: precision?.interpretation || "Planning zone identified.",
    confidence: precision?.confidence || "low",
    categoryInfo: catInfo,
  };
}

function buildOverlayResult(overlay) {
  if (!overlay || !overlay.zone_code) return null;
  const catInfo = resolveCategory(overlay.zone_code, OVERLAY_CATEGORY);
  return {
    code: overlay.zone_code,
    name: overlay.zone_description,
    category: catInfo?.category || "unknown",
    riskLevel: catInfo?.risk || "low",
    interpretation: catInfo ? null : "Overlay identified.",
  };
}

function determineConstraintLevel(zoneInfo, overlays) {
  if (!zoneInfo?.categoryInfo || ["public", "rural"].includes(zoneInfo.categoryInfo.category)) {
    return "high";
  }
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
  console.log(`[build-cache] Starting planning cache build...`);

  // Step 1: 获取所有 unique 坐标点 (4dp ≈ 11m 精度去重)
  const allCoords = await sql`
    SELECT DISTINCT
      ROUND(lat::numeric, 4) AS lat,
      ROUND(lon::numeric, 4) AS lon
    FROM comparable_sales
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY lat, lon
  `;
  const totalPoints = allCoords.length;
  console.log(`[build-cache] Total unique points: ${totalPoints}`);

  let processed = 0;
  let cached = 0;
  let skipped = 0;

  for (let i = 0; i < totalPoints; i += BATCH_SIZE) {
    const batch = allCoords.slice(i, i + BATCH_SIZE);

    for (const pt of batch) {
      const lat = parseFloat(pt.lat);
      const lon = parseFloat(pt.lon);
      const key = `${lat.toFixed(4)}_${lon.toFixed(4)}`;

      // 先检查是否已存在
      const existing = await sql`SELECT lat_lon_key FROM planning_cache WHERE lat_lon_key = ${key}`;
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // 查 zone
      const zones = await sql`
        SELECT zone_code, zone_description
        FROM vicplan_zones
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
        LIMIT 1
      `;

      // 查 overlays
      const overlaysRaw = await sql`
        SELECT zone_code, zone_description
        FROM vicplan_overlays
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
      `;

      const zoneResult = buildZoneResult(zones[0] || null);
      const overlayResults = overlaysRaw.map(buildOverlayResult).filter(Boolean);
      const constraintLevel = determineConstraintLevel(zoneResult, overlayResults);
      const flexibilityHint = determineFlexibilityHint(zoneResult, overlayResults, constraintLevel);

      const overlaysJson = JSON.stringify(overlayResults.map(o => ({
        code: o.code,
        name: o.name,
        category: o.category,
        interpretation: o.interpretation,
        riskLevel: o.riskLevel,
      })));

      await sql`
        INSERT INTO planning_cache (
          lat_lon_key, latitude, longitude,
          zone_code, zone_name, zone_category, zone_interpretation, zone_confidence,
          overlays, constraint_level, flexibility_hint, manual_review_required
        ) VALUES (
          ${key}, ${lat}, ${lon},
          ${zoneResult?.code || null}, ${zoneResult?.name || null},
          ${zoneResult?.category || null}, ${zoneResult?.interpretation || null},
          ${zoneResult?.confidence || null},
          ${overlaysJson}::jsonb,
          ${constraintLevel}, ${flexibilityHint},
          ${zoneResult?.confidence === "low" || constraintLevel === "high"}
        )
        ON CONFLICT (lat_lon_key) DO UPDATE SET
          zone_code = EXCLUDED.zone_code,
          zone_name = EXCLUDED.zone_name,
          zone_category = EXCLUDED.zone_category,
          zone_interpretation = EXCLUDED.zone_interpretation,
          zone_confidence = EXCLUDED.zone_confidence,
          overlays = EXCLUDED.overlays,
          constraint_level = EXCLUDED.constraint_level,
          flexibility_hint = EXCLUDED.flexibility_hint,
          manual_review_required = EXCLUDED.manual_review_required,
          generated_at = NOW()
      `;

      cached++;
    }

    processed += batch.length;
    const pct = ((processed / totalPoints) * 100).toFixed(1);
    console.log(`[build-cache] ${processed}/${totalPoints} (${pct}%) — cached: ${cached}, skipped: ${skipped}`);
  }

  console.log(`[build-cache] ✅ Complete: ${totalPoints} unique points`);
  console.log(`[build-cache]    Cached: ${cached}, Skipped (already existed): ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
