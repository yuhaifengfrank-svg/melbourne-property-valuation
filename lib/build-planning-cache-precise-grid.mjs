/**
 * build-planning-cache-precise-grid.mjs — VicPlan Phase C v4
 *
 * 用现有 cache 的坐标范围生成 200m 全覆盖网格，
 * 批量查询 zone/overlay（100 点一批），提速 100x。
 *
 * 使用方式：
 *   DATABASE_URL=... node lib/build-planning-cache-precise-grid.mjs [--dry-run]
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

const GRID_M = 200;
const RADIUS_M = 300;
const BATCH_SIZE = 100;

const DEG_PER_M_LAT = 1 / (111.32 * 1000);
const DEG_PER_M_LON = 1 / (111.32 * 1000 * Math.cos(-37.8 * Math.PI / 180));

function pad4(n) {
  const s = Math.abs(n).toFixed(4);
  return (n < 0 ? '-' : '') + s.padStart(7, '0');
}
function makeLatLonKey(lat, lon) {
  return `${pad4(lat)}_${pad4(lon)}`;
}

/**
 * 批量查询：对一组 (lat,lon) 查询 zone_code + overlay JSONB
 * 返回 Map<latLonKey, {zoneCode,zoneName,overlays:[]}>
 */
async function batchQuery(points) {
  // 生成 VALUES
  const vals = points.map((p, i) => `($${i*2+1}::numeric, $${i*2+2}::numeric, $${i*2+1}::numeric, $${i*2+2}::numeric)`).join(',');
  const params = points.flatMap(p => [p.lon, p.lat]);

  const sql = `
    WITH pts AS (
      SELECT idx, lon, lat, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS geom
      FROM (VALUES ${vals}) AS t(idx, lon, lat, lon2, lat2)
    ),
    zone_hits AS (
      SELECT p.idx,
             z.zone_code, z.zone_description,
             ROW_NUMBER() OVER (PARTITION BY p.idx ORDER BY z.ufi) AS rn
      FROM pts p
      JOIN vicplan_zones z ON ST_Contains(z.geom, p.geom)
    ),
    overlay_hits AS (
      SELECT p.idx,
             jsonb_agg(jsonb_build_object('code', o.zone_code, 'name', o.zone_description)) AS overlays
      FROM pts p
      JOIN vicplan_overlays o ON ST_Contains(o.geom, p.geom)
      GROUP BY p.idx
    )
    SELECT p.idx,
           zh.zone_code, zh.zone_description,
           oh.overlays
    FROM pts p
    LEFT JOIN zone_hits zh ON zh.idx = p.idx AND zh.rn = 1
    LEFT JOIN overlay_hits oh ON oh.idx = p.idx
    ORDER BY p.idx
  `;

  const result = await pool.query(sql, params);
  return new Map(result.rows.map(r => {
    const pt = points[r.idx - 1];
    const key = makeLatLonKey(pt.lat, pt.lon);
    return [key, {
      zoneCode: r.zone_code || null,
      zoneName: r.zone_description || null,
      overlays: r.overlays || []
    }];
  }));
}

