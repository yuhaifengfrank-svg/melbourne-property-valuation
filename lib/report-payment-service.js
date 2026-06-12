// ── Report Payment Service ──
// Phase 1C3: Database operations for report payments.
//
// - Generates purchase_intent_key for idempotency
// - Checks for active entitlements
// - Creates/reads pending report_payments
// - Uses DB unique constraints for concurrency
// - Does NOT call Stripe, create API endpoints, or grant entitlements

import { buildPurchaseIntentKey } from "./report-checkout-builder.js";

/**
 * Ensure a report_payment row exists for the given purchase intent.
 *
 * Strategy:
 *   1. Check for existing active entitlement — if found, return alreadyPurchased.
 *   2. Check for existing pending/paid payment — reuse if found.
 *   3. Insert a new pending record (ON CONFLICT handles concurrent writes).
 *   4. Return the payment row.
 *
 * @param {object} opts
 * @param {string} opts.reportId
 * @param {number} opts.leadContactId
 * @param {string} [opts.stripeCheckoutSessionId] — set after Stripe session created
 * @param {function} sql — neon SQL executor
 * @returns {Promise<object>} { payment, alreadyConsumed?, alreadyPurchased? }
 */
export async function ensureReportPayment(opts, sql) {
  const { reportId, leadContactId, stripeCheckoutSessionId } = opts;

  // Validate
  if (!reportId) throw new Error("reportId is required");
  if (leadContactId == null || typeof leadContactId !== "number" || !Number.isInteger(leadContactId) || leadContactId <= 0) {
    throw new Error("leadContactId must be a positive integer");
  }

  const purchaseIntentKey = buildPurchaseIntentKey(reportId, leadContactId);

  // ── Step 1: Check for existing active entitlement ──
  const entitlements = await sql`
    SELECT id FROM report_entitlements
    WHERE report_id = ${reportId}
      AND lead_contact_id = ${leadContactId}
      AND status = 'active'
    LIMIT 1
  `;
  if (entitlements.length > 0) {
    return { payment: null, alreadyPurchased: true, alreadyConsumed: false };
  }

  // ── Step 2: Check for existing payment ──
  const existingPayments = await sql`
    SELECT * FROM report_payments
    WHERE purchase_intent_key = ${purchaseIntentKey}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existingPayments.length > 0) {
    const existing = existingPayments[0];

    // Already paid — treat as purchased
    if (existing.status === "paid") {
      return { payment: existing, alreadyPurchased: true, alreadyConsumed: true };
    }

    // Pending with a session ID — return as-is (idempotency)
    if (existing.status === "pending" && existing.stripe_checkout_session_id) {
      return { payment: existing, alreadyPurchased: false, alreadyConsumed: true };
    }

    // Failed or pending without session — fall through to refresh
    // We'll UPDATE this existing row via ON CONFLICT
  }

  // ── Step 3: Insert or update payment row ──
  const inserted = await sql`
    INSERT INTO report_payments (report_id, lead_contact_id, stripe_checkout_session_id, purchase_intent_key, amount_cents, currency, status)
    VALUES (${reportId}, ${leadContactId}, ${stripeCheckoutSessionId || null}, ${purchaseIntentKey}, 399, 'aud', 'pending')
    ON CONFLICT (purchase_intent_key) DO UPDATE SET
      stripe_checkout_session_id = COALESCE(${stripeCheckoutSessionId || null}, report_payments.stripe_checkout_session_id),
      status = CASE
        WHEN report_payments.status = 'failed' THEN 'pending'
        ELSE report_payments.status
      END,
      updated_at = NOW()
    RETURNING *
  `;

  return { payment: inserted[0], alreadyPurchased: false, alreadyConsumed: false };
}

/**
 * Record a failed payment after a Stripe session creation failure.
 *
 * Only updates if the current status is 'pending' — never overwrites
 * an already-paid row.
 *
 * @param {string} purchaseIntentKey
 * @param {function} sql
 * @returns {Promise<object>} updated payment row
 */
export async function markPaymentFailed(purchaseIntentKey, sql) {
  if (!purchaseIntentKey) throw new Error("purchaseIntentKey is required");

  const updated = await sql`
    UPDATE report_payments SET
      status = 'failed',
      updated_at = NOW()
    WHERE purchase_intent_key = ${purchaseIntentKey}
      AND status = 'pending'
    RETURNING *
  `;

  if (updated.length === 0) {
    // Either doesn't exist or status is not 'pending' — this is fine
    // (e.g. concurrent request already marked it, or it's a paid row)
    const existing = await sql`
      SELECT * FROM report_payments WHERE purchase_intent_key = ${purchaseIntentKey} LIMIT 1
    `;
    return existing[0] || null;
  }

  return updated[0];
}

export { buildPurchaseIntentKey };
