#!/usr/bin/env node
/**
 * ingest-street-tree.mjs
 * 
 * Phase 1 — Download street tree data from all VIC councils into VM raw/
 * Phase 2 — Aggregate by suburb+street → street_tree_by_street.json
 * 
 * Usage: node scripts/ingest-street-tree.mjs [--phase 1|2]
 *   --phase 1: Download only (default if raw/ trees missing)
 *   --phase 2: Aggregate only (default if raw/ trees exist)
 *   --phase all: Both
 *
 * Env:
 *   DATA_GOV_API_KEY  (optional, not needed for data.gov.au)
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Allow override via env for VM runs
const RAW_DIR = process.env.RAW_DIR || resolve(__dirname, "..", "data", "street-tree-raw");
const OUTPUT_DIR = process.env.OUTPUT_DIR || resolve(__dirname, "..", "data");
const OUTPUT = resolve(OUTPUT_DIR, "street_tree_by_street.json");

// ── Council datasets (Melbourne metro + regional) ──
const DATASETS = [
  {
    id: "brimbank",
    council: "Brimbank City Council",
    url: "https://data.gov.au/geoserver/brimbank-street-trees/wfs?request=GetFeature&typeName=ckan_f918f178_90f5_4c9d_b15a_9447301a381e&outputFormat=json",
    description: "Brimbank Street Trees",
    mode: "wfs",
  },
  {
    id: "manningham",
    council: "Manningham City Council",
    url: "https://data.gov.au/geoserver/manningham-streettrees/wfs?request=GetFeature&typeName=ckan_1aef5123_24ff_4084_a0f1_a52ca71e9e99&outputFormat=json",
    description: "Manningham Street Trees",
    mode: "wfs",
  },
  {
    id: "glen_eira",
    council: "Glen Eira City Council",
    url: "https://data.gov.au/data/dataset/ed15e3ea-48dc-47d2-afa6-518e6f5276e1/resource/85c2d44c-8ccf-4a32-9881-872f1a511ef7/download/streetandparktrees.json",
    description: "Glen Eira Park and Street Trees",
    mode: "direct",
  },
  {
    id: "hobsons_bay",
    council: "Hobsons Bay City Council",
    url: "https://data.gov.au/data/dataset/80051ffe-04d5-4602-b15b-60e0d0e3d153/resource/ea1ec6fc-02bd-4e36-8e43-c990b6a9268d/download/hbcc_street_and_park_trees.json",
    description: "Hobsons Bay Street and Park Trees",
    mode: "direct",
  },
  {
    id: "yarra",
    council: "City of Yarra",
    url: "https://data.gov.au/data/dataset/f3c88ce7-504b-4ef7-907f-686037f7420c/resource/6e4186b0-3e00-48f9-a09c-cb60d1d0d49f/download/yarra-street-and-park-trees.geojson",
    description: "City of Yarra street and park trees",
    mode: "direct",
  },
  {
    id: "melbourne",
    council: "City of Melbourne",
    url: "https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/trees-with-species-and-dimensions-urban-forest/exports/geojson",
    description: "City of Melbourne Urban Forest (trees with species and dimensions)",
    mode: "direct",
  },
  {
    id: "wyndham",
    council: "Wyndham City Council",
    url: "https://data.gov.au/geoserver/wyndham-city-council-trees/wfs?request=GetFeature&typeName=ckan_87307c7b_b92c_48f1_841a_b5794dfb5322&outputFormat=json",
    description: "Wyndham City Council Trees",
    mode: "wfs",
  },
  {
    id: "port_phillip",
    council: "City of Port Phillip",
    url: "https://data.gov.au/data/dataset/6b72d22b-d824-4281-bd08-ab62e3c38415/resource/9b0d7d55-5267-464b-85d7-3d141d779bab/download/city-of-port-phillip-trees.geojson",
    description: "City of Port Phillip Trees",
    mode: "direct",
  },
  {
    id: "ballarat",
    council: "City of Ballarat",
    url: "https://data.gov.au/geoserver/ballarattrees/wfs?request=GetFeature&typeName=ckan_eabaee3f_a563_449b_a04a_1ec847566ea1&outputFormat=json",
    description: "Ballarat Trees",
    mode: "wfs",
  },
  // ══ More metro councils (need separate ArcGIS Hub detection) ══
  // Whitehorse  → https://data-whitehorse.opendata.arcgis.com/
  // Monash      → https://data-monash.opendata.arcgis.com/
  // Boroondara  → https://data-boroondara.opendata.arcgis.com/
  // Stonnington → https://data-stonnington.opendata.arcgis.com/
  // Bayside     → https://data-bayside.opendata.arcgis.com/
  // Darebin     → https://data-darebin.opendata.arcgis.com/
  // Knox        → knox.opendata.arcgis.com
  // Casey       → casey.opendata.arcgis.com
];

// ── Helpers ──

function log(msg) {
  const t = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${t}] ${msg}`);
}

async function download(url, outputPath) {
  log(`  → 下载 ${url}`);
  const resp = await fetch(url, {
    headers: { "User-Agent": "aushomevalue-etl/1.0" },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  const data = await resp.text();
  writeFileSync(outputPath, data, "utf-8");
  const mb = (Buffer.byteLength(data) / 1024 / 1024).toFixed(2);
  log(`  ✓ 完成 (${mb} MB): ${outputPath.split("/").pop()}`);
  return data;
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

// ── Phase 1: Download ──

async function phase1Download() {
  ensureDir(RAW_DIR);
  log(`开始下载 ${DATASETS.length} 个 council 的 street tree 数据...`);
  let success = 0;
  for (const ds of DATASETS) {
    const outPath = resolve(RAW_DIR, `${ds.id}.geojson`);
    if (existsSync(outPath)) {
      const size = statSync(outPath).size;
      log(`  已存在 ${outPath.split("/").pop()} (${(size/1024/1024).toFixed(2)} MB), 跳过`);
      success++;
      continue;
    }
    try {
      await download(ds.url, outPath);
      success++;
    } catch (err) {
      log(`  ✗ ${ds.id} 下载失败: ${err.message}`);
    }
  }
  log(`Phase 1 完成: ${success}/${DATASETS.length} 成功`);
  return success;
}

// ── Phase 2: Aggregate ──

function determineSuburb(feature, councilId) {
  // 各 council 数据中 suburb/location 字段名不同
  const props = feature.properties || {};
  const fields = ["suburb", "suburb_name", "locality", "location", "town", "municipality", "lga", "council"];
  for (const f of fields) {
    if (props[f] && typeof props[f] === "string" && props[f].trim()) {
      let val = props[f].trim().toUpperCase();
      // 去掉 "VIC" 后缀
      val = val.replace(/,?\s*VIC\s*$/, "").trim();
      if (val.length >= 2) return val;
    }
  }
  // Fallback: from point coordinates → reverse geocode not available
  // Will be marked as "UNKNOWN"
  return "UNKNOWN";
}

function determineStreet(feature) {
  const props = feature.properties || {};
  // 各 council 的 street/road 字段名不同
  const streetFields = [
    "street_name", "street", "road_name", "road", "location_description",
    "location_desc", "site_name", "feature_name"
  ];
  for (const f of streetFields) {
    if (props[f] && typeof props[f] === "string" && props[f].trim()) {
      return props[f].trim().toUpperCase();
    }
  }
  return null;
}

function getCoord(feature) {
  // Expects Point geometry
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  if (g.type === "MultiPoint" && g.coordinates.length > 0) return g.coordinates[0];
  return null;
}

function getDbh(feature) {
  const props = feature.properties || {};
  const dbhFields = [
    "dbh", "diameter_breast_height", "diameter_at_breast_height",
    "diameter", "dia_at_breast_height", "caliper", "trunk_diameter",
    "cbd", "diameter_breast_height_m"
  ];
  for (const f of dbhFields) {
    const v = props[f];
    if (v != null) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

function getHeight(feature) {
  const props = feature.properties || {};
  for (const f of ["height", "tree_height", "height_m", "approx_height", "height_range"]) {
    const v = props[f];
    if (v != null) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

function getGenus(feature) {
  const props = feature.properties || {};
  for (const f of ["genus", "botanical_name", "scientific_name", "species", "common_name", "botanicalname", "commonname", "species_name"]) {
    if (props[f] && typeof props[f] === "string" && props[f].trim()) return props[f].trim();
  }
  return null;
}

function phase2Aggregate() {
  log("开始聚合 street tree 数据...");
  
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith(".geojson"));
  log(`找到 ${files.length} 个 GeoJSON 文件`);

  // streetKey → { suburb, streets, trees: count, dbh_avg, dbh_sum, coords:[] }
  const byStreet = new Map();
  let totalFeatures = 0;

  for (const file of files) {
    const councilId = file.replace(".geojson", "");
    const filePath = resolve(RAW_DIR, file);
    const raw = readFileSync(filePath, "utf-8");
    
    let geojson;
    try {
      geojson = JSON.parse(raw);
    } catch (e) {
      log(`  ✗ ${file}: JSON parse error`);
      continue;
    }

    const features = geojson.features || [];
    log(`  ${file}: ${features.length} 条记录`);
    totalFeatures += features.length;

    for (const feat of features) {
      const suburb = determineSuburb(feat, councilId);
      const street = determineStreet(feat);
      if (!street) continue;

      const coord = getCoord(feat);
      const dbh = getDbh(feat);
      const height = getHeight(feat);
      const genus = getGenus(feat);

      const key = `${suburb}::${street}`;
      if (!byStreet.has(key)) {
        byStreet.set(key, {
          suburb,
          street,
          councils: new Set(),
          count: 0,
          dbhValues: [],
          heights: [],
          genii: new Set(),
          avgCoord: null, // will average
          coordCount: 0,
        });
      }
      const entry = byStreet.get(key);
      entry.councils.add(councilId);
      entry.count++;
      if (dbh != null) entry.dbhValues.push(dbh);
      if (height != null) entry.heights.push(height);
      if (genus) entry.genii.add(genus);
      if (coord) {
        if (!entry.avgCoord) entry.avgCoord = [0, 0];
        entry.avgCoord[0] += coord[0];
        entry.avgCoord[1] += coord[1];
        entry.coordCount++;
      }
    }
  }

  // Build output
  const output = {
    metadata: {
      source: "data.gov.au + council open data portals",
      processed_at: new Date().toISOString(),
      version: "1.0",
      total_streets: byStreet.size,
      total_trees: totalFeatures,
      council_datasets: DATASETS.length,
    },
    records: [],
  };

  for (const [key, entry] of byStreet) {
    const avgDbh = entry.dbhValues.length > 0
      ? Math.round(entry.dbhValues.reduce((a, b) => a + b, 0) / entry.dbhValues.length * 10) / 10
      : null;
    const avgCoord = entry.avgCoord && entry.coordCount > 0
      ? [entry.avgCoord[0] / entry.coordCount, entry.avgCoord[1] / entry.coordCount]
      : null;

    // Tree canopy score (1-5) based on density and avg DBH
    let canopyScore = 3; // default
    const density = entry.count; // per street
    if (density === 0) canopyScore = 1;
    else if (density < 5) canopyScore = 2;
    else if (density < 20) canopyScore = 3;
    else if (density < 50) canopyScore = 4;
    else canopyScore = 5;

    // Maturity score based on DBH
    let maturity = "medium";
    if (avgDbh !== null) {
      if (avgDbh < 15) maturity = "low";
      else if (avgDbh < 35) maturity = "medium";
      else maturity = "high";
    }

    output.records.push({
      suburb: entry.suburb,
      street: entry.street,
      tree_count: entry.count,
      avg_dbh_cm: avgDbh,
      avg_height_m: entry.heights.length > 0
        ? Math.round(entry.heights.reduce((a, b) => a + b, 0) / entry.heights.length * 10) / 10
        : null,
      genus_count: entry.genii.size,
      genera: Array.from(entry.genii).slice(0, 10),
      councils: Array.from(entry.councils),
      canopy_score: canopyScore,
      maturity,
      approx_coord: avgCoord,
      coord_source: avgCoord ? "aggregated_from_data" : null,
    });
  }

  // Sort by suburb then street
  output.records.sort((a, b) => a.suburb.localeCompare(b.suburb) || a.street.localeCompare(b.street));

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
  const mb = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
  log(`Phase 2 完成: ${output.records.length} 条街道记录 → ${OUTPUT.split("/").pop()} (${mb} MB)`);

  return output.records.length;
}

// ── Main ──

async function main() {
  const phase = process.argv.find(a => a.startsWith("--phase="))?.split("=")[1] || "all";

  if (phase === "1" || phase === "all") {
    await phase1Download();
  }

  if (phase === "2" || phase === "all") {
    phase2Aggregate();
  }

  log("完成!");
}

// Need statSync import
import { statSync } from "fs";

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
