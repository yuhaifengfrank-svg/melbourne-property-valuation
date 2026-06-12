// ── lib/report-refund-webhook-service.js ──
// Phase 1D5A: Refund → revoke report entitlement.
//
// When a charge.refunded webhook arrives, we:
//   1. Validate the charge has payment_intent and amount_refunded > 0
//   2. Look up the report_payment by stripe_payment_intent_id
//   3. Atomic CTE: revoke entitlement + refund payment
//   4. Ownership check via CTE WHERE clause
//   5. Idempotent on repeats (payment refunded + same-owner entitlement revoked → no-op)
//
// The CTE revokes entitlement BEFORE refunding payment.
// Payment only proceeds if entitlement was successfully revoked.
// A division-by-zero guard in the SELECT ensures that if either
// update fails to meet post-conditions, the entire statement errors
// and PostgreSQL rolls back all changes atomically.
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

  // ── 5. Atomic CTE with rollback guard ────────────────────────────
  //
  // ent → pay → guard
  //
  // PostgreSQL executes writable CTE steps sequentially within one
  // SQL statement. If the outermost SELECT causes a runtime error
  // (division by zero), the ENTIRE statement is rolled back including
  // all prior CTE modifications.
  //
  // The guard CASE expression evaluates to 0 (→ 1/0 error) if:
  //   - pay returned no rows (payment not in 'paid' state concurrently)
  //   - This forces PostgreSQL to undo the ent UPDATE too.
  //
  // Structure:
  //   WITH
  //     ent AS (UPDATE report_entitlements SET ... WHERE status='active'
  //             AND report_id=X AND lead_contact_id=X RETURNING id ...),
  //     pay AS (UPDATE report_payments SET ... WHERE id=X AND status='paid'
  //             AND EXISTS (SELECT 1 FROM ent) RETURNING id ...)
  //   SELECT ...,
  //     1 / CASE WHEN (SELECT id FROM pay) IS NOT NULL THEN 1 ELSE 0 END AS guard
  //
  // If pay returns NULL (no matching row to update), guard=1/0 → rollback.
  // If ent returns NULL → pay's EXISTS fails → pay returns NULL → guard→rollback.
  // Both updates succeed → guard=1/1=1 → success.

  try {
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
        (SELECT status FROM pay) AS payment_status,
        1 / CASE
          WHEN (SELECT id FROM pay) IS NOT NULL
            OR (SELECT id FROM ent) IS NULL
          THEN 1
          ELSE 0
        END AS guard
    `;

    const r = cteRow[0];

    // ── Entitlement was NOT revoked ─────────────────────────────
    if (r.entitlement_id === null || r.entitlement_id === undefined) {
      throw new RefundProcessingError(
        "REFUND_ENTITLEMENT_MISMATCH",
        "Entitlement does not match or does not exist for this customer."
      );
    }

    // Both succeeded — payment was the limiting factor and guard passed
    return {
      refunded: true,
      revoked: true,
      alreadyRefunded: false,
    };
  } catch (err) {
    // If it's already a RefundProcessingError (from entitlement mismatch), rethrow
    if (err instanceof RefundProcessingError) {
      throw err;
    }

    // If we got a PostgreSQL error (division by zero from the guard),
    // it means pay could not proceed but ent was already updated —
    // the guard forced a rollback so no partial state remains.
    //
    // Re-check the current full state to determine what happened
    // concurrently. Both payment AND entitlement must verify.

    const recheck = await sql`
      SELECT
        rp.status AS payment_status,
        re.status AS ent_status,
        re.lead_contact_id AS ent_lead_contact_id
      FROM report_payments rp
      LEFT JOIN report_entitlements re ON re.report_id = rp.report_id
      WHERE rp.id = ${payment.id}
      LIMIT 1
    `;

    if (recheck.length > 0) {
      const rc = recheck[0];

      if (
        rc.payment_status === "refunded" &&
        rc.ent_status === "revoked" &&
        rc.ent_lead_contact_id !== null &&
        Number(rc.ent_lead_contact_id) === Number(payment.lead_contact_id)
      ) {
        // Another concurrent caller already refunded + revoked atomically
        return {
          refunded: true,
          revoked: true,
          alreadyRefunded: true,
        };
      }

      // Payment is refunded but entitlement is in a bad state:
      // active, missing, or belongs to a different customer.
      if (rc.payment_status === "refunded") {
        throw new RefundProcessingError(
          "REFUND_STATE_INCONSISTENT",
          "Payment is refunded but entitlement state does not match."
        );
      }
    }

    throw new RefundProcessingError(
      "ATOMIC_UPDATE_FAILED",
      "Failed to atomically refund payment and revoke entitlement."
    );
  }
}
