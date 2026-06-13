// ── tests/valuation-full-api-tests.mjs ──
// Phase 1E2: Full valuation report API tests.
//
// Tests for api/valuation-full.js.
// No Stripe network, no production DB.
// Uses setTestSql() to inject mock database.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

// ── Helpers ─────────────────────────────────────────────────────────

function makeReportId() {
  const ts = Date.now();
  const hex = crypto.randomBytes(16).toString("hex");
  return `rp_${ts}_${hex}`;
}

function makeEmail() {
  return `test_${crypto.randomBytes(4).toString("hex")}@example.com`;
}

/**
 * Build a mock SQL tagged template function backed by in-memory state.
 *
 * Supported initialState keys:
 *   contacts: Array<{ id, email, email_lower }>
 *   entitlements: Array<{ report_id, lead_contact_id, status, granted_at?, revoked_at? }>
 *   payments: Array<{ id, report_id, lead_contact_id, status, amount_cents?, currency?, created_at?, updated_at? }>
 *   snapshots: Array<{ report_id, lead_contact_id, snapshot_json, valuation_version?, created_at?, property_key? }>
 */
function makeMockSql(initialState = {}) {
  const contacts = initialState.contacts
    ? initialState.contacts.map((c) => ({
        id: c.id,
        email: c.email,
        email_lower: (c.email_lower || c.email || "").toLowerCase(),
      }))
    : [];

  const ents = initialState.entitlements
    ? initialState.entitlements.map((e) => ({
        id: e.id || 1,
        report_id: e.report_id,
        lead_contact_id: e.lead_contact_id,
        status: e.status || "active",
        granted_at: e.granted_at || new Date(),
        revoked_at: e.revoked_at || null,
      }))
    : [];

  const payments = initialState.payments
    ? initialState.payments.map((p) => ({
        id: p.id || 1,
        report_id: p.report_id,
        lead_contact_id: p.lead_contact_id,
        status: p.status || "paid",
        amount_cents: p.amount_cents || 399,
        currency: p.currency || "aud",
        created_at: p.created_at || new Date(),
        updated_at: p.updated_at || new Date(),
      }))
    : [];

  const snapshots = initialState.snapshots
    ? initialState.snapshots.map((s) => ({
        report_id: s.report_id,
        lead_contact_id: s.lead_contact_id,
        snapshot_json: s.snapshot_json !== undefined ? s.snapshot_json : { midpoint: 825000 },
        valuation_version: s.valuation_version || "vTest",
        created_at: s.created_at || new Date(),
        property_key: s.property_key || "prop_test",
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

    // ── CREATE TABLE / ALTER TABLE / CREATE INDEX (schema init) ──
    const schemaMatch = raw.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX/i);
    if (schemaMatch) {
      return [];
    }

    // ── report_entitlements lookup by report_id (LIMIT 1) ────────
    const entMatch = raw.match(
      /SELECT\s+(.+?)\s+FROM\s+report_entitlements\s+WHERE\s+report_id\s*=\s*\$(\d+)\s+LIMIT\s+1/i
    );
    if (entMatch) {
      const idx = parseInt(entMatch[2], 10);
      const reportId = idx < values.length ? values[idx] : null;
      const match = ents.find((e) => e.report_id === reportId);
      if (match) {
        return [{
          id: match.id,
          status: match.status,
          granted_at: match.granted_at,
          revoked_at: match.revoked_at,
          lead_contact_id: match.lead_contact_id,
        }];
      }
      return [];
    }

    // ── report_payments lookup by report_id (ALL rows, ORDER BY id ASC) ──
    const payMatch = raw.match(
      /FROM\s+report_payments\s+WHERE\s+report_id\s*=\s*\$(\d+)/i
    );
    if (payMatch) {
      const idx = parseInt(payMatch[1], 10);
      const reportId = idx < values.length ? values[idx] : null;
      const matches = payments.filter((p) => p.report_id === reportId);
      return matches.map((m) => ({
        id: m.id,
        status: m.status,
        lead_contact_id: m.lead_contact_id,
        report_id: m.report_id,
        amount_cents: m.amount_cents,
        currency: m.currency,
        created_at: m.created_at,
        updated_at: m.updated_at,
      }));
    }

    // ── report_snapshots lookup by report_id (LIMIT 1) ────────────
    const snapMatch = raw.match(
      /FROM\s+report_snapshots\s+WHERE\s+report_id\s*=\s*\$(\d+)/i
    );
    if (snapMatch) {
      const idx = parseInt(snapMatch[1], 10);
      const reportId = idx < values.length ? values[idx] : null;
      const match = snapshots.find((s) => s.report_id === reportId);
      if (match) {
        return [{
          snapshot_json: match.snapshot_json,
          valuation_version: match.valuation_version,
          created_at: match.created_at,
          lead_contact_id: match.lead_contact_id,
          property_key: match.property_key,
        }];
      }
      return [];
    }

    return [];
  };
}

// ── Build a mock Express req/res for testing ─────────────────────────

function makeRequestResponse(body, method = "POST") {
  const events = {};
  const req = {
    method,
    body: JSON.stringify(body),
    headers: {},
  };
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    _ended: false,
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
      return this;
    },
    end(data) {
      this._ended = true;
      if (data) this._body = data;
      if (typeof this._body !== "string" && this._headers["Content-Type"] === "application/json") {
        try { this._body = JSON.stringify(this._body); } catch {}
      }
      return this;
    },
    json(data) {
      this._body = data;
      this._ended = true;
      return this;
    },
    on(event, fn) { events[event] = fn; return this; },
  };
  return { req, res };
}

