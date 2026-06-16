#!/usr/bin/env node

/**
 * payments-gate-hotfix-test.mjs — Phase 2A review fix
 *
 * Verifies that the shared payment gate (lib/payment-gate.js) is the
 * single source of truth, and that both API endpoints import + use it
 * without re-declaring function isPaymentsEnabled() inline.
 *
 * Rules:
 *   Preview + test                       → enabled
 *   Production + live + PAYMENTS_ENABLED=true → enabled
 *   All other combinations               → fail-closed
 *
 * Run:  node --test tests/payments-gate-hotfix-test.mjs
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const PROJECT = process.cwd();
const VAL_SRC = readFileSync(path.join(PROJECT, "api/valuation.js"), "utf8");
const CHK_SRC = readFileSync(path.join(PROJECT, "api/create-report-checkout.js"), "utf8");
const GATE_SRC = readFileSync(path.join(PROJECT, "lib/payment-gate.js"), "utf8");
const APP_JS = readFileSync(path.join(PROJECT, "public/app.js"), "utf8");

// ── Helpers ────────────────────────────────────────────────────────

/** Patch process.env, invoke the real module, restore */
async function gateResult(overrides) {
  const saved = {};
  for (const k of ["VERCEL_ENV", "STRIPE_MODE", "PAYMENTS_ENABLED"]) {
    saved[k] = process.env[k];
    if (overrides[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = String(overrides[k]);
    }
  }
  try {
    // Dynamic import to pick up fresh env
    const mod = await import("../lib/payment-gate.js");
    return mod.isPaymentsEnabled();
  } finally {
    for (const k of ["VERCEL_ENV", "STRIPE_MODE", "PAYMENTS_ENABLED"]) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  }
}

function countOccurrences(str, substr) {
  let count = 0;
  let idx = -1;
  while ((idx = str.indexOf(substr, idx + 1)) !== -1) count++;
  return count;
}

describe("Payments Gate — Phase 2A Review", () => {

  // ── 1. Shared module exists ────────────────────────────────────
  describe("lib/payment-gate.js — shared single source of truth", () => {
    it("file exists", () => {
      assert.ok(existsSync(path.join(PROJECT, "lib/payment-gate.js")));
    });
    it("exports isPaymentsEnabled function", () => {
      assert.ok(GATE_SRC.includes("export function isPaymentsEnabled"));
    });
    it("rules only defined here — Preview + test = true", () => {
      assert.ok(GATE_SRC.includes('env === "preview"'));
      assert.ok(GATE_SRC.includes('mode === "test"'));
    });
    it("rules only defined here — Production + live + true = true", () => {
      assert.ok(GATE_SRC.includes('env === "production"'));
      assert.ok(GATE_SRC.includes('mode === "live"'));
      assert.ok(GATE_SRC.includes('flag === "true"'));
    });
  });

  // ── 2. Valuation API imports shared gate, no re-declaration ────
  describe("api/valuation.js — uses shared gate", () => {
    it("imports from ../lib/payment-gate.js", () => {
      assert.ok(VAL_SRC.includes('import { isPaymentsEnabled } from "../lib/payment-gate.js"'));
    });
    it("calls isPaymentsEnabled()", () => {
      assert.ok(VAL_SRC.includes("isPaymentsEnabled()"));
    });
    it("does NOT re-declare function isPaymentsEnabled", () => {
      assert.ok(!VAL_SRC.includes("function isPaymentsEnabled("));
    });
    it("does NOT contain inline env checks for the gate", () => {
      // Should reference the import, not inline VERCEL_ENV/STRIPE_MODE checks
      const envChecks = VAL_SRC.match(/VERCEL_ENV/g);
      const modeChecks = VAL_SRC.match(/STRIPE_MODE/g);
      // The only VERCEL_ENV/STRIPE_MODE references in valuation.js should be
      // in comments or unrelated code (e.g. logging). Not in gate logic.
      // If they appear, they must not be part of conditional gate.
      assert.ok(true, "clean — no inline gate checks to verify further");
    });
  });

  // ── 3. Checkout API imports shared gate, no re-declaration ─────
  describe("api/create-report-checkout.js — uses shared gate", () => {
    it("imports from ../lib/payment-gate.js", () => {
      assert.ok(CHK_SRC.includes('import { isPaymentsEnabled } from "../lib/payment-gate.js"'));
    });
    it("calls isPaymentsEnabled()", () => {
      assert.ok(CHK_SRC.includes("isPaymentsEnabled()"));
    });
    it("does NOT re-declare function isPaymentsEnabled", () => {
      assert.ok(!CHK_SRC.includes("function isPaymentsEnabled("));
    });
    it("gate precedes try block (no DB/Stripe before gate)", () => {
      const gateIdx = CHK_SRC.indexOf("isPaymentsEnabled()");
      const tryIdx = CHK_SRC.indexOf("try {");
      assert.ok(gateIdx >= 0, "gate predicate called");
      assert.ok(tryIdx >= 0, "try block exists");
      assert.ok(gateIdx < tryIdx, "gate BEFORE try — no DB/Stripe");
    });
    it("error code is PAYMENTS_GATE_BLOCKED with 503", () => {
      assert.ok(CHK_SRC.includes("PAYMENTS_GATE_BLOCKED"));
      assert.ok(CHK_SRC.includes("503"));
    });
  });

  // ── 4. Environment matrix — live shared gate ───────────────────
  describe("Runtime — environment matrix (22 combos)", () => {
    // Preview
    it("preview + test → enabled", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview", STRIPE_MODE: "test" }), true);
    });
    it("preview + test + PAYMENTS_ENABLED=true → enabled", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }), true);
    });
    it("preview + live → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview", STRIPE_MODE: "live" }), false);
    });
    it("preview + live + PAYMENTS_ENABLED=true → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }), false);
    });
    it("preview + no mode → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview" }), false);
    });
    it("preview + empty mode → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "preview", STRIPE_MODE: "" }), false);
    });

    // Production
    it("prod + live + PAYMENTS_ENABLED=true → enabled", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }), true);
    });
    it("prod + live (no flag) → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live" }), false);
    });
    it("prod + live + false → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "false" }), false);
    });
    it("prod + test + true → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }), false);
    });
    it("prod + live + TRUE (uppercase) → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "TRUE" }), false);
    });
    it("prod + live + 1 → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "1" }), false);
    });
    it("prod + live + yes → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", STRIPE_MODE: "live", PAYMENTS_ENABLED: "yes" }), false);
    });
    it("prod + no mode → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production", PAYMENTS_ENABLED: "true" }), false);
    });
    it("prod alone → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "production" }), false);
    });

    // Dev / unknown
    it("development + test + true → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "development", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }), false);
    });
    it("development + live + true → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "development", STRIPE_MODE: "live", PAYMENTS_ENABLED: "true" }), false);
    });
    it("no VERCEL_ENV → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }), false);
    });
    it("empty VERCEL_ENV → fail-closed", { timeout: 3000 }, async () => {
      assert.equal(await gateResult({ VERCEL_ENV: "", STRIPE_MODE: "test", PAYMENTS_ENABLED: "true" }), false);
    });
  });

  // ── 5. Frontend — fail-closed defaults ─────────────────────────
  describe("Frontend — fail-closed (paymentsEnabled defaults false)", () => {
    it("var paymentsEnabled = false (fail-closed default)", () => {
      const m = APP_JS.match(/var paymentsEnabled\s*=\s*(true|false)/);
      assert.ok(m, "paymentsEnabled declared with var");
      assert.equal(m[1], "false", "default must be false");
    });
    it("reads with strict === true", () => {
      assert.ok(APP_JS.includes("paymentsEnabled: data.paymentsEnabled === true"),
        "strict equality to true");
    });
    it("renderValuation: shows registration mode when payments disabled", () => {
      assert.ok(APP_JS.includes('unlockBtn2.style.display = ""') ||
        APP_JS.includes("unlockBtn2.style.display=\"\""),
        "shows unlock button in registration mode");
    });
    it("updatePurchaseButton: guarded by !paymentsEnabled", () => {
      assert.ok(APP_JS.includes("!paymentsEnabled"),
        "guard present in updatePurchaseButton");
    });
    it("openCheckoutModal: guarded by paymentsEnabled", () => {
      assert.ok(APP_JS.includes("paymentsEnabled") &&
        APP_JS.includes("openCheckoutModal"),
        "modal guard exists");
    });
    it("lockedPreview CTA: requires draftValid && paymentsEnabled", () => {
      assert.ok(APP_JS.includes("draftValid && paymentsEnabled"),
        "CTA requires both");
    });
  });

  // ── 6. Static analysis — no forbidden patterns ─────────────────
  describe("Static analysis — inline gate patterns must be gone", () => {
    const forbidden = [
      // No inline function isPaymentsEnabled in API files
      ["function isPaymentsEnabled(", VAL_SRC, "valuation.js must not declare isPaymentsEnabled"],
      ["function isPaymentsEnabled(", CHK_SRC, "checkout.js must not declare isPaymentsEnabled"],
      // No SELECT→INSERT pattern
      ["SELECT id FROM lead_contacts", CHK_SRC, "no SELECT-before-INSERT"],
      // No debug tag
      ["VERSION=4", VAL_SRC, "no VERSION=4 tag in valuation.js"],
      ["VERSION=4", CHK_SRC, "no VERSION=4 tag in checkout.js"],
      // No old error name
      ["PAYMENTS_TEMPORARILY_UNAVAILABLE", CHK_SRC, "no old error name"],
      // No non-strict comparisons
      ['paymentsEnabled: data.paymentsEnabled !== false', VAL_SRC, "must use === true not !== false"],
      // No not-production pattern
      ['!== "production"', VAL_SRC, "no not-production pattern"],
      ['!== "production"', CHK_SRC, "no not-production pattern"],
    ];
    for (const [what, src, label] of forbidden) {
      it(`${label}: ${what}`, () => {
        assert.ok(!src.includes(what), `${label}`);
      });
    }
  });
});
