#!/usr/bin/env node
/**
 * production-valuation-audit-remaining.mjs
 *
 * Runs all remaining suburbs not yet covered by audit-210.
 * Samples from DB (via audit-sample API) and only runs suburbs
 * not in the existing coverage CSV.
 *
 * Usage: node tests/production-valuation-audit-remaining.mjs
 *   --api <url>    API base (default: https://aushomevalue.com.au)
 *   --existing <path> existing CSV to check coverage (default: reports/audit-210-YYYY-MM-DD.csv)
 */

const API_BASE = (() => {
  const i = process.argv.indexOf("--api");
  return i >= 0 ? process.argv[i + 1] : "https://aushomevalue.com.au";
})();
const AUDIT_SAMPLE_URL = `${API_BASE}/api/audit-sample`;
const VALUATION_URL = `${API_BASE}/api/valuation`;
const TIMEOUT = 30_000;
const MAX_CONSECUTIVE_FAILURES = 10;
const BATCH_SIZE = 100; // how many addresses to fetch per sample API call

function elapsed(start) { return ((Date.now() - start) / 1000).toFixed(1); }
function pad(v, w) { const s = String(v); return s.length >= w ? s : " ".repeat(w - s.length) + s; }
function icon(t) { const tt = (t || "").toLowerCase(); return tt === "house" || tt === "villa" ? "🏠" : tt === "townhouse" ? "🏡" : "🏢"; }

async function fetchJSON(url, body, signal) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText} — ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  return resp.json();
}

async function runOne(address, propertyType, index, total) {
  const suburb = address.split(",")[1]?.trim() || address.split(",")[0]?.trim() || address;
  process.stdout.write(`  ${pad(index, 3)}/${total} ${icon(propertyType)} ${suburb}... `);
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT);
    let result;
    try { result = await fetchJSON(VALUATION_URL, { address, propertyType }, controller.signal); }
    finally { clearTimeout(tid); }
    const elapsedMs = Date.now() - t0;
    if (result?.ok) {
      const e = result.estimate || {};
      const c = result.confidence || {};
      if (typeof e.midpoint === "number" && e.midpoint > 0 && typeof e.low === "number" && typeof e.high === "number") {
        process.stdout.write(`✅ $${Math.round(e.midpoint / 1000)}k [${Math.round(e.low / 1000)}k-${Math.round(e.high / 1000)}k] ${c.label || "?"} (${elapsedMs}ms)\n`);
        return { ok: true, address, propertyType, suburb, midpoint: e.midpoint, low: e.low, high: e.high, confidence: c.label, dataScore: c.dataScore, compCount: result.comparableCount || 0, elapsedMs };
      }
      process.stdout.write(`⚠️  no-valid-est\n`);
      return { ok: false, address, propertyType, suburb, reason: "No valid estimate", elapsedMs };
    }
    const errMsg = result?.error || "Unknown API error";
    process.stdout.write(`❌ ${errMsg}\n`);
    return { ok: false, address, propertyType, suburb, reason: errMsg, elapsedMs };
  } catch (err) {
    const msg = err.name === "AbortError" ? `⏰ Timeout` : `💥 ${err.message}`;
    process.stdout.write(`${msg}\n`);
    return { ok: false, address, propertyType, suburb, reason: msg, elapsedMs: Date.now() - t0 };
  }
}

