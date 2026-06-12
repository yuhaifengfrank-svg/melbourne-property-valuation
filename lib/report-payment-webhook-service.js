// ── lib/report-payment-webhook-service.js ──
// Phase 1D3: Checkout Session Completed Event Handler.
//
// Handles Stripe checkout.session.completed webhook events:
//   1. Validates session mode, payment_status, metadata structure
//   2. Finds matching report_payment by purchase_intent_key, report_id, stripe_checkout_session_id
//   3. Verifies stored amount_cents (399) and currency (aud) — does NOT trust webhook amounts
//   4. Checks existing entitlements — allows same-owner reactivation, rejects cross-owner conflict
//   5. Updates report_payment to paid with stripe_payment_intent_id
//   6. Creates/reactivates report_entitlement from payment's lead_contact_id (never from session)
//   7. Payment update and entitlement creation run inside a DB transaction
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
 * Validates, finds payment, verifies amounts, checks existing entitlement
 * ownership, updates status, and creates/reactivates entitlement — all
 * inside a single DB transaction where supported.
 *
 * @param {object} session  - Stripe checkout session object
 * @param {Function} sql  - Neon SQL tagged template executor (with .transaction)
 * @returns {Promise<object>} { paid, entitlementCreated, entitlement? }
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

  // ── 4. Check existing entitlement ownership ──────────────────────
  //
  // If an entitlement already exists for this report_id, verify it
  // belongs to the same lead_contact_id. Cross-owner entitlements are
  // forbidden — the payment must NOT be updated to paid.

  const existingEntitlements = await sql`
    SELECT id, lead_contact_id, status FROM report_entitlements
    WHERE report_id = ${payment.report_id}
    LIMIT 1
  `;

  const hasExistingEntitlement = existingEntitlements.length > 0;
  const existingEntitlement = hasExistingEntitlement ? existingEntitlements[0] : null;

  if (hasExistingEntitlement) {
    const existingOwnerId = existingEntitlement.lead_contact_id;
    if (Number(existingOwnerId) !== Number(ownerContactId)) {
      throw new SessionValidationError(
        "ENTITLEMENT_OWNER_CONFLICT",
        `Report ${payment.report_id} already has an entitlement for lead_contact_id=${existingOwnerId}, ` +
        `cannot grant to lead_contact_id=${ownerContactId}`
      );
    }
  }

  // ── 5. Already paid — verify entitlement integrity ───────────────

  if (payment.status === "paid") {
    // Must have an active entitlement for this lead_contact_id
    if (!hasExistingEntitlement || existingEntitlement.status !== "active") {
      // Payment says paid but no active entitlement — data integrity issue
      throw new SessionValidationError(
        "PAYMENT_WITHOUT_ENTITLEMENT",
        `Payment id=${payment.id} is marked paid but no active entitlement exists for report ${payment.report_id}`
      );
    }

    return {
      paid: true,
      entitlementCreated: false,
      alreadyPaid: true,
      entitlement: { id: existingEntitlement.id, status: existingEntitlement.status },
    };
  }

  // ── 6. Update payment + create/reactivate entitlement in transaction ──

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

    // Query 2: Insert/reactivate entitlement
    // Never change lead_contact_id on conflict — only status/reactivation fields.
    // (lead_contact_id is set on first insert only.)
    sql`
      INSERT INTO report_entitlements (report_id, lead_contact_id, status)
      VALUES (${payment.report_id}, ${ownerContactId}, 'active')
      ON CONFLICT (report_id) DO UPDATE SET
        status = 'active',
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
      entitlement,
    };
  }

  // UPDATE returned 0 rows — likely a concurrent caller already updated it.
  // Re-check payment status and entitlement integrity.
  const recheck = await sql`
    SELECT status FROM report_payments WHERE id = ${payment.id} LIMIT 1
  `;

  if (recheck.length > 0 && recheck[0].status === "paid") {
    // Another caller already handled this — re-check entitlement
    const recheckEntitlement = await sql`
      SELECT id, lead_contact_id, status FROM report_entitlements
      WHERE report_id = ${payment.report_id}
      LIMIT 1
    `;

    const hasEnt = recheckEntitlement.length > 0;
    const entRow = hasEnt ? recheckEntitlement[0] : null;

    // If entitlement exists for the right owner, this is idempotent success
    if (hasEnt) {
      if (Number(entRow.lead_contact_id) !== Number(ownerContactId)) {
        throw new SessionValidationError(
          "ENTITLEMENT_OWNER_CONFLICT",
          `Report ${payment.report_id} already has an entitlement for ` +
          `lead_contact_id=${entRow.lead_contact_id}, ` +
          `cannot grant to lead_contact_id=${ownerContactId}`
        );
      }

      return {
        paid: true,
        entitlementCreated: false,
        alreadyPaid: true,
        entitlement: { id: entRow.id, status: entRow.status },
      };
    }

    // Payment is paid but no entitlement exists — data integrity problem
    throw new SessionValidationError(
      "PAYMENT_WITHOUT_ENTITLEMENT",
      `Payment id=${payment.id} is marked paid but no entitlement exists for report ${payment.report_id}`
    );
  }

  throw new SessionValidationError(
    "PAYMENT_UPDATE_FAILED",
    `Payment id=${payment.id} was not updated (current status: ${recheck.length > 0 ? recheck[0].status : "not found"})`
  );
}
