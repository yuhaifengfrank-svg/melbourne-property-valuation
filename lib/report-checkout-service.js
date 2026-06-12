// ── Report Checkout Service ──
// Phase 1C4: Orchestrates checkout flow.
//
// 1. ensureReportPayment() — checks entitlements & existing payments
// 2. Reuses existing valid Stripe session if available
// 3. Builds params, creates Stripe Checkout Session, records session ID
// 4. On Stripe failure, marks payment as failed
// 5. Never creates entitlement
//
// State handling:
//   - Already purchased (active entitlement) → { alreadyPurchased: true }
//   - Paid payment without active entitlement → { error: "PAYMENT_AWAITING_ENTITLEMENT" }
//     (do not charge again, do not claim purchased)
//   - getStripe() configuration error → { error: "STRIPE_NOT_CONFIGURED" }
//     (caught exception, not a 500)

import { getStripe, setMockStripe } from "./stripe-client.js";
import { buildReportCheckoutParams } from "./report-checkout-builder.js";
import { ensureReportPayment, markPaymentFailed } from "./report-payment-service.js";

/**
 * Resolve Stripe client — catching configuration errors.
 * Returns null if Stripe is not configured (test mode or missing env).
 */
function resolveStripe(injectedStripe) {
  if (injectedStripe) return injectedStripe;
  try {
    return getStripe();
  } catch {
    return null;
  }
}

/**
 * Orchestrate the full checkout flow.
 *
 * @param {object} opts
 * @param {string} opts.reportId
 * @param {number} opts.leadContactId
 * @param {function} sql — neon SQL executor
 * @param {object} [opts.stripe] — optional injectable Stripe client (for tests)
 * @returns {Promise<object>} { ok, alreadyPurchased, checkoutSessionId, checkoutUrl, error?, message? }
 */
export async function createReportCheckout(opts, sql) {
  const { reportId, leadContactId, stripe: injectedStripe } = opts;

  // ── Step 1: ensure payment (check entitlement, create/read payment) ──
  const { payment, alreadyPurchased, paymentPresent } = await ensureReportPayment(
    { reportId, leadContactId },
    sql,
  );

  // Already purchased via active entitlement — no need for Stripe
  if (alreadyPurchased) {
    return {
      ok: true,
      alreadyPurchased: true,
      reportId,
      checkoutSessionId: null,
      checkoutUrl: null,
    };
  }

  // Paid payment but no active entitlement — don't charge again, don't claim purchased
  if (paymentPresent) {
    return {
      ok: false,
      alreadyPurchased: false,
      paymentPresent: true,
      reportId,
      error: "PAYMENT_AWAITING_ENTITLEMENT",
      message: "Payment received but report is not yet available. Please try again shortly.",
      checkoutSessionId: payment ? payment.stripe_checkout_session_id : null,
      checkoutUrl: null,
    };
  }

  const purchaseIntentKey = payment.purchase_intent_key;

  // ── Step 2: Reuse existing pending session if available ──
  if (payment.stripe_checkout_session_id) {
    const stripe = resolveStripe(injectedStripe);
    if (stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          payment.stripe_checkout_session_id,
        );
        if (session && session.status === "open" && session.url) {
          return {
            ok: true,
            alreadyPurchased: false,
            reportId,
            checkoutSessionId: session.id,
            checkoutUrl: session.url,
          };
        }
      } catch {
        // If Stripe retrieval fails, fall through to create a fresh session
      }
    }
  }

  // ── Step 3: Build checkout params and create Stripe session ──
  const params = buildReportCheckoutParams({ reportId, purchaseIntentKey });

  const stripe = resolveStripe(injectedStripe);
  if (!stripe) {
    // Attempt to mark payment as failed (best-effort)
    try {
      await markPaymentFailed(purchaseIntentKey, sql);
    } catch {
      // DB failure not critical here — log and continue
    }
    return {
      ok: false,
      alreadyPurchased: false,
      error: "STRIPE_NOT_CONFIGURED",
      message: "Payment processing is not configured.",
    };
  }

  let checkoutSession;
  try {
    checkoutSession = await stripe.checkout.sessions.create(params, {
      idempotencyKey: purchaseIntentKey,
    });
  } catch (err) {
    console.error("[report-checkout-service] Stripe session creation failed:", err.message);
    await markPaymentFailed(purchaseIntentKey, sql);
    return {
      ok: false,
      alreadyPurchased: false,
      error: "CHECKOUT_CREATE_FAILED",
      message: "Failed to initiate payment. Please try again later.",
    };
  }

  // ── Step 4: Record the Stripe session ID back to DB ──
  await ensureReportPayment(
    { reportId, leadContactId, stripeCheckoutSessionId: checkoutSession.id },
    sql,
  );

  return {
    ok: true,
    alreadyPurchased: false,
    reportId,
    checkoutSessionId: checkoutSession.id,
    checkoutUrl: checkoutSession.url,
  };
}

export { setMockStripe };
