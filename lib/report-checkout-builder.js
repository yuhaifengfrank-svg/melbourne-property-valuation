// ── Report Checkout Builder ──
// Phase 1C2: Pure function that builds Stripe Checkout Session parameters.
//
// - No database access.
// - No Stripe API calls.
// - Output is a plain object suitable for stripe.checkout.sessions.create().
//
// Rules:
//   mode           = "payment" (fixed)
//   Price ID       = getReportPriceId() only — never from client
//   quantity       = 1 (fixed)
//   success_url    = <baseUrl>/report-success.html?report_id=<encodedReportId>
//   cancel_url     = <baseUrl>/?payment=cancelled&report_id=<encodedReportId>
//   metadata       = { report_id, purchase_intent_key, product_code }
//   NOT in metadata: email, phone, address, valuation content

import { getReportPriceId, getAppBaseUrl } from "./stripe-client.js";

// Internal product code constant — never from client
const PRODUCT_CODE = "valuation_report_399";

/**
 * Build parameters for stripe.checkout.sessions.create().
 *
 * @param {object} opts
 * @param {string} opts.reportId        — report_snapshot ID (e.g. "rp_...")
 * @param {string} opts.purchaseIntentKey — unique business key
 * @param {object} [_clientInput]       — any client-sent overrides (IGNORED)
 * @returns {object} parameters ready for Stripe API
 */
export function buildReportCheckoutParams(opts, _clientInput) {
  const { reportId, purchaseIntentKey } = opts;

  // Validate required fields
  if (!reportId || typeof reportId !== "string") {
    throw new Error("reportId is required and must be a non-empty string");
  }
  if (!purchaseIntentKey || typeof purchaseIntentKey !== "string") {
    throw new Error("purchaseIntentKey is required and must be a non-empty string");
  }

  const baseUrl = getAppBaseUrl();
  const priceId = getReportPriceId();

  return {
    mode: "payment",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      report_id: reportId,
      purchase_intent_key: purchaseIntentKey,
      product_code: PRODUCT_CODE,
    },
    // Explicit card-only — avoids Stripe Link cross-origin iframe issues
    // during automated checkout testing. Harmless in production.
    payment_method_types: ["card"],
    // success/cancel URLs use server-known reportId — secure, no Stripe placeholder
    success_url: `${baseUrl}/report-success.html?report_id=${encodeURIComponent(reportId)}`,
    cancel_url: `${baseUrl}/?payment=cancelled&report_id=${encodeURIComponent(reportId)}`,
  };
}

/**
 * Build the purchase_intent_key for idempotency.
 *
 * Format: `${reportId}:${leadContactId}:valuation_report_399`
 *
 * @param {string} reportId
 * @param {number|string} leadContactId
 * @returns {string}
 */
export function buildPurchaseIntentKey(reportId, leadContactId) {
  if (!reportId) throw new Error("reportId is required");
  if (leadContactId == null) throw new Error("leadContactId is required");
  return `${reportId}:${leadContactId}:${PRODUCT_CODE}`;
}

export { PRODUCT_CODE };
