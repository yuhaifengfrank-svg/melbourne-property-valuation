#!/usr/bin/env node
/**
 * production-valuation-audit.mjs
 *
 * Runs the full valuation pipeline against the production API for 50
 * diverse VIC addresses (houses + units, across suburbs and price tiers).
 *
 * Reports: pass/fail per address, aggregate stats, failed addresses.
 *
 * Usage: node tests/production-valuation-audit.mjs [--random|--top50]
 *   --random: shuffle the 50-address list (default)
 *   --top50:  use the 50 addresses in order
 */

const SAMPLE_MODE = process.argv.includes("--top50") ? "top50" : "random";
const SAMPLE_SIZE = 50;
const API_URL = "https://aushomevalue.com.au/api/valuation";
const TIMEOUT = 30_000; // 30s per valuation (includes Vercel cold start + DB round-trip)

const VALIDATION_ADDRESSES = [
  // South-east suburbs (house-heavy)
  { a: "13 Mcintosh St, Oakleigh, VIC", t: "House" },
  { a: "45 Warrigal Rd, Ashburton, VIC", t: "House" },
  { a: "122 High Street Rd, Mount Waverley, VIC", t: "House" },
  { a: "7 Avon St, Clayton, VIC", t: "House" },
  { a: "23 Centre Rd, Bentleigh East, VIC", t: "House" },
  { a: "56 Mackie Rd, Mulgrave, VIC", t: "House" },
  { a: "18 Springvale Rd, Glen Waverley, VIC", t: "House" },
  { a: "9 Burlington St, Chadstone, VIC", t: "House" },
  { a: "33 Ferntree Gully Rd, Notting Hill, VIC", t: "House" },
  { a: "71 Huntingdale Rd, Huntingdale, VIC", t: "House" },
  // Eastern suburbs
  { a: "15 Belmore Rd, Balwyn, VIC", t: "House" },
  { a: "28 Doncaster Rd, Doncaster, VIC", t: "House" },
  { a: "4 Station St, Box Hill, VIC", t: "House" },
  { a: "62 Mitcham Rd, Mitcham, VIC", t: "House" },
  { a: "91 Whitehorse Rd, Nunawading, VIC", t: "House" },
  { a: "33 Blackburn Rd, Blackburn, VIC", t: "House" },
  { a: "19 Burwood Hwy, Burwood, VIC", t: "House" },
  { a: "5 Riversdale Rd, Camberwell, VIC", t: "House" },
  { a: "72 Canterbury Rd, Canterbury, VIC", t: "House" },
  { a: "39 Union Rd, Surrey Hills, VIC", t: "House" },
  // Northern suburbs
  { a: "70 Murray Rd, Preston, VIC", t: "House" },
  { a: "17 Plenty Rd, Reservoir, VIC", t: "House" },
  { a: "21 Bell St, Coburg, VIC", t: "House" },
  { a: "93 Sydney Rd, Brunswick, VIC", t: "House" },
  { a: "36 St Georges Rd, Northcote, VIC", t: "House" },
  { a: "12 Heidelberg Rd, Ivanhoe, VIC", t: "House" },
  { a: "55 Darebin Rd, Thornbury, VIC", t: "House" },
  { a: "29 Murray Rd, Preston, VIC", t: "House" },
  { a: "7 Gaffney St, Coburg, VIC", t: "House" },
  { a: "42 Bellair St, Kensington, VIC", t: "House" },
  // Western suburbs
  { a: "14 Anderson St, Footscray, VIC", t: "House" },
  { a: "39 Geelong Rd, Werribee, VIC", t: "House" },
  { a: "61 Derrimut Rd, Derrimut, VIC", t: "House" },
  { a: "25 Ballarat Rd, Deer Park, VIC", t: "House" },
  { a: "82 Old Geelong Rd, Hoppers Crossing, VIC", t: "House" },
  { a: "53 Point Cook Rd, Point Cook, VIC", t: "House" },
  { a: "31 Sayers Rd, Laverton, VIC", t: "House" },
  { a: "18 Railway Ave, Altona, VIC", t: "House" },
  { a: "9 Williamstown Rd, Williamstown, VIC", t: "House" },
  { a: "2 Buckley St, Maidstone, VIC", t: "House" },
  // Inner city
  { a: "222 Clarendon St, South Melbourne, VIC", t: "Unit" },
  { a: "15 Ferrars St, Southbank, VIC", t: "Unit" },
  { a: "89 Victoria St, Carlton, VIC", t: "House" },
  { a: "33 Lygon St, Brunswick East, VIC", t: "Unit" },
  { a: "5 Gipps St, Richmond, VIC", t: "House" },
  // Mix
  { a: "11 Bay St, Port Melbourne, VIC", t: "House" },
  { a: "78 Glenhuntly Rd, Elwood, VIC", t: "House" },
  { a: "42 Orrong Rd, Caulfield North, VIC", t: "Unit" },
  { a: "19 Malvern Rd, Malvern, VIC", t: "Unit" },
  { a: "3 Balaclava Rd, Caulfield, VIC", t: "House" },
];

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function callValuation(address, propertyType, signal) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, propertyType }),
    signal,
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  return resp.json();
}

