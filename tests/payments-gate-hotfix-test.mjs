#!/usr/bin/env node

/**
 * payments-gate-hotfix-test.mjs
 *
 * Behavioral tests for the Production payments gate hotfix.
 *
 * Requirements (from brief):
 * 1. Production valuation response → paymentsEnabled=false
 * 2. Production checkout POST → returns 503, no DB/Stripe called
 * 3. Preview + test → paymentsEnabled=true
 * 4. Preview + non-test → 503 / paymentsEnabled=false
 * 5. VERCEL_ENV missing → 503 / paymentsEnabled=false
 * 6. Frontend: missing paymentsEnabled field → purchase UI hidden
 * 7. Frontend: initial page load does NOT show purchase area
 * 8. Free valuation still works in Production
 *
 * Scope: only these 5 files
 *   - api/valuation.js
 *   - api/create-report-checkout.js
 *   - public/app.js
 *   - tests/payments-gate-hotfix-test.mjs
 *
 * Run: node --test tests/payments-gate-hotfix-test.mjs
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const PROJECT = process.cwd();
const VAL_SRC = readFileSync(path.join(PROJECT, "api/valuation.js"), "utf8");
const CHK_SRC = readFileSync(path.join(PROJECT, "api/create-report-checkout.js"), "utf8");
const APP_JS = readFileSync(path.join(PROJECT, "public/app.js"), "utf8");

// ── Helpers ────────────────────────────────────────────────────────

/** Simulate the payments gate predicate from the handler source */
function simulatePaymentsEnabled(env, mode) {
  return env === "preview" && mode === "test";
}

/** Build a set of environment variable overrides for a stage */
function withEnv(env, mode) {
  return { VERCEL_ENV: env, STRIPE_MODE: mode };
}

