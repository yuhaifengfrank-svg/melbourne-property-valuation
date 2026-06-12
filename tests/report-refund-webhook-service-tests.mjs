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
  delete mockDb._simulatePayRace;
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

    // ── LEFT JOIN recheck (catch path) ────────────────────────────
    // Handle: SELECT rp.status, re.status, re.lead_contact_id
    //         FROM report_payments rp LEFT JOIN report_entitlements re ON ...
    //         WHERE rp.id = X LIMIT 1
    const leftJoinRecheck = raw.match(
      /SELECT\s+([\s\S]+?)\s+FROM\s+report_payments\s+rp\s+LEFT\s+JOIN\s+report_entitlements\s+re\s+ON\s+/i
    );
    if (leftJoinRecheck) {
      const idMatch = raw.match(/WHERE\s+rp\.id\s*=\s*\$(\d+)/i);
      if (idMatch) {
        const idx = parseInt(idMatch[1], 10);
        const pid = idx < values.length ? values[idx] : null;
        const p = mockDb.payments.find(p => p.id === pid);
        if (p) {
          const e = mockDb.entitlements.find(
            e => e.report_id === p.report_id
          );
          return [{
            payment_status: p.status,
            ent_status: e ? e.status : null,
            ent_lead_contact_id: e ? e.lead_contact_id : null,
          }];
        }
      }
      return [];
    }

    return [];
  };
}


// ── Refund CTE handler ──────────────────────────────────────────────

