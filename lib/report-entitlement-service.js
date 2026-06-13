// ── lib/report-entitlement-service.js ──
// Phase 1E1: Report Entitlement Query Service.
//
// Single entry point: checkReportEntitlement({ reportId, email }, sql)
//
// This is the ONLY authority for paid report access.
// All gates (api/valuation-full, check-report-entitlement) call this.
//
// Does NOT read cookies, localStorage, or opportunity tokens.
// Does NOT connect to Stripe.
// Does NOT access production DB (caller provides sql).
//
// Rules:
//   1. Validate reportId and email format
//   2. Look up lead_contact by email_lower
//   3. Separately query each of the three report tables
//      so we can distinguish missing entitlement vs missing
//      payment vs missing snapshot vs all missing.
//   4. All conditions below must be true:
//      - entitlement.report_id === requested reportId
//      - entitlement.lead_contact_id === contact.id
//      - entitlement.status === 'active'
//      - payment exists for reportId AND lead_contact_id === contact.id
//      - payment.status === 'paid'
//      - snapshot exists for reportId AND lead_contact_id === contact.id
//      - snapshot.snapshot_json IS NOT NULL AND is a plain object
//   5. If any condition fails → appropriate error code
//   6. Never expose: stripe_customer_id, payment_intent, session_id
//   7. Stable output for same input

// ── Rejection codes ─────────────────────────────────────────────────

export const REJECTION = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  NOT_ENTITLED: "NOT_ENTITLED",
  REFUNDED: "REFUNDED",
  REVOKED: "REVOKED",
  PAYMENT_NOT_CONFIRMED: "PAYMENT_NOT_CONFIRMED",
  REPORT_OWNER_CONFLICT: "REPORT_OWNER_CONFLICT",
  REPORT_DATA_UNAVAILABLE: "REPORT_DATA_UNAVAILABLE",
});

// ── Custom error class ──────────────────────────────────────────────

export class EntitlementCheckError extends Error {
  /**
   * @param {string} code  — One of REJECTION values
   * @param {string} message  — Human-readable description
   */
  constructor(code, message) {
    super(message);
    this.name = "EntitlementCheckError";
    this.code = code;
  }
}

// ── Input validation ────────────────────────────────────────────────

function validateInput(reportId, email) {
  if (!reportId || typeof reportId !== "string" || reportId.length === 0) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Invalid or missing report_id."
    );
  }

  // reportId format: rp_<timestamp_ms>_<hex>
  if (!/^rp_\d+_[0-9a-f]{16,}$/i.test(reportId)) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Invalid or missing report_id."
    );
  }

  if (!email || typeof email !== "string" || email.length === 0) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Invalid or missing email."
    );
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Invalid email format."
    );
  }
}

// ── Parse snapshot_json defensively ────────────────────────────────

/**
 * Safely parse snapshot_json from the database.
 * Returns the parsed plain object, or throws EntitlementCheckError
 * if the value is null, malformed, a primitive, or an array.
 *
 * @param {object|string|null} snapshotJson  — Raw value from DB
 * @returns {object}
 * @throws {EntitlementCheckError} REPORT_DATA_UNAVAILABLE
 */
function parseSnapshotJson(snapshotJson) {
  if (snapshotJson === null || snapshotJson === undefined) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_DATA_UNAVAILABLE,
      "Report data is not available."
    );
  }

  let parsed;

  if (typeof snapshotJson === "string") {
    try {
      parsed = JSON.parse(snapshotJson);
    } catch {
      throw new EntitlementCheckError(
        REJECTION.REPORT_DATA_UNAVAILABLE,
        "Report data is not available."
      );
    }
  } else {
    parsed = snapshotJson;
  }

  // Must be a plain object (not null, not array, not primitive)
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_DATA_UNAVAILABLE,
      "Report data is not available."
    );
  }

  return parsed;
}

// ── Completed payment statuses ──────────────────────────────────────

const COMPLETED_STATUSES = new Set(["paid", "refunded", "disputed"]);

/**
 * Resolve the best payment record for this contact from an already-fetched
 * array of all payments for this report_id.
 *
 * Rules:
 *   1. Filter by lead_contact_id === contactId
 *   2. Prefer completed statuses (paid / refunded / disputed)
 *   3. Within completed, pick most recent (updated_at DESC, then id DESC)
 *   4. If no completed, pick most recent of the rest
 *   5. No match at all → return null (caller handles REPORT_OWNER_CONFLICT)
 *
 * Does NOT perform any SQL — allPayments is already fetched.
 *
 * @param {Array} allPayments  — All payment rows for this report_id
 * @param {number} contactId  — Requesting lead_contact id
 * @returns {object|null}  — The selected payment row, or null
 */
