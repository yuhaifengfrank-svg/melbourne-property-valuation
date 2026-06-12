// ── tests/report-refund-webhook-service-tests.mjs ──
// Phase 1D5A: Refund → revoke report entitlement.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import test from "node:test";

process.env.NODE_ENV = "test";

// ── In-memory mock DB ───────────────────────────────────────────────

const mockDb = {
  payments: [],
  entitlements: [],
};
let paySeq = 100;
let entSeq = 100;

function resetDb() {
  mockDb.payments.length = 0;
  mockDb.entitlements.length = 0;
  paySeq = 100;
  entSeq = 100;
}

// ── Mock SQL function ───────────────────────────────────────────────
// Handles all queries used by handleChargeRefunded.

function makeSql() {
  return async function sql(strings, ...values) {
    const raw = strings
      .map((s, i) => (i < values.length ? s + `$${i}` : s))
      .join("");

    // Schema statements — no-op
    if (
      raw.includes("CREATE TABLE") ||
      raw.includes("ALTER TABLE") ||
      raw.includes("CREATE INDEX")
    ) {
      return [];
    }

    // ── SELECT report_payments ──────────────────────────────────
    // Handle: SELECT ... FROM report_payments WHERE stripe_payment_intent_id = X LIMIT 1
    const selPayPI = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+stripe_payment_intent_id\s*=\s*\$(\d+)/i
    );
    if (selPayPI) {
      const selects = selPayPI[1].trim() === "*" ? "*" : selPayPI[1].split(",").map(s => s.trim());
      const idx = parseInt(selPayPI[2], 10);
      const pi = idx < values.length ? values[idx] : null;
      const p = mockDb.payments.find(p => p.stripe_payment_intent_id === pi);
      if (p) {
        const row = selects === "*" ? { ...p } : selects.reduce((o, c) => ({ ...o, [c]: p[c] }), {});
        return [row];
      }
      return [];
    }

    // Handle: SELECT ... FROM report_payments WHERE id = X
    const selPayId = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+report_payments\s+WHERE\s+id\s*=\s*\$(\d+)/i
    );
    if (selPayId) {
      const selects = selPayId[1].trim() === "*" ? "*" : selPayId[1].split(",").map(s => s.trim());
      const idx = parseInt(selPayId[2], 10);
      const pid = idx < values.length ? values[idx] : null;
      const p = mockDb.payments.find(p => p.id === pid);
      if (p) {
        const row = selects === "*" ? { ...p } : selects.reduce((o, c) => ({ ...o, [c]: p[c] }), {});
        return [row];
      }
      return [];
    }

    // ── SELECT report_entitlements ──────────────────────────────
    // Handle: SELECT id, status FROM report_entitlements WHERE report_id = X LIMIT 1
    const selEnt = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+report_entitlements\s+WHERE\s+(.+?)(?:\s+LIMIT\s+\d+)?\s*$/i
    );
    if (selEnt) {
      const selects = selEnt[1].trim() === "*" ? "*" : selEnt[1].split(",").map(s => s.trim());
      let resolved = selEnt[2];
      for (let i = 0; i < values.length; i++) {
        resolved = resolved.replace(
          new RegExp(`\\$${i}`, "g"),
          values[i] !== null ? `'${String(values[i]).replace(/'/g, "''")}'` : "NULL"
        );
      }
      const e = mockDb.entitlements.find(e => {
        // Simple matching: report_id = X
        return resolved.includes(`report_id = '${e.report_id}'`);
      });
      if (e) {
        const row = selects === "*" ? { ...e } : selects.reduce((o, c) => ({ ...o, [c]: e[c] }), {});
        return [row];
      }
      return [];
    }

    // ── CTE: atomic refund + revoke ─────────────────────────────
    if (
      raw.trimStart().startsWith("WITH") &&
      raw.includes("pay AS (") &&
      raw.includes("ent AS (") &&
      raw.includes("UPDATE report_payments")
    ) {
      return handleRefundCte(raw, values);
    }

    return [];
  };
}

// ── Refund CTE handler ──────────────────────────────────────────────

