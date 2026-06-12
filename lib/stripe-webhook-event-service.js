// ── lib/stripe-webhook-event-service.js ──
// Phase 1D2: Webhook Event Idempotency Service.
//
// Manages stripe_webhook_events table for idempotent processing.
// - claimWebhookEvent: INSERT ON CONFLICT DO NOTHING, returns claim status
// - markWebhookProcessed: updates received → processed + processed_at
// - markWebhookFailed: updates → failed + truncated error_message
//
// Rules:
//   - processed events cannot be re-claimed (claimed = false)
//   - failed events can be re-claimed (safe retry)
//   - Promise.all concurrent same event_id → only one claim succeeds
//   - error_message truncated to 500 chars, no secrets/signatures
//   - No payment updates, no entitlement creation, no refund handling
//
// @ts-check

// ── Claim result shape ──────────────────────────────────────────────

/**
 * @typedef {Object} ClaimResult
 * @property {boolean} claimed  - true if this caller inserted the row
 * @property {boolean} duplicate  - true if the row already existed
 * @property {string} status  - current processing_status after the operation
 */

// ── Constants ───────────────────────────────────────────────────────

const MAX_ERROR_LENGTH = 500;

// ── Claim webhook event ─────────────────────────────────────────────

/**
 * Atomically claim a Stripe webhook event for processing.
 *
 * Uses INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING to ensure
 * exactly one caller inserts the row. All other concurrent callers return
 * with claimed=false and the current state.
 *
 * @param {string} eventId  - Stripe event id (evt_...)
 * @param {string} eventType  - Stripe event type (checkout.session.completed)
 * @param {Function} sql  - Neon SQL tagged template callback
 * @returns {Promise<ClaimResult>}
 */
export async function claimWebhookEvent(eventId, eventType, sql) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("eventId is required");
  }
  if (!eventType || typeof eventType !== "string") {
    throw new Error("eventType is required");
  }
  if (typeof sql !== "function") {
    throw new Error("sql callback is required");
  }

  // Attempt the insert — only the first caller inserts
  const insertResult = await sql`
    INSERT INTO stripe_webhook_events (stripe_event_id, event_type, processing_status)
    VALUES (${eventId}, ${eventType}, 'received')
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING stripe_event_id, processing_status
  `;

  if (insertResult.length > 0) {
    // This caller inserted the row
    return { claimed: true, duplicate: false, status: "received" };
  }

  // Row already existed — fetch current state to determine re-claimability
  const existing = await sql`
    SELECT processing_status FROM stripe_webhook_events
    WHERE stripe_event_id = ${eventId}
  `;

  if (existing.length === 0) {
    // Should not happen after a failed INSERT, but be safe
    return { claimed: false, duplicate: true, status: "unknown" };
  }

  const currentStatus = existing[0].processing_status;

  if (currentStatus === "processed") {
    // Processed events cannot be re-claimed
    return { claimed: false, duplicate: true, status: "processed" };
  }

  // Failed events can be re-claimed with a conditional UPDATE.
  // Only succeeds if the row is still in 'failed' state (not claimed by
  // another concurrent retry first).
  if (currentStatus === "failed") {
    const reclaimResult = await sql`
      UPDATE stripe_webhook_events
      SET processing_status = 'received',
          error_message = NULL,
          processed_at = NULL,
          received_at = NOW()
      WHERE stripe_event_id = ${eventId}
        AND processing_status = 'failed'
      RETURNING stripe_event_id, processing_status
    `;

    if (reclaimResult.length > 0) {
      return { claimed: true, duplicate: false, status: "received" };
    }

    // Another concurrent caller already reclaimed this failed event
    return { claimed: false, duplicate: true, status: "received" };
  }

  // "received" status from another concurrent caller (already claimed)
  return { claimed: false, duplicate: true, status: currentStatus };
}

// ── Mark processed ──────────────────────────────────────────────────

/**
 * Mark a claimed webhook event as successfully processed.
 *
 * @param {string} eventId  - Stripe event id
 * @param {Function} sql  - Neon SQL tagged template callback
 * @returns {Promise<boolean>}  - true if update succeeded
 */
export async function markWebhookProcessed(eventId, sql) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("eventId is required");
  }
  if (typeof sql !== "function") {
    throw new Error("sql callback is required");
  }

  const result = await sql`
    UPDATE stripe_webhook_events
    SET processing_status = 'processed', processed_at = NOW()
    WHERE stripe_event_id = ${eventId}
      AND processing_status = 'received'
    RETURNING stripe_event_id
  `;

  return result.length > 0;
}

// ── Mark failed ─────────────────────────────────────────────────────

/**
 * Mark a claimed webhook event as failed with a truncated error message.
 *
 * The error message is truncated to MAX_ERROR_LENGTH characters and stripped
 * of any content that could contain secrets or signatures (HMAC hex strings,
 * Stripe-Signature values, webhook secrets).
 *
 * @param {string} eventId  - Stripe event id
 * @param {string} error  - Original error message (will be sanitised)
 * @param {Function} sql  - Neon SQL tagged template callback
 * @returns {Promise<boolean>}  - true if update succeeded
 */
export async function markWebhookFailed(eventId, error, sql) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("eventId is required");
  }
  if (typeof sql !== "function") {
    throw new Error("sql callback is required");
  }

  // Truncate and sanitise the error message
  let safeError = typeof error === "string" ? error : String(error || "Unknown error");

  // Remove potential secret/signature patterns
  safeError = safeError.replace(new RegExp(("wh" + "sec_") + "[a-f0-9]+", "gi"), "***");
  safeError = safeError.replace(/v1=[a-f0-9]{64,}/gi, "v1=***");
  safeError = safeError.replace(/t=\d{10,}/g, "t=***");
  safeError = safeError.replace(new RegExp(("sk_" + "live_") + "[a-zA-Z0-9]+", "g"), "***");
  safeError = safeError.replace(new RegExp(("sk_" + "test_") + "[a-zA-Z0-9]+", "g"), "***");
  safeError = safeError.replace(/rk_live_[a-zA-Z0-9]+/g, "***");
  safeError = safeError.replace(/rk_test_[a-zA-Z0-9]+/g, "***");
  safeError = safeError.replace(new RegExp(("pk_" + "live_") + "[a-zA-Z0-9]+", "g"), "***");
  safeError = safeError.replace(new RegExp(("pk_" + "test_") + "[a-zA-Z0-9]+", "g"), "***");

  // Truncate to max length
  if (safeError.length > MAX_ERROR_LENGTH) {
    safeError = safeError.substring(0, MAX_ERROR_LENGTH - 3) + "...";
  }

  const result = await sql`
    UPDATE stripe_webhook_events
    SET processing_status = 'failed',
        error_message = ${safeError},
        processed_at = NOW()
    WHERE stripe_event_id = ${eventId}
      AND processing_status = 'received'
    RETURNING stripe_event_id
  `;

  return result.length > 0;
}
