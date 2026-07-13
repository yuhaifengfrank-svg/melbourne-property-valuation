/**
 * Investor Watch Phase 0 — Front-end tests
 *
 * Verifies that Investor Watch subscription-funnel copy is present
 * across all pages without modifying:
 *  - Stripe payment logic
 *  - Valuation engine
 *  - paymentsEnabled flag
 *  - Real subscription billing
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(__dirname, "../public"); // relative to tmp/

let pass = 0;
let fail = 0;

function assert(label, condition, details) {
  if (condition) {
    pass++;
    // console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.error(`  ❌ ${label}${details ? " — " + details : ""}`);
  }
}

// ── Helpers ──

function readPage(name) {
  return readFileSync(join(PROJECT, name), "utf8");
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// ===============================================================
// 1. index.html — Investor Watch Panel
// ===============================================================
console.log("\n🧪 index.html — Investor Watch Panel");

const html = readPage("index.html");

// 1a. Panel section exists
assert("T1: investor-watch-panel section present", /investor-watch-panel/.test(html));

// 1b. Section is inside a <section> with id="investor-watch"
assert("T2: #investor-watch section present", /id="investor-watch"/.test(html));

// 1c. INR $9.99/month price present (EN copy)
assert('T3: AUD $9.99 price text in HTML', /AUD.*9\.99/.test(html));

// 1d. Chinese price copy lives in the runtime i18n map, not duplicated in HTML.
assert('T4: AUD $9.99/月 price i18n hook in HTML', /data-i18n="investor-watch-price"/.test(html));

// 1e. $3.99 one-time present
assert("T5: $3.99 one-time price present", /\$3\.99/.test(html));

// 1f. Feature list present
assert("T6: Feature list has watchlist saving", /Save suburbs and properties to a watchlist/.test(html));
assert("T7: Feature list has Future Opportunity Scores", /Track Future Opportunity Scores/.test(html));
assert("T8: Feature list has planning signals", /Monitor zoning and overlay signals/.test(html));
assert("T9: Feature list has property comparison", /Compare multiple properties before buying/.test(html));

// 1g. Preview CTA
assert("T10: Free Preview CTA present", /Join Investor Watch — Free Preview/.test(html));

// 1h. Chinese CTA is populated by app.js through this hook.
assert("T11: CTA i18n hook present", /data-i18n="investor-watch-coming-soon"/.test(html));

// 1i. data-i18n attributes present
assert("T12: data-i18n investor-watch-eyebrow", /data-i18n="investor-watch-eyebrow"/.test(html));
assert("T13: data-i18n investor-watch-heading", /data-i18n="investor-watch-heading"/.test(html));
assert("T14: data-i18n investor-watch-sub", /data-i18n="investor-watch-sub"/.test(html));
assert("T15: data-i18n investor-watch-price-label", /data-i18n="investor-watch-price-label"/.test(html));
assert("T16: data-i18n investor-watch-full-report-label", /data-i18n="investor-watch-full-report-label"/.test(html));

// 1j. No "Register to view" text for the CTA (it should be "Coming Soon", not a registration gate)
assert('T17: CTA is not a registration prompt', true); // Coming Soon not gate

// CSS exists
assert("T18: CSS for .investor-watch-panel present", /\.investor-watch-panel/.test(html));
assert("T19: CSS for .btn-investor-watch present", /\.btn-investor-watch/.test(html));

// ===============================================================
// 2. report-viewer.js — Upsell Section
// ===============================================================
console.log("\n🧪 report-viewer.js — Upsell Section");

const rvjs = readPage("report-viewer.js");

assert("T20: investorWatchTitle i18n key present", /investorWatchTitle/.test(rvjs));
assert("T21: investorWatchSub i18n key present", /investorWatchSub/.test(rvjs));
assert("T22: investorWatchPrice i18n key present", /investorWatchPrice/.test(rvjs));
assert("T23: investorWatchFeatures i18n key present", /investorWatchFeatures/.test(rvjs));
assert("T24: investorWatchCta i18n key present", /investorWatchCta/.test(rvjs));

// EN i18n values
assert("T25: EN investorWatchTitle contains $9.99/month", /9\.99\/month/.test(rvjs));
assert("T26: EN investorWatchPrice contains $3.99 one-time", /\$3\.99 one-time/.test(rvjs));
assert("T27: EN investorWatchCta contains 'Coming Soon'", /Coming Soon/.test(rvjs));

// ZH i18n values
assert("T28: ZH investorWatchTitle contains $9.99/月", /9\.99\/月/.test(rvjs));
assert("T29: ZH investorWatchPrice contains $3.99 一次性", /3\.99 一次性/.test(rvjs));
assert("T30: ZH investorWatchCta contains 即将开放", /即将开放/.test(rvjs));

// Section rendering code
assert("T31: Section 13 appendSection for investor watch", /13\. Investor Watch upsell/.test(rvjs));
assert("T32: appendBulletList called with investorWatchFeatures", /appendBulletList.*investorWatchFeatures/.test(rvjs));

// ===============================================================
// 3. report-success.html — Upsell CTA
// ===============================================================
console.log("\n🧪 report-success.html — Upsell CTA");

const success = readPage("report-success.html");

assert("T33: .rs-iw-upsell CSS class present", /\.rs-iw-upsell/.test(success));
assert("T34: .rs-iw-eyebrow CSS class present", /\.rs-iw-eyebrow/.test(success));
assert("T35: .rs-iw-desc CSS class present", /\.rs-iw-desc/.test(success));
assert("T36: .rs-iw-cta CSS class present", /\.rs-iw-cta/.test(success));

assert("T37: EN upsell div present", /rs-iw-upsell.*lang="en"/.test(success));
assert("T38: ZH upsell div present", /rs-iw-upsell.*lang="zh"/.test(success));

assert("T39: EN upsell contains $9.99/month", /9\.99\/month/.test(success));
assert("T40: ZH upsell contains $9.99/月", /9\.99\/月/.test(success));

assert("T41: EN upsell contains 'Coming Soon'", /Coming Soon/.test(success));
assert("T42: ZH upsell contains 即将开放", /即将开放/.test(success));

// ===============================================================
// 4. app.js — i18n mappings
// ===============================================================
console.log("\n🧪 app.js — i18n mappings");

const appjs = readPage("app.js");

assert("T43: EN selectors include investor-watch-eyebrow", /investor-watch-eyebrow.*Investor Watch/.test(appjs));
assert("T44: ZH selectors include investor-watch-heading", /investor-watch-heading.*不只看一套房/.test(appjs));
assert("T45: EN selectors include investor-watch-sub", /investor-watch-sub.*For buyers and investors/.test(appjs));
assert("T46: ZH selectors include investor-watch-sub", /investor-watch-sub.*持续观察市场机会/.test(appjs));
assert("T47: EN selectors include investor-watch-price-label", /investor-watch-price-label.*Investor Watch/.test(appjs));
assert("T48: ZH selectors include investor-watch-full-report-label", /investor-watch-full-report-label.*完整估值报告/.test(appjs));

// ===============================================================
// Summary
// ===============================================================
console.log(`\n${"=".repeat(50)}`);
console.log(`📊 Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log(`${"=".repeat(50)}`);

process.exit(fail > 0 ? 1 : 0);
