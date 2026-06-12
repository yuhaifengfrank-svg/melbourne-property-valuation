// ── Phase 1C3: Report Payment Service Tests ──
//
// Pure DB-logic tests for ensureReportPayment() and markPaymentFailed().
// No Stripe network calls.  Uses mock SQL to simulate DB interactions.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import test from "node:test";

process.env.NODE_ENV = "test";

import { buildPurchaseIntentKey } from "../lib/report-checkout-builder.js";

// ── Mock Database ───────────────────────────────────────────────────
//
// Simulates a Neon-like SQL tagged template with in-memory tables.
// Supports INSERT … ON CONFLICT, SELECT, UPDATE … RETURNING.
// Enforces:
//   - UNIQUE on purchase_intent_key
//   - NOT NULL on lead_contact_id, report_id
//   - status CHECK

const mockDb = {
  payments: [],     // array of payment objects
  entitlements: [], // array of entitlement objects
};

function resetMockDb() {
  mockDb.payments = [];
  mockDb.entitlements = [];
}

/**
 * Create a mock sql tagged-template function.
 * Parses the template to route to the correct table operation.
 */
function createMockSql() {
  return async (strings, ...values) => {
    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");
    return executeSql(raw, values);
  };
}

function executeSql(sql, values) {
  // ── INSERT INTO report_payments … ON CONFLICT … RETURNING * ──
  if (sql.includes("INSERT INTO report_payments") && sql.includes("purchase_intent_key")) {
    // Extract values: [report_id, lead_contact_id, checkout_session_id, purchase_intent_key, amount_cents, currency, status]
    const [reportId, leadContactId, checkoutSessionId, purchaseIntentKey, amountCents, currency, status] = values;

    // Validate required
    if (!reportId) throw new Error("reportId must not be null");
    if (leadContactId == null) throw new Error("leadContactId must not be null");

    // Check for existing by purchase_intent_key
    const existing = mockDb.payments.find(p => p.purchase_intent_key === purchaseIntentKey);

    if (existing) {
      // ON CONFLICT DO UPDATE — merge fields
      if (checkoutSessionId != null) existing.stripe_checkout_session_id = checkoutSessionId;
      if (existing.status === "failed" && status === "pending") existing.status = "pending";
      existing.updated_at = new Date().toISOString();
      return [existing];
    }

    // Create new
    const payment = {
      id: mockDb.payments.length + 1,
      report_id: reportId,
      lead_contact_id: leadContactId,
      stripe_checkout_session_id: checkoutSessionId || null,
      stripe_payment_intent_id: null,
      purchase_intent_key: purchaseIntentKey,
      amount_cents: amountCents || 399,
      currency: currency || "aud",
      status: status || "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockDb.payments.push(payment);
    return [payment];
  }

  // ── SELECT FROM report_entitlements WHERE report_id= AND lead_contact_id= AND status= ──
  if (sql.includes("FROM report_entitlements")) {
    const reportId = values[0];
    const leadContactId = values[1];
    const match = mockDb.entitlements.find(
      e => e.report_id === reportId && e.lead_contact_id === leadContactId && e.status === "active"
    );
    return match ? [match] : [];
  }

  // ── SELECT FROM report_payments WHERE purchase_intent_key= ORDER BY created_at DESC LIMIT 1 ──
  if (sql.includes("FROM report_payments") && sql.includes("purchase_intent_key")) {
    const key = values[0];
    const matches = mockDb.payments
      .filter(p => p.purchase_intent_key === key)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return matches.slice(0, 1);
  }

  // ── UPDATE report_payments SET status='failed' WHERE purchase_intent_key= AND status='pending' RETURNING * ──
  if (sql.includes("UPDATE report_payments") && sql.includes("status = 'failed'")) {
    const key = values[0];
    const payment = mockDb.payments.find(
      p => p.purchase_intent_key === key && p.status === "pending"
    );
    if (payment) {
      payment.status = "failed";
      payment.updated_at = new Date().toISOString();
      return [payment];
    }
    return [];
  }

  throw new Error(`Unhandled mock SQL: ${sql.slice(0, 80)}...`);
}

// ── Module under test ───────────────────────────────────────────────

async function reloadService() {
  return await import("../lib/report-payment-service.js");
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeTestReportId() {
  return "rp_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
}

// ── Tests ───────────────────────────────────────────────────────────

test("creates a pending payment record", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();
  const result = await ensureReportPayment({ reportId, leadContactId: 1 }, sql);

  assert.equal(result.alreadyPurchased, false);
  assert.equal(result.alreadyConsumed, false);
  assert.ok(result.payment, "Must return a payment");
  assert.equal(result.payment.report_id, reportId);
  assert.equal(result.payment.lead_contact_id, 1);
  assert.equal(result.payment.status, "pending");
  assert.equal(result.payment.amount_cents, 399);
  assert.equal(result.payment.currency, "aud");
  assert.ok(result.payment.purchase_intent_key.includes(":valuation_report_399"),
    "Purchase intent key must contain product code");
});

test("same request repeated returns the same payment (idempotency)", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();
  const opts = { reportId, leadContactId: 2, stripeCheckoutSessionId: "cs_test_repeat" };

  const first = await ensureReportPayment(opts, sql);
  const second = await ensureReportPayment(opts, sql);

  assert.equal(first.payment.stripe_checkout_session_id, "cs_test_repeat");
  assert.equal(second.payment.stripe_checkout_session_id, "cs_test_repeat",
    "Second call must reuse same session ID");
  assert.equal(second.alreadyConsumed, true,
    "Second call must indicate already consumed");
  assert.equal(mockDb.payments.length, 1,
    "Only one payment record should exist");
});