async function main() {
  console.log(`🛡️  Production Valuation Audit — Remaining Suburbs`);
  console.log(`   API:  ${VALUATION_URL}\n`);

  // 1. Load existing coverage
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const reportDir = resolve("reports");
  const existingFiles = (() => {
    try {
      return readdirSync(reportDir).filter(f => f.startsWith("audit-210-") && f.endsWith(".csv")).map(f => resolve(reportDir, f));
    } catch { return []; }
  })();
  if (existingFiles.length === 0) {
    console.error("No existing audit-210 CSV found. Run production-valuation-audit-210.mjs first.");
    process.exit(1);
  }
  const existingCsv = readFileSync(existingFiles[0], "utf8");
  const covered = new Set(existingCsv.trim().split("\n").slice(1).map(l => l.split(",")[2]?.trim().toLowerCase()).filter(Boolean));

  console.log(`📊 Existing coverage: ${covered.size} suburbs (from ${existingFiles[0]})`);

  // 2. Keep fetching samples until we've covered all DB suburbs or convergence
  const allResults = [];
  const allErrors = [];
  const seenAddresses = new Set();
  let consecutiveFailures = 0;
  let aborted = false;
  let round = 0;
  let totalRun = 0;

  while (!aborted && round < 20) { // max 20 rounds of 100 = 2000 fetches as safety
    round++;
    // Fetch a batch
    const sampleRes = await fetchJSON(AUDIT_SAMPLE_URL, { count: BATCH_SIZE, houseRatio: 0.5 }, null);
    if (!sampleRes.ok || !sampleRes.sample?.length) {
      console.log(`\n⚠️  Empty sample at round ${round}, stopping.`);
      break;
    }

    // Filter to only uncovered suburbs, skip seen addresses
    const toRun = [];
    for (const r of sampleRes.sample) {
      const subKey = r.suburb.trim().toLowerCase();
      const addrKey = `${r.address}|${r.suburb}|${r.propertyType || "House"}`;
      if (covered.has(subKey)) continue;
      if (seenAddresses.has(addrKey)) continue;
      seenAddresses.add(addrKey);
      const fullAddr = [r.address.trim(), r.suburb.trim(), r.state.trim(), r.postcode?.toString().trim()].filter(Boolean).join(", ");
      const pt = (r.propertyType || "").toLowerCase();
      const propType = pt === "villa" || pt === "house" ? "House" : pt === "townhouse" ? "Townhouse" : "Unit";
      toRun.push({ address: fullAddr, propertyType: propType, suburb: r.suburb.trim().toLowerCase() });
    }

    if (toRun.length === 0) {
      console.log(`\n✅ Round ${round}: no new uncovered suburbs found. Checking DB total...`);
      // Check if there are still uncovered suburbs in a fresh sample
      const checkRes = await fetchJSON(AUDIT_SAMPLE_URL, { count: 50, houseRatio: 0.5 }, null);
      if (!checkRes.ok || !checkRes.sample?.length) break;
      const stillUncovered = checkRes.sample.filter(r => !covered.has(r.suburb.trim().toLowerCase()));
      if (stillUncovered.length === 0) {
        console.log("✅ All DB suburbs covered!");
        break;
      }
      // Some uncovered but not in our seen set — continue
      console.log(`⚠️  ${stillUncovered.length} still uncovered but batch had none new (dupes). Continuing...`);
    }

    console.log(`\n📦 Round ${round}: ${toRun.length} new addresses (${BATCH_SIZE} fetched, ${toRun.length} uncovered/new)`);

    for (let i = 0; i < toRun.length; i++) {
      if (aborted) break;
      const r = toRun[i];
      totalRun++;
      const res = await runOne(r.address, r.propertyType, totalRun, "∞");

      // Mark this suburb as covered regardless of pass/fail
      covered.add(r.suburb);

      if (res.ok) {
        consecutiveFailures = 0;
        allResults.push(res);
      } else {
        consecutiveFailures++;
        allErrors.push(res);
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`\n⚠️  Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
        aborted = true;
        break;
      }
    }
  }

  // 3. Report
  const passed = allResults.length;
  const failed = allErrors.length;
  const total = passed + failed;
  const passRate = total > 0 ? (passed / total * 100).toFixed(1) : "0.0";
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  🛡️  Remaining Suburbs Audit — ${total} addresses`);
  console.log(`${"═".repeat(65)}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Pass rate:    ${passRate}%`);
  console.log(`  Total unique: ${covered.size} suburbs total (was 130, added ${covered.size - 130})`);
  console.log(`  Aborted:      ${aborted ? "⚠️ YES" : "no"}`);

  if (allResults.length > 0) {
    const mids = allResults.map(r => r.midpoint);
    const sorted = [...mids].sort((a, b) => a - b);
    const avgPrice = Math.round(mids.reduce((a, b) => a + b, 0) / mids.length / 1000);
    const medianPrice = Math.round(sorted[Math.floor(sorted.length / 2)] / 1000);
    console.log(`\n  📊 New addresses only:`);
    console.log(`      Avg price: $${avgPrice}k`);
    console.log(`      Median:    $${medianPrice}k`);
    console.log(`      Range:     $${Math.round(sorted[0] / 1000)}k – $${Math.round(sorted[sorted.length - 1] / 1000)}k`);

    const scores = allResults.map(r => r.dataScore).filter(Boolean);
    const comps = allResults.map(r => r.compCount).filter(Boolean);
    const latencies = allResults.map(r => r.elapsedMs).sort((a, b) => a - b);
    if (scores.length) console.log(`      Avg score: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`);
    if (comps.length) console.log(`      Avg comps:  ${(comps.reduce((a, b) => a + b, 0) / comps.length).toFixed(1)}`);
    if (latencies.length) {
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      console.log(`      p50: ${p50}ms  |  p95: ${p95}ms`);
    }
  }

  console.log(`${"═".repeat(65)}`);

  if (allErrors.length > 0) {
    console.log(`\n⚠️  Failed addresses (${allErrors.length}):`);
    for (const e of allErrors.slice(0, 15)) {
      console.log(`  • ${e.suburb || e.address} | ${e.propertyType} → ${e.reason}`);
    }
    if (allErrors.length > 15) console.log(`  ... and ${allErrors.length - 15} more`);
  }

  // Save combined CSV
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("reports", { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  let csv = "address,propertyType,suburb,ok,midpoint,low,high,confidence,dataScore,compCount,elapsedMs,source\n";
  // Merge existing + new
  const existingRows = existingCsv.trim().split("\n").slice(1);
  for (const row of existingRows) {
    if (row.trim()) csv += row + ",existing\n";
  }
  for (const r of allResults) {
    csv += [
      `"${r.address}"`, r.propertyType, r.suburb, "true",
      r.midpoint, r.low, r.high, r.confidence, r.dataScore ?? "", r.compCount, r.elapsedMs, "new"
    ].join(",") + "\n";
  }
  for (const e of allErrors) {
    csv += [
      `"${e.address}"`, e.propertyType, e.suburb, "false",
      "", "", "", "", "", "", e.elapsedMs ?? "", "new"
    ].join(",") + "\n";
  }
  writeFileSync(`reports/audit-full-${dateStr}.csv`, csv, "utf8");
  console.log(`\n📝 Combined report: reports/audit-full-${dateStr}.csv`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[Audit] Fatal:", err.message);
  process.exit(1);
});
