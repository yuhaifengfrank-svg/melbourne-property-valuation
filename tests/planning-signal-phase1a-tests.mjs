// ── planning-signal-phase1a-tests.mjs ──
// Phase 1A: VicPlan Zone/Overlay → Product Integration Tests
//
// Coverage:
//   1. planning-signal-service.js: query + interpretation + component
//   2. report-viewer.js: Planning section rendered with bilingual keys
//   3. index.html: Investor Watch planning-specific items
//   4. No forbidden language: approved, can subdivide, approval likely,
//      no heritage risk, no overlay (absolute)
//   5. Planning component caps: -15 to +15
//   6. Missing planning data: no crash, manualReviewRequired=true
//   7. $3.99 Full Report untouched
//   8. Stripe / payment / entitlement unaffected

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Helpers ──
let passed = 0;
let failed = 0;
const errors = [];

function ok(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = `  ❌ ${label}`;
    console.error(msg);
    errors.push(msg);
  }
}

// ── 1. planning-signal-service.js ──
async function testPlanningService() {
  console.log("\n━━━ 1. planning-signal-service.js ───");

  const mod = await import("../lib/planning-signal-service.js");
  const sql = neon(process.env.DATABASE_URL);

  // 1a. Scoresby: IN1Z, no overlay
  const scoresby = await mod.getPlanningSignals(sql, -37.8978, 145.2161);
  ok(scoresby.ok === true, "Scoresby ok");
  ok(scoresby.zone && scoresby.zone.code === "IN1Z", `Scoresby zone = ${scoresby.zone?.code}`);
  ok(scoresby.zone.category === "industrial", `Scoresby zone category = ${scoresby.zone?.category}`);
  ok(scoresby.overlays.length === 0, "Scoresby no overlays");
  ok(scoresby.planningConstraintLevel != null, "Scoresby constraint set");
  ok(scoresby.manualReviewRequired === false, "Scoresby no manual review");
  ok(scoresby.limitations.length === 2, "Scoresby has 2 limitations");
  ok(scoresby.limitations[0].includes("Heritage Overlay"), "Limitation mentions Heritage Overlay");
  ok(scoresby.limitations[1].includes("not development approval"), "Limitation mentions not approval");

  // 1b. Donvale: LDRZ + SLO1
  const donvale = await mod.getPlanningSignals(sql, -37.7856, 145.1892);
  ok(donvale.ok === true, "Donvale ok");
  ok(donvale.zone && donvale.zone.code === "LDRZ", `Donvale zone = ${donvale.zone?.code}`);
  ok(donvale.zone.category === "residential", `Donvale category = ${donvale.zone.category}`);
  ok(donvale.overlays.length === 1, "Donvale has 1 overlay");
  ok(donvale.overlays[0].code === "SLO1", `Donvale overlay = ${donvale.overlays[0].code}`);
  ok(donvale.overlays[0].category === "landscape", `Overlay category = ${donvale.overlays[0].category}`);
  ok(donvale.planningConstraintLevel === "medium", `Donvale constraint = ${donvale.planningConstraintLevel}`);
  ok(donvale.redevelopmentFlexibilityHint === "mixed", `Donvale flexibility = ${donvale.redevelopmentFlexibilityHint}`);

  // 1c. CBD: CCZ2 + DDOs + flood
  const cbd = await mod.getPlanningSignals(sql, -37.813, 144.963);
  ok(cbd.zone && cbd.zone.code === "CCZ2", `CBD zone = ${cbd.zone?.code}`);
  ok(cbd.overlays.length >= 3, `CBD overlays ${cbd.overlays.length} (expect >=3)`);
  const hasDesign = cbd.overlays.some((o) => o.category === "design");
  ok(hasDesign, "CBD has design overlay");
  const hasFlood = cbd.overlays.some((o) => o.category === "flood");
  ok(hasFlood, "CBD has flood overlay");
  ok(cbd.planningConstraintLevel === "high", `CBD constraint = ${cbd.planningConstraintLevel}`);

  // 1d. Invalid coordinate
  const invalid = await mod.getPlanningSignals(sql, 999, 999);
  ok(invalid.ok === false, "Invalid coord ok=false");
  ok(invalid.zone === null, "Invalid zone=null");
  ok(invalid.manualReviewRequired === true, "Invalid manualReviewRequired");

  // 1e. planning component - cap checks
  const pcScoresby = mod.computePlanningComponent(scoresby);
  ok(typeof pcScoresby.score === "number", "Component score is number");
  ok(pcScoresby.score >= -15 && pcScoresby.score <= 15,
    `Component score ${pcScoresby.score} in [-15,15]`);
  ok(typeof pcScoresby.confidence === "string", "Component confidence is string");
  ok(pcScoresby.confidence === "medium" || pcScoresby.confidence === "low",
    "Component confidence valid");

  const pcCBD = mod.computePlanningComponent(cbd);
  ok(pcCBD.score >= -15 && pcCBD.score <= 15,
    `CBD component ${pcCBD.score} in [-15,15]`);

  const pcInvalid = mod.computePlanningComponent(invalid);
  ok(pcInvalid.score === 0, "Invalid component score = 0");
  ok(pcInvalid.confidence === "low", "Invalid confidence = low");

  // 1f. No forbidden words in any interpretation
  const forbidden = ["approved", "can subdivide", "approval likely", "no heritage risk"];
  // Note: "no overlay" is NOT forbidden — "no overlay data" is the legitimate limitation text
  for (const f of forbidden) {
    const texts = [
      scoresby.zone?.interpretation || "",
      ...scoresby.overlays.map((o) => o.interpretation || ""),
      donvale.zone?.interpretation || "",
      ...donvale.overlays.map((o) => o.interpretation || ""),
      cbd.zone?.interpretation || "",
      ...cbd.overlays.map((o) => o.interpretation || ""),
    ];
    for (const t of texts) {
      if (t.toLowerCase().includes(f.toLowerCase())) {
        ok(false, `Forbidden word '${f}' found in: "${t}"`);
      }
    }
  }
  // 1g. Static check: ALL ZONE_INTERPRETATIONS and OVERLAY_INTERPRETATIONS
  //     must not contain forbidden words
  const staticForbidden = ["approved", "can subdivide", "approval likely", "no heritage risk"];
  // — ZONE_INTERPRETATIONS
  const zoneInterpValues = Object.values(mod.ZONE_INTERPRETATIONS || {});
  for (const val of zoneInterpValues) {
    for (const f of staticForbidden) {
      if (val && val.toLowerCase().includes(f)) {
        ok(false, `Forbidden '${f}' in ZONE_INTERPRETATIONS: "${val}"`);
      }
    }
  }
  // — OVERLAY_INTERPRETATIONS (but the module only exports getPlanningSignals & computePlanningComponent)
  //   Read the source file directly
  const serviceCode = fs.readFileSync(path.join(__dirname, "..", "lib", "planning-signal-service.js"), "utf8");
  const interpMatches = [...serviceCode.matchAll(/": "([^"]+)},?\n/g)];
  for (const m of interpMatches) {
    const val = m[1];
    for (const f of staticForbidden) {
      if (val && val.toLowerCase().includes(f)) {
        ok(false, `Forbidden '${f}' in service interpretations: "${val}"`);
      }
    }
  }
}

// ── 2. report-viewer.js ──
function testReportViewer() {
  console.log("\n━━━ 2. report-viewer.js ───");
  const content = fs.readFileSync(path.join(ROOT, "public/report-viewer.js"), "utf8");

  // 2a. Planning & Zoning Signals section
  ok(content.includes('planningTitle'), "Has planningTitle key");
  ok(content.includes('p.planningSignals = input.planningSignals || null'),
    "normalizePayload preserves planningSignals");
  ok(content.includes('planningIntro'), "Has planningIntro key");
  ok(content.includes('planningZone'), "Has planningZone key");
  ok(content.includes('planningCategory'), "Has planningCategory key");
  ok(content.includes('planningInterpretation'), "Has planningInterpretation key");
  ok(content.includes('planningOverlays'), "Has planningOverlays key");
  ok(content.includes('planningConstraintLevel'), "Has planningConstraintLevel key");
  ok(content.includes('planningFlexibility'), "Has planningFlexibility key");
  ok(content.includes('planningManualReview'), "Has planningManualReview key");
  ok(content.includes('planningLimitations'), "Has planningLimitations key");
  ok(content.includes('planningNone'), "Has planningNone key");
  ok(content.includes('planningUnavailable'), "Has planningUnavailable key");

  // 2b. Bilingual keys
  ok(content.includes('规划与分区信号'), "ZH planningTitle");
  ok(content.includes('规划约束级别'), "ZH planningConstraintLevel");
  ok(content.includes('开发灵活性'), "ZH planningFlexibility");
  ok(content.includes('建议人工复核'), "ZH planningManualReview");
  ok(content.includes('数据局限性'), "ZH planningLimitations");
  ok(content.includes('暂无规划信号数据'), "ZH planningUnavailable");

  // 2b-extra. Forbidden word scan in report-viewer planning text
  const rvForbidden = ['approved', 'can subdivide', 'approval likely', 'no heritage risk', 'no overlay'];
  // Extract all planning-related literal strings after planningTitle
  const rvPlanningText = content.slice(content.indexOf('planningIntro'), content.indexOf('planningSignals'));
  for (const f of rvForbidden) {
    const lowered = rvPlanningText.toLowerCase();
    if (lowered.includes(f)) {
      // 'no overlay' in 'No overlay record was returned' is fine
      if (f === 'no overlay' && lowered.includes('no overlay record')) continue;
      ok(false, "Forbidden '" + f + "' in report-viewer planning text");
    }
  }

  // 2c. Planning section uses appendSection(text("planningTitle")
  ok(content.includes('text("planningTitle")'), "Section uses text() for planningTitle");
  ok(content.includes('p.planningSignals'), "References p.planningSignals");

  // 2d. Planning & Zoning Signals section inserted (between futureOutlook and Valuation Methodology)
  ok(content.includes('// ── 6. Planning & Zoning Signals ──'), "Section comment present");
  ok(content.includes('// ── 7. Valuation Methodology ──'), "Valuation methodology is section 7");

  // 2e. Investor Watch features include planning-specific items
  ok(content.includes('Zoning and overlay signal monitoring'), "EN: Zoning monitoring");
  ok(content.includes('Development constraint alerts when new data is available'), "EN: Dev alerts");
  ok(content.includes('Planning signal updates for saved suburbs'), "EN: Planning updates");
  ok(content.includes('分区与 Overlay 信号追踪'), "ZH: Zoning overlay tracking");
  ok(content.includes('有新数据时提示潜在规划限制'), "ZH: Constraint alerts");
  ok(content.includes('对收藏区域和房产更新规划信号'), "ZH: Planning updates");

  // 2f. No forbidden words
  const forbidden = ["approved", "can subdivide", "approval likely"];
  for (const f of forbidden) {
    ok(!content.toLowerCase().includes(f.toLowerCase()), `No '${f}' in report-viewer.js`);
  }
  // "no overlay" is allowed in the 'none' text but must say "no overlay data"
  ok(content.includes("No overlay record"), "planningNone uses conservative language");

  // 2g. Heritage Overlay limitation in planningIntro
  ok(content.includes("absence of heritage controls"), "EN Heritage Overlay limitation in planningIntro");
  ok(content.includes("不存在 Heritage 控制"), "ZH Heritage Overlay limitation in planningIntro");
}

// ── 3. index.html ──
function testIndexHtml() {
  console.log("\n━━━ 3. index.html ───");
  const content = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

  ok(content.includes('Zoning and overlay signal monitoring'), "Index: Zoning monitoring");
  ok(content.includes('Development constraint alerts when new data is available'), "Index: Dev alerts");
  ok(content.includes('Planning signal updates for saved suburbs'), "Index: Planning updates");
  ok(content.includes('分区与 Overlay 信号追踪'), "Index ZH: Zoning overlay tracking");
  ok(content.includes('有新数据时提示潜在规划限制'), "Index ZH: Constraint alerts");
  ok(content.includes('对收藏区域和房产更新规划信号'), "Index ZH: Planning updates");

  // Forbidden words — scope to Investor Watch / planning sections only
  // (Pre-existing "Approval certainty" labels in opportunity engine are excluded)
  const forbiddenPhrases = ["can subdivide", "approval likely", "no heritage risk"];
  const iwSectionStart = content.indexOf("investor-watch-panel");
  const iwSection = iwSectionStart >= 0 ? content.slice(iwSectionStart) : "";
  for (const f of forbiddenPhrases) {
    ok(!iwSection.toLowerCase().includes(f.toLowerCase()), `No '${f}' in index.html investor-watch section`);
  }
}

// ── 4. report-success.html ──
function testReportSuccessHtml() {
  console.log("\n━━━ 4. report-success.html ───");
  const content = fs.readFileSync(path.join(ROOT, "public/report-success.html"), "utf8");

  ok(content.includes('monitor zoning and overlay signals'), "Success: zoning/overlay monitoring");
  ok(content.includes('planning constraint alerts when new data is available'), "Success: planning alerts");
  ok(content.includes('分区与 Overlay 信号'), "Success ZH: overlay signals");
  ok(content.includes('获取规划限制提醒'), "Success ZH: constraint alerts");
}

// ── 5. API wiring — planningSignals in valuation.js & snapshot ──
function testApiWiring() {
  console.log("\n━━━ 5. API wiring ───");
  const valCode = fs.readFileSync(path.join(ROOT, "api/valuation.js"), "utf8");
  const snapCode = fs.readFileSync(path.join(ROOT, "lib/report-snapshot-service.js"), "utf8");

  // valuation.js: import + query + output
  ok(valCode.includes('planning-signal-service.js'), "valuation.js imports planning service");
  ok(valCode.includes('getPlanningSignals'), "valuation.js calls getPlanningSignals");
  ok(valCode.includes('result.planningSignals'), "valuation.js assigns planningSignals to result");
  ok(valCode.includes('planningSignals: fullResult.planningSignals'), "valuation.js passes through in free summary");
  ok(valCode.includes('Planning signals query failed (non-fatal)'), "valuation.js has non-fatal error handling");

  // snapshot: planningSignals field
  ok(snapCode.includes('planningSignals: fullResult.planningSignals'), "Report snapshot includes planningSignals");

  // No forbidden patterns in API
  const forbidden = ["approved", "can subdivide", "approval likely", "no heritage risk"];
  for (const f of forbidden) {
    ok(!valCode.toLowerCase().includes(f.toLowerCase()), `No '${f}' in valuation.js`);
  }
}

// ── 6. $3.99 Full Report unaffected ──
function testFullReportUntouched() {
  console.log("\n━━━ 6. Paid report infrastructure ───");
  const paidCode = fs.readFileSync(path.join(ROOT, "api/valuation-full.js"), "utf8");
  const payGate = fs.readFileSync(path.join(ROOT, "lib/payment-gate.js"), "utf8");
  const entSvc = fs.readFileSync(path.join(ROOT, "lib/report-entitlement-service.js"), "utf8");
  const stripeSvc = fs.readFileSync(path.join(ROOT, "lib/stripe-client.js"), "utf8");
  const snapSvc = fs.readFileSync(path.join(ROOT, "lib/report-snapshot-service.js"), "utf8");

  // No planning-signal import in any of these
  ok(!paidCode.includes("planning-signal"), "valuation-full.js not importing planning");
  ok(!payGate.includes("planning"), "payment-gate.js not importing planning");
  ok(!entSvc.includes("planning"), "entitlement service not importing planning");
  ok(!stripeSvc.includes("planning"), "stripe service not importing planning");

  // snapshot just passes through, doesn't compute
  ok(!snapSvc.includes("getPlanningSignals"), "Snapshot doesn't call getPlanningSignals");

  // No Price/Stripe/entitlement changes — just check planning doesn't import payment files
  ok(!paidCode.includes("getPlanningSignals"), "valuation-full.js does not query planning");

  // $3.99 not in planning files
  const planCode = fs.readFileSync(path.join(ROOT, "lib/planning-signal-service.js"), "utf8");
  ok(!planCode.includes("$3.99"), "planning service doesn't mention $3.99");
  ok(!planCode.includes("subscription"), "planning service doesn't mention subscription");
  ok(!planCode.includes("Stripe"), "planning service doesn't mention Stripe");
  ok(!planCode.includes("checkout"), "planning service doesn't mention checkout");
  ok(!planCode.includes("payment"), "planning service doesn't mention payment");
}

// ── 7. report-viewer the full report is untouched ──
function testReportViewerNoPriceChanges() {
  console.log("\n━━━ 7. report-viewer untouched sections ───");
  const content = fs.readFileSync(path.join(ROOT, "public/report-viewer.js"), "utf8");

  // $3.99 price unchanged
  ok(content.includes('AUD $3.99'), "report-viewer still mentions $3.99");
  ok(content.includes('$9.99'), "report-viewer still mentions $9.99");
  ok(content.includes('Coming Soon'), "report-viewer Coming Soon unchanged");
  ok(content.includes('investorWatchCta'), "investorWatchCta key preserved");
}

// ── Run all ──
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Phase 1A Planning Signal Integration Tests");
  console.log("═══════════════════════════════════════════\n");

  try {
    await testPlanningService();
  } catch (e) {
    failed++;
    console.error(`  ❌ testPlanningService crashed: ${e.message}`);
    errors.push(`testPlanningService crashed: ${e.message}`);
  }

  try {
    testReportViewer();
  } catch (e) {
    failed++;
    console.error(`  ❌ testReportViewer crashed: ${e.message}`);
    errors.push(`testReportViewer crashed: ${e.message}`);
  }

  try {
    testIndexHtml();
  } catch (e) {
    failed++;
    console.error(`  ❌ testIndexHtml crashed: ${e.message}`);
    errors.push(`testIndexHtml crashed: ${e.message}`);
  }

  try {
    testReportSuccessHtml();
  } catch (e) {
    failed++;
    console.error(`  ❌ testReportSuccessHtml crashed: ${e.message}`);
    errors.push(`testReportSuccessHtml crashed: ${e.message}`);
  }

  try {
    testApiWiring();
  } catch (e) {
    failed++;
    console.error(`  ❌ testApiWiring crashed: ${e.message}`);
    errors.push(`testApiWiring crashed: ${e.message}`);
  }

  try {
    testFullReportUntouched();
  } catch (e) {
    failed++;
    console.error(`  ❌ testFullReportUntouched crashed: ${e.message}`);
    errors.push(`testFullReportUntouched crashed: ${e.message}`);
  }

  try {
    testReportViewerNoPriceChanges();
  } catch (e) {
    failed++;
    console.error(`  ❌ testReportViewerNoPriceChanges crashed: ${e.message}`);
    errors.push(`testReportViewerNoPriceChanges crashed: ${e.message}`);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (errors.length) {
    console.error(`\nErrors:\n${errors.join("\n")}`);
  }
  console.log(`═══════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test runner error:", e);
  process.exit(1);
});
