// ── lib/report-refund-webhook-service.js ──
// Phase 1D5A: Refund → revoke report entitlement.
//
// When a charge.refunded webhook arrives, we:
//   1. Validate the charge has payment_intent and amount_refunded > 0
//   2. Look up the report_payment by stripe_payment_intent_id
//   3. Atomic CTE: mark payment refunded + entitlement revoked
//   4. Ownership check via CTE WHERE clause
//   5. Idempotent on repeats (payment already refunded → no-op)
//
// Does NOT trust customer_id, email, or report_id from the webhook payload.
// Only trusts the payment_intent to match the DB record.

// ── Custom error class ──────────────────────────────────────────────

export class RefundProcessingError extends Error {
  /**
   * @param {string} code  Machine-readable error code
   * @param {string} message  Human-readable description
   */
  constructor(code, message) {
    super(message);
    this.name = "RefundProcessingError";
    this.code = code;
  }
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Handle a charge.refunded event from Stripe webhook.
 *
 * @param {import("stripe").Charge} charge  The charge object from webhook
 * @param {import("@neondatabase/serverless").NeonQueryFunction} sql
 * @returns {Promise<{refunded: boolean, revoked: boolean, alreadyRefunded: boolean}>}
 * @throws {RefundProcessingError} on validation or processing failures
 */
export async function handleChargeRefunded(charge, sql) {
  // ── 1. Validate charge structure ─────────────────────────────────

  if (!charge || typeof charge !== "object") {
    throw new RefundProcessingError(
      "INVALID_CHARGE",
      "Charge object is required."
    );
  }

  const paymentIntent = charge.payment_intent;
  if (!paymentIntent) {
    throw new RefundProcessingError(
      "MISSING_PAYMENT_INTENT",
      "Charge must have a payment_intent."
    );
  }

  const amountRefunded = charge.amount_refunded || 0;
  if (amountRefunded <= 0) {
    throw new RefundProcessingError(
      "AMOUNT_REFUNDED_ZERO",
      "amount_refunded must be greater than 0."
    );
  }

  // ── 2. Find matching report_payment (only by payment_intent) ─────
  // Do NOT trust charge.metadata, charge.customer, or any other fields.

  const matchingPayments = await sql`
    SELECT id, report_id, lead_contact_id, status, amount_cents, currency
    FROM report_payments
    WHERE stripe_payment_intent_id = ${paymentIntent}
    LIMIT 1
  `;

  if (matchingPayments.length === 0) {
    throw new RefundProcessingError(
      "PAYMENT_NOT_FOUND",
      "No matching payment found for this payment_intent."
    );
  }

  const payment = matchingPayments[0];

  // ── 3. Idempotent fast path ──────────────────────────────────────
  // If payment is already refunded, check entitlement state.

  if (payment.status === "refunded") {
    const existingEnt = await sql`
      SELECT id, status FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;

    if (
      existingEnt.length > 0 &&
      existingEnt[0].status === "revoked"
    ) {
      return {
        refunded: true,
        revoked: true,
        alreadyRefunded: true,
      };
    }

    // Payment is refunded but entitlement wasn't revoked — unusual.
    // Still return idempotent ok, but log the inconsistency.
    return {
      refunded: true,
      revoked: existingEnt.length > 0 && existingEnt[0].status === "revoked",
      alreadyRefunded: true,
    };
  }

  // ── 4. Payment must be paid to revoke ────────────────────────────
  // Don't refund pending/failed payments — they were never charged.
  // Don't refund payments already in another terminal state.

  if (payment.status !== "paid") {
    throw new RefundProcessingError(
      "PAYMENT_NOT_PAID",
      "Only paid payments can be refunded."
    );
  }

  // ── 5. Atomic CTE: refund payment + revoke entitlement ───────────
  //
  // Structure:
  //   WITH
  //     pay AS (UPDATE ... SET status=refunded ... WHERE id=X AND status=paid
  //             AND EXISTS (SELECT 1 FROM report_payments WHERE ...)
  //             RETURNING ...),
  //     ent AS (UPDATE ... SET status=revoked, revoked_at=NOW()
  //             WHERE report_id=X AND lead_contact_id=X AND status=active
  //             RETURNING ...)
  //   SELECT ... FROM pay, ent
  //
  // The ent UPDATE only affects rows that match BOTH report_id and
  // lead_contact_id from the payment record. This prevents revoking
  // an entitlement owned by a different customer.
  //
  // pay and ent are linked: if pay fails (returns 0 rows), the whole
  // thing is a no-op.

  const cteRow = await sql`
    WITH
      pay AS (
        UPDATE report_payments
        SET status = 'refunded',
            updated_at = NOW()
        WHERE id = ${payment.id}
          AND status = 'paid'
        RETURNING id, status
      ),
      ent AS (
        UPDATE report_entitlements
        SET status = 'revoked',
            revoked_at = NOW()
        WHERE report_id = ${payment.report_id}
          AND lead_contact_id = ${payment.lead_contact_id}
          AND status = 'active'
          AND EXISTS (SELECT 1 FROM pay)
        RETURNING id, status, revoked_at
      )
    SELECT
      (SELECT id FROM pay) AS payment_id,
      (SELECT status FROM pay) AS payment_status,
      (SELECT id FROM ent) AS entitlement_id,
      (SELECT status FROM ent) AS entitlement_status,
      (SELECT revoked_at FROM ent) AS entitlement_revoked_at
  `;

  if (!cteRow || cteRow.length === 0) {
    throw new RefundProcessingError(
      "ATOMIC_CTE_FAILED",
      "Atomic refund CTE returned no rows."
    );
  }

  const r = cteRow[0];

  // If payment wasn't updated (status was already 'refunded' due to race),
  // treat as idempotent
  if (r.payment_id === null || r.payment_id === undefined) {
    // Re-check: another concurrent caller might have already processed it
    const recheck = await sql`
      SELECT status FROM report_payments WHERE id = ${payment.id}
    `;
    if (recheck.length > 0 && recheck[0].status === "refunded") {
      return {
        refunded: true,
        revoked: false,
        alreadyRefunded: true,
      };
    }
    throw new RefundProcessingError(
      "PAYMENT_UPDATE_FAILED",
      "Failed to update payment to refunded status."
    );
  }

  // If entitlement wasn't affected (no active row for this lead_contact_id)
  // it could mean ownership changed — that's still ok, payment is refunded.
  const revoked = r.entitlement_id !== null && r.entitlement_id !== undefined;

  return {
    refunded: true,
    revoked,
    alreadyRefunded: false,
  };
}
