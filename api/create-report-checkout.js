// ── api/create-report-checkout.js ──
// Phase 1C5: Stripe Checkout API endpoint.
//
// POST only. Input: { "email": "...", "reportDraftToken": "..." }
// All other fields (amount, price_id, report_id, URLs) are IGNORED.
//
// Flow:
//   1. Validate email + verify draft token FIRST (before any DB writes)
//   2. Ensure customer funnel + report payment schemas
//   3. Upsert lead_contact by email_lower (atomic ON CONFLICT)
//   4. consumeDraftIntoSnapshot → immutable report_id
//   5. createReportCheckout() (from Phase 1C4 service)
//   6. Set purchase session cookie
//   7. Return checkoutUrl/checkoutSessionId or error
//
// Does NOT create entitlement.
// Does NOT use Opportunity cookie.
// Does NOT implement webhook, frontend, or PDF.

import { ensureCustomerFunnelSchema, ensureReportPaymentSchema, getSql } from "./_db.js";
import { verifyReportDraftToken, consumeDraftIntoSnapshot } from "../lib/report-snapshot-service.js";
import { createReportCheckout } from "../lib/report-checkout-service.js";
import { createReportAccessSession, buildReportAccessCookie, buildClearReportAccessCookie, assertReportAccessSessionConfigured } from "../lib/report-access-session.js";

// ── Error codes ─────────────────────────────────────────────────────

const ERR = {
  BAD_REQUEST: "BAD_REQUEST",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_DRAFT_TOKEN: "INVALID_DRAFT_TOKEN",
  DRAFT_EXPIRED: "DRAFT_EXPIRED",
  STRIPE_NOT_CONFIGURED: "STRIPE_NOT_CONFIGURED",
  CHECKOUT_CREATE_FAILED: "CHECKOUT_CREATE_FAILED",
  PAYMENT_AWAITING_ENTITLEMENT: "PAYMENT_AWAITING_ENTITLEMENT",
  REPORT_OWNER_CONFLICT: "REPORT_OWNER_CONFLICT",
  REPORT_SESSION_NOT_CONFIGURED: "REPORT_SESSION_NOT_CONFIGURED",
  PAYMENTS_GATE_BLOCKED: "PAYMENTS_GATE_BLOCKED",
};

// ── Test-injectable SQL ─────────────────────────────────────────────

let _testSql = null;
function getApiSql() {
  if (_testSql) return _testSql;
  return getSql();
}
export function setTestSql(sqlFn) {
  _testSql = sqlFn;
}

// ── Lead Contact ID Normalization ───────────────────────────────────

/**
 * Normalize lead_contact_id from PostgreSQL BIGSERIAL RETURNING.
 *
 * Neon / pg >=14 returns BIGINT/BIGSERIAL columns as strings (not numbers)
 * from RETURNING clauses. This function converts the raw DB value to a safe
 * positive integer before passing it to downstream services (which expect
 * a number).
 *
 * Accepts:
 *   - positive integer number           → returned as-is
 *   - string of pure decimal digits     → parsed to number ("42" → 42)
 *
 * Rejects:
 *   - null / undefined
 *   - negative numbers, zero, decimals
 *   - scientific notation, hex, empty/whitespace strings
 *   - BigInt / boolean / object / array / symbol
 *   - values exceeding Number.MAX_SAFE_INTEGER
 *
 * @param {*} value - Raw lead_contact_id from DB (typically string or number)
 * @returns {number} Positive safe integer
 * @throws {TypeError} With descriptive message for invalid input
 */
function normalizeLeadContactId(value) {
  if (value === null || value === undefined) {
    throw new TypeError("leadContactId is required");
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new TypeError(
        `leadContactId must be a positive integer, got ${value}`
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `leadContactId exceeds safe integer range: ${value}`
      );
    }
    return value;
  }

  if (typeof value === "string") {
    // Reject empty, scientific notation (1e2), hex (0x1F), decimals (3.14),
    // leading zero ("012"), and non-numeric strings ("abc").
    if (!/^[1-9]\d*$/.test(value)) {
      throw new TypeError(
        `leadContactId must be a positive integer string, got "${value}"`
      );
    }
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num <= 0) {
      throw new TypeError(
        `leadContactId exceeds safe integer range: ${value}`
      );
    }
    return num;
  }

  // boolean, bigint, symbol, object, array, function, undefined (caught above)
  throw new TypeError(
    `leadContactId must be a number or numeric string, got ${typeof value}`
  );
}

