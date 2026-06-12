// ── Stripe Client ──
// Phase 1C1: Isolated Stripe SDK initialisation & configuration.
//
// - Production: reads env vars, throws if any required key is missing.
// - Test: supports mock injection — no real Stripe network calls.
// - Secret keys and price IDs are NEVER exposed to the frontend.
//
// Environment variables owned:
//   STRIPE_SECRET_KEY         — Stripe secret key (required in production)
//   STRIPE_PRICE_ID_REPORT_399 — Price ID for $3.99 valuation report
//   APP_BASE_URL              — Application base URL for return URLs

import Stripe from "stripe";

// ── Singleton state ─────────────────────────────────────────────────

let _stripe = null;
let _mockStripe = null;

/**
 * Return the Stripe client singleton.
 *
 * Behaviour by environment:
 * - **Production** (NODE_ENV missing or !== "test"):
 *   Requires `STRIPE_SECRET_KEY`.  Throws if absent.
 * - **Test** (NODE_ENV === "test"):
 *   Returns `null` by default so tests MUST inject a mock via
 *   {@link setMockStripe} before calling getStripe().
 * - **Mock injected**: Returns the mock client immediately.
 *
 * @returns {import("stripe").Stripe | null}
 * @throws {Error} if STRIPE_SECRET_KEY is missing in production.
 */
export function getStripe() {
  if (_mockStripe) return _mockStripe;
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    if ((process.env.NODE_ENV || "").toLowerCase() === "test") {
      return null;
    }
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required for Stripe operations"
    );
  }

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
  if (id) return id;
  if ((process.env.NODE_ENV || "").toLowerCase() === "test") {
    return "price_test_399_report";
  }
  throw new Error(
    "STRIPE_PRICE_ID_REPORT_399 environment variable is required"
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
  if ((process.env.NODE_ENV || "").toLowerCase() === "test") {
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
