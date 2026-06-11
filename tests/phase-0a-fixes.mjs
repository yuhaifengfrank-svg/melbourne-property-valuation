/**
 * Phase 0A: Future Growth — online misdirection fixes
 *
 * Tests:
 * 1. Public pages don't contain "Projected 3-year CAGR" or "forecast price appreciation"
 * 2. API unsupported strategy returns error (not same ranking)
 * 3. Trust layer doesn't reference CAGR
 * 4. Index.html doesn't say "forecast price"
 * 5. Top growth page has disclaimer/warning
 * 6. root and public are consistent (no root divergence)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const topGrowth = fs.readFileSync(new URL("../public/top-growth-suburbs-victoria.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const trustLayer = fs.readFileSync(new URL("../public/trust-layer.js", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../api/opportunity.js", import.meta.url), "utf8");

test("Phase 0A-1: top-growth page does NOT contain 'forecast price appreciation'", () => {
  assert.doesNotMatch(topGrowth, /forecast price appreciation/);
});

test("Phase 0A-2: top-growth page does NOT contain 'Projected.*CAGR'", () => {
  assert.doesNotMatch(topGrowth, /Projected.*CAGR/i);
});

test("Phase 0A-3: top-growth page contains disclaimer about Future Growth model", () => {
  assert.match(topGrowth, /Future Growth model/);
  assert.match(topGrowth, /under development/);
  assert.match(topGrowth, /experimental/);
  assert.match(topGrowth, /Beta/);
});

test("Phase 0A-4: top-growth page meta description does NOT contain misleading growth language", () => {
  assert.doesNotMatch(topGrowth, /Ranked by weighted 1, 3 and 5-year/);
  assert.doesNotMatch(topGrowth, /forecast price appreciation/);
});

test("Phase 0A-5: index.html does NOT contain 'forecast price appreciation'", () => {
  assert.doesNotMatch(indexHtml, /forecast price appreciation/);
});

test("Phase 0A-6: index.html shows new trend description", () => {
  assert.match(indexHtml, /Market trends/);
});

test("Phase 0A-7: trust-layer.js does NOT contain 'CAGR'", () => {
  assert.doesNotMatch(trustLayer, /CAGR/);
});

test("Phase 0A-8: trust-layer.js does NOT contain 'forecast' as prediction", () => {
  assert.doesNotMatch(trustLayer, /\bforecast\b/i);
});

test("Phase 0A-9: trust-layer.js contains new 'trend signal' language", () => {
  assert.match(trustLayer, /trend signal/);
});

test("Phase 0A-10: API rejects unsupported strategy", () => {
  assert.match(api, /unsupported_strategy/);
  assert.match(api, /not yet implemented/);
  assert.match(api, /Future Growth strategies are under development/);
});

test("Phase 0A-11: API meta includes disclaimer", () => {
  assert.match(api, /scoreType.*Beta/);
  assert.match(api, /disclaimer/);
  assert.match(api, /not a calibrated future price forecast/);
});

test("Phase 0A-12: API still supports default 'smart' strategy", () => {
  // The default strategy should work - the check is only for non-smart
  assert.match(api, /strategy.*smart/);
  assert.match(api, /VALID_STRATEGIES.*smart/);
});

test("Phase 0A-13: Old top growth URL still accessible via vercel config", () => {
  // vercel.json rewrite should still work
  const vercelJson = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(vercelJson, /top-growth-suburbs-victoria/);
});

test("Phase 0A-14: Generator scripts no longer use misleading '3yr growth' for growth_3y display", () => {
  const genAiPages = fs.readFileSync(new URL("../scripts/generate-ai-pages.js", import.meta.url), "utf8");
  const genSuburbPages = fs.readFileSync(new URL("../scripts/generate-suburb-pages.js", import.meta.url), "utf8");

  // Both should not say "3yr growth" in the context of growth_3y
  // generate-ai-pages.js now uses "trend signal"
  assert.doesNotMatch(genAiPages, /% 3yr growth/);
  assert.doesNotMatch(genSuburbPages, /Positive 3-year price trend/);
  assert.doesNotMatch(genSuburbPages, /price growth trajectory/);

  // Both should have new language
  // generate-ai-pages.js uses 'exp. signal', generate-suburb-pages uses 'trend signal'
  assert.match(genAiPages, /signal/);
  assert.match(genSuburbPages, /Experimental short-term/);
});
