#!/usr/bin/env node
/**
 * production-valuation-audit-210.mjs
 *
 * Runs 200 House/Unit/Townhouse valuations + 10 large-lot properties
 * against production API. Saves full address detail CSV + summary JSON.
 *
 * Usage: node tests/production-valuation-audit-210.mjs
 *   --api <url>     API base URL (default: https://aushomevalue.com.au)
 *   --out <path>    output dir (default: ./reports/)
 */

const API_BASE = (() => {
  const i = process.argv.indexOf("--api");
  return i >= 0 ? process.argv[i + 1] : "https://aushomevalue.com.au";
})();
const AUDIT_SAMPLE_URL = `${API_BASE}/api/valuation?audit_sample=1`;
const VALUATION_URL = `${API_BASE}/api/valuation`;
const TIMEOUT = 30_000;
const MAX_CONSECUTIVE_FAILURES = 10;

// ── Large-lot properties (≥1,000m² land from real sales data) ──
const LARGE_LOT_ADDRESSES = [
  "10 Balmoral Avenue, Balwyn, VIC",
  "42 Tintern Avenue, Toorak, VIC",
  "8 Russell Street, Camberwell, VIC",
  "25 Fulton Drive, Templestowe, VIC",
  "15 Brooklyn Avenue, Mount Waverley, VIC",
  "7 Pannam Drive, Doncaster East, VIC",
  "68 Kameruka Road, Wheelers Hill, VIC",
  "33 Baringo Close, Mulgrave, VIC",
  "19 Inglesby Road, Camberwell, VIC",
  "12 Cygnet Street, Wantirna South, VIC",
];

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