test("Promise.all concurrent requests only create one payment", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();
  const opts = { reportId, leadContactId: 3, stripeCheckoutSessionId: "cs_test_concurrent" };

  const [a, b] = await Promise.all([
    ensureReportPayment(opts, sql),
    ensureReportPayment(opts, sql),
  ]);

  // Both must succeed
  assert.ok(a.payment, "First concurrent call must return a payment");
  assert.ok(a.payment.stripe_checkout_session_id, "cs_test_concurrent");
  assert.ok(b.alreadyConsumed || b.payment, "Second concurrent call must resolve");

  // Exactly one payment record
  assert.equal(mockDb.payments.length, 1,
    "Concurrent requests must only create one payment record");

  // Same purchase intent key
  assert.equal(mockDb.payments[0].purchase_intent_key,
    buildPurchaseIntentKey(reportId, 3));
});

test("existing active entitlement returns alreadyPurchased without creating payment", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();

  // Pre-create an entitlement
  mockDb.entitlements.push({
    id: 1,
    report_id: reportId,
    lead_contact_id: 5,
    status: "active",
    granted_at: new Date().toISOString(),
  });

  const result = await ensureReportPayment({ reportId, leadContactId: 5 }, sql);

  assert.equal(result.alreadyPurchased, true,
    "Must indicate already purchased");
  assert.equal(result.payment, null,
    "Must not create a new payment record");
  assert.equal(mockDb.payments.length, 0,
    "No payment record should be created");
});

test("different customers get different purchase intent keys", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();

  const a = await ensureReportPayment({ reportId, leadContactId: 10 }, sql);
  const b = await ensureReportPayment({ reportId, leadContactId: 11 }, sql);

  assert.equal(a.payment.lead_contact_id, 10);
  assert.equal(b.payment.lead_contact_id, 11);
  assert.notEqual(a.payment.purchase_intent_key, b.payment.purchase_intent_key,
    "Different customers must have different purchase intent keys");
  assert.equal(mockDb.payments.length, 2,
    "Two customers = two payments");
});

test("different reports for same customer get different intent keys", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const a = await ensureReportPayment({ reportId: "rp_report_aaa", leadContactId: 7 }, sql);
  const b = await ensureReportPayment({ reportId: "rp_report_bbb", leadContactId: 7 }, sql);

  assert.notEqual(a.payment.purchase_intent_key, b.payment.purchase_intent_key,
    "Different reports must have different intent keys");
  assert.equal(mockDb.payments.length, 2);
});

test("markPaymentFailed updates status to failed", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment, markPaymentFailed } = await reloadService();

  const reportId = makeTestReportId();
  const { payment } = await ensureReportPayment({ reportId, leadContactId: 8, stripeCheckoutSessionId: "cs_test_fail" }, sql);

  const failed = await markPaymentFailed(payment.purchase_intent_key, sql);

  assert.equal(failed.status, "failed", "Status must be updated to failed");
  assert.equal(failed.stripe_checkout_session_id, "cs_test_fail",
    "Checkout session ID must be preserved");
});

test("markPaymentFailed on non-existent key returns null", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { markPaymentFailed } = await reloadService();

  const result = await markPaymentFailed("nonexistent_key", sql);
  assert.equal(result, null, "Non-existent key must return null");
});

test("markPaymentFailed does not overwrite paid status", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment, markPaymentFailed } = await reloadService();

  const reportId = makeTestReportId();
  const { payment } = await ensureReportPayment({ reportId, leadContactId: 9, stripeCheckoutSessionId: "cs_test_paid" }, sql);

  // Manually set to paid
  payment.status = "paid";
  const paidIdx = mockDb.payments.findIndex(p => p.id === payment.id);
  mockDb.payments[paidIdx].status = "paid";

  const result = await markPaymentFailed(payment.purchase_intent_key, sql);
  assert.notEqual(result.status, "failed", "Must not overwrite paid status");
  assert.equal(result.status, "paid", "Paid status must be preserved");
});

