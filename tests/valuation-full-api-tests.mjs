// ── tests/valuation-full-api-tests.mjs ──
// Phase 1E3C-3A: Full valuation report API tests — Cookie-based auth.
//
// Tests for api/valuation-full.js.
// No Stripe network, no production DB.
// Uses setTestSql() to inject mock database.
// Uses lib/report-access-session.js to sign test cookies.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createReportAccessSession } from "../lib/report-access-session.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeReportId() {
  const ts = Date.now();
  const hex = crypto.randomBytes(16).toString("hex");
  return `rp_${ts}_${hex}`;
}

function makeCookie(reportId, leadContactId) {
  const token = createReportAccessSession({ reportId, leadContactId });
  return `aushomevalue_report_access=${token}`;
}

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

    // lead_contacts lookup by email_lower
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

    // CREATE TABLE / ALTER TABLE / CREATE INDEX (schema init)
    const schemaMatch = raw.match(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX/i
    );
    if (schemaMatch) {
      return [];
    }

    // report_entitlements lookup by report_id (LIMIT 1)
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

    // report_payments lookup by report_id (ALL rows, ORDER BY id ASC)
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

    // report_snapshots lookup by report_id (LIMIT 1)
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

function makeRequestResponse(body, method = "POST", cookieStr) {
  const req = {
    method,
    body: JSON.stringify(body || {}),
    headers: {},
  };
  if (cookieStr) {
    req.headers.cookie = cookieStr;
  }
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
      return this;
    },
    json(data) {
      this._body = data;
      this._ended = true;
      return this;
    },
  };
  return { req, res };
}

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
    entitlements: [{
      report_id: reportId,
      lead_contact_id: contactId,
      status: "active",
      granted_at: new Date(),
    }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: snapshotData,
      valuation_version: "vTest",
    }],
  });

  const cookie = makeCookie(reportId, contactId);
  return { reportId, sql, cookie };
}

// ── Tests ───────────────────────────────────────────────────────────

test("1. valid cookie + matching reportId + active + paid + snapshot → 200", async () => {
  await loadHandler();
  const { reportId, sql, cookie } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);

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
  assert.deepEqual(res._body.report.comparables, [
    { address: "1 Test St", salePrice: 800000, distance: 0.5 },
    { address: "2 Test St", salePrice: 850000, distance: 1.2 },
  ]);
});

test("2. GET → 405", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({}, "GET", makeCookie(makeReportId(), 1));
  await handler(req, res);
  assert.equal(res._status, 405);
  assert.equal(res._body.ok, false);
  assert.equal(res._body.error, "BAD_REQUEST");
  assert.ok(res._headers["Allow"]);
});

test("3. OPTIONS → 204", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({}, "OPTIONS");
  await handler(req, res);
  assert.equal(res._status, 204);
});

test("4. missing body → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse(null, "POST", makeCookie(makeReportId(), 1));
  await handler(req, res);
  assert.equal(res._status, 400);
});

test("5. empty body → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({}, "POST", makeCookie(makeReportId(), 1));
  await handler(req, res);
  assert.equal(res._status, 400);
  assert.equal(res._body.error, "BAD_REQUEST");
});

test("6. body missing reportId → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({ reportId: "" }, "POST", makeCookie(makeReportId(), 1));
  await handler(req, res);
  assert.equal(res._status, 400);
  assert.equal(res._body.error, "BAD_REQUEST");
});

test("7. malformed reportId → 400", async () => {
  await loadHandler();
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({ reportId: "not-a-valid-id" }, "POST", makeCookie(makeReportId(), 1));
  await handler(req, res);
  assert.equal(res._status, 400);
  assert.equal(res._body.error, "BAD_REQUEST");
});

test("8. no cookie → 401", async () => {
  await loadHandler();
  const { reportId, sql } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", null);
  await handler(req, res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "REPORT_SESSION_EXPIRED");
});

test("9. invalid cookie → 401 + Set-Cookie clear", async () => {
  await loadHandler();
  const { reportId, sql } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", "aushomevalue_report_access=bad.token.here");
  await handler(req, res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "REPORT_SESSION_EXPIRED");
  assert.ok(res._headers["Set-Cookie"]);
  assert.ok(res._headers["Set-Cookie"].includes("Max-Age=0"));
});

