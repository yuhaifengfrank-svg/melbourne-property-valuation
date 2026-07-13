#!/usr/bin/env node
/**
 * production-valuation-audit-large.mjs
 *
 * Runs N valuations against production API from DB-sampled addresses.
 * Gets the sample through /api/valuation?audit_sample=1 to avoid local DATABASE_URL dependency.
 *
 * Targets ~50% House / ~50% Unit, covering diverse suburbs.
 *
 * Usage: node tests/production-valuation-audit-large.mjs [--count 200]
 *   --api <url>:     override API base URL
 *   --count <n>:     number of addresses (default: 200)
 *   --house-ratio <f>: ratio of houses (default: 0.5)
 *   --no-abort:      don't abort on consecutive failures
 */

const API_BASE = (() => {
  const idx = process.argv.indexOf("--api");
  return idx >= 0 ? process.argv[idx + 1] : "https://aushomevalue.com.au";
})();

const AUDIT_SAMPLE_URL = `${API_BASE}/api/valuation?audit_sample=1`;
const VALUATION_URL = `${API_BASE}/api/valuation`;

const TARGET_COUNT = (() => {
  const idx = process.argv.indexOf("--count");
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 200;
})();

const HOUSE_RATIO = (() => {
  const idx = process.argv.indexOf("--house-ratio");
  return idx >= 0 ? parseFloat(process.argv[idx + 1]) : 0.5;
})();

const TIMEOUT = 30_000;
const MAX_CONSECUTIVE_FAILURES = process.argv.includes("--no-abort") ? Infinity : 10;

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