function handleRefundCte(raw, values) {
  // ── Parse entitlement UPDATE ─────────────────────────────────────
  // ent runs FIRST. Only if it succeeds does pay run.
  const entReportMatch = raw.match(/WHERE\s+report_id\s*=\s*\$(\d+)/i);
  const entLeadMatch = raw.match(/lead_contact_id\s*=\s*\$(\d+)/i);
  const entResult = { id: null, status: null, revoked_at: null };
  let entFound = false;

  if (entReportMatch && entLeadMatch) {
    const repIdx = parseInt(entReportMatch[1], 10);
    const leadIdx = parseInt(entLeadMatch[1], 10);
    const repId = repIdx < values.length ? values[repIdx] : null;
    const leadId = leadIdx < values.length ? values[leadIdx] : null;

    const e = mockDb.entitlements.find(
      e => e.report_id === repId && Number(e.lead_contact_id) === Number(leadId) && e.status === "active"
    );
    if (e) {
      e.status = "revoked";
      e.revoked_at = new Date();
      entResult.id = e.id;
      entResult.status = "revoked";
      entResult.revoked_at = e.revoked_at;
      entFound = true;
    }
  }

  // ── Parse payment UPDATE (depends on ent) ────────────────────────
  // pay only runs if ent succeeded.
  const payResult = { id: null, status: null };

  if (entFound) {
    const payWhere = raw.match(/WHERE\s+id\s*=\s*\$(\d+)\s+AND\s+status\s*=\s*'paid'/i);
    if (payWhere) {
      const idx = parseInt(payWhere[1], 10);
      const pid = idx < values.length ? values[idx] : null;
      const p = mockDb.payments.find(p => p.id === pid && p.status === "paid");
      if (p) {
        p.status = "refunded";
        p.updated_at = new Date();
        payResult.id = p.id;
        payResult.status = "refunded";
      }
    }
  }

  // If ent didn't find a matching active row, both ent and pay return nulls
  return [{
    entitlement_id: entResult.id,
    entitlement_status: entResult.status,
    entitlement_revoked_at: entResult.revoked_at,
    payment_id: payResult.id,
    payment_status: payResult.status,
  }];
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeCharge(overrides = {}) {
  const charge = {
    id: overrides.id || "ch_test_" + crypto.randomBytes(8).toString("hex"),
    payment_intent: "pi_test_" + crypto.randomBytes(8).toString("hex"),
    amount_refunded: 1000,
    amount: 1000,
    currency: "aud",
  };
  // Apply overrides AFTER default payment_intent so null can override
  if (overrides.paymentIntent !== undefined) charge.payment_intent = overrides.paymentIntent;
  if (overrides.amountRefunded !== undefined) charge.amount_refunded = overrides.amountRefunded;
  if (overrides.amount !== undefined) charge.amount = overrides.amount;
  if (overrides.id !== undefined) charge.id = overrides.id;
  return charge;
}

function seedPayment(sql, overrides = {}) {
  paySeq++;
  const p = {
    id: paySeq,
    report_id: overrides.report_id || "rpt_test_" + crypto.randomBytes(8).toString("hex"),
    lead_contact_id: overrides.lead_contact_id || 42,
    stripe_customer_id: "cus_test_refund",
    stripe_checkout_session_id: "cs_test_refund_" + crypto.randomBytes(8).toString("hex"),
    stripe_payment_intent_id: overrides.paymentIntent || "pi_test_" + crypto.randomBytes(8).toString("hex"),
    purchase_intent_key: "pik_test_refund_" + crypto.randomBytes(8).toString("hex"),
    amount_cents: overrides.amount_cents !== undefined ? overrides.amount_cents : 399,
    currency: overrides.currency || "aud",
    status: overrides.status || "paid",
    created_at: new Date(),
    updated_at: new Date(),
  };
  mockDb.payments.push(p);
  return p;
}

function seedEntitlement(sql, overrides = {}) {
  entSeq++;
  const e = {
    id: entSeq,
    report_id: overrides.report_id,
    lead_contact_id: overrides.lead_contact_id || 42,
    status: overrides.status || "active",
    granted_at: new Date(),
    revoked_at: overrides.revoked_at || null,
  };
  mockDb.entitlements.push(e);
  return e;
}

// ── Setup ───────────────────────────────────────────────────────────

async function setupEnv(options = {}) {
  resetDb();
  const mockSql = makeSql();

  if (options.seedPayment) {
    seedPayment(mockSql, options.seedPayment);
  }
  if (options.seedEntitlement) {
    seedEntitlement(mockSql, options.seedEntitlement);
  }

  // Dynamic import with cache-bust
  const ts = Date.now();
  // Set env for the module if needed (no env needed for base service)
  const mod = await import(`../lib/report-refund-webhook-service.js?t=${ts}`);
  return {
    handleChargeRefunded: mod.handleChargeRefunded,
    mockDb,
    payments: mockDb.payments,
    entitlements: mockDb.entitlements,
    sql: mockSql,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

test("normal refund revokes entitlement atomically", async () => {
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });
  const result = await env.handleChargeRefunded(charge, env.sql);

  assert.equal(result.refunded, true, "Payment should be refunded");
  assert.equal(result.revoked, true, "Entitlement should be revoked");
  assert.equal(result.alreadyRefunded, false, "Not a repeat");

  // Verify DB state
  assert.equal(env.payments[0].status, "refunded", "Payment marked refunded");
  assert.equal(env.entitlements[0].status, "revoked", "Entitlement marked revoked");
  assert.ok(env.entitlements[0].revoked_at !== null, "revoked_at should be set");
});

test("duplicate refund is idempotent", async () => {
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });

  // First refund
  const r1 = await env.handleChargeRefunded(charge, env.sql);
  assert.equal(r1.refunded, true);

  // Second refund (same payment)
  const r2 = await env.handleChargeRefunded(charge, env.sql);
  assert.equal(r2.refunded, true, "Repeat refund should succeed");
  assert.equal(r2.revoked, true, "Repeat should show revoked");
  assert.equal(r2.alreadyRefunded, true, "Should be flagged as repeat");
});

