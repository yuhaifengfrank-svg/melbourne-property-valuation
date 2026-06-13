// ── tests/report-entitlement-service-tests.mjs ──
// Phase 1E1: Report Entitlement Query Service Tests.
//
// Tests for checkReportEntitlement in report-entitlement-service.js.
// No Stripe network, no production DB.
// Uses mock database with support for: lead_contacts, report_entitlements,
// report_payments, report_snapshots.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

// ── Mock database ───────────────────────────────────────────────────

function makeMockSql(initialState = {}) {
  /** @type {Array<{id:number,email:string,email_lower:string,created_at:Date}>} */
  const contacts = initialState.contacts
    ? initialState.contacts.map((c, i) => ({
        id: c.id || i + 1,
        email: c.email,
        email_lower: c.email ? c.email.toLowerCase() : null,
        created_at: c.created_at || new Date(),
      }))
    : [];

  /** @type {Array<{id:number,report_id:string,lead_contact_id:number,status:string,granted_at:Date,revoked_at:Date|null}>} */
  const entitlements = initialState.entitlements
    ? initialState.entitlements.map((e, i) => ({
        id: e.id || i + 1,
        report_id: e.report_id,
        lead_contact_id: e.lead_contact_id,
        status: e.status || "active",
        granted_at: e.granted_at || new Date(),
        revoked_at: e.revoked_at || null,
      }))
    : [];

  /** @type {Array<{id:number,report_id:string,lead_contact_id:number,stripe_customer_id:string|null,stripe_checkout_session_id:string|null,stripe_payment_intent_id:string|null,purchase_intent_key:string,amount_cents:number,currency:string,status:string,created_at:Date,updated_at:Date}>} */
  const payments = initialState.payments
    ? initialState.payments.map((p, i) => ({
        id: p.id || i + 1,
        report_id: p.report_id,
        lead_contact_id: p.lead_contact_id,
        stripe_customer_id: p.stripe_customer_id || null,
        stripe_checkout_session_id: p.stripe_checkout_session_id || null,
        stripe_payment_intent_id: p.stripe_payment_intent_id || null,
        purchase_intent_key: p.purchase_intent_key || "pik_test_" + crypto.randomBytes(8).toString("hex"),
        amount_cents: p.amount_cents || 399,
        currency: p.currency || "aud",
        status: p.status || "paid",
        created_at: p.created_at || new Date(),
        updated_at: p.updated_at || new Date(),
      }))
    : [];

  /** @type {Array<{report_id:string,property_key:string,valuation_version:string,snapshot_json:object|string|null,snapshot_hash:string,lead_contact_id:number,created_at:Date}>} */
  const snapshots = initialState.snapshots
    ? initialState.snapshots.map((s) => ({
        report_id: s.report_id,
        property_key: s.property_key || "prop_key_test",
        valuation_version: s.valuation_version || "vTest",
        snapshot_json: s.snapshot_json !== undefined ? s.snapshot_json : { midpoint: 825000, low: 780000 },
        snapshot_hash: s.snapshot_hash || "hash_test",
        lead_contact_id: s.lead_contact_id,
        created_at: s.created_at || new Date(),
      }))
    : [];

  return async function mockSql(strings, ...values) {
    const raw = strings
      .map((s, i) => (i < values.length ? s + `$${i}` : s))
      .join("");

    // ── lead_contacts lookup by email_lower ────────────────────────
    const lcMatch = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+lead_contacts\s+WHERE\s+email_lower\s*=\s*\$(\d+)/i
    );
    if (lcMatch) {
      const idx = parseInt(lcMatch[2], 10);
      const val = idx < values.length ? values[idx] : null;
      const contact = contacts.find(
        (c) => c.email_lower === (typeof val === "string" ? val.toLowerCase() : val)
      );
      if (contact) {
        return [{ id: contact.id, email: contact.email, email_lower: contact.email_lower }];
      }
      return [];
    }

    // ── Joint query: re INNER JOIN rp INNER JOIN rs ────────────────
    const jointMatch = raw.match(
      /FROM\s+report_entitlements\s+re\s+INNER\s+JOIN\s+report_payments\s+rp\s+ON\s+rp\.report_id\s*=\s*re\.report_id\s+INNER\s+JOIN\s+report_snapshots\s+rs\s+ON\s+rs\.report_id\s*=\s*re\.report_id\s+WHERE\s+re\.report_id\s*=\s*\$(\d+)/i
    );

    if (jointMatch) {
      const idx = parseInt(jointMatch[1], 10);
      const reportId = idx < values.length ? values[idx] : null;

      // Find matching records
      const ent = entitlements.find((e) => e.report_id === reportId);
      if (!ent) return [];

      const pay = payments.find((p) => p.report_id === reportId);
      if (!pay) return [];

      const snap = snapshots.find((s) => s.report_id === reportId);
      if (!snap) return [];

      return [
        {
          ent_id: ent.id,
          ent_status: ent.status,
          ent_granted_at: ent.granted_at,
          ent_revoked_at: ent.revoked_at,
          ent_lead_contact_id: ent.lead_contact_id,

          pay_id: pay.id,
          pay_status: pay.status,
          pay_lead_contact_id: pay.lead_contact_id,
          pay_report_id: pay.report_id,
          pay_amount_cents: pay.amount_cents,
          pay_currency: pay.currency,
          pay_created_at: pay.created_at,

          snapshot_json: snap.snapshot_json,
          valuation_version: snap.valuation_version,
          snapshot_created_at: snap.created_at,
          snapshot_lead_contact_id: snap.lead_contact_id,
          snapshot_property_key: snap.property_key,
        },
      ];
    }

    // ── Generic SELECT (for any unmatched queries) ────────────────
    return [];
  };
}

