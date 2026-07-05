// populate-planning-metrics.mjs
// ETL: For each VIC suburb in suburb_metrics:
//   1. Get centroid from school_locations (lat/lon)
//   2. Round to nearest 0.002 grid → planning_cache exact key match (with 3x3 grid fallback)
//   3. Check vhr_zones via ST_Contains on the (lat, lon)
//   4. Store planning_zone_code, planning_overlay_codes, vhr_flagged
//   5. Compute development_score + confidence_score → write back

import { neon } from '@neondatabase/serverless';
import { computeDevelopmentScoreFromMetrics } from '../lib/development-intelligence.js';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

function gridRound(v, step = 0.002) {
  return (Math.round(Number(v) / step) * step).toFixed(4);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

console.log('[populate] Starting planning metrics ETL...');

const suburbs = await sql`SELECT * FROM suburb_metrics WHERE state = 'VIC'`;
console.log(`[populate] Loaded ${suburbs.length} VIC suburbs`);

// Preload planning_cache into memory for fast lookup
const allPC = await sql`SELECT lat_lon_key, latitude, longitude, zone_code, overlays FROM planning_cache`;
const pcByKey = new Map(allPC.map(r => [r.lat_lon_key, r]));
console.log(`[populate] Loaded ${allPC.length} planning_cache records`);

let matched = 0;
let vhrFound = 0;
let devWritten = 0;

for (const sm of suburbs) {
  const sub = sm.suburb;

  // Get school centroid
  const schoolRows = await sql`
    SELECT ROUND(AVG(latitude)::numeric, 4) AS lat, ROUND(AVG(longitude)::numeric, 4) AS lon
    FROM school_locations
    WHERE LOWER(suburb) = ${sub} AND state = 'VIC' AND latitude IS NOT NULL
    GROUP BY LOWER(suburb)
  `;

  let planningZoneCode = null;
  let planningOverlays = null;
  let vhrFlagged = false;
  let heritageLevel = 'none';

  if (schoolRows.length > 0) {
    const lat = parseFloat(schoolRows[0].lat);
    const lon = parseFloat(schoolRows[0].lon);

    // Try exact 4dp key first, then broader search via SQL nearest neighbor
    const rawKey = lat.toFixed(4) + '_' + lon.toFixed(4);
    let bestRow = pcByKey.get(rawKey) || null;
    let bestDist = bestRow ? haversineKm(lat, lon, parseFloat(bestRow.latitude), parseFloat(bestRow.longitude)) : Infinity;
    
    if (!bestRow || bestDist > 0.15) {
      // Fall back to SQL nearest-neighbor on planning_cache
      try {
        const nearest = await sql`
          SELECT lat_lon_key, zone_code, overlays, latitude, longitude
          FROM planning_cache
          ORDER BY ABS(latitude::numeric - ${lat}) * ABS(latitude::numeric - ${lat}) + ABS(longitude::numeric - ${lon}) * ABS(longitude::numeric - ${lon})
          LIMIT 3
        `;
        for (const candidate of nearest) {
          const d = haversineKm(lat, lon, parseFloat(candidate.latitude), parseFloat(candidate.longitude));
          if (d < bestDist) {
            bestDist = d;
            bestRow = candidate;
          }
        }
      } catch (e) {
        // SQL fallback failed; try broader in-memory search
        const gridLat = parseFloat(gridRound(lat));
        const gridLon = parseFloat(gridRound(lon));
        for (let dl = -0.006; dl <= 0.006; dl += 0.002) {
          for (let dn = -0.006; dn <= 0.006; dn += 0.002) {
            const key = (gridLat + dl).toFixed(4) + '_' + (gridLon + dn).toFixed(4);
            const row = pcByKey.get(key);
            if (row) {
              const d = haversineKm(lat, lon, parseFloat(row.latitude), parseFloat(row.longitude));
              if (d < bestDist) { bestDist = d; bestRow = row; }
            }
          }
        }
      }
    }

    if (bestRow && bestDist < 2.0) { // within 2km
      planningZoneCode = bestRow.zone_code;
      planningOverlays = bestRow.overlays;
      matched++;

      // Check VHR via ST_Contains
      try {
        const vhrCheck = await sql`
          SELECT COUNT(*)::int AS cnt FROM vhr_zones
          WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
        `;
        vhrFlagged = vhrCheck[0].cnt > 0;
      } catch (e) {
        vhrFlagged = false;
      }

      // Heritage level
      let hasHO = false;
      if (planningOverlays) {
        const codes = Array.isArray(planningOverlays)
          ? planningOverlays.map(o => (o && o.code) || '')
          : [];
        hasHO = codes.some(c => c === 'HO' || c.startsWith('HO'));
      }
      if (vhrFlagged) {
        vhrFound++;
        heritageLevel = hasHO ? 'both' : 'state';
      } else if (hasHO) {
        heritageLevel = 'local';
      }
    }
  }

  // Write planning metadata
  await sql`
    UPDATE suburb_metrics SET
      planning_zone_code = ${planningZoneCode},
      planning_overlay_codes = ${planningOverlays != null ? JSON.stringify(planningOverlays) : null}::jsonb,
      planning_heritage_level = ${heritageLevel},
      vhr_flagged = ${vhrFlagged},
      updated_at = NOW()
    WHERE suburb = ${sub} AND state = 'VIC'
  `;

  // Compute development + confidence scores
  const compositeMetrics = {
    ...sm,
    primary_zone_code: planningZoneCode,
    planning_zone_code: planningZoneCode,
    overlays: planningOverlays,
    planning_overlay_codes: planningOverlays,
    vhr_flagged: vhrFlagged,
    heritage_vhr_flag: vhrFlagged,
  };

  const devResult = computeDevelopmentScoreFromMetrics(compositeMetrics);
  if (devResult && devResult.developmentScore != null) {
    await sql`
      UPDATE suburb_metrics SET
        development_score = ${devResult.developmentScore},
        development_label = ${devResult.developmentLabel || null},
        confidence_score = ${devResult.confidenceScore},
        confidence_label = ${devResult.confidenceLabel || null},
        updated_at = NOW()
      WHERE suburb = ${sub} AND state = 'VIC'
    `;
    devWritten++;
  }

  if (devWritten % 50 === 0) {
    console.log(`[populate] Progress: ${devWritten}/${suburbs.length}`);
  }
}

console.log(`\n[populate] Done!
  Suburbs processed: ${suburbs.length}
  Planning cache matched: ${matched}
  VHR found: ${vhrFound}
  Development scores written: ${devWritten}`);

// Summary
const stats = await sql`
  SELECT
    development_label,
    COUNT(*)::int AS label_count,
    ROUND(AVG(development_score)::numeric, 1) AS avg_score,
    MIN(development_score)::int AS min_score,
    MAX(development_score)::int AS max_score
  FROM suburb_metrics
  WHERE state = 'VIC' AND development_score IS NOT NULL
  GROUP BY development_label
  ORDER BY MIN(development_score)
`;
console.log('\n[populate] Score distribution:');
for (const r of stats) {
  console.log(`  ${(r.development_label + '           ').slice(0,16)} ${r.label_count} suburbs (avg ${r.avg_score}, range ${r.min_score}-${r.max_score})`);
}

// Top 10
const top10 = await sql`
  SELECT suburb, development_score, development_label, planning_zone_code, planning_heritage_level
  FROM suburb_metrics WHERE state = 'VIC' AND development_score IS NOT NULL
  ORDER BY development_score DESC LIMIT 10
`;
console.log('\n[populate] Top 10 (highest development potential):');
for (const r of top10) console.log(`  ${(r.suburb + '          ').slice(0,16)} ${r.development_score} ${(r.development_label + '           ').slice(0,16)} ${r.planning_zone_code || 'N/A'}  ${r.planning_heritage_level}`);

// Bottom 10
const bottom10 = await sql`
  SELECT suburb, development_score, development_label, planning_zone_code, planning_heritage_level
  FROM suburb_metrics WHERE state = 'VIC' AND development_score IS NOT NULL
  ORDER BY development_score ASC LIMIT 10
`;
console.log('\n[populate] Bottom 10 (lowest development potential):');
for (const r of bottom10) console.log(`  ${(r.suburb + '          ').slice(0,16)} ${r.development_score} ${(r.development_label + '           ').slice(0,16)} ${r.planning_zone_code || 'N/A'}  ${r.planning_heritage_level}`);

// Sanity check: specific suburbs
const targets = ['brighton', 'doncaster', 'sunshine', 'werribee', 'docklands', 'point cook', 'box hill', 'footscray'];
console.log('\n[populate] Target suburb detail:');
for (const t of targets) {
  const r = (await sql`SELECT suburb, development_score, development_label, confidence_score, confidence_label, planning_zone_code, planning_overlay_codes, planning_heritage_level, vhr_flagged FROM suburb_metrics WHERE suburb = ${t} AND state = 'VIC' LIMIT 1`)[0];
  if (r) console.log(`  ${(r.suburb + '          ').slice(0,16)} dev=${r.development_score} ${(r.development_label + '     ').slice(0,14)} conf=${r.confidence_score} ${r.confidence_label} zone=${r.planning_zone_code} overlay=${r.planning_overlay_codes ? (Array.isArray(r.planning_overlay_codes) ? r.planning_overlay_codes.map(o=>o.code||o).join(',') : typeof r.planning_overlay_codes === 'string' ? r.planning_overlay_codes.substring(0,30) : '?') : 'none'}  heritage=${r.planning_heritage_level} vhr=${r.vhr_flagged}`);
}
