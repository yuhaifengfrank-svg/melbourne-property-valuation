// ── tests/stripe-webhook-event-service-tests.mjs ──
// Phase 1D2: Webhook Event Idempotency Service Tests.
//
// Tests for claimWebhookEvent, markWebhookProcessed, markWebhookFailed.
// No Stripe network, no production DB.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ── Mock SQL (simulates Neon tagged template) ───────────────────────

function createMockDb(initialRows = []) {
  /** @type {Array<{stripe_event_id:string,event_type:string,processing_status:string,error_message:string|null,received_at:Date,processed_at:Date|null}>} */
  const events = [...initialRows];
  let callLog = [];

  function sql(strings, ...values) {
    const q = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    callLog.push({ query: q, values: [...values] });

    // ── INSERT ... ON CONFLICT ... DO NOTHING RETURNING ──
    if (/INSERT\s+INTO\s+stripe_webhook_events/i.test(q) && /DO\s+NOTHING/i.test(q)) {
      const eventId = values[0];
      const eventType = values[1];
      if (events.some((e) => e.stripe_event_id === eventId)) {
        return [];
      }
      events.push({
        stripe_event_id: eventId,
        event_type: eventType,
        processing_status: "received",
        error_message: null,
        received_at: new Date(),
        processed_at: null,
      });
      return [{ stripe_event_id: eventId, processing_status: "received" }];
    }

    // ── SELECT processing_status WHERE stripe_event_id = $1 ──
    if (/SELECT\s+(.+?)\s+FROM\s+stripe_webhook_events\s+WHERE/i.test(q)) {
      const eventId = values[0];
      return events
        .filter((e) => e.stripe_event_id === eventId)
        .map((e) => ({ processing_status: e.processing_status }));
    }

    // ── INSERT ... ON CONFLICT ... DO UPDATE SET (reclaim failed) ──
    if (/INSERT\s+INTO\s+stripe_webhook_events/i.test(q) && /DO\s+UPDATE\s+SET/i.test(q)) {
      const eventId = values[0];
      const eventType = values[1];
      const existing = events.find((e) => e.stripe_event_id === eventId);
      if (existing) {
        existing.processing_status = "received";
        existing.error_message = null;
        existing.processed_at = null;
        existing.received_at = new Date();
      } else {
        events.push({
          stripe_event_id: eventId,
          event_type: eventType,
          processing_status: "received",
          error_message: null,
          received_at: new Date(),
          processed_at: null,
        });
      }
      return [{ stripe_event_id: eventId, processing_status: "received" }];
    }

    // ── UPDATE stripe_webhook_events SET ... WHERE stripe_event_id = $1 RETURNING ──
    // Needs to match: SET ... 'processed' ... or SET ... 'failed' ...
    if (/UPDATE\s+stripe_webhook_events\s+SET/i.test(q)) {
      const eventId = values[values.length - 1];
      const existing = events.find((e) => e.stripe_event_id === eventId);
      if (!existing) return [];

      if (q.includes("'processed'")) {
        existing.processing_status = "processed";
        existing.processed_at = new Date();
      } else if (q.includes("'failed'")) {
        existing.processing_status = "failed";
        // The error_message value will be one of the earlier params
        const errorValue = values.find((v, i) => i < values.length - 1 && typeof v === "string");
        existing.error_message = errorValue || null;
        existing.processed_at = new Date();
      }
      return [{ stripe_event_id: eventId }];
    }

    return [];
  }

  sql.getEvents = () => [...events];
  sql.getCallLog = () => [...callLog];
  sql.resetCallLog = () => { callLog = []; };

  return sql;
}

// ── Import the service under test ───────────────────────────────────

const service = await import("../lib/stripe-webhook-event-service.js");

// ── Helpers ─────────────────────────────────────────────────────────

function uniqueEventId() {
  return "evt_test_" + crypto.randomBytes(12).toString("hex");
}

// ── Tests ───────────────────────────────────────────────────────────

test("claimWebhookEvent inserts new event and returns claimed=true", async () => {
  const sql = createMockDb();
  const eventId = uniqueEventId();
  const result = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);

  assert.equal(result.claimed, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.status, "received");

  const evts = sql.getEvents();
  assert.equal(evts.length, 1);
  assert.equal(evts[0].stripe_event_id, eventId);
  assert.equal(evts[0].event_type, "checkout.session.completed");
  assert.equal(evts[0].processing_status, "received");
});

test("claimWebhookEvent duplicate returns claimed=false with duplicate=true and processed status", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "processed",
      error_message: null,
      received_at: new Date(),
      processed_at: new Date(),
    },
  ]);

  const result = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(result.claimed, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.status, "processed");
});

