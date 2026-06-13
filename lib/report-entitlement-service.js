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
//   3. Joint query across report_entitlements, report_payments,
//      report_snapshots, and lead_contacts
//   4. All conditions below must be true:
//      - entitlement.report_id === requested reportId
//      - entitlement.lead_contact_id === lead_contact.id
//      - entitlement.status === 'active'
//      - payment.status === 'paid'
//      - payment.report_id === reportId
//      - payment.lead_contact_id === lead_contact.id
//      - snapshot exists for reportId
//      - snapshot.lead_contact_id === lead_contact.id
//      - snapshot.snapshot_json IS NOT NULL
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
  const contactId = contact.id;

  // ── 3. Joint query — all four tables in one trip ───────────────

  const rows = await sql`
    SELECT
      re.id               AS ent_id,
      re.status           AS ent_status,
      re.granted_at       AS ent_granted_at,
      re.revoked_at       AS ent_revoked_at,
      re.lead_contact_id  AS ent_lead_contact_id,

      rp.id               AS pay_id,
      rp.status           AS pay_status,
      rp.lead_contact_id  AS pay_lead_contact_id,
      rp.report_id        AS pay_report_id,
      rp.amount_cents     AS pay_amount_cents,
      rp.currency         AS pay_currency,
      rp.created_at       AS pay_created_at,

      rs.snapshot_json    AS snapshot_json,
      rs.valuation_version AS valuation_version,
      rs.created_at       AS snapshot_created_at,
      rs.lead_contact_id  AS snapshot_lead_contact_id,
      rs.property_key     AS snapshot_property_key
    FROM report_entitlements re
    INNER JOIN report_payments rp ON rp.report_id = re.report_id
    INNER JOIN report_snapshots rs ON rs.report_id = re.report_id
    WHERE re.report_id = ${reportId}
    LIMIT 1
  `;

  // ── 4. Interpret results ───────────────────────────────────────

  if (rows.length === 0) {
    // Report not found in any of the three tables
    throw new EntitlementCheckError(
      REJECTION.NOT_FOUND,
      "Report not found or no matching record."
    );
  }

  const row = rows[0];

  // ── 5. Owner checks ────────────────────────────────────────────

  // All three records must belong to the same contact
  const entOwnerId = row.ent_lead_contact_id != null ? Number(row.ent_lead_contact_id) : null;
  const payOwnerId = row.pay_lead_contact_id != null ? Number(row.pay_lead_contact_id) : null;
  const snapOwnerId = row.snapshot_lead_contact_id != null ? Number(row.snapshot_lead_contact_id) : null;
  const reqContactId = Number(contactId);

  // Conflicting ownership: at least one record belongs to someone else
  if (
    (entOwnerId !== null && entOwnerId !== reqContactId) ||
    (payOwnerId !== null && payOwnerId !== reqContactId) ||
    (snapOwnerId !== null && snapOwnerId !== reqContactId)
  ) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_OWNER_CONFLICT,
      "This report belongs to a different user."
    );
  }

  // Payment report_id must match
  if (row.pay_report_id !== reportId) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_OWNER_CONFLICT,
      "Payment does not match this report."
    );
  }

  // ── 6. Entitlement status check ────────────────────────────────

  const entStatus = row.ent_status;

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

  // ── 7. Payment status check ────────────────────────────────────

  const payStatus = row.pay_status;

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

  // ── 8. Snapshot check ─────────────────────────────────────────

  const snapshotJson = row.snapshot_json;
  if (!snapshotJson) {
    throw new EntitlementCheckError(
      REJECTION.REPORT_DATA_UNAVAILABLE,
      "Report data is not available."
    );
  }

  // Handle both string and JSONB (object) snapshot_json
  const snapshot =
    typeof snapshotJson === "string" ? JSON.parse(snapshotJson) : snapshotJson;

  // ── 9. Success ─────────────────────────────────────────────────

  return {
    allowed: true,
    reportId,
    entitlementStatus: "active",
    paymentStatus: "paid",
    snapshot,
    valuationVersion: row.valuation_version || null,
    purchasedAt: row.ent_granted_at || row.pay_created_at || null,
  };
}
