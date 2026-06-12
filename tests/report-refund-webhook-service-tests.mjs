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
  // Parse payment UPDATE: WHERE id = $N AND status = 'paid'
  const payWhere = raw.match(/WHERE\s+id\s*=\s*\$(\d+)\s+AND\s+status\s*=\s*'paid'/i);
  const payResult = { id: null, status: null };

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

  // Parse entitlement UPDATE: WHERE report_id = $N AND lead_contact_id = $N AND status = 'active'
  const entReportMatch = raw.match(/report_id\s*=\s*\$(\d+)/i);
  const entLeadMatch = raw.match(/lead_contact_id\s*=\s*\$(\d+)/i);
  const entResult = { id: null, status: null, revoked_at: null };

  if (payResult.id !== null && entReportMatch && entLeadMatch) {
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
    }
  }

  // If payment didn't update (e.g., not in 'paid' state), ent also won't update
  // because of AND EXISTS (SELECT 1 FROM pay)
  if (payResult.id === null) {
    return [{ payment_id: null, payment_status: null, entitlement_id: null, entitlement_status: null, entitlement_revoked_at: null }];
  }

  return [{
    payment_id: payResult.id,
    payment_status: payResult.status,
    entitlement_id: entResult.id,
    entitlement_status: entResult.status,
    entitlement_revoked_at: entResult.revoked_at,
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

test("payment and entitlement must update together", async () => {
  // If entitlement exists but belongs to a different lead_contact_id than payment,
  // payment should still refund but entitlement should NOT be revoked
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 99 }, // Different owner
  });

  const charge = makeCharge({ paymentIntent });
  const result = await env.handleChargeRefunded(charge, env.sql);

  assert.equal(result.refunded, true, "Payment should be refunded");
  assert.equal(result.revoked, false, "Entitlement for different owner should NOT be revoked");

  // Verify: payment refunded, entitlement unchanged
  assert.equal(env.payments[0].status, "refunded", "Payment marked refunded");
  assert.equal(env.entitlements[0].status, "active", "Other customer's entitlement not revoked");
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

test("Promise.all concurrent refund: only one processes, no double revocation", async () => {
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });

  const results = await Promise.all([
    env.handleChargeRefunded(charge, env.sql),
    env.handleChargeRefunded(charge, env.sql),
  ]);

  // One should process, one should be idempotent
  const original = results.filter(r => !r.alreadyRefunded);
  const repeats = results.filter(r => r.alreadyRefunded);
  assert.equal(original.length, 1, "Exactly one first-time refund");
  assert.equal(repeats.length, 1, "Exactly one idempotent repeat");

  // Both should report refunded=true
  assert.equal(original[0].refunded, true, "First refund succeeds");
  assert.equal(repeats[0].refunded, true, "Repeat refund also reports refunded");

  // Payment refunded exactly once
  assert.equal(env.payments[0].status, "refunded", "Payment is refunded");
  assert.equal(env.entitlements[0].status, "revoked", "Entitlement is revoked");

  // Only one entitlement should exist (no duplicate)
  assert.equal(env.entitlements.length, 1, "Exactly one entitlement row");
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
