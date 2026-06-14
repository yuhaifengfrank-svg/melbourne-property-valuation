// ── Phase 1E3C-1: Payment Status Query API Tests ──
//
// Tests for GET /api/report-payment-status.
// All HTTP through simulated req/res. No real Stripe or production DB.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  createReportAccessSession,
  buildReportAccessCookie,
} from "../lib/report-access-session.js";

// ── Mock Database ───────────────────────────────────────────────────

const mockDb = {
  payments: [],
  entitlements: [],
  snapshots: [],
};

function resetMockDb() {
  mockDb.payments = [];
  mockDb.entitlements = [];
  mockDb.snapshots = [];
}

/**
 * Create a mock SQL function that handles queries used by report-payment-status.
 */
function createMockSql() {
  return async (strings, ...values) => {
    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");

    if (raw.includes("CREATE TABLE") || raw.includes("ALTER TABLE") || raw.includes("CREATE INDEX")) {
      return [];
    }

    if (raw.includes("FROM report_payments")) {
      const reportId = values[0];
      return mockDb.payments
        .filter((p) => p.report_id === reportId)
        .sort((a, b) => Number(a.id) - Number(b.id));
    }

    if (raw.includes("FROM report_entitlements")) {
      const reportId = values[0];
      const match = mockDb.entitlements.find((e) => e.report_id === reportId);
      return match ? [match] : [];
    }

    if (raw.includes("FROM report_snapshots")) {
      const reportId = values[0];
      const match = mockDb.snapshots.find((s) => s.report_id === reportId);
      return match ? [match] : [];
    }

    return [];
  };
}

// ── Helper: signed session cookies ──────────────────────────────────

function makeSessionCookie({ reportId, leadContactId }) {
  const session = createReportAccessSession({ reportId, leadContactId }, {});
  return `aushomevalue_report_access=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`;
}

function makeExpiredSessionCookie({ reportId, leadContactId }) {
  const past = Date.now() - 60 * 60 * 1000;
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId,
    issuedAt: past - 30 * 60 * 1000,
    expiresAt: past,
  };
  const secret = "report-access-session-dev-secret";
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;
  return `aushomevalue_report_access=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`;
}

function makeTamperedCookie({ reportId, leadContactId }) {
  const now = Date.now();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId,
    issuedAt: now,
    expiresAt: now + 30 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const token = `${encoded}.${sig}`;
  return `aushomevalue_report_access=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`;
}

// ── Test environment setup ─────────────────────────────────────────

async function setupTestEnv() {
  resetMockDb();
  const sql = createMockSql();
  const mod = await import(`../api/report-payment-status.js?t=${Date.now()}`);
  mod.setTestSql(sql);
  return { handler: mod.default, sql };
}

// ── Make request/response objects ──────────────────────────────────

function makeReq(path, cookieHeader) {
  const req = { method: "GET", url: path, headers: {} };
  if (cookieHeader) req.headers.cookie = cookieHeader;

  let statusCode = 200;
  let responseData = null;
  const headers = {};
  const setHeaderCalls = {};

  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = { statusCode, data }; return res; },
    setHeader: (name, value) => {
      headers[name] = value;
      setHeaderCalls[name] = (setHeaderCalls[name] || 0) + 1;
      return res;
    },
    end: () => {},
  };

  return {
    req, res,
    getStatus: () => responseData?.statusCode,
    getData: () => responseData?.data,
    getHeader: (name) => headers[name],
    getSetHeaderCount: (name) => setHeaderCalls[name] || 0,
  };
}

// ── Assert clear cookie helper ─────────────────────────────────────

function assertClearCookie(cookie, label) {
  assert.ok(cookie, `${label}: Must set a clear cookie`);
  assert.ok(cookie.startsWith("aushomevalue_report_access="),
    `${label}: Cookie must start with correct name`);
  assert.ok(cookie.includes("Max-Age=0"),
    `${label}: Cookie must have Max-Age=0`);
  assert.ok(cookie.includes("HttpOnly"), `${label}: Cookie must be HttpOnly`);
  assert.ok(cookie.includes("SameSite=Lax"), `${label}: Cookie must be SameSite=Lax`);
  assert.ok(cookie.includes("Path=/"), `${label}: Cookie must have Path=/`);
}

// ── Helpers: seed DB state ─────────────────────────────────────────
//
// paymentStatus: "paid"|"pending"|"refunded"|"disputed"|null
// entStatus: "active"|"revoked"|"refunded"|"disputed"|null
// hasSnapshot: boolean

