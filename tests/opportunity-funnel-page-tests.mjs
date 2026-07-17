import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve("public/opportunities/index.html"), "utf8");
const homepage = fs.readFileSync(path.resolve("public/index.html"), "utf8");
const gate = fs.readFileSync(path.resolve("public/opportunity-gate.js"), "utf8");
const app = fs.readFileSync(path.resolve("public/app.js"), "utf8");

test("opportunities page is a three-layer Future Opportunity funnel", () => {
  assert.match(page, /Future Opportunity Index/);
  assert.match(page, /Free preview/);
  assert.match(page, /Get My Personalised Top 10/);
  assert.match(page, /Investor Pro/);
  assert.match(page, /AUD \$9\.99\/month/);
});

test("opportunities page uses live Future Opportunity and unlock APIs", () => {
  assert.match(page, /\/api\/opportunity\?/);
  assert.match(page, /\/api\/unlock-opportunity\?/);
  assert.match(page, /opportunityGate\.run/);
  assert.match(page, /opportunityGate\.checkTier/);
  assert.match(page, /showSubscriptionUpgrade/);
});

test("homepage opportunity search gives immediate feedback while checking access", () => {
  assert.match(app, /oppLoading\.textContent = language === "zh" \? "正在检查访问权限……" : "Checking access…"/);
  assert.match(app, /oppSearchBtn\.disabled = true/);
  assert.match(app, /gateResult && gateResult\.gateShown/);
  assert.match(gate, /resolve\(\{ authenticated: false, gateShown: true \}\)/);
});

test("homepage cache-busts opportunity scripts so search fixes reach returning visitors", () => {
  assert.match(homepage, /src="\/opportunity-gate\.js\?v=20260717-search-feedback"/);
  assert.match(homepage, /src="\/app\.js\?v=20260717-keep-outlook"/);
});

test("authenticated homepage search re-ranks with the currently selected filters", () => {
  assert.match(app, /new URLSearchParams\(\{[\s\S]*re_rank: "1"/);
  assert.match(app, /goal: document\.getElementById\("opp-strategy"\)\.value/);
  assert.match(app, /propertyType: document\.getElementById\("opp-type"\)\.value/);
  assert.match(app, /activeFilters\.set\("budgetMin", activeMinPrice\)/);
  assert.match(app, /activeFilters\.set\("budgetMax", activeMaxPrice\)/);
  assert.match(app, /fetch\("\/api\/unlock-opportunity\?" \+ activeFilters\.toString\(\)\)/);
  assert.doesNotMatch(app, /fetch\("\/api\/unlock-opportunity\?re_rank=1"\)/);
});

test("homepage search keeps the Future Opportunity Outlook preview visible", () => {
  assert.doesNotMatch(app, /home-snippet['"]\)\s*;[\s\S]{0,100}style\.display\s*=\s*['"]none['"]/);
});

test("free opportunity layer is capped to three preview cards", () => {
  assert.match(page, /maxResults"\s*,\s*String\(maxResults\)/);
  assert.match(page, /buildQuery\(filters,\s*3\)/);
  assert.match(page, /items\.slice\(0,\s*3\)/);
});

test("registered opportunity layer renders personalised Top 10", () => {
  assert.match(page, /items\.slice\(0,\s*10\)/);
  assert.match(page, /Personalised Top 10/);
  assert.match(page, /Personalised Top 10 ready/);
  assert.match(page, /personalisedFutureScore|personalisedScore/);
});

test("registered opportunity cards prioritise personalised future score", () => {
  assert.match(page, /scoreFor\(item,\s*mode\)/);
  assert.match(page, /mode === "registered" && personalised !== null/);
  assert.match(page, /Base suburb score/);
  assert.match(page, /Preference adjustment/);
  assert.match(page, /Personalised formula/);
});

test("opportunity cards show prediction horizon and non-price-forecast type", () => {
  assert.match(page, /Horizon/);
  assert.match(page, /Prediction type/);
  assert.match(page, /Opportunity index/);
  assert.match(page, /Relative 0-100 score/);
  assert.match(page, /String\(displayScore\) \+ "\/100"/);
  assert.match(page, /displayScore === null \? "Data unavailable"/);
  assert.doesNotMatch(page, /item\.opportunityScore/);
});

test("opportunity cards support personalised single reason and risk fields", () => {
  assert.match(page, /normaliseList/);
  assert.match(page, /item\.why \|\| item\.reason/);
  assert.match(page, /item\.risks \|\| item\.risk/);
});

test("opportunities page no longer exposes static percentage trend signals", () => {
  assert.doesNotMatch(page, /trend signal/i);
  assert.doesNotMatch(page, /[+-]\d+(?:\.\d+)?%/);
  assert.doesNotMatch(page, /25\.00%/);
  assert.doesNotMatch(page, /<a\s+href="\/suburb\//i);
});

test("opportunities page uses safe Future Opportunity disclaimer language", () => {
  assert.match(page, /not a price forecast/i);
  assert.match(page, /not a forecast, valuation or promise/i);
  assert.match(page, /relative screening score/i);
});

test("opportunity gate no longer auto-redirects the public funnel page", () => {
  assert.match(gate, /dataset\.opportunityProtect === "true"/);
  assert.doesNotMatch(gate, /if\s*\(\s*typeof window !== "undefined"\s*\)\s*\{\s*window\.opportunityGate\.protectPage\(\);/);
});