function resolvePaymentForContact(allPayments, contactId) {
  // Filter by this contact's ownership
  const myPayments = allPayments.filter(
    (p) => p.lead_contact_id != null && Number(p.lead_contact_id) === contactId
  );

  if (myPayments.length === 0) {
    return null;
  }

  // Separate into completed vs incomplete
  const completed = [];
  const incomplete = [];

  for (const p of myPayments) {
    if (COMPLETED_STATUSES.has(p.status)) {
      completed.push(p);
    } else {
      incomplete.push(p);
    }
  }

  // Helper: sort by updated_at DESC, then id DESC (deterministic)
  function sortByLatest(a, b) {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return Number(b.id) - Number(a.id);
  }

  const pool = completed.length > 0 ? completed : incomplete;
  pool.sort(sortByLatest);

  return pool[0];
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Check if a user (identified by email) is entitled to access a paid report.
 *
 * @param {object} params
 * @param {string} params.reportId  — The report_id to check
 * @param {string} params.email  — User's email address
 * @param {import("@neondatabase/serverless").NeonQueryFunction} sql  — Neon SQL tagged template executor
 * @returns {Promise<object>} Success result with { allowed, reportId, ... }
 * @throws {EntitlementCheckError} with .code from REJECTION constants
 */
export async function checkReportEntitlement({ reportId, email }, sql) {
  // ── 1. Validate input ──────────────────────────────────────────

  validateInput(reportId, email);

  const emailLower = email.toLowerCase().trim();

  // ── 2. Look up lead_contact ────────────────────────────────────

  const contacts = await sql`
    SELECT id, email, email_lower
    FROM lead_contacts
    WHERE email_lower = ${emailLower}
    LIMIT 1
  `;

  if (contacts.length === 0) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "No account found for the provided email."
    );
  }

  const contact = contacts[0];
  const contactId = Number(contact.id);

  // ── 3. Query each report table separately (single fetch) ──────
  //
  // Three tables: report_entitlements, report_payments, report_snapshots.
  // report_payments fetches ALL rows (no LIMIT) so resolvePaymentForContact
  // can select the best match without a second SQL round-trip.

  const [ents, allPayments, snapshots] = await Promise.all([
    sql`
      SELECT id, status, granted_at, revoked_at, lead_contact_id
      FROM report_entitlements
      WHERE report_id = ${reportId}
      LIMIT 1
    `,
    sql`
      SELECT id, status, lead_contact_id, report_id, amount_cents, currency, created_at, updated_at
      FROM report_payments
      WHERE report_id = ${reportId}
      ORDER BY id ASC
    `,
    sql`
      SELECT snapshot_json, valuation_version, created_at, lead_contact_id, property_key
      FROM report_snapshots
      WHERE report_id = ${reportId}
      LIMIT 1
    `,
  ]);

  // ── 4. Determine which records exist ───────────────────────────

  const hasEnt = ents.length > 0;
  const hasPay = allPayments.length > 0;
  const hasSnap = snapshots.length > 0;

  // All three missing → report doesn't exist at all
  if (!hasEnt && !hasPay && !hasSnap) {
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Report not found or no matching record."
    );
  }

  // ── 5. Check each missing table individually ───────────────────

  if (!hasEnt) {
    throw new EntitlementCheckError(
      REJECTION.NOT_ENTITLED,
      "No active entitlement for this report."
    );
  }

  if (!hasSnap) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_DATA_UNAVAILABLE,
      "Report data is not available."
    );
  }

  const ent = ents[0];
  const snap = snapshots[0];

  // ── 6. Strict owner checks (ent, snap) ─────────────────────────
  //
  // null/undefined/non-number/other-customer → all reject.

  const entOwnerId = ent.lead_contact_id != null ? Number(ent.lead_contact_id) : null;
  const snapOwnerId = snap.lead_contact_id != null ? Number(snap.lead_contact_id) : null;

  if (entOwnerId === null || entOwnerId !== contactId) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_OWNER_CONFLICT,
      "This report belongs to a different user."
    );
  }

  if (snapOwnerId === null || snapOwnerId !== contactId) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_OWNER_CONFLICT,
      "This report belongs to a different user."
    );
  }

  // ── 7. Resolve payment for this contact (no SQL call) ──────────
  //
  // Multiple payments can exist for the same report_id (e.g. retried
  // checkouts).  resolvePaymentForContact selects the best match from
  // the already-fetched allPayments array — no second database call.

  const pay = resolvePaymentForContact(allPayments, contactId);

  if (pay === null) {
    // Check if there are payments at all from other customers
    if (hasPay) {
      throw new EntitlementCheckError(
        REJECTION.REPORT_OWNER_CONFLICT,
        "This report belongs to a different user."
      );
    }
    throw new EntitlementCheckError(
      REJECTION.PAYMENT_NOT_CONFIRMED,
      "Payment for this report has not been confirmed."
    );
  }

  // ── 8. Entitlement status check ────────────────────────────────

  const entStatus = ent.status;

  if (entStatus === "revoked") {
    throw new EntitlementCheckError(
      REJECTION.REVOKED,
      "This report has been revoked and is no longer accessible."
    );
  }

  if (entStatus === "refunded" || entStatus === "disputed") {
    throw new EntitlementCheckError(
      REJECTION.REFUNDED,
      "This report has been refunded and is no longer accessible."
    );
  }

  if (entStatus !== "active") {
    throw new EntitlementCheckError(
      REJECTION.NOT_ENTITLED,
      "No active entitlement for this report."
    );
  }

  // ── 9. Payment status check ────────────────────────────────────

  const payStatus = pay.status;

  if (payStatus === "refunded" || payStatus === "disputed") {
    throw new EntitlementCheckError(
      REJECTION.REFUNDED,
      "This report has been refunded and is no longer accessible."
    );
  }

  if (payStatus === "pending" || payStatus === "failed" || payStatus === "expired") {
    throw new EntitlementCheckError(
      REJECTION.PAYMENT_NOT_CONFIRMED,
      "Payment for this report has not been confirmed."
    );
  }

  if (payStatus !== "paid") {
    throw new EntitlementCheckError(
      REJECTION.PAYMENT_NOT_CONFIRMED,
      "Payment for this report has not been confirmed."
    );
  }

  // ── 10. Snapshot check ────────────────────────────────────────

  const snapshot = parseSnapshotJson(snap.snapshot_json);

  // ── 11. Success ────────────────────────────────────────────────

  return {
    allowed: true,
    reportId,
    entitlementStatus: "active",
    paymentStatus: "paid",
    snapshot,
    valuationVersion: snap.valuation_version || null,
    purchasedAt: ent.granted_at || pay.created_at || null,
  };
}