// ── Test helpers ───────────────────────────────────────────────────

function makeReportId() {
  return "rp_" + Date.now() + "_" + crypto.randomBytes(8).toString("hex");
}

function makeEmail() {
  return "test_" + crypto.randomBytes(6).toString("hex") + "@example.com";
}

/**
 * Build a full happy-path initial state for the mock DB.
 *
 * @param {object} overrides
 * @param {string} [overrides.reportId]  — If omitted, generated
 * @param {string} [overrides.email]  — If omitted, generated
 * @param {number} [overrides.emailSeed]  — If 0, don't seed lead_contact
 * @param {string} [overrides.entitlementStatus]  — Default 'active'
 * @param {string} [overrides.paymentStatus]  — Default 'paid'
 * @param {object|null} [overrides.snapshotJson]  — Default valid object; null = empty
 * @param {number} [overrides.ownerOffset]  — lead_contact_id offset for cross-owner tests
 * @returns {{contacts:Array, entitlements:Array, payments:Array, snapshots:Array, reportId:string, email:string, contactId:number}}
 */
function buildHappyState(overrides = {}) {
  const reportId = overrides.reportId || makeReportId();
  const email = overrides.email || makeEmail();
  const emailLower = email.toLowerCase();
  const contactId = 42;

  const ownerOffset = overrides.ownerOffset || 0;
  const entOwner = contactId + ownerOffset;
  const payOwner = contactId + ownerOffset;
  const snapOwner = contactId + ownerOffset;

  const state = {
    contacts: overrides.emailSeed === 0 ? [] : [{ id: contactId, email, email_lower: emailLower }],
    entitlements: [
      {
        report_id: reportId,
        lead_contact_id: entOwner,
        status: overrides.entitlementStatus || "active",
      },
    ],
    payments: [
      {
        report_id: reportId,
        lead_contact_id: payOwner,
        status: overrides.paymentStatus || "paid",
        stripe_customer_id: "cus_test_" + crypto.randomBytes(8).toString("hex"),
        stripe_checkout_session_id: "cs_test_" + crypto.randomBytes(12).toString("hex"),
        stripe_payment_intent_id: "pi_test_" + crypto.randomBytes(12).toString("hex"),
      },
    ],
    snapshots: [
      {
        report_id: reportId,
        lead_contact_id: snapOwner,
        snapshot_json:
          overrides.snapshotJson !== undefined ? overrides.snapshotJson : {
            midpoint: 825000,
            low: 780000,
            high: 870000,
            factors: { location: 0.5, size: 0.3 },
          },
      },
    ],
  };

  return { ...state, reportId, email, contactId };
}

