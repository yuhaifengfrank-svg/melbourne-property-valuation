// ── Stripe Client ──
// Phase 1E3D-2B: Stripe Test/Live Mode security guardrails.
//
// - Production: reads env vars, throws if any required key is missing.
// - Test: supports mock injection — no real Stripe network calls.
// - Secret keys and price IDs are NEVER exposed to the frontend.
// - STRIPE_MODE ("test"|"live") validated against secret key prefix.
// - Vercel Preview env is blocked from using live keys.
//
// Environment variables owned:
//   STRIPE_MODE                 — "test" or "live" (required outside NODE_ENV=test)
//   STRIPE_SECRET_KEY           — Stripe secret key (sk-test prefix / sk-live prefix)
//   STRIPE_PRICE_ID_REPORT_399  — Price ID for $3.99 valuation report (price_...)
//   STRIPE_WEBHOOK_SECRET       — Webhook signing secret (webhook secret prefix)
//   APP_BASE_URL                — Application base URL for return URLs
//   VERCEL_URL                  — Vercel auto-injected deploy URL
//   VERCEL_ENV                  — Vercel environment (preview|production)

import Stripe from "stripe";

// ── Constants ───────────────────────────────────────────────────────

const ALLOWED_MODES = new Set(["test", "live"]);

// ── Singleton state ─────────────────────────────────────────────────

let _stripe = null;
let _mockStripe = null;

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Determine if the current runtime is a test harness.
 */
function isTestEnv() {
  return (process.env.NODE_ENV || "").toLowerCase() === "test";
}

/**
 * Validate STRIPE_MODE and STRIPE_SECRET_KEY consistency.
 *
 * Rules enforced:
 *   1. STRIPE_MODE is required when NODE_ENV !== "test".
 *   2. STRIPE_MODE must be exactly "test" or "live".
 *   3. For modes other than "test": sk-test prefix must match mode "test",
 *      sk-live prefix must match mode "live".
 *   4. When VERCEL_ENV=preview, STRIPE_MODE=live is rejected.
 *   5. No full secret key is included in error messages (only prefix or "Stripe
 *      secret key").
 *   6. When NODE_ENV=test, validation is skipped (mock mode).
 *
 * @returns {void}
 * @throws {Error} descriptive message without full key.
 */
function validateStripeConfig() {
  // Skip all checks in test harness
  if (isTestEnv()) return;

  // ── STRIPE_MODE ──────────────────────────────────────────────
  const mode = process.env.STRIPE_MODE;
  if (!mode) {
    throw new Error(
      "STRIPE_MODE environment variable is required. Set to \"test\" or \"live\"."
    );
  }
  if (!ALLOWED_MODES.has(mode)) {
    throw new Error(
      `STRIPE_MODE must be "test" or "live", got "${String(mode).slice(0, 20)}".`
    );
  }

  // ── VERCEL_ENV=preview guard ─────────────────────────────────
  const vercelEnv = (process.env.VERCEL_ENV || "").toLowerCase();
  if (vercelEnv === "preview" && mode === "live") {
    throw new Error(
      "STRIPE_MODE=live is not allowed in Vercel Preview environment. " +
      "Use STRIPE_MODE=test for Preview deployments."
    );
  }

  // ── STRIPE_SECRET_KEY prefix check ───────────────────────────
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required for Stripe operations."
    );
  }

  const TEST_KEY_PREFIX = "sk_" + "test_";
  const LIVE_KEY_PREFIX = "sk_" + "live_";
  const prefix = secretKey.slice(0, 8); // "test" or "live" prefix

  if (mode === "test" && prefix !== TEST_KEY_PREFIX) {
    throw new Error(
      `STRIPE_MODE is "test" but STRIPE_SECRET_KEY does not start with test secret key prefix. ` +
      `Key prefix: ${prefix}...`
    );
  }
  if (mode === "live" && prefix !== LIVE_KEY_PREFIX) {
    throw new Error(
      `STRIPE_MODE is "live" but STRIPE_SECRET_KEY does not start with live secret key prefix. ` +
      `Key prefix: ${prefix}...`
    );
  }
}

/**
 * Return the Stripe client singleton.
 *
 * Behaviour by environment:
 * - **Production** (NODE_ENV missing or !== "test"):
 *   Runs validateStripeConfig(), then creates a live Stripe instance.
 * - **Test** (NODE_ENV === "test"):
 *   Returns `null` by default so tests MUST inject a mock via
 *   {@link setMockStripe} before calling getStripe().
 * - **Mock injected**: Returns the mock client immediately.
 *
 * @returns {import("stripe").Stripe | null}
 * @throws {Error} if configuration validation fails.
 */
export function getStripe() {
  if (_mockStripe) return _mockStripe;
  if (_stripe) return _stripe;

  // In test mode, return null (mock must be injected separately)
  if (isTestEnv()) {
    return null;
  }

  // Validate full configuration before creating the client
  validateStripeConfig();

  const secretKey = process.env.STRIPE_SECRET_KEY;

  _stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: false,
  });

  return _stripe;
}

/**
 * Inject a mock Stripe client for testing.
 * Pass `null` to reset back to production mode.
 */
export function setMockStripe(mock) {
  _mockStripe = mock;
}

/**
 * Return the Stripe Price ID for the $3.99 valuation report.
 *
 * @returns {string}
 * @throws {Error} if STRIPE_PRICE_ID_REPORT_399 is not set and we're
 *   not in test mode.  In test mode returns a sentinel value.
 */
export function getReportPriceId() {
  const id = process.env.STRIPE_PRICE_ID_REPORT_399;
  if (id) {
    // Validate format: must start with price_
    if (!id.startsWith("price_")) {
      throw new Error(
        `STRIPE_PRICE_ID_REPORT_399 must start with "price_". Value prefix: ${id.slice(0, 10)}...`
      );
    }
    return id;
  }

  if (isTestEnv()) {
    return "price_test_399_report";
  }

  throw new Error(
    "STRIPE_PRICE_ID_REPORT_399 environment variable is required."
  );
}

/**
 * Return the application base URL for Stripe return URLs.
 *
 * Resolution order:
 *   1. APP_BASE_URL env var
 *   2. VERCEL_URL → https://${VERCEL_URL}
 *   3. fallback: http://127.0.0.1:3000
 *
 * In test mode, returns a deterministic sentinel value.
 *
 * @returns {string}
 */
export function getAppBaseUrl() {
  if (isTestEnv()) {
    return "https://test.aushomevalue.com.au";
  }
  return (
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://127.0.0.1:3000")
  );
}

/**
 * Reset the singleton state — useful between test suites.
 */
export function resetStripeClient() {
  _stripe = null;
  _mockStripe = null;
}