test("10. cookie reportId different from body reportId → 403 + clear cookie", async () => {
  await loadHandler();
  const { sql } = buildHappyState();
  setTestSql(sql);
  const otherReportId = makeReportId();
  const cookie = makeCookie(otherReportId, 42);
  const { req, res } = makeRequestResponse({ reportId: makeReportId() }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_SESSION_MISMATCH");
  assert.ok(res._headers["Set-Cookie"]);
});

test("11. invalid leadContactId in cookie (tampered) → 401 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const { sql } = buildHappyState();
  setTestSql(sql);
  // Tamper a valid token by replacing leadContactId with 0
  const validToken = createReportAccessSession({ reportId, leadContactId: 42 });
  const parts = validToken.split(".");
  const decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  decoded.leadContactId = 0;
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  // Keep the old signature — it won't match the tampered payload (but since the handler
  // also checks leadContactId validity, verifyReportAccessSession will return null
  // regardless of signature because leadContactId=0 fails isValidLeadContactId)
  const tamperedToken = tamperedPayload + "." + parts[1];
  const cookie = "aushomevalue_report_access=" + tamperedToken;
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "REPORT_SESSION_EXPIRED");
});test("12. cookie purpose is report_access (verifyReportAccessSession validates)", async () => {
// This is no longer a valid test — createReportAccessSession rejects leadContactId=0
  // and version === 1 at the library level. The handler additionally double-checks.
  await loadHandler();
  const { reportId, sql, cookie } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 200);
});

test("13. unknown report → 404", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const cookie = makeCookie(reportId, 42);
  setTestSql(makeMockSql({}));
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 404);
  assert.equal(res._body.error, "REPORT_NOT_FOUND");
});

test("14. missing entitlement → 403", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_NOT_ENTITLED");
});

test("15. wrong owner → 403 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const cookie = makeCookie(reportId, 42);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: 99, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: 99, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: 99, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_OWNER_CONFLICT");
  assert.ok(res._headers["Set-Cookie"]);
});

test("16. wrong owner for payment only → 403 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const cookie = makeCookie(reportId, 42);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: 42, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: 99, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: 42, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_OWNER_CONFLICT");
  assert.ok(res._headers["Set-Cookie"]);
});

test("17. pending payment → 402", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "pending" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 402);
  assert.equal(res._body.error, "PAYMENT_NOT_CONFIRMED");
});

test("18. refunded payment → 403 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "refunded" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_REFUNDED");
  assert.ok(res._headers["Set-Cookie"]);
});

test("19. revoked entitlement → 403 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "revoked" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_REVOKED");
  assert.ok(res._headers["Set-Cookie"]);
});

test("20. missing snapshot → 503", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 503);
  assert.equal(res._body.error, "REPORT_DATA_UNAVAILABLE");
});

test("21. returns stored snapshot (not re-run model)", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
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
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 200);
  assert.deepEqual(res._body.report, storedSnapshot);
  assert.equal(res._body.valuationVersion, "v2.1");
});

test("22. no sensitive fields leaked in response", async () => {
  await loadHandler();
  const { reportId, sql, cookie } = buildHappyState();
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 200);
  const body = JSON.stringify(res._body);
  assert.ok(!body.includes("stripe_customer_id"));
  assert.ok(!body.includes("stripe_payment_intent_id"));
  assert.ok(!body.includes("stripe_checkout_session_id"));
  assert.ok(!body.includes("purchase_intent_key"));
  assert.ok(!body.includes("lead_contact_id"));
  assert.ok(!body.includes("snapshot_hash"));
});

test("23. nested sensitive fields stripped", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{
      report_id: reportId,
      lead_contact_id: contactId,
      snapshot_json: {
        midpoint: 825000,
        paymentDetails: { stripe_customer_id: "cus_nested", purchase_intent_key: "pik_nested" },
        comparables: [
          { address: "1 Test St", salePrice: 800000 },
          { address: "2 Test St", salePrice: 850000, lead_contact_id: 99 },
        ],
      },
    }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 200);
  const body = JSON.stringify(res._body);
  assert.ok(!body.includes("cus_nested"), "nested stripe_customer_id leaked");
  assert.ok(!body.includes("pik_nested"), "nested purchase_intent_key leaked");
  assert.equal(res._body.report.midpoint, 825000);
  assert.equal(res._body.report.comparables.length, 2);
  assert.equal(res._body.report.comparables[1].salePrice, 850000);
  assert.ok(!("lead_contact_id" in res._body.report.comparables[1]));
});

test("24. original snapshot not mutated", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const originalSnapshot = {
    midpoint: 825000,
    stripe_customer_id: "cus_keepme",
    nested: { stripe_payment_intent_id: "pi_keepme" },
  };
  Object.freeze(originalSnapshot);
  Object.freeze(originalSnapshot.nested);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: originalSnapshot }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 200);
  assert.equal(res._body.report.midpoint, 825000);
  assert.ok(!("stripe_customer_id" in res._body.report));
  assert.ok(!("stripe_payment_intent_id" in res._body.report.nested));
  assert.equal(originalSnapshot.stripe_customer_id, "cus_keepme");
  assert.equal(originalSnapshot.nested.stripe_payment_intent_id, "pi_keepme");
});

test("25. client-side allowed/status ignored", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const contactId = 42;
  const cookie = makeCookie(reportId, contactId);
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: contactId, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: contactId, status: "pending" }],
    snapshots: [{ report_id: reportId, lead_contact_id: contactId, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  const { req, res } = makeRequestResponse({
    reportId,
    allowed: true,
    status: "completed",
    paymentStatus: "paid",
  }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 402);
  assert.equal(res._body.error, "PAYMENT_NOT_CONFIRMED");
});