// ── Import handler ──────────────────────────────────────────────────

let handler;
let setTestSql;

async function loadHandler() {
  if (!handler) {
    const mod = await import("../api/valuation-full.js");
    handler = mod.default;
    setTestSql = mod.setTestSql;
  }
}

function buildHappyState() {
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const snapshotData = {
    midpoint: 825000,
    low: 785000,
    high: 865000,
    confidence: "high",
    comparables: [
      { address: "1 Test St", salePrice: 800000, distance: 0.5 },
      { address: "2 Test St", salePrice: 850000, distance: 1.2 },
    ],
    valuationVersion: "vTest",
    purchasedAt: new Date().toISOString(),
  };

  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active", granted_at: new Date() }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: snapshotData,
      valuation_version: "vTest",
    }],
  });

  return { reportId, email, sql };
}

// ── Tests ───────────────────────────────────────────────────────────

test("active + paid + matching snapshot → 200", async () => {
  await loadHandler();
  const { reportId, email, sql } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.ok, true);
  assert.equal(res._body.status, "completed");
  assert.equal(res._body.reportId, reportId);
  assert.equal(res._body.entitlementStatus, "active");
  assert.equal(res._body.paymentStatus, "paid");
  assert.ok(res._body.report);
  assert.equal(res._body.report.midpoint, 825000);
  assert.equal(res._body.valuationVersion, "vTest");
  // Must be the stored snapshot, not a re-run
  assert.deepEqual(res._body.report.comparables, [
    { address: "1 Test St", salePrice: 800000, distance: 0.5 },
    { address: "2 Test St", salePrice: 850000, distance: 1.2 },
  ]);
});

test("GET → 405", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({}, "GET");

  await handler(req, res);

  assert.equal(res._status, 405);
  assert.equal(res._body.ok, false);
  assert.equal(res._body.error, "BAD_REQUEST");
  assert.ok(res._headers["Allow"]);
});

test("OPTIONS → 204", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({}, "OPTIONS");

  await handler(req, res);

  assert.equal(res._status, 204);
});

test("missing body → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse(null);

  await handler(req, res);

  assert.equal(res._status, 400);
});

test("invalid body (missing fields) → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({ reportId: "only" });

  await handler(req, res);

  assert.equal(res._status, 400);
  assert.equal(res._body.error, "BAD_REQUEST");
});