function pad(v, w) {
  const s = String(v);
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function icon(t) {
  const tt = (t || "").toLowerCase();
  if (tt === "house" || tt === "villa") return "🏠";
  if (tt === "townhouse") return "🏡";
  return "🏢";
}

async function fetchJSON(url, body, signal) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${resp.statusText} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function runOne(address, propertyType, index, total) {
  const suburb = address.split(",")[1]?.trim() || address.split(",")[0]?.trim() || address;
  const label = address.includes(",") ? suburb : address;
  process.stdout.write(`  ${pad(index, 3)}/${total} ${icon(propertyType)} ${label}... `);

  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT);
    let result;
    try {
      result = await fetchJSON(VALUATION_URL, { address, propertyType }, controller.signal);
    } finally {
      clearTimeout(tid);
    }
    const elapsedMs = Date.now() - t0;

    if (result?.ok) {
      const e = result.estimate || {};
      const c = result.confidence || {};
      if (typeof e.midpoint === "number" && e.midpoint > 0 && typeof e.low === "number" && typeof e.high === "number") {
        process.stdout.write(`✅ $${Math.round(e.midpoint / 1000)}k [${Math.round(e.low / 1000)}k-${Math.round(e.high / 1000)}k] ${c.label || "?"} (${elapsedMs}ms)\n`);
        return {
          ok: true, address, propertyType, suburb,
          midpoint: e.midpoint, low: e.low, high: e.high,
          confidence: c.label, dataScore: c.dataScore,
          compCount: result.comparableCount || 0,
          elapsedMs,
        };
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
  console.log(`🛡️  Production Valuation Audit — 210 addresses`);
  console.log(`   API:  ${VALUATION_URL}\n`);

  // ── Phase 1: Sample 200 from DB (100 House, 100 Unit/Townhouse) ──
  console.log("📡 Fetching 200-address sample (half House, half Unit/Townhouse)...");
  const sampleRes = await fetchJSON(AUDIT_SAMPLE_URL, { count: 200, houseRatio: 0.5 }, null);
  if (!sampleRes.ok || !sampleRes.sample?.length) {
    console.error("Failed to get sample:", sampleRes.error || "empty");
    process.exit(1);
  }
  const dbRows = sampleRes.sample;
  console.log(`   Got ${dbRows.length} (${sampleRes.houseCount} House, ${sampleRes.unitCount} other)\n`);

  // ── Phase 2: Build final list ──
  // Filter: keep all "House" + "Villa" as house, rest as unit/townhouse
  const houseRows = dbRows.filter(r => (r.propertyType || "").toLowerCase() === "house");
  const nonHouseRows = dbRows.filter(r => (r.propertyType || "").toLowerCase() !== "house");

  // We want exactly 100 house and 100 non-house
  const finalHouse = houseRows.slice(0, 100);
  const finalNonHouse = nonHouseRows.slice(0, 100);

  const mainRows = [
    ...finalHouse.map(r => ({ address: `${r.address}, ${r.suburb}, ${r.state} ${r.postcode}`, propertyType: "House" })),
    ...finalNonHouse.map(r => {
      const t = (r.propertyType || "").toLowerCase();
      const pt = t === "villa" ? "House" : t === "townhouse" ? "Townhouse" : "Unit";
      return { address: `${r.address}, ${r.suburb}, ${r.state} ${r.postcode}`, propertyType: pt };
    }),
  ].sort(() => Math.random() - 0.5);

  // Add 10 large-lot properties
  const allRows = [
    ...mainRows,
    ...LARGE_LOT_ADDRESSES.map(a => ({ address: a, propertyType: "House", _isLargeLot: true })),
  ];

  console.log(`   Run list: ${allRows.length} addresses`);
  console.log(`     DB House:     ${finalHouse.length}`);
  console.log(`     DB Unit/TH:   ${finalNonHouse.length}`);
  console.log(`     Large-lot:    ${LARGE_LOT_ADDRESSES.length}\n`);

  // ── Phase 3: Run valuations ──
  const startTime = Date.now();
  const results = [];
  const errors = [];
  let consecutiveFailures = 0;
  let aborted = false;

  for (let i = 0; i < allRows.length; i++) {
    if (aborted) break;
    const r = allRows[i];
    const res = await runOne(r.address, r.propertyType, i + 1, allRows.length);
    if (r._isLargeLot) res._isLargeLot = true;
    if (res.ok) {
      consecutiveFailures = 0;
      results.push(res);
    } else {
      consecutiveFailures++;
      errors.push(res);
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`\n⚠️  Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`);
      aborted = true;
    }
  }

  // ── Phase 4: Report ──
  const totalTime = elapsed(startTime);
  const passed = results.length;
  const failed = errors.length;
  const total = passed + failed;
  const passRate = total > 0 ? (passed / total * 100).toFixed(1) : "0.0";

  // Group by type
  const byType = {};
  for (const r of results) {
    const t = r.propertyType;
    if (!byType[t]) byType[t] = { ok: 0, fail: 0, mids: [], comps: [], lat: [] };
    byType[t].ok++;
    byType[t].mids.push(r.midpoint);
    byType[t].comps.push(r.compCount);
    byType[t].lat.push(r.elapsedMs);
  }
  for (const e of errors) {
    const t = e.propertyType;
    if (!byType[t]) byType[t] = { ok: 0, fail: 0, mids: [], comps: [], lat: [] };
    byType[t].fail++;
  }

  const largeLotResults = results.filter(r => r._isLargeLot);
  const largeLotErrors = errors.filter(e => e._isLargeLot);

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  🛡️  Production Valuation Audit — ${total} addresses`);
  console.log(`${"═".repeat(65)}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Pass rate:    ${passRate}%`);
  console.log(`  Total time:   ${totalTime}s`);
  console.log(`  Avg per call: ${total > 0 ? (totalTime / total * 1000).toFixed(0) : "-"}ms`);
  console.log(`  Aborted:      ${aborted ? "⚠️ YES" : "no"}`);

  for (const [t, stats] of Object.entries(byType).sort((a, b) => b[1].ok - a[1].ok)) {
    const rate = stats.ok + stats.fail > 0 ? (stats.ok / (stats.ok + stats.fail) * 100).toFixed(1) : "-";
    console.log(`  ${icon(t)} ${t}: ${stats.ok}/${stats.ok + stats.fail} (${rate}%)`);
  }

  if (largeLotResults.length || largeLotErrors.length) {
    const llRate = largeLotResults.length / (largeLotResults.length + largeLotErrors.length) * 100;
    console.log(`  🌳 Large-lot (≥1000m²): ${largeLotResults.length}/${largeLotResults.length + largeLotErrors.length} (${llRate.toFixed(1)}%)`);
  }

  if (results.length > 0) {
    const mids = results.map(r => r.midpoint);
    const sorted = [...mids].sort((a, b) => a - b);
    const avgPrice = Math.round(mids.reduce((a, b) => a + b, 0) / mids.length / 1000);
    const medianPrice = Math.round(sorted[Math.floor(sorted.length / 2)] / 1000);
    const uniqueSuburbs = new Set(results.map(r => r.suburb)).size;

    console.log(`\n  📊 Price Stats`);
    console.log(`      Average:   $${avgPrice}k`);
    console.log(`      Median:    $${medianPrice}k`);
    console.log(`      Range:     $${Math.round(sorted[0] / 1000)}k – $${Math.round(sorted[sorted.length - 1] / 1000)}k`);
    console.log(`      Suburbs:   ${uniqueSuburbs} unique`);

    for (const [t, stats] of Object.entries(byType).sort((a, b) => b[1].ok - a[1].ok)) {
      if (stats.mids.length) {
        const s = [...stats.mids].sort((a, b) => a - b);
        const med = Math.round(s[Math.floor(s.length / 2)] / 1000);
        const avg = Math.round(stats.mids.reduce((a, b) => a + b, 0) / stats.mids.length / 1000);
        console.log(`      ${icon(t)} ${t} median: $${med}k (avg $${avg}k)`);
      }
    }

    // Confidence
    const byConf = {};
    for (const r of results) {
      byConf[r.confidence] = (byConf[r.confidence] || 0) + 1;
    }
    const confParts = Object.entries(byConf).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", ");
    const avgScore = results.reduce((s, r) => s + (r.dataScore || 0), 0) / results.length;
    console.log(`\n  📊 Confidence:  ${confParts}`);
    console.log(`      Avg score: ${avgScore.toFixed(1)}`);

    // Comparables
    const avgComps = results.reduce((s, r) => s + r.compCount, 0) / results.length;
    console.log(`      Avg comps:  ${avgComps.toFixed(1)}`);

    // Latency
    const latencies = results.map(r => r.elapsedMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p90 = latencies[Math.floor(latencies.length * 0.9)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    console.log(`\n  ⏱  Latency`);
    console.log(`      Avg: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
    console.log(`      p50: ${p50}ms  |  p90: ${p90}ms  |  p95: ${p95}ms  |  p99: ${p99}ms`);
    console.log(`      Min: ${latencies[0]}ms  |  Max: ${latencies[latencies.length - 1]}ms`);
  }
  console.log(`${"═".repeat(65)}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Failed addresses (${errors.length}):`);
    for (const e of errors.slice(0, 20)) {
      console.log(`  • ${e.suburb || e.address} | ${e.propertyType}`);
      console.log(`    → ${e.reason}`);
    }
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
  }

  // ── Save detailed reports ──
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const outDir = (() => {
    const i = process.argv.indexOf("--out");
    return i >= 0 ? process.argv[i + 1] : "reports";
  })();
  mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  // CSV: all addresses with results
  let csv = "address,propertyType,suburb,ok,midpoint,low,high,confidence,dataScore,compCount,elapsedMs,largeLot\n";
  for (const r of results) {
    csv += [
      `"${r.address}"`, r.propertyType, r.suburb, "true",
      r.midpoint, r.low, r.high, r.confidence, r.dataScore ?? "", r.compCount, r.elapsedMs,
      r._isLargeLot ? "yes" : "",
    ].join(",") + "\n";
  }
  for (const e of errors) {
    csv += [
      `"${e.address}"`, e.propertyType, e.suburb || "", "false",
      "", "", "", "", "", "", e.elapsedMs ?? "",
      e._isLargeLot ? "yes" : "",
    ].join(",") + "\n";
  }
  writeFileSync(resolve(outDir, `audit-210-${dateStr}.csv`), csv, "utf8");

  // JSON: full results
  const jsonReport = {
    timestamp: new Date().toISOString(),
    api: VALUATION_URL,
    total, passed, failed,
    passRate: `${passRate}%`,
    totalTime: `${totalTime}s`,
    avgLatency: results.length > 0
      ? `${Math.round(results.reduce((s, r) => s + r.elapsedMs, 0) / results.length)}ms`
      : "-",
    p95Latency: results.length > 0
      ? `${[...results].sort((a, b) => a.elapsedMs - b.elapsedMs)[Math.floor(results.length * 0.95)].elapsedMs}ms`
      : "-",
    breakdown: Object.fromEntries(
      Object.entries(byType).map(([t, s]) => [t, {
        passRate: `${(s.ok / (s.ok + s.fail) * 100).toFixed(1)}%`,
        medianPrice: s.mids.length
          ? `$${Math.round([...s.mids].sort((a, b) => a - b)[Math.floor(s.mids.length / 2)] / 1000)}k`
          : "-",
        avgComps: s.comps.length ? (s.comps.reduce((a, b) => a + b, 0) / s.comps.length).toFixed(1) : "-",
      }])
    ),
    largeLot: {
      total: LARGE_LOT_ADDRESSES.length,
      passed: largeLotResults.length,
      failed: largeLotErrors.length,
      rate: `${(largeLotResults.length / LARGE_LOT_ADDRESSES.length * 100).toFixed(1)}%`,
    },
    topFailures: errors.slice(0, 50).map(e => ({
      address: e.address, propertyType: e.propertyType, reason: e.reason,
    })),
    results: results.map(r => ({
      address: r.address, propertyType: r.propertyType, suburb: r.suburb,
      midpoint: r.midpoint, confidence: r.confidence, dataScore: r.dataScore,
      compCount: r.compCount, elapsedMs: r.elapsedMs, largeLot: !!r._isLargeLot,
    })),
    errors: errors.map(e => ({
      address: e.address, propertyType: e.propertyType, reason: e.reason, largeLot: !!e._isLargeLot,
    })),
  };
  writeFileSync(resolve(outDir, `audit-210-${timestamp}.json`), JSON.stringify(jsonReport, null, 2), "utf8");

  console.log(`\n📝 Reports saved:`);
  console.log(`   audit-210-${dateStr}.csv`);
  console.log(`   audit-210-${timestamp}.json`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[Audit] Fatal:", err.message);
  process.exit(1);
});
