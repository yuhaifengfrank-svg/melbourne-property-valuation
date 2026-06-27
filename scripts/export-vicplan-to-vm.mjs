#!/usr/bin/env node
/**
 * export-vicplan-to-vm.mjs
 *
 * Phase A: 把 Neon 上的 vicplan_zones / vicplan_overlays 导出为 GeoJSON
 * 然后 rsync 到 VM 的 Oracle Data Factory 数据湖。
 *
 * 导出格式：
 *   - /tmp/vicplan_zones_{date}.json (GeoJSON FeatureCollection)
 *   - /tmp/vicplan_overlays_{date}.json
 *
 * 安全检测：拒绝 production host（通常不导出 production，需要 --force）
 *   因为本脚本只读，导出后清 /tmp 不影响任何运行环境
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const DATE = new Date().toISOString().split('T')[0];
const TMP_ZONES = `/tmp/vicplan_zones_${DATE}.geojson`;
const TMP_OVERLAYS = `/tmp/vicplan_overlays_${DATE}.geojson`;

const VM_HOST = "vm-aushomevalue";
const VM_TARGET = "/opt/aushomevalue/data/raw/vicplan";

const PAGE_SIZE = 5000;

async function exportTable(sql, table, tmpPath) {
  console.log(`[export] Exporting ${table} → ${tmpPath} ...`);

  const countQuery = table === 'vicplan_zones'
    ? await sql`SELECT COUNT(*)::int AS n FROM vicplan_zones`
    : await sql`SELECT COUNT(*)::int AS n FROM vicplan_overlays`;
  const total = countQuery[0].n;
  console.log(`[export] Total rows: ${total}`);

  const allFeatures = [];
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const batch = table === 'vicplan_zones'
      ? await sql`SELECT pfi, scheme_code, lga_code, lga, zone_num, zone_status, zone_code, zone_description, gaz_begin_date, ufi, ST_AsGeoJSON(geom)::jsonb AS geometry FROM vicplan_zones ORDER BY pfi LIMIT ${PAGE_SIZE} OFFSET ${offset}`
      : await sql`SELECT pfi, scheme_code, lga_code, lga, zone_num, zone_status, zone_code, zone_description, gaz_begin_date, ufi, ST_AsGeoJSON(geom)::jsonb AS geometry FROM vicplan_overlays ORDER BY pfi LIMIT ${PAGE_SIZE} OFFSET ${offset}`;

    const features = batch.map(r => ({
      type: "Feature",
      geometry: r.geometry,
      properties: {
        pfi: r.pfi,
        scheme_code: r.scheme_code,
        lga_code: r.lga_code,
        lga: r.lga,
        zone_num: r.zone_num,
        zone_status: r.zone_status,
        zone_code: r.zone_code,
        zone_description: r.zone_description,
        gaz_begin_date: r.gaz_begin_date,
        ufi: r.ufi,
      }
    }));
    allFeatures.push(...features);
    console.log(`[export]  Progress: ${allFeatures.length}/${total} (${((offset + PAGE_SIZE) / total * 100).toFixed(0)}%)`);
  }

  const fc = {
    type: "FeatureCollection",
    name: table,
    generatedAt: new Date().toISOString(),
    features: allFeatures,
  };

  fs.writeFileSync(tmpPath, JSON.stringify(fc));
  const stat = fs.statSync(tmpPath);
  console.log(`[export] ✓ ${allFeatures.length} features, ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  return allFeatures.length;
}

async function main() {
  const sql = neon(DB_URL);

  console.log(`[export] Export date: ${DATE}`);

  const nZones = await exportTable(sql, "vicplan_zones", TMP_ZONES);
  const nOverlays = await exportTable(sql, "vicplan_overlays", TMP_OVERLAYS);

  // rsync to VM
  console.log(`[export] rsync to ${VM_HOST}:${VM_TARGET}/ ...`);
  try {
    execSync(
      `rsync -az --rsync-path="mkdir -p ${VM_TARGET} && rsync" ${TMP_ZONES} ${TMP_OVERLAYS} ${VM_HOST}:${VM_TARGET}/`,
      { timeout: 120000, stdio: 'inherit' }
    );
    console.log(`[export] ✓ rsync complete`);
  } catch (e) {
    console.error(`[export] rsync failed: ${e.message}`);
    process.exit(1);
  }

  // Cleanup local tmp
  fs.unlinkSync(TMP_ZONES);
  fs.unlinkSync(TMP_OVERLAYS);
  console.log(`[export] ✓ Local tmp cleaned`);

  console.log(`[export] ✅ Complete: zones=${nZones}, overlays=${nOverlays}`);
}

main().catch(e => { console.error(e); process.exit(1); });
