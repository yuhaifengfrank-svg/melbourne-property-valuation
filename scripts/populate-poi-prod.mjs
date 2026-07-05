#!/usr/bin/env node
/**
 * scripts/populate-poi-prod.mjs
 *
 * Production POI ETL — one-shot run with robust rate limiting for Overpass API.
 *
 * Network fix: This network cannot reach Overpass API via IPv4 (TCP timeouts).
 * The poi-service.js fetchPoiCounts() hardcodes ipv4first, which fails here.
 * We inline a copy of the query logic that uses ipv6first instead.
 *
 * Key features:
 *   - 3500ms delay between suburbs (Overpass rate limits)
 *   - On Overpass HTTP error: wait 10s, retry once. If fails again, log and skip.
 *   - Checkpoint progress every 20 suburbs
 *   - Only processes suburbs with poi_total_count IS NULL
 *
 * Run with: node --dns-result-order=ipv6first scripts/populate-poi-prod.mjs
 * Time: ~216 suburbs × ~6s = ~22 min + retries ≈ 30 min
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
import { setDefaultResultOrder } from 'node:dns';

// ── Inline Overpass query logic (ipv6first version) ──
// poi-service.js calls setDefaultResultOrder('ipv4first') inside fetchPoiCounts,
// which breaks for this network. We duplicate the logic here with ipv6first.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY_TIMEOUT = 15; // seconds per query

const POI_CATEGORIES = {
  healthcare: {
    key: 'amenity',
    values: ['hospital', 'clinic', 'pharmacy'],
    radius: 3000, weight: 0.20, benchmark: 30, label: 'Healthcare'
  },
  shopping: {
    key: 'shop',
    values: ['supermarket', 'mall', 'convenience', 'department_store'],
    radius: 2000, weight: 0.15, benchmark: 15, label: 'Shopping'
  },
  recreation: {
    key: 'leisure',
    values: ['park', 'playground', 'sports_centre', 'garden', 'nature_reserve'],
    radius: 2000, weight: 0.15, benchmark: 20, label: 'Recreation'
  },
  dining: {
    key: 'amenity',
    values: ['restaurant', 'cafe', 'pub', 'bar', 'fast_food'],
    radius: 2000, weight: 0.10, benchmark: 40, label: 'Dining'
  },
  transit: {
    key: 'railway',
    values: ['station'],
    radius: 2000, weight: 0.15, benchmark: 5, label: 'Transit'
  },
  education: {
    key: 'amenity',
    values: ['kindergarten', 'library', 'college', 'university'],
    radius: 3000, weight: 0.10, benchmark: 10, label: 'Education'
  },
  fitness: {
    key: 'leisure',
    values: ['swimming_pool', 'fitness_centre'],
    radius: 3000, weight: 0.05, benchmark: 5, label: 'Fitness'
  },
  public_services: {
    key: 'amenity',
    values: ['police', 'fire_station', 'post_office', 'townhall', 'community_centre'],
    radius: 3000, weight: 0.10, benchmark: 6, label: 'Public Services'
  }
};

const CATEGORY_KEYS = Object.keys(POI_CATEGORIES);
const LETTERS = 'abcdefghij'.split('');

function buildCountQuery(lat, lon) {
  const lines = [`[out:json][timeout:${QUERY_TIMEOUT}];`];
  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    const cat = CATEGORY_KEYS[i];
    const def = POI_CATEGORIES[cat];
    const set = LETTERS[i];
    if (def.key === 'railway') {
      lines.push(`node["railway"="station"](around:${def.radius},${lat},${lon})->.${set};`);
    } else {
      const pattern = def.values.map(v => v).join('|');
      lines.push(`node["${def.key}"~"^(${pattern})$"](around:${def.radius},${lat},${lon})->.${set};`);
    }
  }
  for (let i = 0; i < CATEGORY_KEYS.length; i++) {
    lines.push(`.${LETTERS[i]} out count;`);
  }
  return lines.join('\n');
}

function parseNamedCounts(elements) {
  const counts = {};
  let total = 0;
  for (let i = 0; i < Math.min(elements.length, CATEGORY_KEYS.length); i++) {
    const el = elements[i];
    if (el.type === 'count' && el.tags) {
      const catCount = parseInt(el.tags.total || el.tags.nodes || '0', 10);
      counts[CATEGORY_KEYS[i]] = catCount;
      total += catCount;
    } else {
      counts[CATEGORY_KEYS[i]] = 0;
    }
  }
  return { counts, total };
}

/**
 * Fetch POI counts from Overpass API using IPv6 (bypasses poi-service's ipv4first).
 */