function pad(v, w) {
  const s = String(v);
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function icon(propertyType) {
  const t = (propertyType || "").toLowerCase();
  return t === "house" || t === "villa" ? "🏠" : "🏢";
}

async function fetchJSON(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${resp.statusText} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function main() {
  console.log(`🛡️  Production Valuation Audit — Large Scale`);
  console.log(`   API:          ${API_BASE}`);
  console.log(`   Target:       ${TARGET_COUNT} addresses`);
  console.log(`   House ratio:  ${(HOUSE_RATIO * 100).toFixed(0)}%`);
  console.log(`   Timeout:      ${TIMEOUT / 1000}s/valuation`);
  console.log(`   Max fails:    ${MAX_CONSECUTIVE_FAILURES === Infinity ? "∞" : MAX_CONSECUTIVE_FAILURES}\n`);

  // ── Phase 1: Get sample from API ──
  console.log("📡 Fetching address sample from API...");
  const sampleResult = await fetchJSON(AUDIT_SAMPLE_URL, {
    count: TARGET_COUNT,
    houseRatio: HOUSE_RATIO,
  });

  if (!sampleResult.ok || !sampleResult.sample || sampleResult.sample.length === 0) {
    console.error(`[Audit] Failed to get sample: ${sampleResult.error || "empty sample"}`);
    process.exit(1);
  }

  const rows = sampleResult.sample;
  console.log(`   Got ${rows.length} addresses (${sampleResult.houseCount} House, ${sampleResult.unitCount} Unit/Apt)\n`);

  // ── Phase 2: Run valuations ──
  const startTime = Date.now();
  const results = [];
  const errors = [];
  let consecutiveFailures = 0;
  let aborted = false;

  for (let i = 0; i < rows.length; i++) {
    if (aborted) break;

    const r = rows[i];
    const address = [r.address, r.suburb, r.state, r.postcode].filter(Boolean).join(", ");
    const propertyType = r.propertyType;

    process.stdout.write(`  ${pad(i + 1, 3)}/${rows.length} ${icon(propertyType)} ${r.suburb}... `);

    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      let result;
      try {
        result = await fetchJSON(VALUATION_URL, {
          address,
          propertyType,
          fetch: false,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const elapsedMs = Date.now() - t0;

      if (result && result.ok) {
        const estimate = result.estimate || {};
        const conf = result.confidence || {};
        const hasMidpoint = typeof estimate.midpoint === "number" && estimate.midpoint > 0;
        const hasRange = typeof estimate.low === "number" && typeof estimate.high === "number";

        if (hasMidpoint && hasRange) {
          process.stdout.write(
            `✅ $${Math.round(estimate.midpoint / 1000)}k [${Math.round(estimate.low / 1000)}k-${Math.round(estimate.high / 1000)}k] ${conf.label || "?"} (${elapsedMs}ms)\n`
          );
          consecutiveFailures = 0;
          results.push({
            address,
            propertyType,
            suburb: r.suburb,
            midpoint: estimate.midpoint,
            low: estimate.low,
            high: estimate.high,
            confidence: conf.label,
            dataScore: conf.dataScore,
            compCount: result.comparableCount || 0,
            elapsedMs,
            salesCount: r.salesCount,
          });
        } else {
          process.stdout.write(`⚠️  no-valid-est\n`);
          consecutiveFailures = 0;
          errors.push({ address, propertyType, suburb: r.suburb, reason: "No valid estimate" });
        }
      } else {
        const errMsg = result?.error || "Unknown API error";
        process.stdout.write(`❌ ${errMsg}\n`);
        consecutiveFailures++;
        errors.push({ address, propertyType, suburb: r.suburb, reason: errMsg });
      }
    } catch (err) {
      const msg = err.name === "AbortError" ? `⏰ Timeout` : `💥 ${err.message}`;
      process.stdout.write(`${msg}\n`);
      consecutiveFailures++;
      errors.push({ address, propertyType, suburb: r.suburb, reason: msg });
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`\n⚠️  Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive failures — API likely down.`);
      aborted = true;
    }
  }

  // ── Phase 3: Report ──
  const totalTime = elapsed(startTime);
  const passed = results.length;
  const failed = errors.length;
  const total = passed + failed;
  const passRate = total > 0 ? (passed / total * 100).toFixed(1) : "0.0";

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🛡️  Production Valuation Audit — ${total} addresses`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  API:          ${VALUATION_URL}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Pass rate:    ${passRate}%`);
  console.log(`  Total time:   ${totalTime}s`);
  console.log(`  Avg per call: ${total > 0 ? (totalTime / total * 1000).toFixed(0) : "-"}ms`);
  console.log(`  Aborted:      ${aborted ? "⚠️ YES" : "no"}`);

  const houseResults = results.filter(r => r.propertyType === "House");
  const unitResults = results.filter(r => r.propertyType !== "House");
  const houseErrors = errors.filter(e => e.propertyType === "House");
  const unitErrors = errors.filter(e => e.propertyType !== "House");

  console.log(`  🏠 House:     ${houseResults.length} ok / ${houseErrors.length} fail (${houseResults.length + houseErrors.length > 0 ? ((houseResults.length / (houseResults.length + houseErrors.length) * 100).toFixed(1)) : "-"}%)`);
  console.log(`  🏢 Unit/Apt:  ${unitResults.length} ok / ${unitErrors.length} fail (${unitResults.length + unitErrors.length > 0 ? ((unitResults.length / (unitResults.length + unitErrors.length) * 100).toFixed(1)) : "-"}%)`);

  if (results.length > 0) {
    const mids = results.map(r => r.midpoint).filter(Boolean);
    const scores = results.map(r => r.dataScore).filter(s => s != null);
    const comps = results.map(r => r.compCount).filter(c => c != null);
    const latencies = results.map(r => r.elapsedMs);
    const latSort = [...latencies].sort((a, b) => a - b);

    if (mids.length) {
      const sorted = [...mids].sort((a, b) => a - b);
      const avgPrice = Math.round(mids.reduce((a, b) => a + b, 0) / mids.length / 1000);
      const medianPrice = Math.round(sorted[Math.floor(sorted.length / 2)] / 1000);

      // Suburb uniqueness
      const uniqueSuburbs = new Set(results.map(r => r.suburb)).size;

      console.log();
      console.log(`  📊 Price Stats`);
      console.log(`      Average:   $${avgPrice}k`);
      console.log(`      Median:    $${medianPrice}k`);
      console.log(`      Range:     $${Math.round(sorted[0] / 1000)}k – $${Math.round(sorted[sorted.length - 1] / 1000)}k`);
      console.log(`      Suburbs:   ${uniqueSuburbs} unique`);

      // By property type
      if (houseResults.length > 0) {
        const hMids = houseResults.map(r => r.midpoint);
        const hSorted = [...hMids].sort((a, b) => a - b);
        const hMed = hSorted[Math.floor(hSorted.length / 2)];
        console.log(`      🏠 House median:   $${Math.round(hMed / 1000)}k`);
      }
      if (unitResults.length > 0) {
        const uMids = unitResults.map(r => r.midpoint);
        const uSorted = [...uMids].sort((a, b) => a - b);
        const uMed = uSorted[Math.floor(uSorted.length / 2)];
        console.log(`      🏢 Unit median:    $${Math.round(uMed / 1000)}k`);
      }
    }

    if (scores.length) {
      const byConf = {};
      for (let i = 0; i < results.length; i++) {
        const l = results[i].confidence;
        byConf[l] = (byConf[l] || 0) + 1;
      }
      const confParts = Object.entries(byConf)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      console.log();
      console.log(`  📊 Confidence`);
      console.log(`      ${confParts}`);
      console.log(`      Avg dataScore: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`);
    }

    if (comps.length) {
      const avgComps = comps.reduce((a, b) => a + b, 0) / comps.length;
      console.log(`      Avg comparables:    ${avgComps.toFixed(1)}`);
      if (houseResults.length) {
        const hc = houseResults.map(r => r.compCount);
        console.log(`      🏠 House avg comps:  ${(hc.reduce((a, b) => a + b, 0) / hc.length).toFixed(1)}`);
      }
      if (unitResults.length) {
        const uc = unitResults.map(r => r.compCount);
        console.log(`      🏢 Unit avg comps:   ${(uc.reduce((a, b) => a + b, 0) / uc.length).toFixed(1)}`);
      }
    }

    console.log();
    console.log(`  ⏱  Latency`);
    const p50 = latSort[Math.floor(latSort.length * 0.5)];
    const p90 = latSort[Math.floor(latSort.length * 0.9)];
    const p95 = latSort[Math.floor(latSort.length * 0.95)];
    const p99 = latSort[Math.floor(latSort.length * 0.99)];
    console.log(`      Average: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
    console.log(`      p50:     ${p50}ms`);
    console.log(`      p90:     ${p90}ms`);
    console.log(`      p95:     ${p95}ms`);
    console.log(`      p99:     ${p99}ms`);
    console.log(`      Min:     ${latSort[0]}ms`);
    console.log(`      Max:     ${latSort[latSort.length - 1]}ms`);
  }

  console.log(`${"═".repeat(60)}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Failed addresses (${errors.length}):`);
    for (const e of errors.slice(0, 25)) {
      console.log(`  • ${e.suburb} | ${e.propertyType} | ${e.address}`);
      console.log(`    → ${e.reason}`);
    }
    if (errors.length > 25) {
      console.log(`  ... and ${errors.length - 25} more failures`);
    }
  }

  // Save JSON report
  const reportPath = `reports/audit-large-${new Date().toISOString().slice(0, 10)}.json`;
  if (typeof require !== "undefined" || true) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dir = resolve(process.argv[1] ? require("node:path").dirname(process.argv[1]) : ".", "..", "reports");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, `audit-large-${new Date().toISOString().slice(0, 10)}.json`),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        api: VALUATION_URL,
        total,
        passed,
        failed,
        passRate: `${passRate}%`,
        totalTime: `${totalTime}s`,
        avgLatency: results.length > 0 ? `${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms` : "-",
        p95Latency: results.length > 0 ? `${[...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]}ms` : "-",
        housePassRate: houseResults.length + houseErrors.length > 0
          ? `${(houseResults.length / (houseResults.length + houseErrors.length) * 100).toFixed(1)}%`
          : "-",
        unitPassRate: unitResults.length + unitErrors.length > 0
          ? `${(unitResults.length / (unitResults.length + unitErrors.length) * 100).toFixed(1)}%`
          : "-",
        confidenceBreakdown: results.length > 0
          ? (() => {
              const b = {};
              for (const r of results) {
                b[r.confidence] = (b[r.confidence] || 0) + 1;
              }
              return b;
            })()
          : {},
        topFailures: errors.slice(0, 50).map(e => ({ suburb: e.suburb, type: e.propertyType, reason: e.reason })),
        results: results.map(r => ({
          address: r.address,
          propertyType: r.propertyType,
          suburb: r.suburb,
          midpoint: r.midpoint,
          confidence: r.confidence,
          dataScore: r.dataScore,
          compCount: r.compCount,
          elapsedMs: r.elapsedMs,
        })),
      }, null, 2),
      "utf8"
    );
    console.log(`\n📝 Report saved to reports/audit-large-${new Date().toISOString().slice(0, 10)}.json`);
  }

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[Audit] Fatal:", err.message);
  process.exit(1);
});
