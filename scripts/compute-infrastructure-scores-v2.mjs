#!/usr/bin/env node
/**
 * compute-infrastructure-scores-v2.mjs
 *
 * Compute suburb_metrics.infrastructure_score from infrastructure_projects
 * using geographic proximity (Haversine distance).
 *
 * Algorithm:
 *   1. Log-scaled budget weight (no cap, so $50B vs $100M is ~3x not 500x)
 *   2. Type multiplier (transport 1.5x, others 1.0x etc.)
 *   3. Timeline discount (under_construction=1.0, planning=0.5, far future=0.2)
 *   4. Proximity decay (quadratic beyond 2km ideal radius, cutoff at 15km)
 *   5. Sum raw, then final_score = raw / 25 (targeting ~0-100 for metro)
 *
 * Usage: node scripts/compute-infrastructure-scores-v2.mjs
 */

const DB_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_yxd0rKOc3uvR@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
import { neon } from "@neondatabase/serverless";
const sql = neon(DB_URL);

// ── Constants ──
const R = 6371; // Earth radius km
const MAX_DIST = 15; // cutoff distance km
const IDEAL_DIST = 2; // full-proximity zone km

const TYPE_MULT = { transport: 1.5, health: 1.0, education: 1.0, employment: 1.0, utility: 1.2, recreation: 0.8, housing: 1.1 };

// ── Helpers ──
const toRad = d => d * Math.PI / 180;
const haversine = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function timelineMult(status, completion) {
  const s = (status || "").toLowerCase();
  if (s === "completed") return 0;
  if (s.includes("construct") || s.includes("underway")) return 1.0;
  if (s.includes("approved")) return 0.6;
  // planning/proposed or unknown
  if (completion) {
    const y = parseInt(completion, 10);
    if (!isNaN(y)) {
      const away = y - new Date().getFullYear();
      if (away <= 2) return 0.7;
      if (away <= 5) return 0.5;
      if (away <= 10) return 0.35;
      return 0.2;
    }
  }
  return 0.35;
}

function proximityMult(dist) {
  if (dist <= IDEAL_DIST) return 1.0;
  if (dist >= MAX_DIST) return 0;
  const r = (dist - IDEAL_DIST) / (MAX_DIST - IDEAL_DIST);
  return 1 - r**2; // quadratic decay
}

function budgetWeight(b) {
  if (!b || b <= 0) return 0.5;
  return Math.log10(b); // $100M→2, $1B→3, $10B→4, $55B→4.74
}

// ── Main ──
async function main() {
  const projects = await sql`
    SELECT id, project_name, project_type, estimated_budget_m, status, estimated_completion,
           latitude::numeric as lat, longitude::numeric as lng
    FROM infrastructure_projects
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  console.log(`Loaded ${projects.length} projects`);

  const suburbs = await sql`
    WITH coords AS (
      SELECT LOWER(s.suburb) as sl, s.suburb,
             AVG(sl.latitude)::numeric as lat,
             AVG(sl.longitude)::numeric as lng
      FROM suburb_metrics s
      JOIN school_locations sl ON LOWER(s.suburb) = LOWER(sl.suburb)
      GROUP BY LOWER(s.suburb), s.suburb
    )
    SELECT * FROM coords
  `;
  console.log(`Loaded ${suburbs.length} suburb coords`);

  const result = [];

  for (const sub of suburbs) {
    let raw = 0;
    let matchCount = 0;

    for (const p of projects) {
      const dist = haversine(
        parseFloat(sub.lat), parseFloat(sub.lng),
        parseFloat(p.lat), parseFloat(p.lng)
      );
      if (dist > MAX_DIST) continue;

      const w = budgetWeight(parseFloat(p.estimated_budget_m))
              * (TYPE_MULT[p.project_type] || 1.0)
              * timelineMult(p.status, p.estimated_completion)
              * proximityMult(dist);
      raw += w;
      matchCount++;
    }

    if (matchCount > 0) {
      // Normalize: raw/80*100 calibrated so metro core (Kew raw ~72) → ~90
      const score = Math.round(Math.min(100, raw / 80 * 100) * 10) / 10;
      result.push({ suburb: sub.suburb, sl: sub.sl, score, matchCount, raw });
    }
  }

  // Sort by score desc
  const sorted = result.sort((a, b) => b.score - a.score);
  console.log(`\nScored: ${result.length} suburbs\n`);
  console.log("Top 20:");
  console.log("  Suburb".padEnd(22) + "Score  Projects  Raw");
  console.log("  " + "-".repeat(45));
  for (const r of sorted.slice(0, 20)) {
    console.log(`  ${r.suburb.padEnd(22)} ${String(r.score).padStart(6)} ${String(r.matchCount).padStart(5)}  ${r.raw.toFixed(1)}`);
  }
  console.log("\nBottom 10:");
  const bottom = [...sorted].reverse().slice(0, 10);
  for (const r of bottom) {
    console.log(`  ${r.suburb.padEnd(22)} ${String(r.score).padStart(6)} ${String(r.matchCount).padStart(5)}`);
  }
  console.log(`\nMin: ${sorted[sorted.length-1].score}, Max: ${sorted[0].score}`);

  // Reset and update DB
  console.log("\nUpdating DB...");
  await sql`UPDATE suburb_metrics SET infrastructure_score = 0, updated_at = NOW()`;

  let updated = 0;
  for (const r of result) {
    await sql`UPDATE suburb_metrics SET infrastructure_score = ${r.score}, updated_at = NOW() WHERE LOWER(suburb) = ${r.sl}`;
    updated++;
    if (updated % 50 === 0) process.stdout.write(".");
  }

  const verify = await sql`
    SELECT COUNT(*) FILTER (WHERE infrastructure_score > 0) as scored,
           COUNT(*) as total, ROUND(AVG(infrastructure_score), 1) as avg,
           MAX(infrastructure_score) as max, MIN(infrastructure_score) as min
    FROM suburb_metrics WHERE suburb = INITCAP(suburb)
  `;
  console.log(`\nVerification (capitalized only): scored ${verify[0].scored}/${verify[0].total}, avg ${verify[0].avg}, range ${verify[0].min}-${verify[0].max}`);
  console.log("\nDone ✅");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
