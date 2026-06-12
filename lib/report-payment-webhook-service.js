// ── lib/report-payment-webhook-service.js ──
// Phase 1D3: Checkout Session Completed Event Handler.
//
// Handles Stripe checkout.session.completed webhook events:
//   1. Validates session mode, payment_status, metadata structure
//   2. Finds matching report_payment by purchase_intent_key, report_id, stripe_checkout_session_id
//   3. Verifies stored amount_cents (399) and currency (aud) — does NOT trust webhook amounts
//   4. Updates report_payment to paid with stripe_payment_intent_id
//   5. Creates report_entitlement from payment's lead_contact_id
//   6. Payment update and entitlement creation run inside a DB transaction
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
 * Validates, finds payment, verifies amounts, updates status, and creates
 * entitlement — all inside a single DB transaction where supported.
 *
 * @param {object} session  - Stripe checkout session object
 * @param {Function} sql  - Neon SQL tagged template executor (with .transaction)
 * @returns {Promise<object>} { paid, entitlementCreated, entitlements? }
 * @throws {SessionValidationError} on validation failures
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

  // ── 4. Already paid — idempotent return ──────────────────────────

  if (payment.status === "paid") {
    // Check if entitlement already exists
    const entitlements = await sql`
      SELECT id, status FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;
    return {
      paid: true,
      entitlementCreated: false,
      alreadyPaid: true,
      entitlements: entitlements.length > 0 ? entitlements : [],
    };
  }

  // ── 5. Update payment + create entitlement in a transaction ──────

  // Validate that the payment is in a mutable state
  if (payment.status !== "pending" && payment.status !== "failed") {
    throw new SessionValidationError(
      "PAYMENT_STATUS_INVALID",
      `Cannot update payment in status: ${payment.status}`
    );
  }

  // Use sql.transaction to atomically update payment and create entitlement
  if (typeof sql.transaction !== "function") {
    throw new Error(
      "Neon client does not support sql.transaction(). " +
      "Cannot atomically update payment and create entitlement."
    );
  }

  const txnResult = await sql.transaction([
    // Query 1: Update payment to paid
    sql`
      UPDATE report_payments
      SET status = 'paid',
          stripe_payment_intent_id = ${session.payment_intent || null},
          updated_at = NOW()
      WHERE id = ${payment.id}
        AND status IN ('pending', 'failed')
      RETURNING *
    `,

    // Query 2: Insert entitlement (ON CONFLICT handles idempotency)
    sql`
      INSERT INTO report_entitlements (report_id, lead_contact_id, status)
      VALUES (${payment.report_id}, ${payment.lead_contact_id}, 'active')
      ON CONFLICT (report_id) DO UPDATE SET
        status = 'active',
        lead_contact_id = ${payment.lead_contact_id},
        revoked_at = NULL,
        granted_at = NOW()
      RETURNING id, status
    `,
  ]);

  const [updatedPayments, entitlementRows] = txnResult;

  // Payment was updated — return success
  if (updatedPayments && updatedPayments.length > 0) {
    const updatedPayment = updatedPayments[0];
    const entitlement = entitlementRows && entitlementRows.length > 0 ? entitlementRows[0] : null;

    return {
      paid: true,
      entitlementCreated: true,
      paymentId: updatedPayment.id,
      entitlementId: entitlement ? entitlement.id : null,
      updatedPayment,
    };
  }

  // UPDATE returned 0 rows — likely a concurrent caller already updated it.
  // Re-check payment status to distinguish idempotent vs. invalid state.
  const recheck = await sql`
    SELECT status FROM report_payments WHERE id = ${payment.id} LIMIT 1
  `;

  if (recheck.length > 0 && recheck[0].status === "paid") {
    // Another caller already handled this — idempotent return
    const entitlements = await sql`
      SELECT id, status FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;
    return {
      paid: true,
      entitlementCreated: false,
      alreadyPaid: true,
      entitlements: entitlements.length > 0 ? entitlements : [],
    };
  }

  throw new SessionValidationError(
    "PAYMENT_UPDATE_FAILED",
    `Payment id=${payment.id} was not updated (current status: ${recheck.length > 0 ? recheck[0].status : "not found"})`
  );
}
