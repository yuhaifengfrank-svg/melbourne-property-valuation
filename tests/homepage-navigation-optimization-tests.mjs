import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/index.html"), "utf8");
const app = readFileSync(join(root, "public/app.js"), "utf8");
const nav = html.match(/<nav class="topbar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const morePanel = nav.match(/<div class="more-menu-panel">[\s\S]*?<\/div>/)?.[0] || "";

test("primary navigation has one valuation action instead of duplicate labels", () => {
  assert.equal((nav.match(/data-i18n="nav-get-estimate"/g) || []).length, 1);
  assert.equal(nav.includes('data-i18n="nav-valuation"'), false);
  assert.match(nav, /class="nav-cta" href="#valuation" data-i18n="nav-get-estimate"/);
});

test("Investor Watch is a primary navigation item, not duplicated under More", () => {
  assert.equal((nav.match(/data-i18n="nav-investor-watch"/g) || []).length, 1);
  assert.match(nav, /href="\/investor-watch\/" data-i18n="nav-investor-watch"/);
  assert.equal(morePanel.includes("nav-investor-watch"), false);
});

test("primary navigation order reflects the main user journeys", () => {
  const estimate = nav.indexOf('data-i18n="nav-get-estimate"');
  const opportunities = nav.indexOf('data-i18n="nav-opportunities"');
  const watch = nav.indexOf('data-i18n="nav-investor-watch"');
  const more = nav.indexOf('data-i18n="nav-more"');
  assert.ok(estimate < opportunities && opportunities < watch && watch < more);
});

test("More keeps only secondary navigation destinations", () => {
  for (const key of ["nav-research", "nav-about", "nav-methodology", "nav-contact"]) {
    assert.match(morePanel, new RegExp(`data-i18n="${key}"`));
  }
});

test("English and Chinese navigation copy remains concise", () => {
  assert.match(app, /'\[data-i18n="nav-get-estimate"\]': "Get estimate"/);
  assert.match(app, /'\[data-i18n="nav-get-estimate"\]': "开始估值"/);
  assert.match(app, /'\[data-i18n="nav-investor-watch"\]': "Investor Watch"/);
  assert.match(app, /'\[data-i18n="nav-investor-watch"\]': "机会监控"/);
  assert.doesNotMatch(app, /nav-investor-watch"\]': "Investor Watch（机会监控）"/);
});