function seedDb({ reportId, leadContactId, paymentStatus, entStatus, hasSnapshot, paymentId, updatedAt }) {
  resetMockDb();
  const now = Date.now();
  if (paymentStatus != null) {
    const pid = paymentId || 1;
    mockDb.payments.push({
      id: pid,
      report_id: reportId,
      lead_contact_id: leadContactId,
      status: paymentStatus,
      updated_at: updatedAt || new Date(now - pid).toISOString(),
    });
  }
  if (entStatus != null) {
    mockDb.entitlements.push({ id: 1, report_id: reportId, lead_contact_id: leadContactId, status: entStatus });
  }
  if (hasSnapshot) {
    mockDb.snapshots.push({ id: 1, report_id: reportId, lead_contact_id: leadContactId, snapshot_json: JSON.stringify({ some: "data" }) });
  }
}

function seedDbWithConflict({ reportId, otherContactId }) {
  resetMockDb();
  const now = Date.now();
  mockDb.payments.push({ id: 1, report_id: reportId, lead_contact_id: otherContactId, status: "paid", updated_at: new Date(now - 1000).toISOString() });
  mockDb.entitlements.push({ id: 1, report_id: reportId, lead_contact_id: otherContactId, status: "active" });
  mockDb.snapshots.push({ id: 1, report_id: reportId, lead_contact_id: otherContactId, snapshot_json: JSON.stringify({ some: "data" }) });
}

/**
 * Seed multiple payments for the same report (testing sorting rules).
 * Each payment: { id, status, leadContactId? }.
 * updated_at is set based on sequence (earliest index = oldest).
 */
function seedMultiPayments({ reportId, ownContactId, payments, entStatus, hasSnapshot }) {
  resetMockDb();
  const now = Date.now();
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    mockDb.payments.push({
      id: p.id,
      report_id: reportId,
      lead_contact_id: p.leadContactId ?? ownContactId,
      status: p.status,
      updated_at: p.updatedAt || new Date(now - (payments.length - i) * 1000).toISOString(),
    });
  }
  if (entStatus != null) {
    mockDb.entitlements.push({ id: 1, report_id: reportId, lead_contact_id: ownContactId, status: entStatus });
  }
  if (hasSnapshot) {
    mockDb.snapshots.push({ id: 1, report_id: reportId, lead_contact_id: ownContactId, snapshot_json: JSON.stringify({ some: "data" }) });
  }
}

// ── Generate a valid reportId ──────────────────────────────────────

function makeReportId(seed) {
  const ts = Date.now();
  const hash = crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 16);
  return `rp_${ts}_${hash}`;
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

// ── 1. No cookie ──────────────────────────────────────────────────

test("no cookie returns session_expired", async () => {
  const { handler } = await setupTestEnv();
  const ctx = makeReq("/api/report-payment-status?report_id=rp_123_abc");
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 401);
  assert.equal(ctx.getData().status, "session_expired");
  assert.equal(ctx.getData().ok, false);
  assert.equal(ctx.getHeader("Set-Cookie"), undefined, "No cookie: should not set cookie header");
});

// ── 2a. Tampered cookie ──────────────────────────────────────────

test("tampered cookie returns session_expired and clears cookie", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("tampered");
  const cookie = makeTamperedCookie({ reportId, leadContactId: 1 });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 401);
  assert.equal(ctx.getData().status, "session_expired");
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Tampered cookie");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Tampered cookie: exactly one Set-Cookie");
});

// ── 2b. Expired cookie ────────────────────────────────────────────

test("expired session cookie returns session_expired and clears cookie", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("expired");
  const cookie = makeExpiredSessionCookie({ reportId, leadContactId: 1 });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 401);
  assert.equal(ctx.getData().status, "session_expired");
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Expired cookie");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Expired cookie: exactly one Set-Cookie");
});

// ── 3. Invalid report_id format ────────────────────────────────────

test("invalid report_id format returns 400", async () => {
  const { handler } = await setupTestEnv();
  const validReportId = makeReportId("format-test");
  const cookie = makeSessionCookie({ reportId: validReportId, leadContactId: 1 });
  const ctx = makeReq("/api/report-payment-status?report_id=BAD_ID", cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().ok, false);
});

// ── 4. Query report_id mismatch with cookie ────────────────────────