async function fetchPoiOverpass(lat, lon) {
  setDefaultResultOrder('ipv6first');
  const ql = buildCountQuery(lat, lon);
  let lastError;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const url = new URL(OVERPASS_URL);
      url.searchParams.set('data', ql);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AusHomeValue/1.0 (property research; mailto:admin@aushomevalue.com.au)'
        },
        signal: AbortSignal.timeout((QUERY_TIMEOUT + 5) * 1000)
      });
      if (!response.ok) {
        throw new Error(`Overpass HTTP ${response.status}`);
      }
      const data = await response.json();
      return parseNamedCounts(data.elements);
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Failed to query Overpass API');
}

/**
 * Compute normalized POI scores (0-100) from raw counts.
 * Mirrors poi-service.js computePoiScores exactly.
 */
function computePoiScores(counts) {
  const scores = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, def] of Object.entries(POI_CATEGORIES)) {
    const count = counts[cat] || 0;
    const ratio = count / def.benchmark;
    const score = Math.round(Math.min(ratio, 1.5) * 66.7);
    scores[`poi_${cat}_score`] = Math.min(score, 100);
    weightedSum += score * def.weight;
    totalWeight += def.weight;
  }
  const composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  return { scores, composite: Math.min(composite, 100) };
}

// ── Config ──
const CHECKPOINT_INTERVAL = 20;
const SUBURB_DELAY_MS = 5000;    // 5s between queries (Overpass ~2 qps limit with safe margin)
const RETRY_DELAY_MS = 15000;   // 15s wait before retry on HTTP error/429
const RATE_LIMIT_WAIT_MS = 30000; // 30s backoff on 429 rate limit