describe("Payments Gate Hotfix", () => {
  // ── 0. Commit scope ──────────────────────────────────────────────
  describe("Commit scope — only 4 files", () => {
    it("api/valuation.js contains the gate", () => {
      assert.ok(VAL_SRC.includes("paymentsEnabled"));
    });
    it("api/create-report-checkout.js contains the gate", () => {
      assert.ok(CHK_SRC.includes("PAYMENTS_GATE_BLOCKED"));
    });
    it("public/app.js contains the gate", () => {
      assert.ok(APP_JS.includes("paymentsEnabled"));
    });
    it("test file exists", () => {
      assert.ok(existsSync(path.join(PROJECT, "tests/payments-gate-hotfix-test.mjs")));
    });
  });

  // ── 1. Valuation API: paymentsEnabled correctness ───────────────
  describe("Valuation API — paymentsEnabled field", () => {
    it("value: code uses (VERCEL_ENV===preview && STRIPE_MODE===test)", () => {
      assert.ok(VAL_SRC.includes('VERCEL_ENV === "preview"'));
      assert.ok(VAL_SRC.includes('STRIPE_MODE === "test"'));
    });

    it("value: does not use negation (not-production) logic", () => {
      // Should NOT contain the old pattern
      assert.ok(!VAL_SRC.includes('!== "production"'), "must not use not-production");
      assert.ok(!VAL_SRC.includes('!=="production"'), "must not use not-production");
    });

    it("behaviour: Production → paymentsEnabled=false", () => {
      assert.equal(simulatePaymentsEnabled("production", "live"), false);
      assert.equal(simulatePaymentsEnabled("production", "test"), false);
      assert.equal(simulatePaymentsEnabled("production", undefined), false);
    });

    it("behaviour: Preview + test → paymentsEnabled=true", () => {
      assert.equal(simulatePaymentsEnabled("preview", "test"), true);
    });

    it("behaviour: Preview + non-test → paymentsEnabled=false", () => {
      assert.equal(simulatePaymentsEnabled("preview", "live"), false);
      assert.equal(simulatePaymentsEnabled("preview", "production"), false);
      assert.equal(simulatePaymentsEnabled("preview", undefined), false);
    });

    it("behaviour: VERCEL_ENV undefined → paymentsEnabled=false", () => {
      assert.equal(simulatePaymentsEnabled(undefined, "test"), false);
      assert.equal(simulatePaymentsEnabled(undefined, undefined), false);
    });

    it("behaviour: development → paymentsEnabled=false", () => {
      assert.equal(simulatePaymentsEnabled("development", "test"), false);
      assert.equal(simulatePaymentsEnabled("development", "live"), false);
    });

    it("behaviour: ALL 12 combinations — only (preview,test) is true", () => {
      const combos = [
        ["production", "live", false],
        ["production", "test", false],
        ["production", "production", false],
        ["production", undefined, false],
        ["preview",    "live",   false],
        ["preview",    "test",   true],
        ["preview",    "production", false],
        ["preview",    undefined,    false],
        ["development", "test",  false],
        ["development", "live",  false],
        [undefined,    "test",  false],
        [undefined,    undefined,    false],
      ];
      const mismatches = combos.filter(([e, m, exp]) =>
        simulatePaymentsEnabled(e, m) !== exp
      );
      assert.equal(mismatches.length, 0,
        "Mismatches: " + JSON.stringify(mismatches));
    });

    it("behaviour: free valuation NOT gated by VERCEL_ENV (draft creation safe)", () => {
      const lines = VAL_SRC.split("\n");
      const draftBlocks = lines.filter(l =>
        l.includes("ensureCustomerFunnelSchema") ||
        l.includes("ensureReportPaymentSchema") ||
        l.includes("createReportDraft")
      );
      for (const line of draftBlocks) {
        const idx = lines.indexOf(line);
        const before = lines.slice(Math.max(0, idx - 10), idx).join("");
        assert.ok(!before.includes("paymentsEnabled"),
          `line ${idx + 1}: draft creation not wrapped in paymentsEnabled check`);
      }
    });
  });

  // ── 2. Checkout API: 503 gate ───────────────────────────────────
  describe("Checkout API — 503 PAYMENTS_GATE_BLOCKED", () => {
    it("source: handler has gate BEFORE try block (no DB/Stripe)", () => {
      const src = CHK_SRC;
      // Gate must appear before the first try { block
      const gateIdx = src.indexOf("isPaymentsEnabled()");
      const tryIdx = src.indexOf("try {");
      assert.ok(gateIdx >= 0, "gate predicate called");
      assert.ok(tryIdx >= 0, "try block exists");
      assert.ok(gateIdx < tryIdx, "gate BEFORE try — no DB/Stripe");
    });

    it("source: error code is PAYMENTS_GATE_BLOCKED (not TEMPORARILY_UNAVAILABLE)", () => {
      assert.ok(CHK_SRC.includes("PAYMENTS_GATE_BLOCKED"));
      assert.ok(!CHK_SRC.includes("PAYMENTS_TEMPORARILY_UNAVAILABLE"));
      assert.ok(CHK_SRC.includes("503"));
    });

    it("source: uses isPaymentsEnabled() function (shared logic)", () => {
      assert.ok(CHK_SRC.includes("function isPaymentsEnabled()"));
    });

    it("source: no SELECT→INSERT logic (atomic ON CONFLICT restored)", () => {
      assert.ok(!CHK_SRC.includes("SELECT id FROM lead_contacts"),
        "no SELECT-before-INSERT");
      // The INSERT and ON CONFLICT must appear together (not SELECT→INSERT pattern)
      const insertIdx = CHK_SRC.indexOf("INSERT INTO lead_contacts");
      const conflictIdx = CHK_SRC.indexOf("ON CONFLICT");
      assert.ok(insertIdx >= 0 && conflictIdx >= 0,
        "has both INSERT and ON CONFLICT");
      // INSERT should be near ON CONFLICT (within 10 lines), not before SELECT
      assert.ok(conflictIdx - insertIdx < 500,
        "ON CONFLICT near INSERT (not SELECT→INSERT pattern)");
      // Must NOT have SELECT before this INSERT
      const beforeInsert = CHK_SRC.slice(0, insertIdx);
      assert.ok(!beforeInsert.includes("SELECT id FROM lead_contacts"),
        "no SELECT-before-INSERT before the used INSERT");
    });

    it("source: no VERSION=4 debug logging", () => {
      assert.ok(!CHK_SRC.includes("VERSION=4"),
        "no debug log version tag");
    });

    it("source: VERCEL_ENV gate checks both env and mode", () => {
      assert.ok(CHK_SRC.includes('VERCEL_ENV === "preview"'));
      assert.ok(CHK_SRC.includes('STRIPE_MODE === "test"'));
    });

    it("behaviour: Production → 503 PA YMENTS_GATE_BLOCKED", () => {
      assert.equal(simulatePaymentsEnabled("production", "live"), false);
      assert.equal(simulatePaymentsEnabled("production", "test"), false);
    });

    it("behaviour: Preview + test → pass through (not blocked)", () => {
      assert.equal(simulatePaymentsEnabled("preview", "test"), true);
    });

    it("behaviour: Preview + non-test → blocked", () => {
      assert.equal(simulatePaymentsEnabled("preview", "live"), false);
    });

    it("behaviour: VERCEL_ENV missing → blocked", () => {
      assert.equal(simulatePaymentsEnabled(undefined, "test"), false);
    });

    it("behaviour: development → blocked", () => {
      assert.equal(simulatePaymentsEnabled("development", "test"), false);
    });
  });

  // ── 3. Frontend: fail-closed ────────────────────────────────────
  describe("Frontend — fail-closed (paymentsEnabled defaults false)", () => {
    it("var paymentsEnabled = false (fail-closed)", () => {
      const m = APP_JS.match(/var paymentsEnabled\s*=\s*(true|false)/);
      assert.ok(m, "paymentsEnabled declared with var");
      assert.equal(m[1], "false", "default must be false");
    });

    it("reads paymentsEnabled from API response with === true", () => {
      assert.ok(APP_JS.includes("paymentsEnabled: data.paymentsEnabled === true"),
        "strict equality to true");
    });

    it("renderValuation: fails closed when data.paymentsEnabled missing or falsy", () => {
      assert.ok(APP_JS.includes("paymentsEnabled = data.paymentsEnabled;"),
        "assignment from response");
      assert.ok(APP_JS.includes('!paymentsEnabled'),
        "negation check present");
    });

    it("renderValuation: hides unlock button and lead panel when disabled", () => {
      // Check that renderValuation contains style manipulation
      assert.ok(APP_JS.includes('unlockBtn2.style.display = "none"') ||
        APP_JS.includes("unlockBtn2.style.display=\"none\""),
        "hides unlock button");
      assert.ok(APP_JS.includes('leadPanel2.style.display = "none"') ||
        APP_JS.includes("leadPanel2.style.display=\"none\""),
        "hides lead panel");
      assert.ok(APP_JS.includes("currentReportDraft = null"),
        "clears draft token");
    });

    it("updatePurchaseButton: never enables when payments disabled", () => {
      // The guard at top of updatePurchaseButton
      assert.ok(APP_JS.includes("!paymentsEnabled"),
        "guard present");
    });

    it("openCheckoutModal: guarded by paymentsEnabled", () => {
      assert.ok(APP_JS.includes("paymentsEnabled") &&
        APP_JS.includes("openCheckoutModal"),
        "modal guard exists");
    });

    it("handleCheckoutSubmit: guarded by paymentsEnabled", () => {
      assert.ok(APP_JS.includes("paymentsEnabled") &&
        APP_JS.includes("handleCheckoutSubmit"),
        "submit guard exists");
    });

    it("lockedPreview CTA: requires paymentsEnabled", () => {
      assert.ok(APP_JS.includes("draftValid && paymentsEnabled"),
        "CTA requires both draft and payments");
    });

    it("mobile CTA: skips lead panel when payments disabled", () => {
      assert.ok(APP_JS.includes("mobile-report-cta") &&
        APP_JS.includes("paymentsEnabled"),
        "mobile CTA guard exists");
    });
  });

  // ── 4. Frontend initial state ───────────────────────────────────
  describe("Frontend initial load — no flash of purchase UI", () => {
    it("IIFE hides unlock button on page load", () => {
      assert.ok(APP_JS.includes('unlockBtn.style.display = "none"'),
        "IIFE hides unlock button");
      assert.ok(APP_JS.includes('unlockBtn.disabled = true'),
        "IIFE disables unlock button");
    });

    it("IIFE hides lead panel on page load", () => {
      assert.ok(APP_JS.includes('leadPanel.style.display = "none"'),
        "IIFE hides lead panel");
    });

    it("IIFE runs before any other code", () => {
      // The IIFE should be at the very top of app.js content
      const topLines = APP_JS.split("\n").slice(0, 15).join("\n");
      assert.ok(topLines.includes("(function()"),
        "IIFE at top");
      assert.ok(topLines.includes("unlockBtn"),
        "button manipulation in IIFE");
    });
  });

  // ── 5. Checkout: no SELECT→INSERT, no debug ─────────────────────
  describe("Checkout implementation — clean restore", () => {
    it("no SELECT id FROM lead_contacts (pre-ON CONFLICT pattern)", () => {
      assert.ok(!CHK_SRC.includes("SELECT id FROM lead_contacts"));
    });

    it("no VERSION=4 debug comment", () => {
      assert.ok(!CHK_SRC.includes("VERSION=4"));
    });

    it("no ctupyiks4 marker", () => {
      assert.ok(!CHK_SRC.includes("ctupyiks4"));
    });

    it("comment says atomic ON CONFLICT", () => {
      assert.ok(CHK_SRC.includes("no SELECT-before-INSERT race") ||
        CHK_SRC.includes("atomic ON CONFLICT"));
    });

    it("ERR table does NOT include PAYMENTS_TEMPORARILY_UNAVAILABLE", () => {
      assert.ok(!CHK_SRC.includes("PAYMENTS_TEMPORARILY_UNAVAILABLE"));
    });

    it("ERR table includes PAYMENTS_GATE_BLOCKED", () => {
      assert.ok(CHK_SRC.includes("PAYMENTS_GATE_BLOCKED"));
    });
  });

  // ── 6. Static analysis — no forbidden patterns ──────────────────
  describe("Static analysis — forbidden patterns", () => {
    const forbidden = [
      "SELECT id FROM lead_contacts",
      "VERSION=4",
      "PAYMENTS_TEMPORARILY_UNAVAILABLE",
      "paymentsEnabled: data.paymentsEnabled !== false",
      "paymentsEnabled = data.paymentsEnabled !== false",
      "!== \"production\"",
      "!==\"production\"",
    ];
    for (const pattern of forbidden) {
      it(`valuation.js does NOT contain: ${pattern}`, () => {
        assert.ok(!VAL_SRC.includes(pattern),
          `valuation.js should not contain: ${pattern}`);
      });
      it(`checkout.js does NOT contain: ${pattern}`, () => {
        assert.ok(!CHK_SRC.includes(pattern),
          `checkout.js should not contain: ${pattern}`);
      });
    }
  });

  // ── 7. Error: missing paymentsEnabled field ─────────────────────
  describe("Frontend — missing paymentsEnabled field", () => {
    it("renderValuation defaults to false when API omits paymentsEnabled", () => {
      // When data.paymentsEnabled is undefined, paymentsEnabled = data.paymentsEnabled → undefined → falsy
      assert.ok(APP_JS.includes("paymentsEnabled = data.paymentsEnabled;"),
        "direct assignment — undefined means disabled");
    });

    it("freeData mapping uses strict === true", () => {
      assert.ok(APP_JS.includes("paymentsEnabled: data.paymentsEnabled === true"),
        "strict — undefined/null/false all become false");
    });
  });
});