test("failed status does not create entitlement", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment, markPaymentFailed } = await reloadService();

  const reportId = makeTestReportId();
  const { payment } = await ensureReportPayment({ reportId, leadContactId: 12 }, sql);

  await markPaymentFailed(payment.purchase_intent_key, sql);

  // Verify no entitlement was created
  const entitlements = mockDb.entitlements;
  assert.equal(entitlements.length, 0, "Failed payment must not create entitlement");
});

test("pending payment without session ID can be updated with session ID", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();
  // Create payment without session ID
  const first = await ensureReportPayment({ reportId, leadContactId: 13 }, sql);
  assert.equal(first.payment.stripe_checkout_session_id, null,
    "First call without session ID must have null");

  // Second call adds session ID
  const second = await ensureReportPayment({ reportId, leadContactId: 13, stripeCheckoutSessionId: "cs_test_updated" }, sql);
  assert.equal(second.payment.stripe_checkout_session_id, "cs_test_updated",
    "Second call must update session ID");
});

test("missing reportId throws", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  await assert.rejects(() => ensureReportPayment({ leadContactId: 1 }, sql),
    { message: /reportId/ });
});

test("invalid leadContactId throws", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();
  const reportId = makeTestReportId();

  await assert.rejects(() => ensureReportPayment({ reportId, leadContactId: 0 }, sql),
    { message: /leadContactId/ });
  await assert.rejects(() => ensureReportPayment({ reportId, leadContactId: -1 }, sql),
    { message: /leadContactId/ });
  await assert.rejects(() => ensureReportPayment({ reportId, leadContactId: "abc" }, sql),
    { message: /leadContactId/ });
});

test("no Stripe network access", () => {
  // Static check: the service module must not import stripe-client
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib/report-payment-service.js"),
    "utf8"
  );
  assert.equal(source.includes("stripe-client.js"), false,
    "Must not import stripe-client");
  assert.equal(source.includes(".stripe."), false,
    "Must not reference Stripe SDK methods");
  assert.equal(source.includes("checkout.sessions"), false,
    "Must not call Stripe checkout API");
});

test("paid payment without active entitlement returns alreadyPurchased: false, paymentPresent: true", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();

  // Pre-create a paid payment (simulates Stripe webhook aftermath)
  mockDb.payments.push({
    id: 99,
    report_id: reportId,
    lead_contact_id: 20,
    stripe_checkout_session_id: "cs_test_paid_no_entitlement",
    stripe_payment_intent_id: "pi_test_paid",
    purchase_intent_key: buildPurchaseIntentKey(reportId, 20),
    amount_cents: 399,
    currency: "aud",
    status: "paid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const result = await ensureReportPayment({ reportId, leadContactId: 20 }, sql);

  // Must NOT claim already purchased (no active entitlement)
  assert.equal(result.alreadyPurchased, false,
    "Paid payment without entitlement must not claim alreadyPurchased");
  // Must indicate payment exists
  assert.equal(result.paymentPresent, true,
    "Must indicate payment is present");
  // Must return the payment
  assert.equal(result.payment.status, "paid",
    "Must return the paid payment record");
  // Must not create a new payment
  assert.equal(mockDb.payments.length, 1,
    "Must not create a new payment record");
});

test("paid payment returns paymentPresent even if entitlements checked first", async () => {
  resetMockDb();
  const sql = createMockSql();
  const { ensureReportPayment } = await reloadService();

  const reportId = makeTestReportId();

  // Both exist — entitlement check happens first
  mockDb.entitlements.push({
    id: 10,
    report_id: reportId,
    lead_contact_id: 21,
    status: "active",
    granted_at: new Date().toISOString(),
  });
  mockDb.payments.push({
    id: 100,
    report_id: reportId,
    lead_contact_id: 21,
    stripe_checkout_session_id: "cs_test_paid_entitled_also",
    purchase_intent_key: buildPurchaseIntentKey(reportId, 21),
    amount_cents: 399,
    currency: "aud",
    status: "paid",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Entitlement wins — returns alreadyPurchased: true
  const result = await ensureReportPayment({ reportId, leadContactId: 21 }, sql);
  assert.equal(result.alreadyPurchased, true,
    "Active entitlement must take priority even with paid payment");
  assert.equal(result.payment, null,
    "No payment returned when entitlement exists");
});