async function q(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

/**
 * Query Overpass with an additional outer retry layer (10s wait on HTTP error).
 */
async function queryPoiWithRetry(lat, lon, suburbName) {
  try {
    return await fetchPoiOverpass(lat, lon);
  } catch (err) {
    // On 429 rate limit, wait longer
    const isRateLimit = err.message && err.message.includes('429');
    const waitTime = isRateLimit ? RATE_LIMIT_WAIT_MS : RETRY_DELAY_MS;
    console.warn(`  ⚠ First attempt failed for ${suburbName}: ${err.message}`);
    console.warn(`  ⏳ Waiting ${waitTime/1000}s before retry...`);
    await new Promise(r => setTimeout(r, waitTime));
    return await fetchPoiOverpass(lat, lon);
  }
}

async function main() {
  setDefaultResultOrder('ipv6first');

  console.log('═════════════════════════════════════════════════════');
  console.log('  POI Metrics ETL — Production Run');
  console.log('═════════════════════════════════════════════════════');

  console.log('');
  console.log('[1/3] Fetching remaining suburbs from DB...');

  const suburbs = await q(`
    SELECT sm.suburb,
      (SELECT ROUND(AVG(latitude)::numeric, 5)
       FROM school_locations
       WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND latitude IS NOT NULL) AS lat,
      (SELECT ROUND(AVG(longitude)::numeric, 5)
       FROM school_locations
       WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND longitude IS NOT NULL) AS lon
    FROM suburb_metrics sm
    WHERE sm.state = 'VIC'
      AND sm.poi_total_count IS NULL
      AND EXISTS (
        SELECT 1 FROM school_locations
        WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND latitude IS NOT NULL
      )
    ORDER BY sm.suburb
  `);

  console.log(`  → ${suburbs.length} suburbs remaining`);
  console.log('');

  if (suburbs.length === 0) {
    console.log('[populate-poi] All done. Exiting.');
    process.exit(0);
  }

  console.log('[2/3] Processing suburbs...');
  console.log('');

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let totalPois = 0;
  const results = [];
  const failures = [];

  for (let i = 0; i < suburbs.length; i++) {
    const s = suburbs[i];
    const suburbName = s.suburb;
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);

    // Safety: skip if already populated
    const existing = await q(
      `SELECT poi_total_count FROM suburb_metrics WHERE LOWER(suburb) = LOWER($1) AND state = 'VIC'`,
      [suburbName]
    );
    if (existing.length > 0 && existing[0].poi_total_count !== null) {
      skipped++;
      process.stdout.write('⏭');
      if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
        console.log(`  [${i + 1}/${suburbs.length}] sk=${skipped}`);
      }
      continue;
    }

    // Overpass query with retry
    let result;
    try {
      result = await queryPoiWithRetry(lat, lon, suburbName);
    } catch (err) {
      failed++;
      process.stdout.write('✗');
      failures.push({ suburb: suburbName, lat, lon, error: err.message });
      if (failures.length <= 5) {
        console.warn(`\n  ✗ FAILED ${suburbName}: ${err.message}`);
      }
      if (i < suburbs.length - 1) await new Promise(r => setTimeout(r, SUBURB_DELAY_MS));
      continue;
    }

    // Score + DB write
    const scored = computePoiScores(result.counts);
    try {
      await q(`
        UPDATE suburb_metrics SET
          poi_healthcare_score = $1,
          poi_shopping_score = $2,
          poi_recreation_score = $3,
          poi_dining_score = $4,
          poi_transit_score = $5,
          poi_education_score = $6,
          poi_fitness_score = $7,
          poi_public_services_score = $8,
          poi_composite_score = $9,
          poi_total_count = $10,
          updated_at = NOW()
        WHERE LOWER(suburb) = LOWER($11) AND state = 'VIC'
      `, [
        scored.scores.poi_healthcare_score, scored.scores.poi_shopping_score,
        scored.scores.poi_recreation_score, scored.scores.poi_dining_score,
        scored.scores.poi_transit_score, scored.scores.poi_education_score,
        scored.scores.poi_fitness_score, scored.scores.poi_public_services_score,
        scored.composite, result.total, suburbName
      ]);
      success++;
      totalPois += result.total;
      results.push({ suburb: suburbName, composite: scored.composite, total: result.total });
    } catch (dbErr) {
      failed++;
      process.stdout.write('✗');
      failures.push({ suburb: suburbName, lat, lon, error: `DB write: ${dbErr.message}` });
      if (failures.length <= 5) console.warn(`\n  ✗ DB WRITE FAILED ${suburbName}: ${dbErr.message}`);
      if (i < suburbs.length - 1) await new Promise(r => setTimeout(r, SUBURB_DELAY_MS));
      continue;
    }

    // Progress
    process.stdout.write('✓');
    if ((i + 1) % CHECKPOINT_INTERVAL === 0 || (i + 1) === suburbs.length) {
      const pct = ((i + 1) / suburbs.length * 100).toFixed(1);
      console.log(`  [${i + 1}/${suburbs.length}] (${pct}%) | ✓${success} ✗${failed} ⏭${skipped} | avg ${success > 0 ? Math.round(totalPois / success) : '-'} POIs`);
    }

    if (i < suburbs.length - 1) await new Promise(r => setTimeout(r, SUBURB_DELAY_MS));
  }

  // ── Final Summary ──
  console.log('');
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  FINAL SUMMARY');
  console.log('══════════════════════════════════════════');
  console.log(`  Total suburbs processed:  ${suburbs.length}`);
  console.log(`  ✓ Successfully populated: ${success}`);
  console.log(`  ⏭ Already had data:       ${skipped}`);
  console.log(`  ✗ Failed:                 ${failed}`);
  console.log(`  Avg POIs/suburb:          ${success > 0 ? Math.round(totalPois / success) : 'N/A'}`);

  if (failures.length > 0) {
    console.log('');
    console.log('  ❌ Failed suburbs:');
    for (const f of failures) console.log(`     ✗ ${f.suburb}: ${f.error}`);
  }

  console.log('');
  console.log('══════════════════════════════════════════');

  if (results.length > 0) {
    const sorted = [...results].sort((a, b) => b.composite - a.composite);
    console.log('');
    console.log('  ★ Top 5 by POI composite score:');
    for (let i = 0; i < Math.min(5, sorted.length); i++) {
      const r = sorted[i];
      const si = '★'.repeat(Math.min(5, Math.max(1, Math.ceil(r.composite / 20))));
      console.log(`     ${si.padEnd(5)}  ${r.suburb.padEnd(22)} ${r.composite.toFixed(1).padStart(5)}  (${r.total} POIs)`);
    }

    console.log('');
    console.log('  ☆ Bottom 5 by POI composite score:');
    const b5 = sorted.slice(-5);
    for (const r of b5) {
      const si = '☆'.repeat(Math.min(5, Math.max(1, Math.ceil(r.composite / 20))));
      console.log(`     ${si.padEnd(5)}  ${r.suburb.padEnd(22)} ${r.composite.toFixed(1).padStart(5)}  (${r.total} POIs)`);
    }
  }

  console.log('');
  console.log('[populate-poi] Done.');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  process.exit(failed > 10 ? 1 : 0);
}

main().catch(err => {
  console.error('[populate-poi] Fatal error:', err);
  process.exit(1);
});
