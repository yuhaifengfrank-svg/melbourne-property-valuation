/**
 * build-planning-cache-suburb-grid.mjs — VicPlan Phase C 方案 A
 *
 * 在每个 suburb 中心 ±0.02°（~2.2km）范围，按 0.005°（~500m）步长生成网格，
 * 每 suburb ~65 点，全覆盖约 235×65 ≈ 15,000 点。
 *
 * 使用方式：
 *   DATABASE_URL=... node lib/build-planning-cache-suburb-grid.mjs [--dry-run]
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000
});
const DRY_RUN = process.argv.includes('--dry-run');

const BATCH_SIZE = 100;

function pad4(n) {
  const s = Math.abs(n).toFixed(4);
  return (n < 0 ? '-' : '') + s.padStart(7, '0');
}
function makeLatLonKey(lat, lon) {
  return `${pad4(lat)}_${pad4(lon)}`;
}

async function batchQuery(points) {
  const vals = points.map((p, i) => `($${i*2+1}::numeric, $${i*2+2}::numeric)`).join(',');
  const params = points.flatMap(p => [p.lon, p.lat]);
  const sql = `
    WITH pts AS (
      SELECT (ROW_NUMBER() OVER())::int AS idx, lon, lat,
             ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS geom
      FROM (VALUES ${vals}) AS t(lon, lat)
    ),
    zh AS (SELECT p.idx, z.zone_code, z.zone_description,
                  ROW_NUMBER() OVER(PARTITION BY p.idx ORDER BY z.ufi) AS rn
           FROM pts p JOIN vicplan_zones z ON ST_Contains(z.geom, p.geom)),
    oh AS (SELECT p.idx,
                  jsonb_agg(jsonb_build_object('code', o.zone_code, 'name', o.zone_description)) AS overlays
           FROM pts p JOIN vicplan_overlays o ON ST_Contains(o.geom, p.geom) GROUP BY p.idx)
    SELECT p.idx, zh.zone_code, zh.zone_description, oh.overlays
    FROM pts p LEFT JOIN zh ON zh.idx = p.idx AND zh.rn = 1
               LEFT JOIN oh ON oh.idx = p.idx ORDER BY p.idx
  `;
  const result = await pool.query(sql, params);
  return new Map(result.rows.map(r => {
    const pt = points[r.idx - 1];
    return [makeLatLonKey(pt.lat, pt.lon), {
      zoneCode: r.zone_code || null, zoneName: r.zone_description || null,
      overlays: r.overlays || []
    }];
  }));
}

async function main() {
  console.log('VicPlan Phase C — 方案 A (suburb 中心网格)');
  console.log(DRY_RUN ? '🟡 DRY RUN\n' : '🟢 正式运行\n');

  // 1. 获取 suburb 中心坐标
  console.log('步骤 1/4: 获取 suburb 中心坐标...');
  const { rows: suburbs } = await pool.query(`
    SELECT suburb, AVG(lat::numeric) AS lat, AVG(lon::numeric) AS lng
    FROM comparable_sales
    WHERE lat IS NOT NULL AND lat != 0
    GROUP BY suburb
  `);
  console.log(`  找到 ${suburbs.length} 个 suburb\n`);

  // 2. 生成网格点
  console.log('步骤 2/4: 生成网格点...');
  const pad = 0.02;
  const step = 0.005;
  const allPoints = [];

  for (const sub of suburbs) {
    const clat = parseFloat(sub.lat);
    const clon = parseFloat(sub.lng);
    for (let lat = clat - pad; lat <= clat + pad + 0.0001; lat += step) {
      for (let lon = clon - pad; lon <= clon + pad + 0.0001; lon += step) {
        allPoints.push({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) });
      }
    }
  }
  console.log(`  总网格点: ${allPoints.length.toLocaleString()}\n`);

  // 3. 预读已有 key
  console.log('步骤 3/4: 过滤已有 cache 点...');
  const { rows: ekeys } = await pool.query(`SELECT lat_lon_key FROM planning_cache`);
  const existingSet = new Set(ekeys.map(r => r.lat_lon_key));
  const newPoints = allPoints.filter(p => !existingSet.has(makeLatLonKey(p.lat, p.lon)));
  console.log(`  过滤后新点: ${newPoints.length.toLocaleString()}\n`);

  if (DRY_RUN) {
    console.log('🟡 DRY RUN 结束');
    await pool.end();
    return;
  }

  const existingCount = parseInt((await pool.query(`SELECT COUNT(*) AS cnt FROM planning_cache`)).rows[0].cnt);
  console.log(`  现有 planning_cache: ${existingCount.toLocaleString()}行`);

  // 4. 批量写入
  console.log(`步骤 4/4: 批量查询写入 (每批 ${BATCH_SIZE} 点)...`);
  const startTime = Date.now();
  let inserted = 0, errors = 0;

  for (let i = 0; i < newPoints.length; i += BATCH_SIZE) {
    const batch = newPoints.slice(i, i + BATCH_SIZE);
    try {
      const resultMap = await batchQuery(batch);
      for (const pt of batch) {
        const info = resultMap.get(makeLatLonKey(pt.lat, pt.lon));
        if (!info) continue;

        let constraintLevel = 'moderate';
        let flexibilityHint = null;
        const zc = info.zoneCode;
        if (zc && (zc.includes('PUZ') || zc.includes('UFZ') || zc.includes('FZ'))) {
          constraintLevel = 'low'; flexibilityHint = 'public/utility zone';
        }
        if (info.overlays.length > 0) {
          const env = info.overlays.filter(o => o.code?.startsWith('ESO') || o.code?.startsWith('SLO') || o.code?.startsWith('VPO'));
          if (env.length > 0) { constraintLevel = 'high'; flexibilityHint = `${env.length} env overlay(s)`; }
        }

        try {
          await pool.query(`
            INSERT INTO planning_cache (lat_lon_key,latitude,longitude,zone_code,zone_name,constraint_level,flexibility_hint,overlays,manual_review_required,source_version)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'phase-c-suburb-grid')
            ON CONFLICT(lat_lon_key) DO NOTHING
          `, [pt.key || makeLatLonKey(pt.lat, pt.lon), pt.lat, pt.lon,
              info.zoneCode, info.zoneName, constraintLevel, flexibilityHint,
              info.overlays.length ? JSON.stringify(info.overlays) : null,
              info.overlays.length > 0
          ]);
          inserted++;
        } catch(e2) { errors++; if (errors <= 5) console.error(`  INSERT ERR: ${e2.message}`); }
      }
    } catch(e) { errors++; if (errors <= 5) console.error(`  BATCH ERR: ${e.message}`); }

    const elapsed = ((Date.now() - startTime)/1000).toFixed(0);
    const pct = (Math.min(i + BATCH_SIZE, newPoints.length) / newPoints.length * 100).toFixed(1);
    process.stdout.write(`  [${elapsed}s] ${inserted} inserted / ${errors} err / ${pct}%\r`);
  }

  const totalTime = ((Date.now() - startTime)/1000/60).toFixed(1);
  console.log('\n');
  const postCount = parseInt((await pool.query(`SELECT COUNT(*) AS cnt FROM planning_cache`)).rows[0].cnt);
  console.log('════════════════════════════════════');
  console.log('完成！');
  console.log(`  新增: ${inserted.toLocaleString()}`);
  console.log(`  错误: ${errors}`);
  console.log(`  原: ${existingCount.toLocaleString()} → 现: ${postCount.toLocaleString()} 行`);
  console.log(`  耗时: ${totalTime} 分钟`);

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