test("concurrent Promise.all same event_id only one caller gets claimed=true", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb();

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.claimWebhookEvent(eventId, "checkout.session.completed", sql)
    )
  );

  const claimed = results.filter((r) => r.claimed);
  assert.equal(claimed.length, 1, "Only one caller should claim");
  assert.equal(results.filter((r) => r.duplicate).length, 4, "Four should be duplicates");
  results.forEach((r) => assert.equal(r.status, "received"));
});

test("claimWebhookEvent returns claimed=false for already processed event", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "processed",
      error_message: null,
      received_at: new Date(),
      processed_at: new Date(),
    },
  ]);

  const result = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(result.claimed, false);
  assert.equal(result.duplicate, true);
  assert.equal(result.status, "processed");
});

test("claimWebhookEvent returns claimed=true for failed event (safe retry)", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "failed",
      error_message: "Some transient error",
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  const result = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(result.claimed, true, "Failed events should be re-claimable");
  assert.equal(result.duplicate, false);
  assert.equal(result.status, "received");

  const evts = sql.getEvents();
  const updated = evts.find((e) => e.stripe_event_id === eventId);
  assert.equal(updated.processing_status, "received");
  assert.equal(updated.error_message, null);
});

test("claimWebhookEvent throws on missing eventId", async () => {
  const sql = createMockDb();
  await assert.rejects(
    () => service.claimWebhookEvent("", "checkout.session.completed", sql),
    { message: "eventId is required" }
  );
});

test("claimWebhookEvent throws on null eventId", async () => {
  const sql = createMockDb();
  await assert.rejects(
    () => service.claimWebhookEvent(null, "checkout.session.completed", sql),
    { message: "eventId is required" }
  );
});

test("claimWebhookEvent throws on missing eventType", async () => {
  const sql = createMockDb();
  await assert.rejects(
    () => service.claimWebhookEvent("evt_test_1", "", sql),
    { message: "eventType is required" }
  );
});

test("claimWebhookEvent throws on missing sql", async () => {
  await assert.rejects(
    () => service.claimWebhookEvent("evt_test_1", "checkout.session.completed", null),
    { message: "sql callback is required" }
  );
});

test("markWebhookProcessed updates event to processed with processed_at", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  const result = await service.markWebhookProcessed(eventId, sql);
  assert.equal(result, true);

  const evts = sql.getEvents();
  const updated = evts.find((e) => e.stripe_event_id === eventId);
  assert.equal(updated.processing_status, "processed");
  assert.notEqual(updated.processed_at, null);
});

test("markWebhookProcessed returns false for non-existent event", async () => {
  const sql = createMockDb();
  const result = await service.markWebhookProcessed("evt_nonexistent", sql);
  assert.equal(result, false);
});

test("markWebhookProcessed throws on missing eventId", async () => {
  const sql = createMockDb();
  await assert.rejects(
    () => service.markWebhookProcessed("", sql),
    { message: "eventId is required" }
  );
});

test("markWebhookProcessed throws on missing sql", async () => {
  await assert.rejects(
    () => service.markWebhookProcessed("evt_1", null),
    { message: "sql callback is required" }
  );
});

test("markWebhookFailed updates event to failed with error message", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  const result = await service.markWebhookFailed(eventId, "Connection timeout", sql);
  assert.equal(result, true);

  const evts = sql.getEvents();
  const updated = evts.find((e) => e.stripe_event_id === eventId);
  assert.equal(updated.processing_status, "failed");
  assert.equal(updated.error_message, "Connection timeout");
  assert.notEqual(updated.processed_at, null);
});

test("markWebhookFailed truncates long error messages to 500 chars", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(eventId, "x".repeat(1000), sql);
  const evts = sql.getEvents();
  const updated = evts.find((e) => e.stripe_event_id === eventId);
  assert.ok(updated.error_message.length <= 500, "Should be ≤ 500 chars");
  assert.ok(updated.error_message.endsWith("..."), "Should end with ...");
});

test("markWebhookFailed sanitises webhook secret prefix", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(eventId, `${("wh" + "sec_")}${"a".repeat(40)} mismatch`, sql);
  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.equal(msg.includes("wh" + "sec_"), false, "Must not expose webhook secret prefix");
  assert.ok(msg.includes("***"), "Should be replaced with ***");
});

test("markWebhookFailed sanitises v1= signature hex", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(eventId, `v1=${"a".repeat(64)} mismatch`, sql);
  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.equal(msg.includes("v1=" + "a".repeat(64)), false, "Must not expose full sig");
  assert.ok(msg.includes("v1=***"), "Should be replaced with v1=***");
});

test("markWebhookFailed sanitises t= timestamps", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(eventId, "timestamp t=1234567890 mismatch", sql);
  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.equal(msg.includes("t=1234567890"), false, "Must not expose timestamp");
  assert.ok(msg.includes("t=***"), "Should be replaced with t=***");
});

