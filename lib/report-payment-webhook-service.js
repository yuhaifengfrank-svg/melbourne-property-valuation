// ── lib/report-payment-webhook-service.js ──
// Phase 1D3: Checkout Session Completed Event Handler.
//
// Handles Stripe checkout.session.completed webhook events:
//   1. Validates session mode, payment_status, metadata structure
//   2. Finds matching report_payment by purchase_intent_key, report_id, stripe_checkout_session_id
//   3. Verifies stored amount_cents (399) and currency (aud) — does NOT trust webhook amounts
//   4. Single atomic CTE: entitlement upsert (with ownership guard) + conditional payment update
//   5. Entitlement lead_contact_id comes from payment record (never from session)
//
// Does NOT connect to webhook entry point.
// Does NOT handle refunds.
//
// @ts-check

// ── Constants ───────────────────────────────────────────────────────

const EXPECTED_AMOUNT = 399;
const EXPECTED_CURRENCY = "aud";

// ── Session validation errors ───────────────────────────────────────

export class SessionValidationError extends Error {
  /**
   * @param {string} code  - Machine-readable error code
   * @param {string} message  - Human-readable description
   */
  constructor(code, message) {
    super(message);
    this.name = "SessionValidationError";
    this.code = code;
  }
}

// ── Handle checkout.session.completed ───────────────────────────────

/**
 * Handle a Stripe checkout.session.completed event.
 *
 * Validates session, finds matching report_payment, verifies amounts,
 * then runs a single atomic CTE that:
 *   1. Attempts to create/reactivate report_entitlement
 *   2. Guards ownership: ON CONFLICT WHERE lead_contact_id = EXCLUDED.lead_contact_id
 *   3. Only updates payment to paid when entitlement was confirmed for the right owner
 *   4. Returns entitlement_id / payment_id from the CTE, or null row on conflict
 *
 * If the CTE returns null entitlement_id → ENTITLEMENT_OWNER_CONFLICT.
 * If the CTE returns entitlement but null payment_id → concurrent caller paid it.
 *
 * @param {object} session  - Stripe checkout session object
 * @param {Function} sql  - Neon SQL tagged template executor
 * @returns {Promise<object>} { paid, entitlementCreated, entitlement?, alreadyPaid? }
 * @throws {SessionValidationError} on validation or ownership conflicts
 * @throws {Error} on database or consistency errors
 */