async function main() {
  console.log(`[Audit] Production valuation audit — ${SAMPLE_SIZE} addresses`);
  console.log(`[Audit] API: ${API_URL}`);
  console.log(`[Audit] Mode: ${SAMPLE_MODE}`);
  console.log(`[Audit] Timeout: ${TIMEOUT / 1000}s\n`);

  const rows = SAMPLE_MODE === "random"
    ? shuffle(VALIDATION_ADDRESSES)
    : [...VALIDATION_ADDRESSES];

  const startTime = Date.now();
  const results = [];
  let passed = 0;
  let failed = 0;
  let errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fullAddress = r.a.trim();
    const propertyType = r.t;

    // Show progress with suburb only for readability
    const suburb = fullAddress.split(",")[1]?.trim() || fullAddress.split(",")[0]?.trim() || fullAddress;
    process.stdout.write(`  [${i + 1}/${rows.length}] ${suburb} (${propertyType})... `);

    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      let result;
      try {
        result = await callValuation(fullAddress, propertyType, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }

      const elapsedMs = Date.now() - t0;

      if (result && result.ok) {
        const estimate = result.estimate || {};
        const confidence = result.confidence || {};
        const hasMidpoint = typeof estimate.midpoint === "number" && estimate.midpoint > 0;
        const hasRange = typeof estimate.low === "number" && typeof estimate.high === "number";

        if (hasMidpoint && hasRange) {
          const rangeWidth = ((estimate.high - estimate.low) / estimate.midpoint * 100).toFixed(1);
          process.stdout.write(`✅ $${Math.round(estimate.midpoint / 1000)}k [$${Math.round(estimate.low / 1000)}k-$${Math.round(estimate.high / 1000)}k] ${confidence.label || "?"} (${elapsedMs}ms)\n`);
          passed++;
          results.push({
            address: fullAddress,
            propertyType,
            midpoint: estimate.midpoint,
            low: estimate.low,
            high: estimate.high,
            confidence: confidence.label,
            dataScore: confidence.dataScore,
            compCount: result.comparableCount || 0,
            elapsedMs,
          });
        } else {
          process.stdout.write(`⚠️  ok=true but no valid estimate\n`);
          failed++;
          errors.push({ address: fullAddress, reason: "No valid estimate" });
        }
      } else {
        const errMsg = result?.error || "Unknown API error";
        process.stdout.write(`❌ ${errMsg}\n`);
        failed++;
        errors.push({ address: fullAddress, reason: errMsg });
      }
    } catch (err) {
      const elapsedMs = Date.now() - t0;
      const msg = err.name === "AbortError" ? `⏰ Timeout (${TIMEOUT / 1000}s)` : `💥 ${err.message}`;
      process.stdout.write(`${msg}\n`);
      failed++;
      errors.push({ address: fullAddress, reason: msg });
    }
  }

  // 4. Report
  const totalTime = elapsed(startTime);
  const passRate = (passed / rows.length * 100).toFixed(1);

  console.log(`\n┌${"─".repeat(55)}┐`);
  console.log(`│  Production Valuation Audit — Summary`);
  console.log(`├${"─".repeat(55)}┤`);
  console.log(`│  Total addresses: ${rows.length}`);
  console.log(`│  Passed:          ${passed}`);
  console.log(`│  Failed:          ${failed}`);
  console.log(`│  Pass rate:       ${passRate}%`);
  console.log(`│  Total time:      ${totalTime}s`);
  console.log(`│  Avg per call:    ${(totalTime / rows.length * 1000).toFixed(0)}ms`);

  if (results.length > 0) {
    const mids = results.map(r => r.midpoint).filter(Boolean);
    const scores = results.map(r => r.dataScore).filter(s => s != null);
    const comps = results.map(r => r.compCount).filter(c => c != null);
    if (mids.length) {
      const sorted = [...mids].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = mids.reduce((a, b) => a + b, 0) / mids.length;
      console.log(`│  Avg price:      $${Math.round(avg / 1000)}k`);
      console.log(`│  Median price:   $${Math.round(median / 1000)}k`);
      console.log(`│  Price range:    $${Math.round(sorted[0] / 1000)}k ~ $${Math.round(sorted[sorted.length - 1] / 1000)}k`);
    }
    if (scores.length) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`│  Avg dataScore:   ${avgScore.toFixed(1)}`);
      const byConf = {};
      for (const l of scores.map((_, i) => results[i].confidence)) {
        byConf[l] = (byConf[l] || 0) + 1;
      }
      const confParts = Object.entries(byConf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", ");
      console.log(`│  Confidence:      ${confParts}`);
    }
    if (comps.length) {
      const avgComps = comps.reduce((a, b) => a + b, 0) / comps.length;
      console.log(`│  Avg comparables: ${avgComps.toFixed(1)}`);
    }
    const avgLatency = results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length;
    console.log(`│  Avg latency:     ${Math.round(avgLatency)}ms`);
    // Success latency (excluding errors)
    const p50 = [...results].sort((a, b) => a.elapsedMs - b.elapsedMs)[Math.floor(results.length * 0.5)]?.elapsedMs || 0;
    const p95 = [...results].sort((a, b) => a.elapsedMs - b.elapsedMs)[Math.floor(results.length * 0.95)]?.elapsedMs || 0;
    console.log(`│  p50 latency:     ${p50}ms`);
    console.log(`│  p95 latency:     ${p95}ms`);
  }
  console.log(`└${"─".repeat(55)}┘`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Failed addresses (${errors.length}):`);
    for (const e of errors) {
      console.log(`  • ${e.address}`);
      console.log(`    → ${e.reason}`);
    }
  }

  const allPassed = failed === 0;
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("[Audit] Fatal:", err.message);
  process.exit(1);
});