test("query report_id mismatches cookie returns session_expired and clears cookie", async () => {
  const { handler } = await setupTestEnv();
  const cookieReportId = makeReportId("cookie-side");
  const queryReportId = makeReportId("query-side");
  const cookie = makeSessionCookie({ reportId: cookieReportId, leadContactId: 1 });
  const ctx = makeReq(`/api/report-payment-status?report_id=${queryReportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "session_expired");
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Mismatched report_id");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Mismatch: exactly one Set-Cookie");
});

// ── 5. Pending payment (normal checkout flow) ──────────────────────

test("pending payment returns pending status", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("pending");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "pending", entStatus: null, hasSnapshot: false });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200);
  assert.equal(ctx.getData().status, "pending");
  assert.equal(ctx.getData().ok, false);
});

// ── 6. Paid but no entitlement → data_unavailable ──────────────────

test("paid but no entitlement returns data_unavailable", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("paid-no-ent");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: null, hasSnapshot: false });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 503);
  assert.equal(ctx.getData().status, "data_unavailable");
  assert.equal(ctx.getData().ok, false);
});

// ── 7. Paid + active entitlement + snapshot → ready ────────────────

test("paid with active entitlement and snapshot returns ready", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("ready");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: "active", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200);
  assert.equal(ctx.getData().status, "ready");
  assert.equal(ctx.getData().ok, true);
});

// ── 8. Refunded payment + refunded entitlement ─────────────────────

test("refunded payment returns refunded status", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("refunded");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "refunded", entStatus: "refunded", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "refunded");
  assert.equal(ctx.getData().ok, false);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Refunded");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Refunded: exactly one Set-Cookie");
});

// ── 9. Revoked entitlement ─────────────────────────────────────────

test("revoked entitlement returns revoked status", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("revoked");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: "revoked", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "revoked");
  assert.equal(ctx.getData().ok, false);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Revoked");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Revoked: exactly one Set-Cookie");
});

// ── 10. Paid + active entitlement but no snapshot → data_unavailable

test("paid with active entitlement but no snapshot returns data_unavailable", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("no-snap");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: "active", hasSnapshot: false });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 503);
  assert.equal(ctx.getData().status, "data_unavailable");
  assert.equal(ctx.getData().ok, false);
});

// ── 11. Active entitlement but no paid payment → data_unavailable ──

test("active entitlement but no paid payment returns data_unavailable", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("ent-no-pay");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "pending", entStatus: "active", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 503);
  assert.equal(ctx.getData().status, "data_unavailable");
  assert.equal(ctx.getData().ok, false);
});

// ── 12. Owner conflict (payment belongs to other customer) ────────

test("owner conflict returns owner_conflict and clears cookie", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("conflict");
  const otherContactId = 99;
  const cookie = makeSessionCookie({ reportId, leadContactId: 42 });
  seedDbWithConflict({ reportId, otherContactId });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "owner_conflict");
  assert.equal(ctx.getData().ok, false);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Owner conflict");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Owner conflict: exactly one Set-Cookie");
});

// ── 13. Opportunity cookie cannot unlock ──────────────────────────

test("opportunity cookie cannot unlock report payment status", async () => {
  const { handler } = await setupTestEnv();
  const wrongCookie = "opportunity_report=abc123; HttpOnly; Path=/";
  const ctx = makeReq("/api/report-payment-status?report_id=rp_123_abc", wrongCookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 401);
  assert.equal(ctx.getData().status, "session_expired");
  assert.equal(ctx.getData().ok, false);
  assert.equal(ctx.getHeader("Set-Cookie"), undefined, "No valid cookie: should not set cookie header");
});

// ── 14. Response must not leak sensitive fields ───────────────────

test("response must not leak sensitive fields", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("no-leak");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: "active", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200);
  assert.equal(ctx.getData().status, "ready");
  const bodyStr = JSON.stringify(ctx.getData());
  assert.ok(!bodyStr.includes("email"), "Response must not contain email");
  assert.ok(!bodyStr.includes("leadContactId"), "Response must not contain leadContactId");
  assert.ok(!bodyStr.includes("stripe"), "Response must not contain Stripe references");
  assert.ok(!bodyStr.includes("payment_intent"), "Response must not contain payment intent");
  assert.ok(!bodyStr.includes("checkoutSessionId"), "Response must not contain checkout session ID");
  assert.ok(!bodyStr.includes("purchase_intent_key"), "Response must not contain purchase intent key");
  assert.ok(!bodyStr.includes("snapshot_json"), "Response must not contain snapshot content");
  assert.ok(!bodyStr.includes("SET"), "Response must not leak SQL or DB info");
  assert.equal(ctx.getHeader("Set-Cookie"), undefined, "Ready status should not set cookie");
  const allowedKeys = ["ok", "status", "message"];
  for (const key of Object.keys(ctx.getData())) {
    assert.ok(allowedKeys.includes(key), `Response must not contain unexpected key: ${key}`);
  }
});

// ── 15. No Stripe references ──────────────────────────────────────

test("handler does not import or reference Stripe", async () => {
  const { handler } = await setupTestEnv();
  const handlerStr = handler.toString();
  assert.ok(!handlerStr.includes("stripe"), "Handler must not reference Stripe");
  assert.ok(!handlerStr.includes("stripe.checkout"), "Handler must not call Stripe checkout");
});

// ── 16. OPTIONS returns 204 ──────────────────────────────────────

test("OPTIONS returns 204", async () => {
  const { handler } = await setupTestEnv();
  const req = { method: "OPTIONS", url: "/api/report-payment-status", headers: {} };
  let statusCode = 200;
  let calledEnd = false;
  const headers = {};
  const res = {
    status: (code) => { statusCode = code; return res; },
    setHeader: (k, v) => { headers[k] = v; return res; },
    json: () => res,
    end: () => { calledEnd = true; },
  };
  await handler(req, res);
  assert.equal(statusCode, 204);
  assert.ok(calledEnd, "OPTIONS must call end()");
});

// ── 17. POST returns 405 ─────────────────────────────────────────

test("POST returns 405", async () => {
  const { handler } = await setupTestEnv();
  const req = { method: "POST", url: "/api/report-payment-status", headers: {} };
  let statusCode = 200;
  const headers = {};
  const res = {
    status: (code) => { statusCode = code; return res; },
    setHeader: (k, v) => { headers[k] = v; return res; },
    json: () => res,
    end: () => {},
  };
  await handler(req, res);
  assert.equal(statusCode, 405);
  assert.equal(headers["Allow"], "GET");
});

// ── 18. Not found (no records at all) ────────────────────────────

test("no matching DB records returns not_found and clears cookie", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("not-found-db");
  const cookie = makeSessionCookie({ reportId, leadContactId: 42 });
  resetMockDb();
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 404);
  assert.equal(ctx.getData().status, "not_found");
  assert.equal(ctx.getData().ok, false);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Not found");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Not found: exactly one Set-Cookie");
});

// ── 19. Disputed payment → refunded ─────────────────────────────

test("disputed payment returns refunded", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("disputed");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "disputed", entStatus: "active", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "refunded");
  assert.equal(ctx.getData().ok, false);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Disputed");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1, "Disputed: exactly one Set-Cookie");
});

// ── 20. Disputed entitlement → refunded ─────────────────────────

test("disputed entitlement returns refunded", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("ent-disputed");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  seedDb({ reportId, leadContactId: contactId, paymentStatus: "paid", entStatus: "disputed", hasSnapshot: true });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403);
  assert.equal(ctx.getData().status, "refunded");
});

// ── 21. Missing report_id query param ───────────────────────────

test("missing report_id query param returns 400", async () => {
  const { handler } = await setupTestEnv();
  const validReportId = makeReportId("missing-param");
  const cookie = makeSessionCookie({ reportId: validReportId, leadContactId: 1 });
  const ctx = makeReq("/api/report-payment-status", cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().ok, false);
});

// ── 22. Unexpected query parameters ─────────────────────────────

test("unexpected query parameters return 400", async () => {
  const { handler } = await setupTestEnv();
  const validReportId = makeReportId("unexpected");
  const cookie = makeSessionCookie({ reportId: validReportId, leadContactId: 1 });
  const ctx = makeReq(`/api/report-payment-status?report_id=${validReportId}&email=test@example.com`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().ok, false);
});

// ── 23. Overly long query string ────────────────────────────────

test("overly long query returns 400", async () => {
  const { handler } = await setupTestEnv();
  const validReportId = makeReportId("long-query");
  const cookie = makeSessionCookie({ reportId: validReportId, leadContactId: 1 });
  const longId = "rp_" + "1".repeat(250) + "_aaaa";
  const ctx = makeReq(`/api/report-payment-status?report_id=${longId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().ok, false);
});

// ══════════════════════════════════════════════════════════════════════
// Payment sorting & customer isolation tests
// ══════════════════════════════════════════════════════════════════════

// ── 24. Old paid + new refunded → refunded ─────────────────────────

test("old paid then new refunded returns refunded", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("paid-then-refunded");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  const now = Date.now();
  seedMultiPayments({
    reportId, ownContactId: contactId,
    payments: [
      { id: 1, status: "paid", updatedAt: new Date(now - 5000).toISOString() },
      { id: 2, status: "refunded", updatedAt: new Date(now - 1000).toISOString() },
    ],
    entStatus: "refunded", hasSnapshot: true,
  });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 403, "Latest refunded should win");
  assert.equal(ctx.getData().status, "refunded");
});

