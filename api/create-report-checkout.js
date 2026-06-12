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
//   6. Return checkoutUrl/checkoutSessionId or error
//
// Does NOT create entitlement.
// Does NOT use Opportunity cookie.
// Does NOT implement webhook, frontend, or PDF.

import { ensureCustomerFunnelSchema, ensureReportPaymentSchema, getSql } from "./_db.js";
import { verifyReportDraftToken, consumeDraftIntoSnapshot, DraftTokenError } from "../lib/report-snapshot-service.js";
import { createReportCheckout } from "../lib/report-checkout-service.js";

// ── Error codes ─────────────────────────────────────────────────────

const ERR = {
  BAD_REQUEST: "BAD_REQUEST",
  INVALID_EMAIL: "INVALID_EMAIL",
  INVALID_DRAFT_TOKEN: "INVALID_DRAFT_TOKEN",
  DRAFT_EXPIRED: "DRAFT_EXPIRED",
  STRIPE_NOT_CONFIGURED: "STRIPE_NOT_CONFIGURED",
  CHECKOUT_CREATE_FAILED: "CHECKOUT_CREATE_FAILED",
  PAYMENT_AWAITING_ENTITLEMENT: "PAYMENT_AWAITING_ENTITLEMENT",
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

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const rawEmail = (body.email || "").trim().toLowerCase();
    const reportDraftToken = body.reportDraftToken || "";

    // ── Step 1: Validate input + verify token BEFORE any DB writes ──
    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ ok: false, error: ERR.INVALID_EMAIL, message: "A valid email address is required." });
    }

    const tokenPayload = verifyReportDraftToken(reportDraftToken);
    if (!tokenPayload) {
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
    const leadContactId = contactResult[0].id;

    // ── Step 4: Consume draft into immutable snapshot ──
    let snapshotOutcome;
    try {
      snapshotOutcome = await consumeDraftIntoSnapshot(reportDraftToken, leadContactId, sql);
    } catch (consumeErr) {
      if (consumeErr instanceof DraftTokenError) {
        // Token-level errors: expired, tampered, invalid
        if (consumeErr.code === "TOKEN_EXPIRED") {
          return res.status(400).json({ ok: false, error: ERR.DRAFT_EXPIRED, message: "The report draft has expired. Please run a new valuation." });
        }
        if (consumeErr.code === "DRAFT_CONSUMED") {
          return res.status(400).json({ ok: false, error: ERR.DRAFT_EXPIRED, message: "The report draft has already been used. Please run a new valuation." });
        }
        return res.status(400).json({ ok: false, error: ERR.INVALID_DRAFT_TOKEN, message: consumeErr.message || "The report draft token is invalid." });
      }
      throw consumeErr;
    }

    const reportId = snapshotOutcome.report_id;

    // ── Step 5: Call checkout service ──
    const checkoutResult = await createReportCheckout({ reportId, leadContactId }, sql);

    // ── Step 6: Transform service result to API response ──

    // Already purchased (active entitlement exists)
    if (checkoutResult.alreadyPurchased) {
      return res.status(200).json({
        ok: true,
        alreadyPurchased: true,
        reportId,
      });
    }

    // Payment made but awaiting entitlement grant
    if (checkoutResult.error === "PAYMENT_AWAITING_ENTITLEMENT") {
      return res.status(200).json({
        ok: false,
        alreadyPurchased: false,
        error: ERR.PAYMENT_AWAITING_ENTITLEMENT,
        message: "Payment received but report is not yet available. Please try again shortly.",
        reportId,
        checkoutSessionId: checkoutResult.checkoutSessionId,
      });
    }

    // Stripe not configured
    if (checkoutResult.error === "STRIPE_NOT_CONFIGURED") {
      return res.status(503).json({
        ok: false,
        error: ERR.STRIPE_NOT_CONFIGURED,
        message: "Payment processing is not configured. Please try again later.",
      });
    }

    // Stripe session creation failed
    if (checkoutResult.error === "CHECKOUT_CREATE_FAILED") {
      return res.status(502).json({
        ok: false,
        error: ERR.CHECKOUT_CREATE_FAILED,
        message: "Failed to initiate payment. Please try again later.",
      });
    }

    // Success — checkout session created
    if (checkoutResult.ok && checkoutResult.checkoutUrl) {
      return res.status(200).json({
        ok: true,
        alreadyPurchased: false,
        reportId,
        checkoutSessionId: checkoutResult.checkoutSessionId,
        checkoutUrl: checkoutResult.checkoutUrl,
      });
    }

    // Fallback — unexpected state
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  } catch (error) {
    console.error("[create-report-checkout]", error.message);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  }
}
