#!/usr/bin/env node
/**
 * compute-infrastructure-scores.mjs
 *
 * Phase: Data Source Expansion — Step 2
 * Purpose: Compute suburb_metrics.infrastructure_score from infrastructure_projects
 *
 * Algorithm:
 *   For each suburb, match projects by suburb name.
 *   Score = sum of project weights (budget * type_multiplier * timeline_discount)
 *   Normalized to 0-100.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/compute-infrastructure-scores.mjs
 *
 * Run via: source .env && node scripts/compute-infrastructure-scores.mjs
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// ── Config ──
const TYPE_MULTIPLIER = {
  transport: 1.5,
  health: 1.0,
  education: 1.0,
  employment: 1.0,
  utility: 1.2,
  recreation: 0.8,
  housing: 1.1,
};

function typeMultiplier(type) {
  return TYPE_MULTIPLIER[type?.toLowerCase()] ?? 1.0;
}

function timelineDiscount(status, estimatedCompletion) {
  const statusLower = (status || "").toLowerCase();
  if (statusLower === "completed") return 0;

  if (estimatedCompletion) {
    const year = parseInt(estimatedCompletion, 10);
    if (!isNaN(year)) {
      const now = new Date().getFullYear();
      const yearsAway = year - now;
      if (yearsAway <= 1) return 0.5;
      if (yearsAway <= 3) return 0.7;
      if (yearsAway <= 5) return 0.5;
      return 0.3;
    }
  }

  if (statusLower.includes("construct") || statusLower.includes("underway")) return 0.5;
  if (statusLower.includes("planning") || statusLower.includes("proposed")) return 0.3;
  if (statusLower.includes("approved")) return 0.4;

  return 0.3;
}

async function main() {
  const projects = await sql`
    SELECT id, project_name, project_type, suburb, latitude as lat, longitude as lng,
           catchment_radius_km, estimated_budget_m, status, estimated_completion,
           catchment_sa3
    FROM infrastructure_projects
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `;
  console.log(`Loaded ${projects.length} projects with coordinates`);

  const suburbs = await sql`
    SELECT DISTINCT LOWER(suburb) as suburb_lower
    FROM suburb_metrics
  `;
  console.log(`Loaded ${suburbs.length} unique suburbs`);

  // Compute scores as a Map (suburb_lower → score)
  const scoreMap = new Map();

  for (const { suburb_lower } of suburbs) {
    let score = 0;
    let matchedCount = 0;
    let totalBudget = 0;

    for (const proj of projects) {
      if ((proj.suburb || "").toLowerCase().trim() !== suburb_lower) continue;

      const budgetScore = proj.estimated_budget_m
        ? Math.min(proj.estimated_budget_m / 100, 40)
        : 10;
      const typeMult = typeMultiplier(proj.project_type);
      const timeline = timelineDiscount(proj.status, proj.estimated_completion);

      score += budgetScore * typeMult * timeline;
      matchedCount++;
      totalBudget += proj.estimated_budget_m || 0;
    }

    const normalized = Math.min(100, Math.round(score * 10) / 10);

    if (matchedCount > 0) {
      scoreMap.set(suburb_lower, { score: normalized, matchedCount, totalBudget });
    }
  }

  console.log(`Suburbs with infrastructure_score > 0: ${scoreMap.size}`);

  // Batch update
  let updated = 0;
  for (const [suburbLower, data] of scoreMap) {
    await sql`
      UPDATE suburb_metrics
      SET infrastructure_score = ${data.score},
          updated_at = NOW()
      WHERE LOWER(suburb) = ${suburbLower}
    `;
    updated++;
    if (updated % 50 === 0) process.stdout.write(".");
  }
  console.log(`\nUpdated ${updated} suburbs`);

  // Top 10
  const sorted = [...scoreMap.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 10);
  console.log("\nTop 10 by infrastructure_score:");
  for (const [name, data] of sorted) {
    console.log(`  ${name.padEnd(25)} ${data.score.toFixed(1).padStart(6)} (${data.matchedCount} projects, $${(data.totalBudget / 1000).toFixed(0)}M)`);
  }

  const verify = await sql`
    SELECT COUNT(*) FILTER (WHERE infrastructure_score IS NOT NULL AND infrastructure_score > 0) as scored,
           COUNT(*) as total
    FROM suburb_metrics
  `;
  console.log("\nVerification:", verify[0]);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
