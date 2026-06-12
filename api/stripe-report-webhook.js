// ── api/stripe-report-webhook.js ──
// Phase 1D1: Stripe Webhook — Signature Verification Only.
//
// POST only. Reads raw body (bodyParser: false), verifies Stripe signature
// via stripe.webhooks.constructEvent(), returns {"received": true, "eventType": "..."}.
//
// Does NOT update payment status.
// Does NOT create entitlement.
// Does NOT handle refunds.
// Does NOT write to database.
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
  WEBHOOK_NOT_CONFIGURED: "WEBHOOK_NOT_CONFIGURED",
};

// ── Stripe client (uses singleton from stripe-client.js) ────────────

import { getStripe } from "../lib/stripe-client.js";

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

    // ── Step 2: Read raw body from request stream ──
    const rawBody = await readRawBody(req);
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
        message: `Invalid signature: ${err.message}`,
      });
    }

    // ── Step 6: Return success (no DB writes yet) ──
    return res.status(200).json({
      received: true,
      eventType: event.type,
    });
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
 *
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
  });
}
