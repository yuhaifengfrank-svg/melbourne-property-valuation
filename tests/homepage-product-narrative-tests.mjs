import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const INDEX = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const APP = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function dom() {
  return new JSDOM(INDEX);
}

test("primary navigation exposes Suburb Research alongside core product links", () => {
  const document = dom().window.document;
  const nav = document.querySelector(".topbar-nav");
  assert.ok(nav, "primary nav exists");

  const directLinks = [...nav.children].filter((el) => el.tagName === "A");
  assert.equal(directLinks.length, 4, "four direct nav links");
  assert.equal(nav.querySelectorAll(":scope > details.more-menu").length, 1, "one More menu");
  assert.equal(nav.children.length, 5, "five primary navigation items");
  assert.equal(nav.querySelector('[data-i18n="nav-get-estimate"]')?.textContent.trim(), "Get estimate");
  assert.equal(nav.querySelector('.nav-suburb-research')?.getAttribute("href"), "/suburb-research.html");
});

test("Top Opportunity navigation opens the original homepage ranking section", () => {
  assert.match(INDEX, /href="\/#opportunities"[^>]*data-i18n="nav-opportunities"/);
  assert.doesNotMatch(INDEX, /href="\/opportunities\/"[^>]*data-i18n="nav-opportunities"/);
});

test("More menu contains only secondary research and company links", () => {
  const document = dom().window.document;
  const menu = document.querySelector(".more-menu");
  assert.ok(menu, "more menu exists");

  const labels = [...menu.querySelectorAll(".more-menu-panel a")].map((a) => a.textContent.trim());
  assert.deepEqual(labels, ["Research", "About Us", "Methodology", "Contact"]);
  assert.equal(menu.querySelector("summary")?.getAttribute("data-i18n"), "nav-more");
});

test("homepage hero explains the product narrative, not only valuation", () => {
  assert.match(INDEX, /smart opportunity/i);
  assert.match(INDEX, /suburb opportunity signals/i);
  assert.match(INDEX, /planning constraints/i);
  assert.match(APP, /不只是知道房子值多少钱/);
});

test("lightweight product visual uses three signal cards and reduced-motion fallback", () => {
  const document = dom().window.document;
  assert.equal(document.querySelectorAll(".home-product-visual .signal-card").length, 3);
  assert.match(INDEX, /Estimate/);
  assert.match(INDEX, /Future Score/);
  assert.match(INDEX, /Planning Signal/);
  assert.match(INDEX, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(INDEX, /\.signal-card\s*\{\s*animation: none;/);
});

test("three-layer funnel is explicit and keeps 3.99 separate from 9.99", () => {
  const document = dom().window.document;
  const cards = [...document.querySelectorAll(".product-funnel .funnel-card")];
  assert.equal(cards.length, 3);

  const text = document.querySelector(".product-funnel")?.textContent || "";
  assert.match(text, /Free Estimate/);
  assert.match(text, /AUD \$3\.99 one-time/);
  assert.match(text, /AUD \$9\.99\/month/);
  assert.match(text, /comparable sales evidence/i);
  assert.match(text, /planning and zoning signals/i);
  assert.match(text, /Future Opportunity Outlook/i);
  assert.match(text, /key risks/i);
});

test("Investor Watch copy is subscription monitoring, not the one-time report", () => {
  const document = dom().window.document;
  const panel = document.querySelector("#investor-watch");
  assert.ok(panel, "investor watch panel exists");
  const text = panel.textContent;
  assert.match(text, /AUD \$9\.99\/month/);
  assert.match(text, /AUD \$3\.99 one-time/);
  assert.match(text, /watchlist/i);
  assert.match(text, /Future Opportunity Scores/i);
  assert.match(text, /zoning and overlay signals when new data is available/i);
  assert.match(text, /Compare multiple properties/i);
  assert.match(text, /Free Preview/i);
  assert.match(text, /No payment setup required/i);
});

test("Top Opportunity and Investor Watch distinction is visible", () => {
  const document = dom().window.document;
  const text = document.querySelector(".product-difference")?.textContent || "";
  assert.match(text, /Top Opportunity helps you discover where to look/);
  assert.match(text, /Investor Watch helps you keep watching what matters/);
  assert.match(APP, /Top Opportunity 帮你发现该看哪里/);
});

test("Methodology section exists and the full methodology is reachable from More menu", () => {
  const document = dom().window.document;
  assert.ok(document.querySelector('#methodology'), "#methodology section exists");
  assert.ok(document.querySelector('.more-menu-panel a[href="/methodology.html"]'), "More menu links full methodology");
  assert.match(document.querySelector("#methodology")?.textContent || "", /Not financial advice/i);
});

test("forbidden subscription promises and nonexistent price are absent from homepage product blocks", () => {
  const document = dom().window.document;
  const scopedText = [
    document.querySelector(".product-funnel")?.textContent || "",
    document.querySelector("#investor-watch")?.textContent || "",
    document.querySelector(".product-difference")?.textContent || "",
  ].join(" ");

  assert.doesNotMatch(scopedText, /\$2\.99/);
  assert.doesNotMatch(scopedText, /\bweekly\b/i);
  assert.doesNotMatch(scopedText, /\bdaily alerts?\b/i);
  assert.doesNotMatch(scopedText, /\brealtime\b/i);
});

test("Chinese copy exists for the main funnel and Investor Watch value proposition", () => {
  assert.match(APP, /完整估值报告 — AUD \$3\.99 一次性/);
  assert.match(APP, /Investor Watch — AUD \$9\.99\/月/);
  assert.match(APP, /收藏区域和房产/);
  assert.match(APP, /有新数据时/);
});

test("payment gate language remains fail-closed and separate from homepage narrative", () => {
  assert.match(APP, /var paymentsEnabled = false/);
  assert.match(APP, /paymentsEnabled === true/);
  assert.doesNotMatch(INDEX, /PAYMENTS_ENABLED/);
});