test("empty body → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({});

  await handler(req, res);

  assert.equal(res._status, 400);
  assert.equal(res._body.error, "BAD_REQUEST");
});

test("unknown report → 404", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const sql = makeMockSql({});
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 404);
  assert.equal(res._body.error, "REPORT_NOT_FOUND");
});

test("missing entitlement → 403", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_NOT_ENTITLED");
});

test("wrong owner → 403", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: 99, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: 99, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: 99,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_OWNER_CONFLICT");
});

test("pending payment → 402", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "pending" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 402);
  assert.equal(res._body.error, "PAYMENT_NOT_CONFIRMED");
});

test("refunded payment → 403", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "refunded" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_REFUNDED");
});

test("revoked entitlement → 403", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "revoked" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_REVOKED");
});

test("missing / corrupt snapshot → 503", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: null,
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 503);
  assert.equal(res._body.error, "REPORT_DATA_UNAVAILABLE");
});

test("returns stored snapshot (not re-run model)", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;

  // Verify the snapshot returned is exactly what was stored
  const storedSnapshot = {
    midpoint: 750000,
    low: 700000,
    high: 800000,
    propertyType: "house",
    bedrooms: 3,
    bathrooms: 2,
    landSize: 500,
  };

  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: storedSnapshot,
      valuation_version: "v2.1",
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 200);
  assert.deepEqual(res._body.report, storedSnapshot);
  assert.equal(res._body.valuationVersion, "v2.1");
});

test("no Stripe/internal fields leaked in response", async () => {
  await loadHandler();
  const { reportId, email, sql } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId, email });

  await handler(req, res);

  assert.equal(res._status, 200);
  const body = JSON.stringify(res._body);
  // These must never appear in the response
  assert.ok(!body.includes("stripe_customer_id"));
  assert.ok(!body.includes("stripe_payment_intent_id"));
  assert.ok(!body.includes("stripe_checkout_session_id"));
  assert.ok(!body.includes("purchase_intent_key"));
  assert.ok(!body.includes("lead_contact_id"));
  assert.ok(!body.includes("snapshot_hash"));
});

test("client-side allowed/status cannot override", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const email = makeEmail();
  const contactId = 42;

  // Add client-faked fields to body
  const sql = makeMockSql({
    contacts: [{ id: contactId, email, email_lower: email.toLowerCase() }],
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "pending" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: { midpoint: 825000 },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({
    reportId,
    email,
    allowed: true,
    status: "completed",
    paymentStatus: "paid",
  });

  await handler(req, res);

  // Allowed must NOT bypass entitlement check — payment is pending
  assert.equal(res._status, 402);
  assert.equal(res._body.error, "PAYMENT_NOT_CONFIRMED");
});

test("same request returns stable snapshot", async () => {
  await loadHandler();
  const { reportId, email, sql } = buildHappyState();
  setTestSql(sql);
  const { req: r1, res: res1 } = makeRequestResponse({ reportId, email });
  const { req: r2, res: res2 } = makeRequestResponse({ reportId, email });

  await handler(r1, res1);
  await handler(r2, res2);

  assert.equal(res1._status, 200);
  assert.equal(res2._status, 200);
  assert.deepEqual(res1._body.report, res2._body.report);
});

test("unexpected exception returns safe 500", async () => {
  await loadHandler();
  const crashingSql = async () => {
    throw new Error("DB explosion");
  };
  setTestSql(crashingSql);
  const { req, res } = makeRequestResponse({ reportId: makeReportId(), email: makeEmail() });

  await handler(req, res);

  assert.equal(res._status, 500);
  assert.equal(res._body.error, "INTERNAL_ERROR");
  // Must not leak the error message
  assert.ok(!res._body.message || !res._body.message.includes("explosion"));
});

test("does not access real Stripe or production DB", () => {
  assert.equal(typeof process.env.DATABASE_URL === "string" ? "string" : "undefined", "undefined");
  assert.equal(typeof process.env.STRIPE_SECRET_KEY === "string" ? "string" : "undefined", "undefined");
});