test("unknown payment_intent rejects", async () => {
  const env = await setupEnv();
  const charge = makeCharge({ paymentIntent: "pi_unknown" });

  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    {
      code: "PAYMENT_NOT_FOUND",
    },
    "Should reject unknown payment_intent"
  );
});

test("amount_refunded of 0 rejects", async () => {
  const env = await setupEnv();
  const charge = makeCharge({ amountRefunded: 0 });

  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    {
      code: "AMOUNT_REFUNDED_ZERO",
    },
    "Should reject amount_refunded=0"
  );
});

test("amount_refunded negative rejects", async () => {
  const env = await setupEnv();
  const charge = makeCharge({ amountRefunded: -1 });

  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    {
      code: "AMOUNT_REFUNDED_ZERO",
    },
    "Should reject negative amount_refunded"
  );
});

test("payment with status pending rejects (not yet paid)", async () => {
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, status: "pending" },
  });

  const charge = makeCharge({ paymentIntent });

  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    {
      code: "PAYMENT_NOT_PAID",
    },
    "Should reject pending payment"
  );
});

test("cross-owner: payment stays paid, entitlement unchanged", async () => {
  // Entitlement exists but belongs to a different lead_contact_id than payment.
  // The CTE must reject — payment must stay paid, entitlement must stay active.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 99 },
  });

  const charge = makeCharge({ paymentIntent });
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "REFUND_ENTITLEMENT_MISMATCH" },
    "Cross-owner refund must reject with REFUND_ENTITLEMENT_MISMATCH"
  );

  // Verify: both payment and entitlement are UNCHANGED
  assert.equal(env.payments[0].status, "paid", "Payment must stay paid");
  assert.equal(env.entitlements[0].status, "active", "Entitlement must stay active");
  assert.equal(Number(env.entitlements[0].lead_contact_id), 99, "Entitlement owner unchanged");
});

test("charge without payment_intent rejects", async () => {
  const env = await setupEnv();
  const charge = makeCharge({ paymentIntent: null });

  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    {
      code: "MISSING_PAYMENT_INTENT",
    },
    "Should reject charge without payment_intent"
  );
});

test("charge object structure invalid rejects", async () => {
  const env = await setupEnv();

  await assert.rejects(
    () => env.handleChargeRefunded(null, env.sql),
    { code: "INVALID_CHARGE" },
    "Should reject null charge"
  );

  await assert.rejects(
    () => env.handleChargeRefunded("not_an_object", env.sql),
    { code: "INVALID_CHARGE" },
    "Should reject non-object charge"
  );
});