// ── 25. Old refunded + new paid → ready ────────────────────────────

test("old refunded then new paid returns ready", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("refund-then-paid");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  const now = Date.now();
  seedMultiPayments({
    reportId, ownContactId: contactId,
    payments: [
      { id: 1, status: "refunded", updatedAt: new Date(now - 5000).toISOString() },
      { id: 2, status: "paid", updatedAt: new Date(now - 1000).toISOString() },
    ],
    entStatus: "active", hasSnapshot: true,
  });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200, "Latest paid should give ready");
  assert.equal(ctx.getData().status, "ready");
});

// ── 26. Old paid + new pending → ready (latest completed wins) ─────

test("old paid then new pending returns ready", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("paid-then-pending");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });
  const now = Date.now();
  seedMultiPayments({
    reportId, ownContactId: contactId,
    payments: [
      { id: 1, status: "paid", updatedAt: new Date(now - 5000).toISOString() },
      { id: 2, status: "pending", updatedAt: new Date(now - 1000).toISOString() },
    ],
    entStatus: "active", hasSnapshot: true,
  });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200, "Completed paid should win over pending");
  assert.equal(ctx.getData().status, "ready");
});

// ── 27. This customer paid + other customer has payment too ────────

test("own paid payments not overridden by other customer payments", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("mixed-owners");
  const ownContactId = 42;
  const otherContactId = 99;
  const cookie = makeSessionCookie({ reportId, leadContactId: ownContactId });
  const now = Date.now();
  seedMultiPayments({
    reportId, ownContactId,
    payments: [
      { id: 1, status: "paid", updatedAt: new Date(now - 5000).toISOString() },
      { id: 2, status: "refunded", leadContactId: otherContactId, updatedAt: new Date(now - 1000).toISOString() },
    ],
    entStatus: "active", hasSnapshot: true,
  });
  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  // Own payment is paid, entitled, snapshot exists → ready
  assert.equal(ctx.getStatus(), 200, "Own paid should not be overridden by other customer's refunded");
  assert.equal(ctx.getData().status, "ready");
});

