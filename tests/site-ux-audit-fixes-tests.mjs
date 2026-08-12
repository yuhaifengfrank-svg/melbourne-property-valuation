import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("public/app.js");
const home = read("public/index.html");
const gate = read("public/opportunity-gate.js");
const opportunities = read("public/opportunities/index.html");
const research = read("public/suburb-research.js");
const researchHtml = read("public/suburb-research.html");
const vercel = JSON.parse(read("vercel.json"));

test("homepage translations update every repeated ranking CTA", () => {
  assert.match(app, /document\.querySelectorAll\(selector\)\.forEach/);
  assert.match(app, /View full ranking/);
  assert.match(app, /查看完整排名/);
  assert.match(home, /\.more-menu:not\(\[open\]\) \.more-menu-panel\s*\{\s*display: none/);
});

test("valuation language switch hides the inactive bilingual copy", () => {
  assert.match(app, /function syncBilingualVisibility/);
  assert.match(app, /element\.hidden = element\.getAttribute\("lang"\) !== activeLanguage/);
  assert.match(app, /syncBilingualVisibility\(\)/);
});

test("Top Opportunity gives visible and accessible gate feedback", () => {
  assert.match(home, /class="opp-hint" role="status" aria-live="polite"/);
  assert.match(app, /Opening the free personalised ranking form/);
  assert.match(app, /Form opened\. Enter your email and preferences/);
  assert.match(gate, /aria-modal/);
  assert.match(gate, /aria-labelledby/);
  assert.match(gate, /firstField\.focus\(\)/);
});

test("high scores with limited evidence receive an explicit warning", () => {
  assert.match(opportunities, /displayScore >= 80 && hasLimitedEvidence\(item\)/);
  assert.match(opportunities, /High relative score, limited evidence/);
  assert.match(opportunities, /opp-confidence-warning/);
});

test("legacy Investor Watch URL permanently redirects to the canonical route", () => {
  assert.ok(vercel.redirects.some((rule) =>
    rule.source === "/investor-watch.html" &&
    rule.destination === "/investor-watch/" &&
    rule.permanent === true
  ));
});

test("shared suburb comparisons load exact suburbs in parallel before suggestions", () => {
  assert.match(research, /Promise\.allSettled\(requested\.map\(fetchExact\)\)/);
  assert.match(research, /maxResults=60&strategy=balanced/);
  assert.doesNotMatch(research, /maxResults=200&strategy=balanced/);
  assert.match(research, /sessionStorage\.getItem\(suggestionCacheKey\)/);
  assert.match(researchHtml, /suburb-research\.js\?v=20260812-performance/);
});