test("Promise.all concurrent refund: one succeeds, other gets mismatch (Stripe retries)", async () => {
  // In a concurrent scenario, both callers see payment.status='paid'.
  // Only one's CTE succeeds in updating entitlement+payment.
  // The other's CTE sees entitlement already revoked → REFUND_ENTITLEMENT_MISMATCH.
  // Stripe will retry, then the repeat caller hits the idempotent path.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });

  const results = await Promise.allSettled([
    env.handleChargeRefunded(charge, env.sql),
    env.handleChargeRefunded(charge, env.sql),
  ]);

  // One should fulfill (refunded), one should reject (mismatch due to race)
  const fulfilled = results.filter(r => r.status === "fulfilled");
  const rejected = results.filter(r => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "Exactly one fulfillment");
  assert.equal(rejected.length, 1, "Exactly one rejection");

  // The fulfilled one refunded+revoked
  assert.equal(fulfilled[0].value.refunded, true, "First refund succeeds");
  assert.equal(fulfilled[0].value.revoked, true, "Entitlement revoked");
  assert.equal(fulfilled[0].value.alreadyRefunded, false, "First time");

  // The rejected one got REFUND_ENTITLEMENT_MISMATCH
  assert.equal(rejected[0].reason.code, "REFUND_ENTITLEMENT_MISMATCH",
    "Second caller gets REFUND_ENTITLEMENT_MISMATCH during race");

  // DB state: exactly one update
  assert.equal(env.payments[0].status, "refunded", "Payment is refunded");
  assert.equal(env.entitlements[0].status, "revoked", "Entitlement is revoked");
  assert.equal(env.entitlements.length, 1, "Exactly one entitlement row");

  // Now simulate Stripe retry: third call should be idempotent
  const retryResult = await env.handleChargeRefunded(charge, env.sql);
  assert.equal(retryResult.refunded, true, "Retry succeeds");
  assert.equal(retryResult.revoked, true, "Retry shows revoked");
  assert.equal(retryResult.alreadyRefunded, true, "Retry is idempotent");
});


test("missing entitlement: payment stays paid, entitlement was never created", async () => {
  // No entitlement exists for this report at all.
  // Payment must stay paid — do not refund without revoking first.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    // No seedEntitlement
  });

  const charge = makeCharge({ paymentIntent });
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "REFUND_ENTITLEMENT_MISMATCH" },
    "Missing entitlement must reject"
  );

  assert.equal(env.payments[0].status, "paid", "Payment must stay paid");
  assert.equal(env.entitlements.length, 0, "No entitlement created");
});

test("refunded payment + active entitlement: throws REFUND_STATE_INCONSISTENT", async () => {
  // Abnormal state: payment is refunded but entitlement is still active.
  // Must throw, cannot pretend success.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42, status: "refunded" },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42, status: "active" },
  });

  const charge = makeCharge({ paymentIntent });
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Must throw REFUND_STATE_INCONSISTENT"
  );

  // DB state unchanged
  assert.equal(env.payments[0].status, "refunded", "Payment already refunded");
  assert.equal(env.entitlements[0].status, "active", "Entitlement still active");
  assert.equal(Number(env.entitlements[0].lead_contact_id), 42, "Owner unchanged");
});

test("refunded payment + missing entitlement: throws REFUND_STATE_INCONSISTENT", async () => {
  // Abnromal: payment refunded but no entitlement row exists at all.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42, status: "refunded" },
    // No entitlement
  });

  const charge = makeCharge({ paymentIntent });
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Must throw REFUND_STATE_INCONSISTENT when entitlement is missing"
  );
});

test("refunded payment + wrong-owner entitlement: throws REFUND_STATE_INCONSISTENT", async () => {
  // Abnormal: payment refunded but entitlement belongs to another customer.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42, status: "refunded" },
    seedEntitlement: { report_id: reportId, lead_contact_id: 99, status: "revoked" },
  });

  const charge = makeCharge({ paymentIntent });
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Must throw REFUND_STATE_INCONSISTENT when owner mismatches"
  );
});

