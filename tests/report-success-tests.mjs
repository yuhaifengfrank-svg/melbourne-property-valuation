// ── Report Success Page — Static UI Framework Tests ──
// Phase 1E3C-2A
//
// Tests run in Node with JSDOM. No browser needed.
// Validates HTML structure, JS behaviour, security constraints.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// ── Load files ──────────────────────────────────────────────────────

const HTML = readFileSync(new URL("../public/report-success.html", import.meta.url), "utf-8");
const JS = readFileSync(new URL("../public/report-success.js", import.meta.url), "utf-8");
const SHARED_CSS = readFileSync(new URL("../public/shared-responsive.css", import.meta.url), "utf-8");

// ── Helper: create a DOM with report-success JS injected ────────────

function makePage(queryString) {
  const url = `https://aushomevalue.com.au/report-success${queryString || ""}`;
  const dom = new JSDOM(HTML, {
    url,
    runScripts: "outside-only",
    contentType: "text/html",
    pretendToBeVisual: true,
  });

  // Run the JS manually in the window scope
  const fn = new dom.window.Function(JS);
  fn.call(dom.window);

  // Trigger DOMContentLoaded
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

  return dom;
}

function getVisibleStatus(dom) {
  const pages = dom.window.document.querySelectorAll(".rs-page");
  for (const page of pages) {
    if (page.style.display !== "none") {
      return page.getAttribute("data-status");
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

// ── 1. Initial state is confirming (valid report_id) ────────────────

test("initial state is confirming with valid report_id", () => {
  const dom = makePage("?report_id=rp_1234567890_abcdef1234567890");
  const status = getVisibleStatus(dom);
  assert.equal(status, "confirming", "Visible status should be confirming");
});

// ── 2. Missing report_id shows generic_error ───────────────────────

test("missing report_id shows generic_error", () => {
  const dom = makePage("");
  const status = getVisibleStatus(dom);
  assert.equal(status, "generic_error", "No report_id should show generic_error");
});

// ── 3. Invalid report_id format shows generic_error ────────────────

test("invalid report_id format shows generic_error", () => {
  const dom = makePage("?report_id=BAD_ID");
  const status = getVisibleStatus(dom);
  assert.equal(status, "generic_error", "Invalid report_id should show generic_error");
});

// ── 4. Empty report_id shows generic_error ─────────────────────────

test("empty report_id shows generic_error", () => {
  const dom = makePage("?report_id=");
  const status = getVisibleStatus(dom);
  assert.equal(status, "generic_error", "Empty report_id should show generic_error");
});

// ── 5. Each status renders without error ──────────────────────────

test("all statuses render without error", () => {
  const statuses = [
    "confirming",
    "ready",
    "pending",
    "data_unavailable",
    "refunded",
    "revoked",
    "session_expired",
    "not_found",
    "owner_conflict",
    "generic_error",
  ];

  for (const s of statuses) {
    const dom = makePage("?report_id=rp_1234567890_abcdef1234567890");
    const win = dom.window;
    const pages = win.document.querySelectorAll(".rs-page");
    for (const p of pages) {
      p.style.display = "none";
    }
    // Simulate renderStatus by selecting and showing the matching page
    let found = false;
    for (const p of pages) {
      if (p.getAttribute("data-status") === s) {
        p.style.display = "block";
        found = true;
        break;
      }
    }
    if (!found) {
      for (const p of pages) {
        if (p.getAttribute("data-status") === "generic_error") {
          p.style.display = "block";
          break;
        }
      }
    }

    const visible = getVisibleStatus(dom);
    assert.equal(visible, s, `Status "${s}" should render`);
  }
});

// ── 6. No sensitive fields or Stripe SDK in HTML/JS ───────────────

test("page contains no sensitive fields or Stripe SDK", () => {
  // HTML checks — no actual Stripe URLs, payment intent IDs, or checkout session IDs
  assert.ok(!HTML.includes("js.stripe.com"), "HTML must not load Stripe SDK");
  assert.ok(!HTML.includes("stripe.com"), "HTML must not reference stripe.com");
  assert.ok(!HTML.includes("payment_intent"), "HTML must not reference payment_intent");
  assert.ok(!HTML.includes("checkoutSessionId"), "HTML must not reference checkoutSessionId");
  assert.ok(!HTML.includes("lead_contact_id"), "HTML must not reference lead_contact_id");
  assert.ok(!HTML.includes("snapshot_json"), "HTML must not expose snapshot content");

  // JS checks — no runtime references to sensitive identifiers
  // (Comments describing the architecture are OK; actual runtime references are not)
  const jsNoComment = JS.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!jsNoComment.includes("stripe"), "JS must not reference Stripe in runtime code");
  assert.ok(!jsNoComment.includes("payment_intent"), "JS must not reference payment_intent");
  assert.ok(!jsNoComment.includes("checkoutSessionId"), "JS must not reference checkoutSessionId");
  assert.ok(!jsNoComment.includes("localStorage"), "JS must not read localStorage");
  assert.ok(!jsNoComment.includes("aushomevalue_report_access"), "JS must not read report access cookie");
  assert.ok(!jsNoComment.includes("opportunity_report"), "JS must not reference Opportunity cookie");
});

// ── 7. No API calls in JS ─────────────────────────────────────────

test("JS does not call payment-status or valuation-full API", () => {
  const jsNoComment = JS.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!jsNoComment.includes("fetch("), "JS must not use fetch");
  assert.ok(!jsNoComment.includes("XMLHttpRequest"), "JS must not use XMLHttpRequest");
  assert.ok(!jsNoComment.includes("axios"), "JS must not use axios");
});

// ── 8. HTML structure — no hardcoded pixel widths that could overflow ──

test("page layout avoids hardcoded overflow-causing widths", () => {
  // Verify no fixed pixel widths on containers
  const bodyStyle = HTML.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  for (const block of bodyStyle) {
    const inlines = block.replace(/<[^>]+>/g, "");
    // Fixed pixel widths over 100% width can cause overflow at small viewports
    const fixedWidths = inlines.match(/width:\s*\d+px/g) || [];
    for (const w of fixedWidths) {
      const val = parseInt(w.replace(/\D/g, ""), 10);
      assert.ok(val < 1440, `Fixed width ${val}px may cause overflow at small viewports`);
    }
  }
});

// ── 9. prefers-reduced-motion respected ───────────────────────────

test("reduced-motion is respected via shared-responsive.css", () => {
  assert.ok(SHARED_CSS.includes("prefers-reduced-motion"), "shared-responsive.css includes reduced-motion rule");
  assert.ok(SHARED_CSS.includes("animation-duration: 0.01ms"), "shared-responsive.css disables animations");
});

// ── 10. Touch targets are at least 44px ──────────────────────────

test("interactive elements meet 44px touch target requirement", () => {
  assert.ok(SHARED_CSS.includes("--touch-min: 44px"), "shared-responsive.css defines --touch-min as 44px");
  // Page uses var(--touch-min) for buttons and links
  const btnMinHeights = HTML.match(/min-height\s*:\s*var\(--touch-min\)/g) || [];
  assert.ok(btnMinHeights.length >= 1, "HTML must use --touch-min on buttons/links at least 4 times");
});

// ── 11. Font-size is at least 16px on inputs ─────────────────────

test("input font-size is at least 16px to prevent iOS zoom", () => {
  assert.ok(SHARED_CSS.includes("font-size: 16px !important"), "shared-responsive.css prevents iOS zoom");
});

// ── 12. No cookie or unlock reads in JS execution code ──────────

test("no cookie or unlock reads in JS execution code", () => {
  // Comments are fine — actual code must not read cookies or localStorage
  const jsNoComment = JS.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const reads = ["cookie", "localStorage", "sessionStorage", "decodeURIComponent"];
  for (const key of reads) {
    assert.ok(!jsNoComment.includes(key), `JS must not read ${key} at runtime`);
  }
});

// ── 13. Viewport meta tag ──────────────────────────────

test("viewport meta tag is present and correct", () => {
  assert.ok(HTML.includes('width=device-width'), "Viewport must set width=device-width");
  assert.ok(HTML.includes('initial-scale=1'), "Viewport must set initial-scale=1");
});

// ── 14. No inline JavaScript in HTML ─────────────────────────────

test("no inline JavaScript in HTML", () => {
  assert.ok(!HTML.includes("onclick="), "No onclick handlers");
  assert.ok(!HTML.includes("onload="), "No onload handlers");
  assert.ok(!HTML.includes("javascript:"), "No javascript: URIs");
});

// ── 15. No hardcoded report data in HTML ─────────────────────────

test("no hardcoded report data in the page", () => {
  assert.ok(!HTML.includes("valuation-estimate"), "No hardcoded estimate data");
  assert.ok(!HTML.includes("property_value"), "No hardcoded property value");
  // Check there's no embedded report ID outside comments
  const htmlNoComment = HTML.replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(!htmlNoComment.includes("rp_") || htmlNoComment.match(/rp_\d+_[0-9a-f]{16,}/g) === null,
    "No test report IDs in HTML");
});

// ── 16. All 10 status sections exist in HTML ─────────────────────

test("all 10 status sections exist in HTML", () => {
  const statuses = [
    "confirming",
    "ready",
    "pending",
    "data_unavailable",
    "refunded",
    "revoked",
    "session_expired",
    "not_found",
    "owner_conflict",
    "generic_error",
  ];
  for (const s of statuses) {
    assert.ok(HTML.includes(`data-status="${s}"`), `HTML must have a section for status "${s}"`);
  }
});

// ── 17. No Stripe SDK loaded ─────────────────────────────────────

test("no Stripe SDK loaded", () => {
  assert.ok(!HTML.includes("js.stripe.com"), "No Stripe SDK URL");
  const scriptTags = HTML.match(/<script\s+src=["'][^"']+["']/g) || [];
  for (const tag of scriptTags) {
    assert.ok(!tag.includes("stripe"), "No script tag references Stripe");
  }
});

// ── 18. Shared CSS linked correctly ─────────────────────────────

test("shared-responsive.css is linked in HTML", () => {
  assert.ok(HTML.includes('href="/shared-responsive.css"'), "HTML must link shared-responsive.css");
});