// ── Email validation ────────────────────────────────────────────────

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex !== trimmed.lastIndexOf("@")) return false;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length === 0 || domain.length < 3) return false;
  if (!domain.includes(".")) return false;
  return true;
}

// ── Purchase session cookie helper ──────────────────────────────────

/**
 * Create and set the purchase session cookie on the response.
 * Only called on successful/retryable checkout paths.
 * The cookie is set via Set-Cookie header — it does NOT appear in the JSON body.
 */
function setPurchaseSessionCookie(res, reportId, leadContactId) {
  const token = createReportAccessSession({ reportId, leadContactId });
  const cookie = buildReportAccessCookie(token);
  res.setHeader("Set-Cookie", cookie);
}

/**
 * Clear (remove) the purchase session cookie on the response.
 * Called on error paths to ensure a stale cookie is not retained.
 */
function clearPurchaseSessionCookie(res) {
  const cookie = buildClearReportAccessCookie();
  res.setHeader("Set-Cookie", cookie);
}

// ── Payments gate predicate ────────────────────────────────────────

/**
 * Payments are only enabled when ALL of the following are true:
 * - VERCEL_ENV === "preview"
 * - STRIPE_MODE === "test"
 *
 * All other environments (production, development, undefined, etc.)
 * return false — including Preview with live/production Stripe mode.
 */
