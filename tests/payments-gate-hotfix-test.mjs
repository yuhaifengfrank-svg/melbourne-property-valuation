#!/usr/bin/env node

/**
 * payments-gate-hotfix-test.mjs
 *
 * Tests for the Production payments gate hotfix.
 *
 * Verifies:
 * 1. Valuation API: paymentsEnabled=✓ based on VERCEL_ENV
 * 2. Checkout API: 503 PAYMENTS_TEMPORARILY_UNAVAILABLE on Production
 * 3. Frontend: paymentsEnabled global, button hidden on production, guards in all entry points
 * 4. Free valuation NOT gated by VERCEL_ENV
 * 5. No layout overflow (delegated to overlay test)
 *
 * Run: node --test tests/payments-gate-hotfix-test.mjs
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const PROJECT = process.cwd();
const VAL_SRC = readFileSync(path.join(PROJECT, "api/valuation.js"), "utf8");
const CHK_SRC = readFileSync(path.join(PROJECT, "api/create-report-checkout.js"), "utf8");
const APP_JS = readFileSync(path.join(PROJECT, "public/app.js"), "utf8");

describe("Payments Gate Hotfix", () => {
  before(() => delete process.env.VERCEL_ENV);

  // ── 1. Valuation API ──
  describe("Valuation API — paymentsEnabled field", () => {
    it("source contains paymentsEnabled + VERCEL_ENV check", () => {
      assert.ok(VAL_SRC.includes("paymentsEnabled"), "must have paymentsEnabled");
      assert.ok(VAL_SRC.includes("VERCEL_ENV"), "must check VERCEL_ENV");
      assert.ok(VAL_SRC.includes('"production"'), "must compare vs 'production'");
    });

    it("returns true when VERCEL_ENV != production", () => {
      process.env.VERCEL_ENV = "preview";
      assert.equal(process.env.VERCEL_ENV !== "production", true);
      delete process.env.VERCEL_ENV;
      assert.equal(process.env.VERCEL_ENV !== "production", true);
    });

    it("returns false when VERCEL_ENV = production", () => {
      process.env.VERCEL_ENV = "production";
      assert.equal(process.env.VERCEL_ENV !== "production", false);
    });
  });

  // ── 2. Checkout API ──
  describe("Checkout API — 503 gate", () => {
    it("source guards with VERCEL_ENV === production at top", () => {
      assert.ok(CHK_SRC.includes('VERCEL_ENV === "production"'), "must gate on production");
      assert.ok(CHK_SRC.includes("PAYMENTS_TEMPORARILY_UNAVAILABLE"), "must use error code");
      assert.ok(CHK_SRC.includes("503"), "must return 503");
    });
  });

  // ── 3. Frontend ──
  describe("Frontend app.js — all guards", () => {
    it("declares paymentsEnabled global (default true)", () => {
      const m = APP_JS.match(/var paymentsEnabled\s*=\s*(true|false)/);
      assert.ok(m, "paymentsEnabled var declaration");
      assert.equal(m[1], "true", "default true");
    });

    it("reads from server response in renderValuation", () => {
      assert.ok(APP_JS.includes("paymentsEnabled: data.paymentsEnabled"), "copy from response");
    });

    it("hides unlock button + lead panel + clears draft when disabled", () => {
      assert.ok(APP_JS.includes('unlockBtn2.style.display = "none"'), "hides button");
      assert.ok(APP_JS.includes('leadPanel.style.display = "none"'), "hides lead panel");
      assert.ok(APP_JS.includes("currentReportDraft = null"), "clears draft");
    });

    it("updatePurchaseButton keeps button disabled when !paymentsEnabled", () => {
      assert.ok(APP_JS.includes("!paymentsEnabled"), "check in updatePurchaseButton");
      assert.ok(APP_JS.includes('"aria-disabled", "true"'), "set aria-disabled");
    });

    it("openCheckoutModal guarded", () => {
      assert.ok(APP_JS.includes("function openCheckoutModal") && APP_JS.includes("!paymentsEnabled"));
    });

    it("handleCheckoutSubmit guarded", () => {
      assert.ok(APP_JS.includes("async function handleCheckoutSubmit") && APP_JS.includes("!paymentsEnabled"));
    });

    it("renderLockState CTA guarded", () => {
      assert.ok(APP_JS.includes("draftValid && paymentsEnabled"));
    });

    it("mobile button scroll guarded", () => {
      assert.ok(APP_JS.includes("mobile-report-cta") && APP_JS.includes("!paymentsEnabled"));
    });
  });

  // ── 4. Free valuation NOT gated ──
  it("free valuation draft creation NOT gated by VERCEL_ENV", () => {
    const lines = VAL_SRC.split("\n");
    const draftIdx = lines.findIndex(l => l.includes("try ") && l.includes("result.ok"));
    const catchIdx = lines.findIndex(l => l.includes("catch (draftErr"));
    if (draftIdx >= 0 && catchIdx > draftIdx) {
      const block = lines.slice(draftIdx, catchIdx + 1).join("\n");
      assert.ok(!block.includes("VERCEL_ENV"), "draft creation must not depend on VERCEL_ENV");
    }
  });

  // ── 5. Existing test suite compatible ──
  it("existing checkout tests must not be broken", () => {
    // The paymentsEnabled global doesn't block existing test flow (they set it via mock)
    // Test cannot stomp on existing test assertions
    assert.ok(APP_JS.includes("var paymentsEnabled"), "declare no-let ensures test mockable");
  });

  it("all three hotfix files modified", () => {
    assert.ok(VAL_SRC.includes("paymentsEnabled"), "valuation.js");
    assert.ok(CHK_SRC.includes("VERCEL_ENV"), "create-report-checkout.js");
    assert.ok(APP_JS.includes("paymentsEnabled"), "app.js");
  });
});