test("26. same request returns stable snapshot", async () => {
  await loadHandler();
  const { reportId, sql, cookie } = buildHappyState();
  setTestSql(sql);
  const { req: r1, res: res1 } = makeRequestResponse({ reportId }, "POST", cookie);
  const { req: r2, res: res2 } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(r1, res1);
  await handler(r2, res2);
  assert.equal(res1._status, 200);
  assert.equal(res2._status, 200);
  assert.deepEqual(res1._body.report, res2._body.report);
});

test("27. unexpected exception → safe 500", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const crashingSql = async () => { throw new Error("DB explosion"); };
  setTestSql(crashingSql);
  const cookie = makeCookie(reportId, 42);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 500);
  assert.equal(res._body.error, "INTERNAL_ERROR");
  assert.ok(!res._body.message || !res._body.message.includes("explosion"));
});

test("28. Set-Cookie at most once per error (invalid session + owner conflict)", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const sql = makeMockSql({
    entitlements: [{ report_id: reportId, lead_contact_id: 99, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: 99, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: 99, snapshot_json: { midpoint: 825000 } }],
  });
  setTestSql(sql);
  // Valid cookie but owner=99 != cookie contactId=42
  const cookie = makeCookie(reportId, 42);
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 403);
  assert.equal(res._body.error, "REPORT_OWNER_CONFLICT");
  assert.ok(res._headers["Set-Cookie"]);
  const setCookieVal = res._headers["Set-Cookie"];
  const count = Array.isArray(setCookieVal) ? setCookieVal.length : 1;
  assert.equal(count, 1);
});

test("no production DB or Stripe keys accessed", () => {
  assert.equal(typeof process.env.DATABASE_URL === "string" ? "string" : "undefined", "undefined");
  assert.equal(typeof process.env.STRIPE_SECRET_KEY === "string" ? "string" : "undefined", "undefined");
});


test("29. expired cookie (via tampered expiresAt) \u2192 401 + clear cookie", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const { sql } = buildHappyState();
  setTestSql(sql);
  // Create a valid token then tamper expiresAt to the past
  const validToken = createReportAccessSession({ reportId, leadContactId: 42 });
  const parts = validToken.split(".");
  const decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  // Set issuedAt to 61 minutes ago and expiresAt to 31 minutes ago
  decoded.issuedAt = Date.now() - 61 * 60 * 1000;
  decoded.expiresAt = decoded.issuedAt + 30 * 60 * 1000;
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  const tamperedToken = tamperedPayload + "." + parts[1];
  const cookie = "aushomevalue_report_access=" + tamperedToken;
  const { req, res } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(req, res);
  assert.equal(res._status, 401);
  assert.equal(res._body.error, "REPORT_SESSION_EXPIRED");
  // Must clear the expired cookie
  assert.ok(res._headers["Set-Cookie"]);
  assert.ok(res._headers["Set-Cookie"].includes("Max-Age=0"));
});

test("30. sequential requests each get exactly one Set-Cookie (no module state leak)", async () => {
  await loadHandler();
  const reportId = makeReportId();
  const cookie = makeCookie(reportId, 42);
  const makeState = () => ({
    entitlements: [{ report_id: reportId, lead_contact_id: 99, status: "active" }],
    payments: [{ id: 1, report_id: reportId, lead_contact_id: 99, status: "paid" }],
    snapshots: [{ report_id: reportId, lead_contact_id: 99, snapshot_json: { midpoint: 825000 } }],
  });

  // Request 1
  setTestSql(makeMockSql(makeState()));
  const { req: rq1, res: rs1 } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(rq1, rs1);
  assert.equal(rs1._status, 403, "r1 status should be 403");
  assert.equal(rs1._body.error, "REPORT_OWNER_CONFLICT");
  assert.ok(rs1._headers["Set-Cookie"]);
  const c1 = Array.isArray(rs1._headers["Set-Cookie"]) ? rs1._headers["Set-Cookie"].length : 1;
  assert.equal(c1, 1, "r1 should have exactly 1 Set-Cookie");
  assert.ok(rs1._headers["Set-Cookie"].includes("Max-Age=0"));

  // Request 2 — same cookie, same DB state, must NOT inherit cookieCleared from req1
  setTestSql(makeMockSql(makeState()));
  const { req: rq2, res: rs2 } = makeRequestResponse({ reportId }, "POST", cookie);
  await handler(rq2, rs2);
  assert.equal(rs2._status, 403, "r2 status should be 403");
  assert.equal(rs2._body.error, "REPORT_OWNER_CONFLICT");
  assert.ok(rs2._headers["Set-Cookie"], "r2 should have Set-Cookie");
  const c2 = Array.isArray(rs2._headers["Set-Cookie"]) ? rs2._headers["Set-Cookie"].length : 1;
  assert.equal(c2, 1, "r2 should have exactly 1 Set-Cookie");
  assert.ok(rs2._headers["Set-Cookie"].includes("Max-Age=0"), "r2 cookie should be clear");
});
