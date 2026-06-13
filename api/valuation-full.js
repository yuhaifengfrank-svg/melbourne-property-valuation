// ── api/valuation-full.js ──
// Phase 1E2: Full valuation report API.
//
// POST only.
// Body: { "reportId": "rp_...", "email": "customer@example.com" }
//
// Flow:
//   1. POST only. OPTIONS → 204.
//   2. Parse and validate JSON body.
//   3. ensureCustomerFunnelSchema + ensureReportPaymentSchema.
//   4. checkReportEntitlement({ reportId, email }, sql)
//   5. allowed=true → return stored snapshot.
//   6. Does NOT re-run valuation model.
//   7. Does NOT accept address, propertyType, landSize, client estimates.
//   8. Does NOT trust client-side allowed/status/paymentStatus.
//   9. Does NOT use Opportunity cookie, Opportunity token, or localStorage.
//  10. Does NOT call Stripe.
//  11. Does NOT write to payment, entitlement, or snapshot tables.
//  12. Does NOT auto-create lead_contact.

import { ensureCustomerFunnelSchema, ensureReportPaymentSchema, getSql } from "./_db.js";
import { checkReportEntitlement } from "../lib/report-entitlement-service.js";

// ── Test-injectable SQL ─────────────────────────────────────────────

let _testSql = null;
function getApiSql() {
  if (_testSql) return _testSql;
  return getSql();
}
export function setTestSql(sqlFn) {
  _testSql = sqlFn;
}

// ── Input validation ────────────────────────────────────────────────

function isValidRequest(body) {
  if (!body || typeof body !== "object") return false;
  if (typeof body.reportId !== "string" || body.reportId.length === 0) return false;
  if (typeof body.email !== "string" || body.email.length === 0) return false;
  return true;
}

// ── Error code mapping (EntitlementCheckError.code → HTTP) ──────────

const HTTP_CODE = {
  NOT_FOUND: 404,
  NOT_ENTITLED: 403,
  REPORT_OWNER_CONFLICT: 403,
  PAYMENT_NOT_CONFIRMED: 402,
  REFUNDED: 403,
  REVOKED: 403,
  REPORT_DATA_UNAVAILABLE: 503,
};

const ERROR_MAP = {
  NOT_FOUND: "REPORT_NOT_FOUND",
  NOT_ENTITLED: "REPORT_NOT_ENTITLED",
  REPORT_OWNER_CONFLICT: "REPORT_OWNER_CONFLICT",
  PAYMENT_NOT_CONFIRMED: "PAYMENT_NOT_CONFIRMED",
  REFUNDED: "REPORT_REFUNDED",
  REVOKED: "REPORT_REVOKED",
  REPORT_DATA_UNAVAILABLE: "REPORT_DATA_UNAVAILABLE",
};

// ── Allowed headers ─────────────────────────────────────────────────

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

// ── JSON body size limit (16 KB) ────────────────────────────────────

const MAX_BODY_BYTES = 16384;

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(request, response) {
  // ── CORS headers (always set) ────────────────────────────────
  for (const [k, v] of Object.entries(COMMON_HEADERS)) {
    response.setHeader(k, v);
  }

  // ── OPTIONS → 204 ────────────────────────────────────────────
  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  // ── POST only ────────────────────────────────────────────────
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({
      ok: false,
      error: "BAD_REQUEST",
      message: "Method not allowed.",
    });
  }

  try {
    // ── Read raw body for size limit ──────────────────────────
    const rawBody = typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body || {});

    if (Buffer.byteLength(rawBody, "utf-8") > MAX_BODY_BYTES) {
      return response.status(400).json({
        ok: false,
        error: "BAD_REQUEST",
        message: "Request body too large.",
      });
    }

    // ── Parse JSON body ───────────────────────────────────────
    let body;
    try {
      body = typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body || {};
    } catch {
      return response.status(400).json({
        ok: false,
        error: "BAD_REQUEST",
        message: "Invalid JSON body.",
      });
    }

    // ── Validate reportId and email ───────────────────────────
    if (!isValidRequest(body)) {
      return response.status(400).json({
        ok: false,
        error: "BAD_REQUEST",
        message: "Both reportId and email are required.",
      });
    }

    // ── Sanitise email ───────────────────────────────────────
    const email = body.email.trim().toLowerCase();
    const reportId = body.reportId;

    // ── Initialise database schemas ───────────────────────────
    const sql = getApiSql();

    try {
      await ensureCustomerFunnelSchema(sql);
      await ensureReportPaymentSchema(sql);
    } catch {
      return response.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      });
    }

    // ── Check entitlement (this is the ONLY authority) ────────
    let entitlementResult;
    try {
      entitlementResult = await checkReportEntitlement({ reportId, email }, sql);
    } catch (entErr) {
      if (entErr.name === "EntitlementCheckError" && ERROR_MAP[entErr.code]) {
        const httpCode = HTTP_CODE[entErr.code] || 500;
        const errorCode = ERROR_MAP[entErr.code];
        return response.status(httpCode).json({
          ok: false,
          error: errorCode,
          message: safeErrorMessage(errorCode),
        });
      }
      throw entErr; // unexpected → fall to outer catch
    }

    // ── Only allowed=true reaches here ─────────────────────────
    if (!entitlementResult || !entitlementResult.allowed) {
      return response.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      });
    }

    // ── Return stored snapshot (NEVER re-run valuation model) ──
    return response.status(200).json({
      ok: true,
      status: "completed",
      reportId: entitlementResult.reportId,
      entitlementStatus: entitlementResult.entitlementStatus,
      paymentStatus: entitlementResult.paymentStatus,
      valuationVersion: entitlementResult.valuationVersion,
      purchasedAt: entitlementResult.purchasedAt,
      report: entitlementResult.snapshot,
    });
  } catch (error) {
    // ── Unexpected errors → safe 500 ──────────────────────────
    console.error("[valuation-full]", error.message);
    return response.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  }
}

// ── Safe error messages (no leak) ───────────────────────────────────

function safeErrorMessage(errorCode) {
  const messages = {
    REPORT_NOT_FOUND: "Report not found.",
    REPORT_NOT_ENTITLED: "You are not entitled to access this report.",
    REPORT_OWNER_CONFLICT: "This report belongs to a different user.",
    PAYMENT_NOT_CONFIRMED: "Payment for this report has not been confirmed.",
    REPORT_REFUNDED: "This report has been refunded.",
    REPORT_REVOKED: "This report has been revoked.",
    REPORT_DATA_UNAVAILABLE: "Report data is temporarily unavailable. Please try again later.",
  };
  return messages[errorCode] || "An unexpected error occurred. Please try again.";
}