export async function handleCheckoutCompleted(session, sql) {
  // ── 1. Validate session ──────────────────────────────────────────

  if (session.mode !== "payment") {
    throw new SessionValidationError(
      "INVALID_SESSION_MODE",
      `Expected session.mode=payment, got: ${session.mode}`
    );
  }

  if (session.payment_status !== "paid") {
    throw new SessionValidationError(
      "SESSION_NOT_PAID",
      `Expected session.payment_status=paid, got: ${session.payment_status}`
    );
  }

  const metadata = session.metadata || {};
  if (metadata.product_code !== "valuation_report_399") {
    throw new SessionValidationError(
      "INVALID_PRODUCT_CODE",
      `Expected metadata.product_code=valuation_report_399, got: ${metadata.product_code}`
    );
  }

  if (!metadata.report_id) {
    throw new SessionValidationError(
      "MISSING_REPORT_ID",
      "Session metadata must include report_id"
    );
  }

  if (!metadata.purchase_intent_key) {
    throw new SessionValidationError(
      "MISSING_PURCHASE_INTENT_KEY",
      "Session metadata must include purchase_intent_key"
    );
  }

  // ── 2. Find matching report_payment ──────────────────────────────

  const matchingPayments = await sql`
    SELECT * FROM report_payments
    WHERE purchase_intent_key = ${metadata.purchase_intent_key}
      AND report_id = ${metadata.report_id}
      AND stripe_checkout_session_id = ${session.id}
    LIMIT 1
  `;

  if (matchingPayments.length === 0) {
    throw new SessionValidationError(
      "PAYMENT_NOT_FOUND",
      `No report_payment found matching purchase_intent_key=${metadata.purchase_intent_key}, report_id=${metadata.report_id}, session_id=${session.id}`
    );
  }

  const payment = matchingPayments[0];
  const ownerContactId = payment.lead_contact_id;

  // ── 3. Verify database amounts (don't trust webhook values) ──────

  if (payment.amount_cents !== EXPECTED_AMOUNT) {
    throw new SessionValidationError(
      "AMOUNT_MISMATCH",
      `Database amount_cents=${payment.amount_cents}, expected ${EXPECTED_AMOUNT}`
    );
  }

  if (payment.currency !== EXPECTED_CURRENCY) {
    throw new SessionValidationError(
      "CURRENCY_MISMATCH",
      `Database currency=${payment.currency}, expected ${EXPECTED_CURRENCY}`
    );
  }

  // ── 4. Already-paid / idempotent fast path ───────────────────────

  if (payment.status === "paid") {
    const existingEnt = await sql`
      SELECT id, lead_contact_id, status FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;

    if (
      existingEnt.length > 0 &&
      Number(existingEnt[0].lead_contact_id) === Number(ownerContactId) &&
      existingEnt[0].status === "active"
    ) {
      return {
        paid: true,
        entitlementCreated: false,
        alreadyPaid: true,
        entitlement: { id: existingEnt[0].id, status: existingEnt[0].status },
      };
    }

    throw new SessionValidationError(
      "PAYMENT_WITHOUT_ENTITLEMENT",
      `Payment id=${payment.id} is marked paid but no active entitlement ` +
      `for lead_contact_id=${ownerContactId} exists on report ${payment.report_id}`
    );
  }

  // ── 5. Payment must be in a mutable state ────────────────────────

  if (payment.status !== "pending" && payment.status !== "failed") {
    throw new SessionValidationError(
      "PAYMENT_STATUS_INVALID",
      `Cannot update payment in status: ${payment.status}`
    );
  }

  // ── 6. Atomic CTE: entitlement upsert + conditional payment update ──
  //
  // Structure:
  //   WITH
  //     ent AS (INSERT ... ON CONFLICT DO UPDATE SET ... WHERE ... RETURNING ...),
  //     pay AS (UPDATE ... WHERE ... AND EXISTS (SELECT 1 FROM ent) RETURNING ...)
  //   SELECT (SELECT id FROM ent) AS entitlement_id,
  //         (SELECT ...) AS entitlement_owner_id,
  //         (SELECT ... FROM pay) AS payment_id,
  //         ...
  //
  // The ON CONFLICT WHERE clause blocks ownership change:
  //   WHERE report_entitlements.lead_contact_id = EXCLUDED.lead_contact_id
  // If the existing row's lead_contact_id differs from the new one,
  // the WHERE evaluates to false, the UPDATE action is skipped,
  // RETURNING returns 0 rows, and ent returns nulls.
  //
  // Because pay has AND EXISTS (SELECT 1 FROM ent), it also returns null.
  // The final SELECT gives null entitlement_id → detected as conflict.

  const cteRow = await sql`
    WITH
      ent AS (
        INSERT INTO report_entitlements (report_id, lead_contact_id, status)
        VALUES (${payment.report_id}, ${ownerContactId}, 'active')
        ON CONFLICT (report_id) DO UPDATE SET
          status = 'active',
          revoked_at = NULL,
          granted_at = NOW()
        WHERE report_entitlements.lead_contact_id = ${ownerContactId}
        RETURNING id, lead_contact_id, status
      ),
      pay AS (
        UPDATE report_payments
        SET status = 'paid',
            stripe_payment_intent_id = ${session.payment_intent || null},
            updated_at = NOW()
        WHERE id = ${payment.id}
          AND status IN ('pending', 'failed')
          AND EXISTS (SELECT 1 FROM ent)
        RETURNING id, status
      )
    SELECT
      (SELECT id FROM ent) AS entitlement_id,
      (SELECT lead_contact_id FROM ent) AS entitlement_owner_id,
      (SELECT status FROM ent) AS entitlement_status,
      (SELECT id FROM pay) AS payment_id,
      (SELECT status FROM pay) AS payment_status
  `;

  if (!cteRow || cteRow.length === 0) {
    throw new SessionValidationError(
      "PAYMENT_UPDATE_FAILED",
      `Atomic CTE returned no rows for payment id=${payment.id}`
    );
  }

  const r = cteRow[0];

  // ── 7. Interpret CTE result ──────────────────────────────────────

  // Null entitlement_id means the ON CONFLICT WHERE blocked it
  // because existing entitlement belongs to a different lead_contact_id
  if (r.entitlement_id === null || r.entitlement_id === undefined) {
    // Fetch the actual owner for a detailed error message
    const blockingEnt = await sql`
      SELECT lead_contact_id FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;
    const actualOwnerId = blockingEnt.length > 0 ? blockingEnt[0].lead_contact_id : "unknown";

    throw new SessionValidationError(
      "ENTITLEMENT_OWNER_CONFLICT",
      `Report ${payment.report_id} already has an entitlement ` +
      `for lead_contact_id=${actualOwnerId}, ` +
      `cannot grant to lead_contact_id=${ownerContactId}`
    );
  }

  // Safety net: validate owner returned by CTE matches expected
  if (r.entitlement_owner_id !== null && r.entitlement_owner_id !== undefined) {
    if (Number(r.entitlement_owner_id) !== Number(ownerContactId)) {
      throw new SessionValidationError(
        "ENTITLEMENT_OWNER_CONFLICT",
        `Entitlement for report ${payment.report_id} belongs to ` +
        `lead_contact_id=${r.entitlement_owner_id}, ` +
        `cannot grant to lead_contact_id=${ownerContactId}`
      );
    }
  }

  // Check if payment was updated
  if (r.payment_id !== null && r.payment_id !== undefined) {
    return {
      paid: true,
      entitlementCreated: true,
      paymentId: r.payment_id,
      entitlementId: r.entitlement_id,
      payment: { id: r.payment_id, status: r.payment_status },
      entitlement: { id: r.entitlement_id, status: r.entitlement_status },
    };
  }

  // Entitlement succeeded but payment didn't update — concurrent caller
  // already paid this payment. Re-check to return meaningful result.
  const recheckPayment = await sql`
    SELECT status FROM report_payments WHERE id = ${payment.id} LIMIT 1
  `;

  if (recheckPayment.length > 0 && recheckPayment[0].status === "paid") {
    return {
      paid: true,
      entitlementCreated: false,
      alreadyPaid: true,
      payment: { id: payment.id, status: "paid" },
      entitlement: { id: r.entitlement_id, status: r.entitlement_status },
    };
  }

  throw new SessionValidationError(
    "PAYMENT_UPDATE_FAILED",
    `Entitlement created (id=${r.entitlement_id}) but payment id=${payment.id} ` +
    `was not updated (current status: ${recheckPayment.length > 0 ? recheckPayment[0].status : "not found"})`
  );
}
