// ── api/stripe-report-webhook.js ──
// Phase 1D5B: Stripe Webhook — Payment + Refund Event Routing.
//
// POST only. Reads raw body (bodyParser: false), verifies Stripe signature
// via stripe.webhooks.constructEvent(), routes to handlers:
//   - checkout.session.completed → handleCheckoutCompleted
//   - charge.refunded            → handleChargeRefunded
// All other events are safely ignored (still marked processed for idempotency).
//
// Uses stripe-webhook-event-service for idempotent event claiming.
// Handlers receive `event.data.object` + `sql`.
//
// Vercel config: bodyParser disabled so we get the raw Buffer.

// @ts-check

export const config = {
  api: {
    bodyParser: false,
  },
};

// ── Error codes ─────────────────────────────────────────────────────

const ERR = {
  BAD_REQUEST: "BAD_REQUEST",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  SIGNATURE_MISSING: "SIGNATURE_MISSING",
  WEBHOOK_BODY_TOO_LARGE: "WEBHOOK_BODY_TOO_LARGE",
  WEBHOOK_NOT_CONFIGURED: "WEBHOOK_NOT_CONFIGURED",
};

// ── Stripe client (uses singleton from stripe-client.js) ────────────

import { getStripe } from "../lib/stripe-client.js";

// ── Test-injectable SQL ─────────────────────────────────────────────
// Tests can set a mock SQL function via setTestSql().
// When set, it overrides the default getSql() from _db.js.

let _testSql = null;
/**
 * @param {Function|null} sqlFn
 */
export function setTestSql(sqlFn) {
  _testSql = sqlFn;
}

// ── Handler ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature");
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
    // ── Step 1: Read Stripe-Signature header ──
    const sigHeader = req.headers["stripe-signature"];
    if (!sigHeader) {
      return res.status(400).json({
        ok: false,
        error: ERR.SIGNATURE_MISSING,
        message: "Missing Stripe-Signature header.",
      });
    }

    // ── Step 2: Read raw body from request stream (max 1 MB) ──
    const bodyResult = await readRawBody(req, 1_048_576);
    if (!bodyResult.ok) {
      // Overflow — body exceeded 1 MB
      return res.status(413).json({
        ok: false,
        error: ERR.WEBHOOK_BODY_TOO_LARGE,
        message: "Request body too large.",
      });
    }
    const rawBody = bodyResult.body;
    if (rawBody.length === 0) {
      return res.status(400).json({
        ok: false,
        error: ERR.SIGNATURE_INVALID,
        message: "Empty request body.",
      });
    }

    // ── Step 3: Get Stripe client ──
    let stripe;
    try {
      stripe = getStripe();
    } catch {
      return res.status(503).json({
        ok: false,
        error: ERR.WEBHOOK_NOT_CONFIGURED,
        message: "Stripe is not configured. Webhook endpoint unavailable.",
      });
    }

    if (!stripe) {
      return res.status(503).json({
        ok: false,
        error: ERR.WEBHOOK_NOT_CONFIGURED,
        message: "Stripe is not configured. Webhook endpoint unavailable.",
      });
    }

    // ── Step 4: Get webhook secret ──
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(503).json({
        ok: false,
        error: ERR.WEBHOOK_NOT_CONFIGURED,
        message: "STRIPE_WEBHOOK_SECRET is not configured.",
      });
    }

    // ── Step 5: Verify signature ──
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: ERR.SIGNATURE_INVALID,
        message: "Invalid webhook signature.",
      });
    }

    // ── Step 6: Get SQL (use test injection if set) ──
    let sql;
    try {
      if (_testSql) {
        sql = _testSql;
      } else {
        const { getSql } = await import("./_db.js");
        sql = getSql();
      }
      await import("./_db.js").then(m => m.ensureReportPaymentSchema(sql));
    } catch {
      console.error("[stripe-report-webhook] Failed to initialize DB");
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }

    // ── Step 7: Claim event for idempotent processing ──
    let claimResult;
    try {
      const { claimWebhookEvent, markWebhookProcessed, markWebhookFailed } = await import(
        "../lib/stripe-webhook-event-service.js"
      );

      claimResult = await claimWebhookEvent(event.id, event.type, sql);

      // claimed = true → we have exclusive right to process
      if (claimResult.claimed) {
        // Continue to Step 8
      }
      // claimed = false + processed → already processed, idempotent ACK
      else if (claimResult.status === "processed") {
        return res.status(200).json({
          received: true,
          eventType: event.type,
          idempotent: true,
        });
      }
      // claimed = false + received → another caller is processing, retry later
      else if (claimResult.status === "received") {
        return res.status(409).json({
          ok: false,
          error: "DUPLICATE_PROCESSING",
          message: "This event is already being processed.",
        });
      }
      // claimed = false + any other status → unknown state, cannot proceed
      else {
        return res.status(500).json({
          ok: false,
          error: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        });
      }
    } catch (claimErr) {
      console.error("[stripe-report-webhook] claim failed:", claimErr.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }

    // ── Step 8: Route event by type ──
    try {
      if (event.type === "checkout.session.completed") {
        const { handleCheckoutCompleted } = await import(
          "../lib/report-payment-webhook-service.js"
        );
        await handleCheckoutCompleted(event.data.object, sql);
      } else if (event.type === "charge.refunded") {
        const { handleChargeRefunded } = await import(
          "../lib/report-refund-webhook-service.js"
        );
        await handleChargeRefunded(event.data.object, sql);
      }

      // Mark processed for all successful events (including unsupported types)
      const { markWebhookProcessed } = await import(
        "../lib/stripe-webhook-event-service.js"
      );
      const markOk = await markWebhookProcessed(event.id, sql);
      if (!markOk) {
        // Event was not in 'received' state — something went wrong
        console.error(
          "[stripe-report-webhook] markWebhookProcessed returned false for event",
          event.id
        );
        return res.status(500).json({
          ok: false,
          error: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        });
      }

      const handledTypes = ["checkout.session.completed", "charge.refunded"];
      return res.status(200).json({
        received: true,
        eventType: event.type,
        ignored: !handledTypes.includes(event.type),
      });
    } catch (processErr) {
      // ── Step 9: Processing failure — mark failed, return 500 for retry ──
      console.error("[stripe-report-webhook] processing failed:", processErr.message);
      try {
        const { markWebhookFailed } = await import(
          "../lib/stripe-webhook-event-service.js"
        );
        await markWebhookFailed(event.id, processErr.message, sql);
      } catch (markErr) {
        console.error("[stripe-report-webhook] markWebhookFailed also failed:", markErr.message);
      }
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      });
    }
  } catch (error) {
    console.error("[stripe-report-webhook]", error.message);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  }
}

// ── Raw body reader (for bodyParser: false in Vercel) ───────────────

/**
 * Read the raw body from the IncomingMessage stream as a Buffer.
 * Enforces a maxBytes limit — the response must use the `res` object
 * for sending the 413 error, so this function signals overflow to the
 * caller instead of resolving/rejecting.
 *
 * @param {import("http").IncomingMessage} req
 * @param {number} [maxBytes=1_048_576]
 * @returns {Promise<{ ok: true, body: Buffer } | { ok: false, overflow: true }>}
 */
function readRawBody(req, maxBytes = 1_048_576) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        // Overflow — destroy the stream to stop reading
        req.destroy();
        resolve({ ok: false, overflow: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve({ ok: true, body: Buffer.concat(chunks) });
    });
    req.on("error", (err) => reject(err));
  });
}