async function main() {
  console.log(`VicPlan Phase C — 批量网格 ETL (${GRID_M}m, 扩展 ${RADIUS_M}m)`);
  console.log(DRY_RUN ? '🟡 DRY RUN\n' : '🟢 正式运行\n');

  // 1. 现有 cache 范围
  console.log('步骤 1/4: 读取现有 cache 分布...');
  const { rows: [range] } = await pool.query(`
    SELECT MIN(latitude) AS lat_min, MAX(latitude) AS lat_max,
           MIN(longitude) AS lon_min, MAX(longitude) AS lon_max
    FROM planning_cache
  `);

  const expand = RADIUS_M * DEG_PER_M_LAT;
  const step = GRID_M * DEG_PER_M_LAT;
  const lonStep = GRID_M * DEG_PER_M_LON;

  const gLatMin = parseFloat(range.lat_min) - expand;
  const gLatMax = parseFloat(range.lat_max) + expand;
  const gLonMin = parseFloat(range.lon_min) - expand;
  const gLonMax = parseFloat(range.lon_max) + expand;

  const latSteps = Math.round((gLatMax - gLatMin) / step) + 1;
  const lonSteps = Math.round((gLonMax - gLonMin) / lonStep) + 1;
  const totalEst = latSteps * lonSteps;

  console.log(`  坐标范围: lat ${gLatMin.toFixed(4)} ~ ${gLatMax.toFixed(4)}`);
  console.log(`             lon ${gLonMin.toFixed(4)} ~ ${gLonMax.toFixed(4)}`);
  console.log(`  网格: ${latSteps} × ${lonSteps} = ${totalEst.toLocaleString()} 点\n`);

  if (DRY_RUN) {
    console.log('🟡 DRY RUN 结束');
    await pool.end();
    return;
  }

  const existingCount = parseInt((await pool.query(`SELECT COUNT(*) AS cnt FROM planning_cache`)).rows[0].cnt);
  console.log(`  现有 planning_cache: ${existingCount.toLocaleString()} 行\n`);

  // 2. 预读已有 key（去重检查更快）
  console.log('步骤 2/4: 预读已有 lat_lon_key...');
  const { rows: existingKeys } = await pool.query(`SELECT lat_lon_key FROM planning_cache`);
  const existingKeySet = new Set(existingKeys.map(r => r.lat_lon_key));
  console.log(`  已加载 ${existingKeySet.size} 个 key\n`);

  // 3. 生成网格点（过滤已有）
  console.log('步骤 3/4: 生成网格点...');
  const newPoints = [];
  for (let lat = gLatMin; lat <= gLatMax; lat += step) {
    for (let lon = gLonMin; lon <= gLonMax; lon += lonStep) {
      const rLat = +lat.toFixed(6);
      const rLon = +lon.toFixed(6);
      const key = makeLatLonKey(rLat, rLon);
      if (!existingKeySet.has(key)) {
        newPoints.push({ lat: rLat, lon: rLon, key });
      }
    }
  }
  console.log(`  新增待查点: ${newPoints.length.toLocaleString()}\n`);

  // 4. 分批批量写入
  console.log(`步骤 4/4: 批量查询并写入 (每批 ${BATCH_SIZE} 点)...`);
  const startTime = Date.now();
  let inserted = 0, errors = 0;

  for (let i = 0; i < newPoints.length; i += BATCH_SIZE) {
    const batch = newPoints.slice(i, i + BATCH_SIZE);
    try {
      const resultMap = await batchQuery(batch);

      // 逐行 INSERT
      for (const pt of batch) {
        const info = resultMap.get(pt.key);
        if (!info) continue; // 没查到结果（可能坐标在海上/无规划区域）

        const zoneCode = info.zoneCode;
        const zoneName = info.zoneName;
        const overlays = info.overlays;

        // constraint 标签
        let constraintLevel = 'moderate';
        let flexibilityHint = null;
        if (zoneCode && (zoneCode.includes('PUZ') || zoneCode.includes('UFZ') || zoneCode.includes('FZ'))) {
          constraintLevel = 'low';
          flexibilityHint = 'public/utility zone, generally flexible';
        }
        if (overlays.length > 0) {
          const envCodes = overlays.filter(o => o.code?.startsWith('ESO') || o.code?.startsWith('SLO') || o.code?.startsWith('VPO'));
          if (envCodes.length > 0) {
            constraintLevel = 'high';
            flexibilityHint = `${envCodes.length} environmental overlay(s)`;
          }
        }

        try {
          await pool.query(`
            INSERT INTO planning_cache
              (lat_lon_key, latitude, longitude, zone_code, zone_name,
               constraint_level, flexibility_hint, overlays, manual_review_required, source_version)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT(lat_lon_key) DO NOTHING
          `, [pt.key, pt.lat, pt.lon, zoneCode, zoneName,
              constraintLevel, flexibilityHint,
              overlays.length ? JSON.stringify(overlays) : null,
              overlays.length > 0, 'phase-c-grid-v4'
          ]);
          inserted++;
        } catch(e2) {
          errors++;
          if (errors <= 5) console.error(`  INSERT ERR ${pt.key}: ${e2.message}`);
        }
      }
    } catch(e) {
      errors++;
      if (errors <= 5) console.error(`  BATCH ERR batch ${i}: ${e.message}`);
    }

    // 进度
    const elapsed = ((Date.now() - startTime)/1000).toFixed(0);
    const pct = (Math.min(i + BATCH_SIZE, newPoints.length) / newPoints.length * 100).toFixed(1);
    process.stdout.write(`  [${elapsed}s] ${inserted} inserted / ${errors} err / ${pct}%\r`);
  }

  // 5. 完成
  const totalTime = ((Date.now() - startTime)/1000/60).toFixed(1);
  console.log('\n');
  const postCount = parseInt((await pool.query(`SELECT COUNT(*) AS cnt FROM planning_cache`)).rows[0].cnt);

  console.log('════════════════════════════════════');
  console.log('完成！');
  console.log(`  新增插入: ${inserted.toLocaleString()}`);
  console.log(`  错误: ${errors}`);
  console.log(`  原行数: ${existingCount.toLocaleString()}`);
  console.log(`  新总行数: ${postCount.toLocaleString()}`);
  console.log(`  增长率: ${((postCount / existingCount - 1) * 100).toFixed(1)}%`);
  console.log(`  耗时: ${totalTime} 分钟`);
  console.log('\n提示：在 Production 验证 cache hit rate 确认覆盖率');

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
