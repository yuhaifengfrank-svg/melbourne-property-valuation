// ── Payment Gate — Shared Single Source of Truth ──
// All payment-gating decisions must go through this module.
// No inline process.env checks in api/valuation.js or api/create-report-checkout.js.

/**
 * Determine whether payments are enabled in the current environment.
 *
 * Rules (strict, no relaxations):
 *
 *   Preview (VERCEL_ENV=preview):
 *     STRIPE_MODE=test   → true
 *     STRIPE_MODE=live   → false  (code-level guard, never allow live key on preview)
 *     anything else      → false
 *
 *   Production (VERCEL_ENV=production):
 *     STRIPE_MODE=live   + PAYMENTS_ENABLED="true"   → true
 *     STRIPE_MODE=live   + PAYMENTS_ENABLED anything  → false
 *     STRIPE_MODE=test   → false
 *     STRIPE_MODE=any    → false
 *
 *   Development / undefined VERCEL_ENV:
 *     always false
 *
 * @returns {boolean}
 */
export function isPaymentsEnabled() {
  const env = process.env.VERCEL_ENV;
  const mode = process.env.STRIPE_MODE;
  const flag = process.env.PAYMENTS_ENABLED;

  if (env === "preview") {
    // Preview only works with test keys
    return mode === "test";
  }

  if (env === "production") {
    // Production requires explicit PAYMENTS_ENABLED=true AND live mode
    return mode === "live" && flag === "true";
  }

  // development, undefined, or anything else → closed
  return false;
}
