// ── api/report-payment-status.js ──
// Phase 1E3C: Payment Status Query API.
//
// GET only. Reads aushomevalue_report_access cookie.
// Never reads client-supplied email, leadContactId, or entitlement status.
// Never calls Stripe.
// Never writes to payment, entitlement, or snapshot tables.
//
// Response statuses:
//   pending           — Checkout payment still being confirmed
//   ready             — Paid + active entitlement + snapshot exists
//   refunded          — Payment refunded or entitlement disputed
//   revoked           — Entitlement explicitly revoked
//   not_found         — No matching purchase flow found
//   session_expired   — Cookie invalid or expired
//   owner_conflict    — Owner mismatch between records
//   data_unavailable  — DB-level data inconsistency (503 stop polling)
//
// Response NEVER contains:
//   email, leadContactId, Stripe customer ID, payment intent,
//   checkout session ID, purchase intent key, snapshot content,
//   DB or stack trace information.

import { ensureCustomerFunnelSchema, ensureReportPaymentSchema, getSql } from "./_db.js";
import {
  verifyReportAccessSession,
  extractReportAccessCookie,
  buildClearReportAccessCookie,
} from "../lib/report-access-session.js";

// ── Test-injectable SQL ─────────────────────────────────────────────

let _testSql = null;
function getApiSql() {
  if (_testSql) return _testSql;
  return getSql();
}
export function setTestSql(sqlFn) {
  _testSql = sqlFn;
}

// ── Allowed headers (always set) ───────────────────────────────────

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

// ── Status codes ────────────────────────────────────────────────────

const STATUSES = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  REFUNDED: "refunded",
  REVOKED: "revoked",
  NOT_FOUND: "not_found",
  SESSION_EXPIRED: "session_expired",
  OWNER_CONFLICT: "owner_conflict",
  DATA_UNAVAILABLE: "data_unavailable",
});

// ── Completed payment statuses (mirrors report-entitlement-service) ─

const COMPLETED_STATUSES = new Set(["paid", "refunded", "disputed"]);

// ── reportId format check ──────────────────────────────────────────

function isValidReportId(value) {
  return typeof value === "string" && /^rp_\d+_[0-9a-f]{16,}$/i.test(value);
}

// ── Maximum query parameter size ────────────────────────────────────

const MAX_QUERY_LENGTH = 256;

// ── Cookie clearing helper ──────────────────────────────────────────

function clearCookie(res) {
  res.setHeader("Set-Cookie", buildClearReportAccessCookie());
}

// ── Payment resolution (mirrors resolvePaymentForContact) ───────────
//
// Rules:
//   1. Filter by lead_contact_id === contactId
//   2. Prefer completed statuses (paid / refunded / disputed)
//   3. Within completed, pick most recent (updated_at DESC, then id DESC)
//   4. If no completed, pick most recent of the rest
//   5. No match at all → return null

