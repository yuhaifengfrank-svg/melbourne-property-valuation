// ── Phase 1D1: Stripe Webhook Signature Verification Tests ──
//
// Tests for POST /api/stripe-report-webhook.
// No real Stripe network or production DB access.
// Uses mock Stripe client with webhooks.constructEvent.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV = "test";

// ── Webhook secret for testing ──────────────────────────────────────

const TEST_WEBHOOK_SECRET = ("wh" + "sec_") + crypto.randomBytes(16).toString("hex");

// ── Helper: Stripe-signature format ─────────────────────────────────
// Real Stripe: t=timestamp,v1=signature
// For mock constructEvent: we embed the raw body into the HMAC

function computeStripeSignature(rawBodyOrString, secret, timestamp) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const body = Buffer.isBuffer(rawBodyOrString)
    ? rawBodyOrString.toString("utf8")
    : rawBodyOrString;
  const payload = `${ts}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { timestamp: ts, signature: sig, header: `t=${ts},v1=${sig}` };
}

// ── Fake webhook event payload ──────────────────────────────────────

const TEST_EVENT_PAYLOAD = JSON.stringify({
  id: "evt_test_" + crypto.randomBytes(8).toString("hex"),
  type: "charge.succeeded",
  data: {
    object: {
      id: "ch_test_" + crypto.randomBytes(6).toString("hex"),
    },
  },
});

// ── Mock Stripe client ──────────────────────────────────────────────
// Mimics stripe.webhooks.constructEvent(rawBody, sigHeader, secret)

function createMockStripe() {
  return {
    webhooks: {
      /**
       * Simulates Stripe's constructEvent.
       * - Parses signature from Stripe-Signature header
       * - Computes expected HMAC: HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
       * - On mismatch: throws with message matching real Stripe error
       * - On match: parses rawBody as JSON and returns as the event
       */
      constructEvent(rawBody, sigHeader, secret) {
        if (!rawBody || rawBody.length === 0) {
          const err = new Error("No payload provided");
          err.type = "StripeSignatureVerificationError";
          throw err;
        }
        if (!sigHeader) {
          // Should not reach here — handler checks header first
          return null;
        }
        if (!secret) {
          const err = new Error("No webhook secret provided");
          err.type = "StripeSignatureVerificationError";
          throw err;
        }

        // Parse signature header: t=...,v1=...
        const tMatch = sigHeader.match(/t=(\d+)/);
        const v1Match = sigHeader.match(/v1=([a-f0-9]+)/);
        if (!tMatch || !v1Match) {
          const err = new Error("No signatures found matching the expected signature scheme.");
          err.type = "StripeSignatureVerificationError";
          throw err;
        }

        const timestamp = tMatch[1];
        const providedSig = v1Match[1];

        // Compute expected signature
        const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
        const payload = `${timestamp}.${bodyStr}`;
        const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

        if (providedSig !== expectedSig) {
          const err = new Error(
            "Stripe signature verification failed. " +
            "Expected signature not found in the provided header. " +
            `Computed signature: ${expectedSig}, provided signature: ${providedSig}`
          );
          err.type = "StripeSignatureVerificationError";
          throw err;
        }

        // Parse JSON body for the event object
        let event;
        try {
          event = JSON.parse(bodyStr);
        } catch {
          throw new Error("Invalid JSON payload");
        }

        return event;
      },
    },
  };
}

// ── Mock state tracking ─────────────────────────────────────────────

let mockDbInvocations = [];
function resetMockDbInvocation() {
  mockDbInvocations = [];
}

// ── Mock DB function for "no writes" assertions ─────────────────────

const noopMockSql = () => {
  mockDbInvocations.push("called");
  return {
    then: () => null,
    catch: () => null,
  };
};

// ── Stream req builder ──────────────────────────────────────────────
// Simulates Vercel's IncomingMessage when bodyParser: false.
// Handler calls readRawBody(req) which listens on data/end events.

/**
 * Create a simulated IncomingMessage for bodyParser: false tests.
 *
 * Vercel with bodyParser: false passes the raw request with a Readable stream.
 * The handler calls readRawBody(req) which does:
 *   req.on("data", chunk => chunks.push(chunk))
 *   req.on("end", () => resolve(Buffer.concat(chunks)))
 *
 * We emit the raw body chunks synchronously when the "data" listener
 * is attached (simulating the stream having already buffered the data).
 */
/**
 * Create a simulated IncomingMessage for bodyParser: false tests.
 *
 * Uses a Readable stream so the handler's readRawBody can read chunks
 * via data/end events just like Vercel's real request object.
 */
function makeStreamReq(body, headers = {}, method = "POST") {
  const bodyBuffer = typeof body === "string" ? Buffer.from(body, "utf8") : (body || Buffer.alloc(0));

  const req = Readable.from(bodyBuffer);
  req.method = method;
  req.headers = {
    "content-type": "application/json",
    ...headers,
  };

  return req;
}

// ── Setup helper ────────────────────────────────────────────────────

async function setupTestEnv() {
  resetMockDbInvocation();

  // Set webhook secret
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  // Inject mock Stripe via setMockStripe
  const { setMockStripe } = await import("../lib/stripe-client.js");
  setMockStripe(createMockStripe());

  // Inject mock SQL into the webhook handler
  // Must import FIRST to call setTestSql BEFORE the handler runs.
  const ts = Date.now();
  const whMod = await import(`../api/stripe-report-webhook.js?t=${ts}`);
  whMod.setTestSql(makeWhMockSql());

  // Re-import same module (cache-busting with same timestamp ensures fresh but
  // the setTestSql above was on a different instance. We need ONE import.
  // Actually, Node.js module cache means the second import with same URL returns
  // the same cached module. So the setTestSql on the first import persists.
  // Let's import once and use the same reference.
  return { handler: whMod.default };
}

async function setupNoStripeEnv() {
  resetMockDbInvocation();

  // Remove webhook secret
  delete process.env.STRIPE_WEBHOOK_SECRET;

  // Ensure Stripe client returns null (test mode, no mock → null)
  const { resetStripeClient, setMockStripe } = await import("../lib/stripe-client.js");
  resetStripeClient();
  setMockStripe(null);

  const ts = Date.now() + 1;
  const whMod = await import(`../api/stripe-report-webhook.js?t=${ts}`);
  whMod.setTestSql(makeWhMockSql());
  return { handler: whMod.default };
}

// ── Mock SQL for webhook tests ─────────────────────────────────────
// Provides in-memory stripe_webhook_events + report_payments + report_entitlements
// so the handler can process events without real DB.

const mockWhEvents = [];
const mockWHPayments = [];
const mockWHEntitlements = [];

function makeWhMockSql() {
  // A simple mock that handles stripe_webhook_events + the services
  // the webhook handler needs. For signature-only tests, it just
  // returns a no-op function that accepts claim/process calls.
  return async function whSql(strings, ...values) {
    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");

    // Insert into stripe_webhook_events (ON CONFLICT DO NOTHING)
    if (raw.includes("INSERT INTO stripe_webhook_events") && raw.includes("DO NOTHING")) {
      const eventId = values[0];
      const existing = mockWhEvents.find(e => e.stripe_event_id === eventId);
      if (existing) return [];
      mockWhEvents.push({
        stripe_event_id: eventId,
        event_type: values[1],
        processing_status: "received",
      });
      return [{ stripe_event_id: eventId, processing_status: "received" }];
    }

    // Select from stripe_webhook_events
    if (raw.includes("FROM stripe_webhook_events") && !raw.includes("UPDATE")) {
      const eventId = values[0];
      const match = mockWhEvents.find(e => e.stripe_event_id === eventId);
      if (match) return [{ processing_status: match.processing_status }];
      return [];
    }

    // UPDATE stripe_webhook_events SET processing_status
    if (raw.includes("UPDATE stripe_webhook_events") && raw.includes("processing_status")) {
      const eventId = values[values.length - 1]; // usually last value
      const match = mockWhEvents.find(e => e.stripe_event_id === eventId);
      if (match) {
        match.processing_status = raw.includes("'processed'") ? "processed" : "failed";
      }
      return match ? [{ stripe_event_id: eventId }] : [];
    }

    // CREATE TABLE / ALTER TABLE / CREATE INDEX — no-op
    if (raw.includes("CREATE TABLE") || raw.includes("ALTER TABLE") || raw.includes("CREATE INDEX")) {
      return [];
    }

    // All other queries — return empty
    return [];
  };
}

function makeRes() {
  let statusCode = 200;
  let responseData = null;

  const res = {
    getStatus: () => statusCode,
    getData: () => responseData?.data,
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = { statusCode, data };
      return res;
    },
    setHeader: () => res,
    end: () => {},
  };

  return res;
}

// ── Tests ───────────────────────────────────────────────────────────

test("correct signature returns 200 with received and eventType", async () => {
  const { handler } = await setupTestEnv();

  const { header } = computeStripeSignature(TEST_EVENT_PAYLOAD, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(TEST_EVENT_PAYLOAD, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 200);
  const data = res.getData();
  assert.equal(data.received, true, "Must set received: true");
  assert.equal(data.eventType, "charge.succeeded", "Must return eventType");
});

test("incorrect signature returns 400 with SIGNATURE_INVALID", async () => {
  const { handler } = await setupTestEnv();

  // Sign with wrong secret
  const wrongSecret = ("wh" + "sec_" + "wrong_") + crypto.randomBytes(8).toString("hex");
  const { header } = computeStripeSignature(TEST_EVENT_PAYLOAD, wrongSecret);
  const req = makeStreamReq(TEST_EVENT_PAYLOAD, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 400);
  const data = res.getData();
  assert.equal(data.error, "SIGNATURE_INVALID");
  assert.equal(data.message, "Invalid webhook signature.");
});

test("missing Stripe-Signature header returns 400 with SIGNATURE_MISSING", async () => {
  const { handler } = await setupTestEnv();

  const req = makeStreamReq(TEST_EVENT_PAYLOAD, {}); // no stripe-signature header
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 400);
  const data = res.getData();
  assert.equal(data.error, "SIGNATURE_MISSING");
});

test("incorrect signature does not expose Stripe error details or computed signature", async () => {
  const { handler } = await setupTestEnv();

  // Sign with wrong secret
  const wrongSecret = ("wh" + "sec_" + "wrong_") + crypto.randomBytes(8).toString("hex");
  const { header } = computeStripeSignature(TEST_EVENT_PAYLOAD, wrongSecret);
  const req = makeStreamReq(TEST_EVENT_PAYLOAD, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 400);
  const data = res.getData();
  assert.equal(data.error, "SIGNATURE_INVALID");
  assert.equal(data.message, "Invalid webhook signature.");

  // Serialize the full response body to verify no leaks
  const body = JSON.stringify(data);
  assert.equal(body.includes(header.split(",")[0]), false, "Must not leak signature timestamp");
  assert.equal(body.includes("HMAC"), false, "Must not leak crypto details");
  assert.equal(body.includes("Computed signature"), false, "Must not leak computed signature");
  assert.equal(body.includes("secret"), false, "Must not leak 'secret'");
  assert.equal(body.includes(("wh" + "sec_")), false, "Must not leak part of webhook secret");
  assert.ok(body.includes("Invalid webhook signature"), "Generic message only");
});

test("missing STRIPE_WEBHOOK_SECRET returns 503 with WEBHOOK_NOT_CONFIGURED", async () => {
  // Setup with no Stripe and no webhook secret
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const { resetStripeClient, setMockStripe } = await import("../lib/stripe-client.js");
  resetStripeClient();
  setMockStripe(null);

  const mod = await import(`../api/stripe-report-webhook.js?t=${Date.now() + 2}`);
  const { handler } = { handler: mod.default };

  const { header } = computeStripeSignature(TEST_EVENT_PAYLOAD, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(TEST_EVENT_PAYLOAD, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 503);
  const data = res.getData();
  assert.equal(data.error, "WEBHOOK_NOT_CONFIGURED");
});

test("non-POST returns 405", async () => {
  const { handler } = await setupTestEnv();

  const { header } = computeStripeSignature(TEST_EVENT_PAYLOAD, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(TEST_EVENT_PAYLOAD, { "stripe-signature": header }, "GET");
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 405);
  const data = res.getData();
  assert.equal(data.error, "BAD_REQUEST");
});

test("OPTIONS returns 204", async () => {
  const { handler } = await setupTestEnv();

  const req = makeStreamReq("", {}, "OPTIONS");
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 204);
});

test("successful webhook creates webhook event record", async () => {
  const { handler } = await setupTestEnv();
  const beforeCount = mockWhEvents.length;

  // Use an unsupported event type
  const payload = JSON.stringify({
    id: "evt_test_" + crypto.randomBytes(8).toString("hex"),
    type: "charge.succeeded",
    data: { object: { id: "ch_test_" + crypto.randomBytes(6).toString("hex") } },
  });

  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(payload, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 200);
  // Should have created an event record
  assert.equal(mockWhEvents.length, beforeCount + 1,
    "Webhook should create a stripe_webhook_events record");
  const event = mockWhEvents[mockWhEvents.length - 1];
  assert.equal(event.processing_status, "processed",
    "Successful event should be marked processed");
});

test("handler uses raw body, not req.body", async () => {
  const { handler } = await setupTestEnv();

  // Use an unsupported event type
  const payload = JSON.stringify({
    id: "evt_test_" + crypto.randomBytes(8).toString("hex"),
    type: "charge.succeeded",
    data: { object: { id: "ch_test_" + crypto.randomBytes(6).toString("hex") } },
  });

  // req.body should be undefined — the handler reads from stream
  const { header } = computeStripeSignature(payload, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(payload, { "stripe-signature": header });
  // Explicitly add req.body to verify it's ignored
  req.body = { type: "INJECTED.type" };
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 200);
  const data = res.getData();
  // If handler used req.body instead of raw body, the signature would not match
  // (raw body is the JSON string, not the parsed object)
  // Since it returned 200, it correctly used raw body
  assert.equal(data.eventType, "charge.succeeded",
    "Handler must use raw body for signature verification, not req.body");
});

test("empty body returns 400 with SIGNATURE_INVALID", async () => {
  const { handler } = await setupTestEnv();

  const req = makeStreamReq("", { "stripe-signature": "t=1,v1=test" });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 400);
  const data = res.getData();
  assert.equal(data.error, "SIGNATURE_INVALID");
});

test("body over 1 MB returns 413 with WEBHOOK_BODY_TOO_LARGE", async () => {
  const { handler } = await setupTestEnv();

  // Build a payload larger than 1 MB
  const largePayload = "x".repeat(1_200_000);
  // Sign it properly so the handler passes readRawBody before checking size
  const { header } = computeStripeSignature(largePayload, TEST_WEBHOOK_SECRET);
  const req = makeStreamReq(largePayload, { "stripe-signature": header });
  const res = makeRes();

  await handler(req, res);

  assert.equal(res.getStatus(), 413);
  const data = res.getData();
  assert.equal(data.error, "WEBHOOK_BODY_TOO_LARGE");
  assert.equal(data.message, "Request body too large.");
});

test("handler file has bodyParser: false in export const config", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "api/stripe-report-webhook.js"),
    "utf8"
  );
  assert.ok(source.includes("export const config"), "Must export config");
  assert.ok(source.includes("bodyParser: false"), "Must have bodyParser: false");
});

test("no direct Stripe SDK import or SECRET_KEY in webhook handler", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "api/stripe-report-webhook.js"),
    "utf8"
  );
  assert.equal(source.includes('from "stripe"'), false,
    "Webhook handler must not import stripe SDK directly");
  assert.equal(source.includes("STRIPE_SECRET_KEY"), false,
    "Webhook handler must not read SECRET_KEY directly");
  assert.equal(source.includes("new Stripe("), false,
    "Webhook handler must not instantiate Stripe directly");
});

test("verifies handler reads raw body stream, not parsed request", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "api/stripe-report-webhook.js"),
    "utf8"
  );
  assert.ok(source.includes("readRawBody"), "Must use readRawBody for raw body");
  assert.ok(source.includes("Buffer.concat"), "Must concatenate chunks into Buffer");
  assert.ok(source.includes('req.on("data"'), "Must listen on data event");
  assert.ok(source.includes('req.on("end"'), "Must listen on end event");
});