function isPaymentsEnabled() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.STRIPE_MODE === "test"
  );
}

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: ERR.BAD_REQUEST, message: "Method not allowed" });
  }

  // Payments gate: fail-closed — 503 before any DB or Stripe calls
  if (!isPaymentsEnabled()) {
    return res.status(503).json({
      ok: false,
      error: ERR.PAYMENTS_GATE_BLOCKED,
      message: "Payments are temporarily unavailable. Please try again later."
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const rawEmail = (body.email || "").trim().toLowerCase();
    const reportDraftToken = body.reportDraftToken || "";

    // ── Step 1: Validate input + verify token BEFORE any DB writes ──
    if (!isValidEmail(rawEmail)) {
      clearPurchaseSessionCookie(res);
      return res.status(400).json({ ok: false, error: ERR.INVALID_EMAIL, message: "A valid email address is required." });
    }

    const tokenPayload = verifyReportDraftToken(reportDraftToken);
    if (!tokenPayload) {
      clearPurchaseSessionCookie(res);
      return res.status(400).json({ ok: false, error: ERR.INVALID_DRAFT_TOKEN, message: "The report draft token is invalid or has been tampered with." });
    }

    // ── Step 2: Initialise database schemas ──
    const sql = getApiSql();
    await ensureCustomerFunnelSchema(sql);
    await ensureReportPaymentSchema(sql);

    // ── Step 3: Upsert lead_contact (atomic — no SELECT-before-INSERT race) ──
    const contactResult = await sql`
      INSERT INTO lead_contacts (email, email_lower)
      VALUES (${rawEmail}, ${rawEmail})
      ON CONFLICT (email_lower)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `;
    const leadContactId = normalizeLeadContactId(contactResult?.[0]?.id);

    // ── Step 4: Consume draft into immutable snapshot ──
    let snapshotOutcome;
    try {
      snapshotOutcome = await consumeDraftIntoSnapshot(reportDraftToken, leadContactId, sql);
    } catch (consumeErr) {

      if (consumeErr.code && ["TOKEN_EXPIRED", "DRAFT_CONSUMED", "REPORT_OWNER_CONFLICT", "TOKEN_INVALID"].includes(consumeErr.code)) {
        // Token-level errors: expired, tampered, invalid
        if (consumeErr.code === "TOKEN_EXPIRED") {
          clearPurchaseSessionCookie(res);
          return res.status(400).json({ ok: false, error: ERR.DRAFT_EXPIRED, message: "The report draft has expired. Please run a new valuation." });
        }
        if (consumeErr.code === "DRAFT_CONSUMED") {
          clearPurchaseSessionCookie(res);
          return res.status(400).json({ ok: false, error: ERR.DRAFT_EXPIRED, message: "The report draft has already been used. Please run a new valuation." });
        }
        if (consumeErr.code === "REPORT_OWNER_CONFLICT") {
          clearPurchaseSessionCookie(res);
          return res.status(409).json({ ok: false, error: ERR.REPORT_OWNER_CONFLICT, message: consumeErr.message || "This report already belongs to another customer." });
        }
        clearPurchaseSessionCookie(res);
        return res.status(400).json({ ok: false, error: ERR.INVALID_DRAFT_TOKEN, message: consumeErr.message || "The report draft token is invalid." });
      }
      // Unknown DB/snapshot error — throw directly; outer catch clears cookie once.
      // Do NOT clear here to avoid double Set-Cookie.
      throw consumeErr;
    }

    // ── Step 5a: Check session config BEFORE Stripe checkout call ──
    // Avoid creating a Stripe session that can't be matched by cookie.
    if (!assertReportAccessSessionConfigured()) {
      clearPurchaseSessionCookie(res);
      return res.status(503).json({
        ok: false,
        error: ERR.REPORT_SESSION_NOT_CONFIGURED,
        message: "Report access session is temporarily unavailable. Please try again later.",
      });
    }

    // ── Step 5b: Call checkout service ──
    const checkoutResult = await createReportCheckout({ reportId: snapshotOutcome.report_id, leadContactId }, sql);

    // Already purchased (active entitlement exists)
    if (checkoutResult.alreadyPurchased) {
      setPurchaseSessionCookie(res, snapshotOutcome.report_id, leadContactId);
      return res.status(200).json({
        ok: true,
        alreadyPurchased: true,
        reportId: snapshotOutcome.report_id,
      });
    }

    // Payment made but awaiting entitlement grant — set cookie for polling
    if (checkoutResult.error === "PAYMENT_AWAITING_ENTITLEMENT") {
      setPurchaseSessionCookie(res, snapshotOutcome.report_id, leadContactId);
      return res.status(200).json({
        ok: false,
        alreadyPurchased: false,
        error: ERR.PAYMENT_AWAITING_ENTITLEMENT,
        message: "Payment received but report is not yet available. Please try again shortly.",
        reportId: snapshotOutcome.report_id,
      });
    }

    // Stripe not configured
    if (checkoutResult.error === "STRIPE_NOT_CONFIGURED") {
      clearPurchaseSessionCookie(res);
      return res.status(503).json({
        ok: false,
        error: ERR.STRIPE_NOT_CONFIGURED,
        message: "Payment processing is not configured. Please try again later.",
      });
    }

    // Stripe session creation failed
    if (checkoutResult.error === "CHECKOUT_CREATE_FAILED") {
      clearPurchaseSessionCookie(res);
      return res.status(502).json({
        ok: false,
        error: ERR.CHECKOUT_CREATE_FAILED,
        message: "Failed to initiate payment. Please try again later.",
      });
    }

    // Success — checkout session created
    if (checkoutResult.ok && checkoutResult.checkoutUrl) {
      setPurchaseSessionCookie(res, snapshotOutcome.report_id, leadContactId);
      return res.status(200).json({
        ok: true,
        alreadyPurchased: false,
        reportId: snapshotOutcome.report_id,
        checkoutUrl: checkoutResult.checkoutUrl,
      });
    }

    // Fallback — unexpected state
    clearPurchaseSessionCookie(res);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  } catch (error) {
    console.error("[create-report-checkout]", error.message);
    clearPurchaseSessionCookie(res);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  }
}
