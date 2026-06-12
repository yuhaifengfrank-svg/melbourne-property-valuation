// ── lib/report-refund-webhook-service.js ──
// Phase 1D5A: Refund → revoke report entitlement.
//
// When a charge.refunded webhook arrives, we:
//   1. Validate the charge has payment_intent and amount_refunded > 0
//   2. Look up the report_payment by stripe_payment_intent_id
//   3. Atomic CTE: mark payment refunded + entitlement revoked
//   4. Ownership check via CTE WHERE clause
//   5. Idempotent on repeats (payment refunded + same-owner entitlement revoked → no-op)
//
// The CTE runs ent BEFORE pay so that entitlement is verified to exist,
// belong to the correct customer, and be active BEFORE payment is refunded.
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
    // Check if the entitlement is also revoked AND belongs to the same customer
    const existingEnt = await sql`
      SELECT id, status, lead_contact_id FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;

    const entOk = existingEnt.length > 0 &&
      existingEnt[0].status === "revoked" &&
      Number(existingEnt[0].lead_contact_id) === Number(payment.lead_contact_id);

    if (entOk) {
      return {
        refunded: true,
        revoked: true,
        alreadyRefunded: true,
      };
    }

    // Payment is refunded but entitlement is still active, missing,
    // or belongs to a different customer — inconsistent state.
    throw new RefundProcessingError(
      "REFUND_STATE_INCONSISTENT",
      "Payment is refunded but entitlement state does not match."
    );
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
      ent AS (
        UPDATE report_entitlements
        SET status = 'revoked',
            revoked_at = NOW()
        WHERE report_id = ${payment.report_id}
          AND lead_contact_id = ${payment.lead_contact_id}
          AND status = 'active'
        RETURNING id, status, revoked_at
      ),
      pay AS (
        UPDATE report_payments
        SET status = 'refunded',
            updated_at = NOW()
        WHERE id = ${payment.id}
          AND status = 'paid'
          AND EXISTS (SELECT 1 FROM ent)
        RETURNING id, status
      )
    SELECT
      (SELECT id FROM ent) AS entitlement_id,
      (SELECT status FROM ent) AS entitlement_status,
      (SELECT revoked_at FROM ent) AS entitlement_revoked_at,
      (SELECT id FROM pay) AS payment_id,
      (SELECT status FROM pay) AS payment_status
  `;

  if (!cteRow || cteRow.length === 0) {
    throw new RefundProcessingError(
      "ATOMIC_CTE_FAILED",
      "Atomic refund CTE returned no rows."
    );
  }

  const r = cteRow[0];

  // ── Entitlement must be revoked first ─────────────────────────
  // Because ent is declared before pay, and pay depends on ent,
  // if entitlement was not updated (wrong customer, or no entitlement),
  // both ent and pay columns will be null.

  if (r.entitlement_id === null || r.entitlement_id === undefined) {
    // Entitlement was NOT revoked. This could be:
    //   - No active entitlement for this report + lead_contact_id
    //   - Entitlement belongs to a different customer
    // Payment MUST remain paid — do NOT refund it.
    throw new RefundProcessingError(
      "REFUND_ENTITLEMENT_MISMATCH",
      "Entitlement does not match or does not exist for this customer."
    );
  }

  // Entitlement was revoked. If payment was also updated, we're done.
  if (r.payment_id !== null && r.payment_id !== undefined) {
    return {
      refunded: true,
      revoked: true,
      alreadyRefunded: false,
    };
  }

  // Entitlement was revoked but payment wasn't updated — could be a race.
  // Re-check: another concurrent caller might have already refunded.
  const recheck = await sql`
    SELECT status FROM report_payments WHERE id = ${payment.id}
  `;
  if (recheck.length > 0 && recheck[0].status === "refunded") {
    return {
      refunded: true,
      revoked: true,
      alreadyRefunded: true,
    };
  }

  // Both should have updated atomically — this is an anomaly.
  throw new RefundProcessingError(
    "PAYMENT_UPDATE_FAILED",
    "Entitlement revoked but payment could not be updated."
  );
}