// ── 28. Source contract: MUST NOT SELECT id FROM report_snapshots ───
test("source contract: no SELECT id FROM report_snapshots", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("./api/report-payment-status.js", "utf8");
  const code = source.replace(/'[^']*'/g, "").replace(/"[^"`]*"/g, "");
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/SELECT\s+id\b/i.test(line) && /report_snapshots/i.test(line)) {
      assert.fail(`Line ${i + 1}: forbidden SELECT id… FROM report_snapshots — use report_id instead`);
    }
  }
});

// ── 29. Regression: snapshot without id column still returns ready ──
test("ready status when snapshot mock has no id column", async () => {
  const { handler } = await setupTestEnv();
  const reportId = makeReportId("no-id-snapshot");
  const contactId = 42;
  const cookie = makeSessionCookie({ reportId, leadContactId: contactId });

  resetMockDb();
  mockDb.snapshots.push({
    report_id: reportId,
    lead_contact_id: contactId,
    snapshot_json: JSON.stringify({ some: "data" }),
  });
  mockDb.payments.push({ id: 1, report_id: reportId, lead_contact_id: contactId, status: "paid", updated_at: new Date().toISOString() });
  mockDb.entitlements.push({ id: 1, report_id: reportId, lead_contact_id: contactId, status: "active" });

  const ctx = makeReq(`/api/report-payment-status?report_id=${reportId}`, cookie);
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 200, "Should return 200 with snapshot missing id");
  assert.equal(ctx.getData().status, "ready");
});