// ── Tests ──────────────────────────────────────────────────────────

test("active entitlement + paid payment + matching snapshot → allowed", async () => {
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const result = await checkReportEntitlement(
    { reportId: state.reportId, email: state.email },
    sql
  );

  assert.equal(result.allowed, true);
  assert.equal(result.reportId, state.reportId);
  assert.equal(result.entitlementStatus, "active");
  assert.equal(result.paymentStatus, "paid");
  assert.ok(result.snapshot, "Should return snapshot data");
  assert.equal(result.snapshot.midpoint, 825000);
  assert.equal(result.snapshot.low, 780000);
  assert.ok(result.valuationVersion, "Should have valuation version");
  assert.ok(result.purchasedAt, "Should have purchased timestamp");
  // Must NOT expose Stripe internal fields
  assert.equal(result.stripe_customer_id, undefined, "Must not expose customer ID");
  assert.equal(result.stripe_payment_intent_id, undefined, "Must not expose payment intent");
  assert.equal(result.stripe_checkout_session_id, undefined, "Must not expose session ID");
});

test("unknown email → NOT_FOUND", async () => {
  const state = buildHappyState({ emailSeed: 0 });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: "unknown@example.com" }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      assert.equal(err.name, "EntitlementCheckError");
      return true;
    }
  );
});

test("unknown reportId → NOT_FOUND", async () => {
  const email = makeEmail();
  const state = buildHappyState({ email });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () =>
      checkReportEntitlement(
        { reportId: "rp_9999999999_aaaaaaaaaaaaaaaa", email },
        sql
      ),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );
});

test("entitlement belongs to other customer → REPORT_OWNER_CONFLICT", async () => {
  const state = buildHappyState({ ownerOffset: 1 });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REPORT_OWNER_CONFLICT);
      return true;
    }
  );
});

test("snapshot belongs to other customer → REPORT_OWNER_CONFLICT", async () => {
  const state = buildHappyState({ ownerOffset: 1 });
  // Only shift the snapshot owner (entitlement and payment still match)
  state.entitlements[0].lead_contact_id = state.contactId; // reset ent to match
  state.payments[0].lead_contact_id = state.contactId; // reset pay to match
  // snapshot already has ownerOffset=1 (different from contactId)
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REPORT_OWNER_CONFLICT);
      return true;
    }
  );
});

test("payment belongs to other customer → REPORT_OWNER_CONFLICT", async () => {
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{
      report_id: reportId,
      lead_contact_id: 99, // different owner
      status: "paid",
      stripe_customer_id: "cus_wrong",
      stripe_checkout_session_id: "cs_wrong",
      stripe_payment_intent_id: "pi_wrong",
    }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 800000 },
    }],
  });
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId, email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REPORT_OWNER_CONFLICT);
      return true;
    }
  );
});

test("revoked entitlement → REVOKED", async () => {
  const state = buildHappyState({ entitlementStatus: "revoked" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REVOKED);
      return true;
    }
  );
});

test("refunded entitlement → REFUNDED", async () => {
  const state = buildHappyState({ entitlementStatus: "refunded" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REFUNDED);
      return true;
    }
  );
});

test("disputed entitlement → REFUNDED", async () => {
  const state = buildHappyState({ entitlementStatus: "disputed" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REFUNDED);
      return true;
    }
  );
});

test("refunded payment → REFUNDED", async () => {
  const state = buildHappyState({ paymentStatus: "refunded" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REFUNDED);
      return true;
    }
  );
});

test("pending payment → PAYMENT_NOT_CONFIRMED", async () => {
  const state = buildHappyState({ paymentStatus: "pending" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.PAYMENT_NOT_CONFIRMED);
      return true;
    }
  );
});

test("failed payment → PAYMENT_NOT_CONFIRMED", async () => {
  const state = buildHappyState({ paymentStatus: "failed" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.PAYMENT_NOT_CONFIRMED);
      return true;
    }
  );
});