function handleRefundCte(raw, values) {
  // ── Parse entitlement UPDATE ─────────────────────────────────────
  // ent runs FIRST. Only if it succeeds does pay check proceed.
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
  // pay only runs if ent succeeded. If pay fails after ent succeeds,
  // we simulate PostgreSQL's division-by-zero guard: throw an error
  // so the service catches it. Before throwing, ROLL BACK ent.

  const payResult = { id: null, status: null };

  if (entFound) {
    const payWhere = raw.match(/WHERE\s+id\s*=\s*\$(\d+)\s+AND\s+status\s*=\s*'paid'/i);
    if (payWhere) {
      const idx = parseInt(payWhere[1], 10);
      const pid = idx < values.length ? values[idx] : null;
      // Check for simulated race: if _simulatePayRace is set,
      // pretend payment is NOT in 'paid' state for the CTE.
      // The mock will undo ent and throw, simulating the SQL guard.
      const payRaceActive = mockDb._simulatePayRace;
      if (!payRaceActive) {
        const p = mockDb.payments.find(p => p.id === pid && p.status === "paid");
        if (p) {
          p.status = "refunded";
          p.updated_at = new Date();
          payResult.id = p.id;
          payResult.status = "refunded";
        }
      }
    }

    // ── Guard: if ent updated but pay did not (state race) ─────
    // Roll back ent to simulate PostgreSQL statement-level rollback.
    if (payResult.id === null) {
      // Undo ent update
      const entRollback = mockDb.entitlements.find(
        e => e.id === entResult.id
      );
      if (entRollback) {
        entRollback.status = "active";
        entRollback.revoked_at = null;
      }
      // Throw to simulate div-by-zero guard error
      throw new Error("division_by_zero_guard: atomic CTE rolled back");
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

test("concurrent state race: ent rolled back when pay concurrently fails", async () => {
  // Scenario: the initial SELECT sees payment.status='paid'. By the time
  // the CTE runs, payment has changed to a non-'paid' state (concurrent
  // update). The CTE should:
  //   - NOT change entitlement (GDP triggers rollback)
  //   - NOT change payment
  //   - Throw an atomic failure error
  //
  // We simulate this by making the mock CTE handler check a flag.
  // This test also verifies that the service catches the error and
  // produces a meaningful RefundProcessingError, not a raw SQL error.

  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  // Before the CTE runs, change payment status to trigger guard failure.
  // The initial SELECT runs first and finds status='paid'. The CTE handler
  // runs next and sees status has changed.
  // We do this by patching the mockDb directly.
  const charge = makeCharge({ paymentIntent });

  // Strip the CTE handler to temporarily skip the "ent found found" check
  // by flipping payment status just before the CTE.
  // Strategy: wrap the sql function to flip payment status to 'pending'
  // on the second call (after the initial SELECT, before the CTE).

  let callIndex = 0;
  const originalSql = env.sql;

  // We can't easily intercept. Instead, just change payment status
  // before the call, but keep the initial select result cached.
  // Actually, simpler: change the payment status BEFORE calling,
  // but set up our mockDb to have the payment in 'pending' state.
  // No — the initial SELECT needs to return 'paid' for the service
  // to proceed past step 4. But the CTE needs to find it NOT 'paid'.
  //
  // Solution: use the concurrentFlags mechanism on mockDb.
  // The mock CTE handler will check mockDb.concurrentFlags.racePayNotPaid.
  // If set, it skips the payment UPDATE (simulating the race condition).

  // Mark the payment as 'paid' initially (it is — we seeded it as paid).
  // Set a flag for the mock to NOT find the payment in 'paid' state during CTE.
  // The mock handler will see mockDb._simulatePayRace = true and behave
  // as if payment is no longer 'paid'.

  // Set the flag BEFORE calling
  env.mockDb._simulatePayRace = true;

  // The service should throw ATOMIC_UPDATE_FAILED because:
  // ent succeeds → pay fails → guard fires → rollback → re-check → payment still 'paid'
  // (we didn't actually change it, just told the mock to pretend)
  await assert.rejects(
    () => env.handleChargeRefunded(charge, env.sql),
    { code: "ATOMIC_UPDATE_FAILED" },
    "Race condition must throw ATOMIC_UPDATE_FAILED"
  );

  // Verify: entitlement was rolled back to active (not left in revoked half-state)
  const ent = env.entitlements[0];
  assert.equal(ent.status, "active", "Entitlement must be rolled back to active");
  assert.equal(ent.revoked_at, null, "revoked_at must be cleared after rollback");

  // Verify: payment stayed paid (since we simulated it not being paid)
  assert.equal(env.payments[0].status, "paid", "Payment must stay paid");
});



test("catch path: SQL error, payment refunded but entitlement active → STATE_INCONSISTENT", async () => {
  // Catch path must verify both payment AND entitlement state.
  // If payment=refunded but entitlement=active, it's half-state.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });

  // Pre-set state BEFORE calling the service:
  // Payment is 'refunded' (concurrent caller did partial work),
  // Entitlement is still 'active'.
  env.payments[0].status = "refunded";

  // The initial SELECT sees payment.status='refunded'.
  // The service enters the idempotent path (step 3).
  // The idempotent check sees ent status='active' →
  // REFUND_STATE_INCONSISTENT.
  // (This is the non-catch path, which we already test.)

  // We want to test the CATCH path specifically.
  // To enter catch path, the CTE must run and fail.
  // CTE runs only if payment.status != 'refunded'.
  // So payment must be 'paid' at initial SELECT, but the CTE
  // must fail after ent updates.

  // Reset: payment back to paid
  env.payments[0].status = "paid";

  // We need the LEFT JOIN recheck to return payment=refunded + ent=active.
  // The mock's LEFT JOIN handler reads the current state.
  // We can set a flag to make the CTE fail like the guard,
  // then BEFORE the catch recheck, we change the state.

  // This is hard with a purely synchronous mock.
  // Let me take a different approach: simulate the guard error
  // directly by making the sql function throw a mock error
  // at the right time. The service catches it and runs the
  // LEFT JOIN recheck.
  //
  // We wrap env.sql to intercept the CTE call and throw.
  // Then set up the state for the recheck.
  const sql = env.sql;

  // We need: CTE call → throw → catch → recheck with bad state
  // Easiest: set up a state where:
  // 1. initial SELECT returns paid
  // 2. _simulatePayRace makes CTE fail via guard
  // 3. before the catch, we set payment=refunded but keep ent=active
  //
  // Problem: the mock is sync, so step 2 and 3 happen in the same tick.
  // We can't interleave.
  //
  // Cleanest: use a wrapper around sql that does the state change.
  // Count calls: call 1 = initial SELECT, call 2 = the catch path
  // LEFT JOIN. We'll make wrapping simpler.

  // Let's just use a simpler approach: wrap sql to intercept
  // the CTE and inject the bad state.

  let callCount = 0;
  const wrappedSql = async function(...args) {
    // args is template-literaled: args = [strings, ...values]
    callCount++;
    const full = args[0].map((s, i) =>
      i < args[0].length - 1 ? s + "$" + i : s
    ).join("");

    // After the CTE fails (call 2: guard error), set up bad state
    // before the catch path recheck runs (call 3).
    if (callCount === 3) {
      // This is the catch path's LEFT JOIN query.
      // Set payment to 'refunded' but leave ent 'active'.
      env.payments[0].status = "refunded";
    }

    // Let the mock handle normally
    return sql(...args);
  };

  // Set simulate flag so CTE fails
  env.mockDb._simulatePayRace = true;

  await assert.rejects(
    () => env.handleChargeRefunded(charge, wrappedSql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Catch path must reject when payment=refunded but ent still active"
  );

  // Verify DB state: the guard rolled back ent, so both should be
  // in original state... but we manually set payment=refunded in
  // the wrapper. Let's verify the final expected state.
  // The ent was rolled back by the guard, then we set payment=refunded.
  assert.equal(env.entitlements[0].status, "active",
    "Entitlement should be rolled back to active by guard");
  assert.equal(env.payments[0].status, "refunded",
    "Payment should have been set to refunded by wrapper (simulating race)");

  // The catch path handles inconsistent state correctly
  // (payment refunded but entitlement still active → error)
});

test("catch path: SQL error, payment refunded, missing entitlement → STATE_INCONSISTENT", async () => {
  // Entitlement MUST exist for CTE ent to succeed (so guard fires).
  // Then in the catch recheck, we simulate the entitlement being
  // gone: the LEFT JOIN returns ent_status=null.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    // Seed an entitlement so the CTE ent step succeeds
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });
  const sql = env.sql;

  let callCount = 0;
  const wrappedSql = async function(...args) {
    callCount++;
    if (callCount === 3) {
      // Simulate: after guard fired, the catch recheck finds
      // payment=refunded but NO entitlement (ent was rolled back
      // by the guard, then another concurrent caller refunded
      // the payment independently — creating an inconsistent state)
      env.payments[0].status = "refunded";
      // Remove the entitlement to simulate "missing"
      env.entitlements.length = 0;
    }
    return sql(...args);
  };

  env.mockDb._simulatePayRace = true;

  await assert.rejects(
    () => env.handleChargeRefunded(charge, wrappedSql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Catch path must reject when payment=refunded but no entitlement"
  );
});



test("catch path: SQL error, payment refunded, wrong-owner entitlement → STATE_INCONSISTENT", async () => {
  // Simulates worst-case race: a concurrent caller refunded the
  // payment and someone created/modified the entitlement to belong
  // to a different customer. The catch recheck must detect this.
  //
  // To trigger the catch path, ent must succeed in the CTE first.
  // We seed a matching entitlement so CTE ent succeeds.
  // Then in the catch recheck, we change the entitlement owner
  // to simulate the concurrent modification.
  const paymentIntent = "pi_test_" + crypto.randomBytes(8).toString("hex");
  const reportId = "rpt_test_" + crypto.randomBytes(8).toString("hex");
  const env = await setupEnv({
    seedPayment: { paymentIntent, report_id: reportId, lead_contact_id: 42 },
    // Seed a MATCHING entitlement so CTE ent step succeeds
    seedEntitlement: { report_id: reportId, lead_contact_id: 42 },
  });

  const charge = makeCharge({ paymentIntent });
  const sql = env.sql;

  let callCount = 0;
  const wrappedSql = async function(...args) {
    callCount++;
    if (callCount === 3) {
      // Simulate: concurrent process refunded payment AND changed
      // entitlement to a different customer before our check
      env.payments[0].status = "refunded";
      env.entitlements[0].lead_contact_id = 99;
    }
    return sql(...args);
  };

  env.mockDb._simulatePayRace = true;

  await assert.rejects(
    () => env.handleChargeRefunded(charge, wrappedSql),
    { code: "REFUND_STATE_INCONSISTENT" },
    "Catch path must reject when payment=refunded but wrong-owner ent"
  );
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