test("markWebhookFailed sanitises live and test keys", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(
    eventId,
    ("sk_" + "live_" + "abcdefghijklmnopqrstuvwx and " + "sk_" + "test_" + "12345678901234567890 leaked"),
    sql
  );
  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.equal(msg.includes("sk" + "_live_"), false, "Must not expose live secret key");
  assert.equal(msg.includes("sk" + "_test_"), false, "Must not expose test secret key");
  assert.ok(msg.includes("***"), "Should be redacted");
});

test("markWebhookFailed sanitises multiple secret patterns in one error", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  await service.markWebhookFailed(
    eventId,
    `${("wh" + "sec_")}${"b".repeat(32)} and v1=${"c".repeat(64)} mismatch`,
    sql
  );
  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.equal(msg.includes(("wh" + "sec_") + "b".repeat(32)), false);
  assert.equal(msg.includes("v1=" + "c".repeat(64)), false);
  assert.ok(msg.match(/\*\*\*/g)?.length >= 2, "Both secrets redacted");
});

test("markWebhookFailed returns false for non-existent event", async () => {
  const sql = createMockDb();
  const result = await service.markWebhookFailed("evt_nonexistent", "error", sql);
  assert.equal(result, false);
});

test("markWebhookFailed throws on missing eventId", async () => {
  const sql = createMockDb();
  await assert.rejects(
    () => service.markWebhookFailed("", "error", sql),
    { message: "eventId is required" }
  );
});

test("markWebhookFailed throws on missing sql", async () => {
  await assert.rejects(
    () => service.markWebhookFailed("evt_1", "error", null),
    { message: "sql callback is required" }
  );
});

test("markWebhookFailed handles non-string error gracefully", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  const result = await service.markWebhookFailed(eventId, new Error("Something broke"), sql);
  assert.equal(result, true);

  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.ok(msg.includes("Something broke"), "Should extract message from Error object");
});

test("markWebhookFailed handles undefined error gracefully", async () => {
  const eventId = uniqueEventId();
  const sql = createMockDb([
    {
      stripe_event_id: eventId,
      event_type: "checkout.session.completed",
      processing_status: "received",
      error_message: null,
      received_at: new Date(),
      processed_at: null,
    },
  ]);

  const result = await service.markWebhookFailed(eventId, undefined, sql);
  assert.equal(result, true);

  const evts = sql.getEvents();
  const msg = evts.find((e) => e.stripe_event_id === eventId).error_message;
  assert.ok(msg.length > 0, "Should convert undefined to string");
});

test("complete lifecycle: claim → processed", async () => {
  const sql = createMockDb();
  const eventId = uniqueEventId();

  let r = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(r.claimed, true);

  const ok = await service.markWebhookProcessed(eventId, sql);
  assert.equal(ok, true);

  const evts = sql.getEvents();
  const e = evts.find((x) => x.stripe_event_id === eventId);
  assert.equal(e.processing_status, "processed");
  assert.notEqual(e.processed_at, null);
});

test("complete lifecycle: claim → failed → re-claim → processed", async () => {
  const sql = createMockDb();
  const eventId = uniqueEventId();

  // Claim
  let r = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(r.claimed, true);

  // Fail
  const f = await service.markWebhookFailed(eventId, "Transient network error", sql);
  assert.equal(f, true);

  // Re-claim (failed event is re-claimable)
  r = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(r.claimed, true, "Failed event should be re-claimable");
  assert.equal(r.status, "received");

  // Process
  const ok = await service.markWebhookProcessed(eventId, sql);
  assert.equal(ok, true);

  // Verify final state
  const evts = sql.getEvents();
  const e = evts.find((x) => x.stripe_event_id === eventId);
  assert.equal(e.processing_status, "processed");
  assert.equal(e.error_message, null, "error_message cleared on re-claim");
});

test("processed event cannot be re-claimed", async () => {
  const sql = createMockDb();
  const eventId = uniqueEventId();

  await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  await service.markWebhookProcessed(eventId, sql);

  const r = await service.claimWebhookEvent(eventId, "checkout.session.completed", sql);
  assert.equal(r.claimed, false);
  assert.equal(r.duplicate, true);
  assert.equal(r.status, "processed");
});

test("service does not import stripe SDK or read secret env vars", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "lib/stripe-webhook-event-service.js"),
    "utf8"
  );
  assert.equal(source.includes('from "stripe"'), false, "Must not import Stripe SDK");
  assert.equal(source.includes("STRIPE_SECRET_KEY"), false, "Must not read STRIPE_SECRET_KEY");
  assert.equal(source.includes("STRIPE_WEBHOOK_SECRET"), false, "Must not read STRIPE_WEBHOOK_SECRET");
  assert.equal(source.includes("process.env."), false, "Must not read any env vars");
});