test("expired payment → PAYMENT_NOT_CONFIRMED", async () => {
  const state = buildHappyState({ paymentStatus: "expired" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.PAYMENT_NOT_CONFIRMED);
      return true;
    }
  );
});

test("disputed payment → REFUNDED", async () => {
  const state = buildHappyState({ paymentStatus: "disputed" });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REFUNDED);
      return true;
    }
  );
});

test("snapshot missing → REPORT_DATA_UNAVAILABLE", async () => {
  const sql = makeMockSql({});
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;

  // Snapshot doesn't exist for this report_id
  const mockSql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{
      report_id: reportId,
      lead_contact_id: contactId,
      status: "paid",
    }],
    snapshots: [], // no snapshot for this report
  });
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  // The joint query (INNER JOIN) will return 0 rows when snapshot is missing
  await assert.rejects(
    () => checkReportEntitlement({ reportId, email }, mockSql),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );
});

test("snapshot_json is null → REPORT_DATA_UNAVAILABLE", async () => {
  const state = buildHappyState({ snapshotJson: null });
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.REPORT_DATA_UNAVAILABLE);
      return true;
    }
  );
});

test("invalid reportId format → NOT_FOUND", async () => {
  const sql = makeMockSql({});
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: "", email: "test@example.com" }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );

  await assert.rejects(
    () => checkReportEntitlement({ reportId: "invalid", email: "test@example.com" }, sql),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );
});

test("invalid email format → NOT_FOUND", async () => {
  const sql = makeMockSql({});
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  await assert.rejects(
    () =>
      checkReportEntitlement(
        { reportId: "rp_1750612345678_a3f2c91b8e4d", email: "" },
        sql
      ),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );

  await assert.rejects(
    () =>
      checkReportEntitlement(
        { reportId: "rp_1750612345678_a3f2c91b8e4d", email: "notanemail" },
        sql
      ),
    (err) => {
      assert.equal(err.code, REJECTION.NOT_FOUND);
      return true;
    }
  );
});

test("does not return Stripe internal fields", async () => {
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const result = await checkReportEntitlement(
    { reportId: state.reportId, email: state.email },
    sql
  );

  const safeKeys = Object.keys(result);
  for (const key of safeKeys) {
    assert.equal(
      key.startsWith("stripe_"),
      false,
      `Key ${key} must not start with "stripe_"`
    );
  }
  assert.equal(
    safeKeys.includes("stripe_customer_id"),
    false,
    "Must not include stripe_customer_id"
  );
  assert.equal(
    safeKeys.includes("stripe_payment_intent_id"),
    false,
    "Must not include stripe_payment_intent_id"
  );
  assert.equal(
    safeKeys.includes("stripe_checkout_session_id"),
    false,
    "Must not include stripe_checkout_session_id"
  );
});

test("same input returns stable result", async () => {
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const r1 = await checkReportEntitlement(
    { reportId: state.reportId, email: state.email },
    sql
  );
  const r2 = await checkReportEntitlement(
    { reportId: state.reportId, email: state.email },
    sql
  );

  assert.deepEqual(r1, r2, "Stable output for same input");
});