function resolvePayment(rows, contactId) {
  const myPayments = rows.filter(
    (p) => p.lead_contact_id != null && Number(p.lead_contact_id) === contactId
  );
  if (myPayments.length === 0) return null;

  const completed = [];
  const incomplete = [];
  for (const p of myPayments) {
    if (COMPLETED_STATUSES.has(p.status)) {
      completed.push(p);
    } else {
      incomplete.push(p);
    }
  }

  function byLatest(a, b) {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return Number(b.id) - Number(a.id);
  }

  const pool = completed.length > 0 ? completed : incomplete;
  pool.sort(byLatest);
  return pool[0];
}

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // ── CORS headers (always set) ────────────────────────────────
  for (const [k, v] of Object.entries(COMMON_HEADERS)) {
    res.setHeader(k, v);
  }

  // ── OPTIONS → 204 ────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── GET only ─────────────────────────────────────────────────
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      status: STATUSES.SESSION_EXPIRED,
      message: "Method not allowed.",
    });
  }

  try {
    // ── Validate query parameters ─────────────────────────────
    const rawUrl = req.url || "";
    const qIdx = rawUrl.indexOf("?");
    const params = new URLSearchParams(qIdx >= 0 ? rawUrl.slice(qIdx + 1) : "");

    // Reject unexpected parameters (basic safety)
    const allowedParamNames = new Set(["report_id"]);
    for (const key of params.keys()) {
      if (!allowedParamNames.has(key)) {
        return res.status(400).json({
          ok: false,
          status: STATUSES.SESSION_EXPIRED,
          message: "Invalid request.",
        });
      }
    }

    // Validate length — prevent abuse
    const totalQueryLength = (qIdx >= 0 ? rawUrl.slice(qIdx + 1) : "").length;
    if (totalQueryLength > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Invalid request.",
      });
    }

    // ── Extract and verify session cookie ─────────────────────
    const token = extractReportAccessCookie(req);

    if (!token) {
      // No cookie → no session → session_expired
      return res.status(401).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Session expired. Please complete checkout again.",
      });
    }

    const session = verifyReportAccessSession(token);

    if (!session) {
      // Session invalid or expired — clear the stale cookie
      clearCookie(res);
      return res.status(401).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Session expired. Please complete checkout again.",
      });
    }

    // ── Validate query report_id ──────────────────────────────
    const queryReportId = params.get("report_id");

    if (!queryReportId) {
      return res.status(400).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Invalid request.",
      });
    }

    if (!isValidReportId(queryReportId)) {
      return res.status(400).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Invalid request.",
      });
    }

    // ── Verify query report_id matches session ────────────────
    // Client-provided report_id must match the server-signed cookie.
    if (queryReportId !== session.reportId) {
      clearCookie(res);
      return res.status(403).json({
        ok: false,
        status: STATUSES.SESSION_EXPIRED,
        message: "Session expired. Please complete checkout again.",
      });
    }

    // ── Initialize database schemas ───────────────────────────
    const sql = getApiSql();

    try {
      await ensureCustomerFunnelSchema(sql);
      await ensureReportPaymentSchema(sql);
    } catch {
      return res.status(500).json({
        ok: false,
        status: STATUSES.NOT_FOUND,
        message: "Unable to check report status. Please try again.",
      });
    }

    // ── Query all three tables in parallel ────────────────────
    // Must include updated_at for payment sorting (mirrors
    // report-entitlement-service resolvePaymentForContact rules).
    const [payments, ents, snapshots] = await Promise.all([
      sql`
        SELECT id, status, lead_contact_id, report_id, updated_at
        FROM report_payments
        WHERE report_id = ${queryReportId}
        ORDER BY id ASC
      `,
      sql`
        SELECT id, status, lead_contact_id, report_id
        FROM report_entitlements
        WHERE report_id = ${queryReportId}
        LIMIT 1
      `,
      sql`
        SELECT report_id, lead_contact_id, snapshot_json
        FROM report_snapshots
        WHERE report_id = ${queryReportId}
        LIMIT 1
      `,
    ]);

    const contactId = session.leadContactId;
    const hasPayments = payments.length > 0;
    const hasEnt = ents.length > 0;
    const hasSnap = snapshots.length > 0;

    // ── Resolve the best payment for THIS contact ─────────────
    //
    // Following resolvePaymentForContact rules:
    //   - Filter by lead_contact_id === contactId
    //   - Prefer completed paid/refunded/disputed
    //   - Sort by updated_at DESC, id DESC
    //   - If no row for this contact → null → owner_conflict

    const bestPay = resolvePayment(payments, contactId);

    // ── Owner consistency check for payment ────────────────────
    //
    // If this contact has no payment rows at all, but other contacts
    // have payments for this report_id → owner_conflict.
    // We have the bestPay = null; check if ANY payment exists.
    if (!bestPay && hasPayments) {
      // Payments exist but none for this contact → conflict
      clearCookie(res);
      return res.status(403).json({
        ok: false,
        status: STATUSES.OWNER_CONFLICT,
        message: "Report ownership mismatch.",
      });
    }

    // ── Owner consistency check for entitlement ───────────────
    if (hasEnt) {
      const ent = ents[0];
      const entOwner = ent.lead_contact_id != null ? Number(ent.lead_contact_id) : null;
      if (entOwner !== contactId) {
        clearCookie(res);
        return res.status(403).json({
          ok: false,
          status: STATUSES.OWNER_CONFLICT,
          message: "Report ownership mismatch.",
        });
      }
    }

    // ── Owner consistency check for snapshot ──────────────────
    if (hasSnap) {
      const snap = snapshots[0];
      const snapOwner = snap.lead_contact_id != null ? Number(snap.lead_contact_id) : null;
      if (snapOwner !== contactId) {
        clearCookie(res);
        return res.status(403).json({
          ok: false,
          status: STATUSES.OWNER_CONFLICT,
          message: "Report ownership mismatch.",
        });
      }
    }

    // ── All three missing → no such purchase flow ─────────────
    if (!bestPay && !hasEnt && !hasSnap) {
      clearCookie(res);
      return res.status(404).json({
        ok: false,
        status: STATUSES.NOT_FOUND,
        message: "Report not found.",
      });
    }

    // ── Status determination ──────────────────────────────────
    //
    // At this point all records (when present) belong to this contact.
    // Determine the aggregate status from payment + entitlement + snapshot.

    const payStatus = bestPay ? bestPay.status : null;
    const entStatus = hasEnt ? ents[0].status : null;
    const snapExists = hasSnap && snapshots[0].snapshot_json != null;

    // ── Entitlement-based negative states (highest priority) ───
    if (entStatus === "revoked") {
      clearCookie(res);
      return res.status(403).json({
        ok: false,
        status: STATUSES.REVOKED,
        message: "Report access has been revoked.",
      });
    }

    if (entStatus === "refunded" || entStatus === "disputed") {
      clearCookie(res);
      return res.status(403).json({
        ok: false,
        status: STATUSES.REFUNDED,
        message: "Report payment has been refunded.",
      });
    }

    // ── Refunded/disputed payment ─────────────────────────────
    if (payStatus === "refunded" || payStatus === "disputed") {
      clearCookie(res);
      return res.status(403).json({
        ok: false,
        status: STATUSES.REFUNDED,
        message: "Report payment has been refunded.",
      });
    }

    // ── Check for ready ────────────────────────────────────────
    // paid + active entitlement + snapshot exists
    // ALL must be true. No shortcut from cookie or URL alone.
    if (payStatus === "paid" && entStatus === "active" && snapExists) {
      return res.status(200).json({
        ok: true,
        status: STATUSES.READY,
        message: "Report is ready for viewing.",
      });
    }

    // ── Data inconsistency checks (data_unavailable) ───────────
    //
    // The Webhook updates payment + entitlement atomically, and the
    // snapshot is created before payment. So these combinations
    // indicate DB-level inconsistency, NOT a normal pending state.
    // Return 503 so the frontend stops polling.
    //
    // 1. Paid but no active entitlement (or vice versa)
    // 2. Paid + active entitlement but no snapshot

    const hasPaid = payStatus === "paid";
    const hasActive = entStatus === "active";

    if ((hasPaid && !hasActive) || (!hasPaid && hasActive)) {
      // Paid↔entitlement mismatch
      return res.status(503).json({
        ok: false,
        status: STATUSES.DATA_UNAVAILABLE,
        message: "Report data is currently unavailable. Please try again later.",
      });
    }

    if (hasPaid && hasActive && !snapExists) {
      return res.status(503).json({
        ok: false,
        status: STATUSES.DATA_UNAVAILABLE,
        message: "Report data is currently unavailable. Please try again later.",
      });
    }

    // ── Check for pending (normal checkout flow) ───────────────
    // Payment exists but not yet confirmed by Webhook.
    // This is the ONLY valid pending path.
    if (bestPay) {
      return res.status(200).json({
        ok: false,
        status: STATUSES.PENDING,
        message: "Payment is being confirmed. Please try again shortly.",
      });
    }

    // ── Entitlement without payment (= incomplete flow) ────────
    if (hasEnt) {
      return res.status(200).json({
        ok: false,
        status: STATUSES.PENDING,
        message: "Payment is being confirmed. Please try again shortly.",
      });
    }

    // ── Fallback: nothing matches ──────────────────────────────
    clearCookie(res);
    return res.status(404).json({
      ok: false,
      status: STATUSES.NOT_FOUND,
      message: "Report not found.",
    });
  } catch (error) {
    // ── Unexpected errors → safe generic response ──────────────
    console.error("[report-payment-status]", error.message);
    return res.status(500).json({
      ok: false,
      status: STATUSES.NOT_FOUND,
      message: "Unable to check report status. Please try again.",
    });
  }
}