test("all failure paths leave no partial writes", async () => {
  // Run several failure scenarios and verify none left partial state.
  const pi1 = "pi_test_no_" + crypto.randomBytes(8).toString("hex");
  const pi2 = "pi_test_no_" + crypto.randomBytes(8).toString("hex");
  const rep1 = "rpt_test_no_" + crypto.randomBytes(8).toString("hex");
  const rep2 = "rpt_test_no_" + crypto.randomBytes(8).toString("hex");

  // Scenario A: cross-owner → both unchanged
  const envA = await setupEnv({
    seedPayment: { paymentIntent: pi1, report_id: rep1, lead_contact_id: 42 },
    seedEntitlement: { report_id: rep1, lead_contact_id: 99 },
  });
  await assert.rejects(
    () => envA.handleChargeRefunded(makeCharge({ paymentIntent: pi1 }), envA.sql),
    { code: "REFUND_ENTITLEMENT_MISMATCH" }
  );
  assert.equal(envA.payments[0].status, "paid", "A: payment unchanged");
  assert.equal(envA.entitlements[0].status, "active", "A: entitlement unchanged");

  // Scenario B: missing entitlement → payment unchanged, no entitlement created
  const envB = await setupEnv({
    seedPayment: { paymentIntent: pi2, report_id: rep2, lead_contact_id: 42 },
  });
  await assert.rejects(
    () => envB.handleChargeRefunded(makeCharge({ paymentIntent: pi2 }), envB.sql),
    { code: "REFUND_ENTITLEMENT_MISMATCH" }
  );
  assert.equal(envB.payments[0].status, "paid", "B: payment unchanged");
  assert.equal(envB.entitlements.length, 0, "B: no entitlement created");

  // Scenario C: pending payment → no refund, no entitlement change
  const pi3 = "pi_test_no_" + crypto.randomBytes(8).toString("hex");
  const rep3 = "rpt_test_no_" + crypto.randomBytes(8).toString("hex");
  const envC = await setupEnv({
    seedPayment: { paymentIntent: pi3, report_id: rep3, lead_contact_id: 42, status: "pending" },
    seedEntitlement: { report_id: rep3, lead_contact_id: 42 },
  });
  await assert.rejects(
    () => envC.handleChargeRefunded(makeCharge({ paymentIntent: pi3 }), envC.sql),
    { code: "PAYMENT_NOT_PAID" }
  );
  assert.equal(envC.payments[0].status, "pending", "C: payment unchanged");
  assert.equal(envC.entitlements[0].status, "active", "C: entitlement unchanged");
});

test("no access to Stripe network or production DB", () => {
  // Verify the module doesn't import any Stripe or DB clients
  const source = fs.readFileSync(
    new URL("../lib/report-refund-webhook-service.js", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes('from "stripe"'), false, "Must not import Stripe SDK");
  assert.equal(source.includes("STRIPE_SECRET_KEY"), false, "Must not reference secret key");
  assert.equal(source.includes("DATABASE_URL"), false, "Must not reference DB URL");
  assert.equal(source.includes("./_db.js"), false, "Must not import _db directly");
  assert.equal(source.includes("new Stripe("), false, "Must not instantiate Stripe");
});

test("error messages do not leak internal info", async () => {
  // This is a meta-test: verify all RefundProcessingError messages
  // don't contain payment IDs, customer IDs, or other sensitive data.

  const env = await setupEnv();

  // MISSING_PAYMENT_INTENT
  try {
    await env.handleChargeRefunded(makeCharge({ paymentIntent: null }), env.sql);
  } catch (e) {
    assert.equal(e.message.includes("pi_"), false, "Must not leak payment_intent");
    assert.equal(e.message.includes("cus_"), false, "Must not leak customer_id");
    assert.equal(e.message.includes("cs_"), false, "Must not leak session_id");
  }

  // PAYMENT_NOT_FOUND
  try {
    await env.handleChargeRefunded(makeCharge({ paymentIntent: "pi_nonexistent" }), env.sql);
  } catch (e) {
    assert.equal(e.message.includes("pi_nonexistent"), false, "Must not leak payment_intent");
    assert.equal(e.message.match(/report_payments/g) === null, true,
      "Must not leak DB table names in sanitized message");
  }
});