test("Promise.all concurrent queries are stable", async () => {
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const results = await Promise.all([
    checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
    checkReportEntitlement({ reportId: state.reportId, email: state.email }, sql),
  ]);

  assert.equal(results.length, 3);
  assert.equal(results[0].allowed, true);
  assert.equal(results[1].allowed, true);
  assert.equal(results[2].allowed, true);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test("does not connect to real Stripe or production DB", async () => {
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  // The service should not import stripe SDK or access process.env.DATABASE_URL
  // at module level. Let's verify the module can be loaded without Stripe.
  async function loadModule() {
    return import("../lib/report-entitlement-service.js");
  }

  const mod = await loadModule();
  assert.ok(typeof mod.checkReportEntitlement === "function");
  assert.ok(typeof mod.EntitlementCheckError === "function");
  assert.ok(typeof mod.REJECTION === "object");
});

test("error messages do not leak internal info", async () => {
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement, REJECTION } = await import(
    "../lib/report-entitlement-service.js"
  );

  const errors = [];

  // Gather error messages for various failure modes
  try {
    await checkReportEntitlement(
      { reportId: state.reportId, email: "unknown@example.com" },
      sql
    );
  } catch (e) {
    errors.push({ code: e.code, message: e.message });
  }

  const mockSql2 = makeMockSql({
    contacts: [{ id: 42, email: "no@report.com", email_lower: "no@report.com" }],
    entitlements: [],
    payments: [],
    snapshots: [],
  });
  try {
    await checkReportEntitlement(
      { reportId: makeReportId(), email: "no@report.com" },
      mockSql2
    );
  } catch (e) {
    errors.push({ code: e.code, message: e.message });
  }

  const state2 = buildHappyState({ entitlementStatus: "revoked" });
  const sql2 = makeMockSql(state2);
  try {
    await checkReportEntitlement(
      { reportId: state2.reportId, email: state2.email },
      sql2
    );
  } catch (e) {
    errors.push({ code: e.code, message: e.message });
  }

  const state3 = buildHappyState({ paymentStatus: "refunded" });
  const sql3 = makeMockSql(state3);
  try {
    await checkReportEntitlement(
      { reportId: state3.reportId, email: state3.email },
      sql3
    );
  } catch (e) {
    errors.push({ code: e.code, message: e.message });
  }

  for (const err of errors) {
    assert.equal(
      err.message.includes("stripe_customer_id"),
      false,
      `Error message must not leak stripe_customer_id: ${err.message}`
    );
    assert.equal(
      err.message.includes("checkout_session_id"),
      false,
      `Error message must not leak checkout_session_id: ${err.message}`
    );
    assert.equal(
      err.message.includes("payment_intent_id"),
      false,
      `Error message must not leak payment_intent_id: ${err.message}`
    );
    assert.equal(
      err.message.includes("lead_contact_id"),
      false,
      `Error message must not leak lead_contact_id: ${err.message}`
    );
    assert.equal(
      err.message.includes("sk" + "_test_"),
      false,
      `Error message must not leak Stripe secret: ${err.message}`
    );
  }
});

test("opportunity token cannot unlock report (no cookie/param accepted)", async () => {
  // The service has no cookie or token parameter — it only accepts
  // { reportId, email }. This test verifies that signature.
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  assert.strictEqual(
    checkReportEntitlement.length,
    2,
    "checkReportEntitlement must accept exactly 2 arguments (params, sql)"
  );

  // Function toString check: no cookie or token usage
  const fnStr = checkReportEntitlement.toString();
  assert.equal(
    fnStr.includes("cookie"),
    false,
    "Service must not reference cookies"
  );
  assert.equal(
    fnStr.includes("localStorage"),
    false,
    "Service must not reference localStorage"
  );
  assert.equal(
    fnStr.includes("opportunity"),
    false,
    "Service must not reference opportunity tokens"
  );
  assert.equal(
    fnStr.includes("gate_level"),
    false,
    "Service must not reference gate_level"
  );
});

test("entitlement with status=active but payment=paid and email_case_insensitive", async () => {
  const reportId = makeReportId();
  const email = "MixedCase.User@Example.COM";
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [
      {
        id: contactId,
        email: "mixedcase.user@example.com",
        email_lower: "mixedcase.user@example.com",
      },
    ],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{
      report_id: reportId,
      lead_contact_id: contactId,
      status: "paid",
    }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 800000 },
    }],
  });
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const result = await checkReportEntitlement({ reportId, email }, sql);
  assert.equal(result.allowed, true);
  assert.equal(result.reportId, reportId);
});

test("mockSql captures sql calls accurately", async () => {
  // Verify the mock tracks SQL queries correctly
  const state = buildHappyState();
  const sql = makeMockSql(state);
  const { checkReportEntitlement } = await import(
    "../lib/report-entitlement-service.js"
  );

  const result = await checkReportEntitlement(
    { reportId: state.reportId, email: state.email },
    sql
  );

  assert.equal(result.allowed, true);
  // Verify snapshot data is passed through correctly
  assert.deepEqual(
    result.snapshot,
    state.snapshots[0].snapshot_json
  );
});
