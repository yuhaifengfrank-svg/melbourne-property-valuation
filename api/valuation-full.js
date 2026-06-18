// ── api/valuation-full.js ──
// Phase 1E3C-3A: Full valuation report API — HttpOnly Cookie auth.
//
// POST only.
// Body: { "reportId": "rp_..." }
//
// Auth flow:
//   1. Read aushomevalue_report_access HttpOnly cookie
//   2. Verify cookie signature and 30-minute expiry
//   3. Verify cookie.reportId matches body.reportId
//   4. Verify cookie.leadContactId is valid positive integer
//   5. Database entitlement check via leadContactId (the sole authority)
//   6. Return sanitized stored snapshot
//
// Does NOT accept email as authentication.
// Does NOT accept client-supplied allowed/status/leadContactId.
// Does NOT re-run valuation model.
// Does NOT call Stripe.
// Does NOT write to payment, entitlement, or snapshot tables.

import { ensureCustomerFunnelSchema, ensureReportPaymentSchema, getSql } from "./_db.js";
import { checkReportEntitlementByContactId } from "../lib/report-entitlement-service.js";
import {
  verifyReportAccessSession,
  extractReportAccessCookie,
  buildClearReportAccessCookie,
} from "../lib/report-access-session.js";

// ── Vercel body parser config (16 KB limit) ─────────────────────────

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
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

// ── reportId format validation ──────────────────────────────────────

function isValidReportId(value) {
  return typeof value === "string" && /^rp_\d+_[0-9a-f]{16,}$/i.test(value.trim());
}

// ── Body existence check (minimal — only reportId required) ─────────

function isValidRequest(body) {
  if (!body || typeof body !== "object") return false;
  if (typeof body.reportId !== "string" || body.reportId.trim().length === 0) return false;
  // email, leadContactId, allowed, status, paymentStatus — all ignored at API layer
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

// ── CORS headers ────────────────────────────────────────────────────

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const MAX_BODY_BYTES = 16384;

// ── Sensitive fields to strip from snapshot response ───────────────

const SENSITIVE_FIELDS = new Set([
  "stripe_customer_id",
  "stripe_payment_intent_id",
  "stripe_checkout_session_id",
  "purchase_intent_key",
  "lead_contact_id",
  "snapshot_hash",
  "email",
  "phone",
  "token",
  "session_id",
]);

/**
 * Recursively strip sensitive fields from an object tree.
 * Deep clones — original snapshot never mutated.
 */
function sanitizeSnapshot(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeSnapshot);
  }

  if (typeof value === "object") {
    const cleaned = {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_FIELDS.has(key)) {
        continue;
      }
      cleaned[key] = sanitizeSnapshot(value[key]);
    }
    return cleaned;
  }

  return value;
}

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(request, response) {
  // ── Request-level clearCookie guard (no shared module state) ──
  let _cookieCleared = false;
  function clearCookieOnce() {
    if (_cookieCleared) return;
    _cookieCleared = true;
    response.setHeader("Set-Cookie", buildClearReportAccessCookie());
  }

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
    // ── Read raw body for size limit (secondary check) ─────────
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

    // ── Validate body has required fields ─────────────────────
    if (!isValidRequest(body)) {
      return response.status(400).json({
        ok: false,
        error: "BAD_REQUEST",
        message: "reportId is required.",
      });
    }

    const reportId = body.reportId.trim();

    // ── reportId format validation ─────────────────────────────
    if (!isValidReportId(reportId)) {
      return response.status(400).json({
        ok: false,
        error: "BAD_REQUEST",
        message: "Invalid reportId format.",
      });
    }

    // ── Extract and verify session cookie ─────────────────────
    const token = extractReportAccessCookie(request);

    if (!token) {
      return response.status(401).json({
        ok: false,
        error: "REPORT_SESSION_EXPIRED",
        message: "Session expired. Please complete checkout again.",
      });
    }

    const session = verifyReportAccessSession(token);

    if (!session) {
      clearCookieOnce();
      return response.status(401).json({
        ok: false,
        error: "REPORT_SESSION_EXPIRED",
        message: "Session expired. Please complete checkout again.",
      });
    }

    // ── Session purpose check — only report_access ────────────
    if (session.purpose !== "report_access" || session.version !== 1) {
      clearCookieOnce();
      return response.status(401).json({
        ok: false,
        error: "REPORT_SESSION_EXPIRED",
        message: "Session expired. Please complete checkout again.",
      });
    }

    // ── Verify session reportId matches body reportId ─────────
    if (session.reportId !== reportId) {
      clearCookieOnce();
      return response.status(403).json({
        ok: false,
        error: "REPORT_SESSION_MISMATCH",
        message: "Request reportId does not match session.",
      });
    }

    // ── Validate leadContactId from cookie ────────────────────
    const leadContactId = session.leadContactId;
    if (typeof leadContactId !== "number" || !Number.isInteger(leadContactId) || leadContactId <= 0) {
      clearCookieOnce();
      return response.status(401).json({
        ok: false,
        error: "REPORT_SESSION_EXPIRED",
        message: "Session expired. Please complete checkout again.",
      });
    }

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

    // ── Check entitlement by contactId (database is sole authority) ──
    let entitlementResult;
    try {
      entitlementResult = await checkReportEntitlementByContactId({ reportId, leadContactId }, sql);
    } catch (entErr) {
      if (entErr.name === "EntitlementCheckError" && ERROR_MAP[entErr.code]) {
        const httpCode = HTTP_CODE[entErr.code] || 500;
        const errorCode = ERROR_MAP[entErr.code];

        // Clear cookie on terminal states: refunded, revoked, owner_conflict
        if (errorCode === "REPORT_REFUNDED" || errorCode === "REPORT_REVOKED" || errorCode === "REPORT_OWNER_CONFLICT") {
          clearCookieOnce();
        }

        return response.status(httpCode).json({
          ok: false,
          error: errorCode,
          message: safeErrorMessage(errorCode),
        });
      }
      throw entErr;
    }

    // ── Only allowed=true reaches here ─────────────────────────
    if (!entitlementResult || !entitlementResult.allowed) {
      return response.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      });
    }

    // ── Sanitise snapshot (deep clone, strip sensitive fields) ──
    const cleanReport = sanitizeSnapshot(entitlementResult.snapshot);

    // ── Return stored snapshot ─────────────────────────────────
    return response.status(200).json({
      ok: true,
      status: "completed",
      reportId: entitlementResult.reportId,
      entitlementStatus: entitlementResult.entitlementStatus,
      paymentStatus: entitlementResult.paymentStatus,
      valuationVersion: entitlementResult.valuationVersion,
      purchasedAt: entitlementResult.purchasedAt,
      report: cleanReport,
    });
  } catch (error) {
    console.error("[valuation-full]", error.message);
    return response.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
    });
  }
}

// ── Safe error messages ─────────────────────────────────────────────

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
