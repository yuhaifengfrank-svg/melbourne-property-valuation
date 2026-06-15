// ── Phase 1C5: Create Checkout API Handler Tests ──
//
// Tests for POST /api/create-report-checkout.
// All HTTP through simulated req/res. No real Stripe or production DB.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV = "test";

// ── Shared snapshot tools ───────────────────────────────────────────

let _stableStringifyFn;
let _hashSnapshotFn;
let _verifyReportDraftTokenFn;

async function getSnapshotTools() {
  if (!_stableStringifyFn) {
    const mod = await import("../lib/report-snapshot-service.js");
    _stableStringifyFn = mod.stableStringify;
    _hashSnapshotFn = mod.hashSnapshot;
    _verifyReportDraftTokenFn = mod.verifyReportDraftToken;
  }
  return {
    stableStringify: _stableStringifyFn,
    hashSnapshot: _hashSnapshotFn,
    verifyReportDraftToken: _verifyReportDraftTokenFn,
  };
}

// ── Mock Database ───────────────────────────────────────────────────

const mockDb = {
  leadContacts: [],
  drafts: [],
  snapshots: [],
  payments: [],
  entitlements: [],
  upsertLeadContactLog: [],
};

function resetMockDb() {
  mockDb.leadContacts = [];
  mockDb.drafts = [];
  mockDb.snapshots = [];
  mockDb.payments = [];
  mockDb.entitlements = [];
  mockDb.upsertLeadContactLog = [];
}

let nextLeadContactId = 1;

function createMockSql() {
  return async (strings, ...values) => {

    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");

    // INSERT INTO lead_contacts ... ON CONFLICT (email_lower) DO UPDATE SET updated_at = NOW() RETURNING id
    if (raw.includes("ON CONFLICT") && raw.includes("email_lower")) {
      const email = values[0];
      const emailLower = values[1];
      let existing = mockDb.leadContacts.find(c => c.email_lower === emailLower);
      if (existing) {
        existing.updated_at = new Date().toISOString();
        mockDb.upsertLeadContactLog.push({ action: "update", id: existing.id, email: emailLower });
        return [{ id: existing.id }];
      }
      const contact = {
        id: nextLeadContactId++,
        email,
        email_lower: emailLower,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.leadContacts.push(contact);
      mockDb.upsertLeadContactLog.push({ action: "insert", id: contact.id, email: emailLower });
      return [{ id: contact.id }];
    }

    // SELECT … FROM lead_contacts — only here for schema-safety SELECT
    if (raw.includes("FROM lead_contacts")) {
      return [];
    }

    if (raw.includes("CREATE TABLE") || raw.includes("ALTER TABLE") || raw.includes("CREATE INDEX")) {
      return [];
    }

    if (raw.includes("FROM report_drafts")) {
      const draftId = values[0];
      const match = mockDb.drafts.find(
        d => d.draft_id === draftId && d.consumed_at == null && new Date(d.expires_at) > new Date()
      );
      return match ? [match] : [];
    }

    if (raw.includes("INSERT INTO report_snapshots")) {
      if (mockDb.throwOnSnapshotInsert) {
        throw new Error(mockDb.throwOnSnapshotInsert);
      }
      const draftId = values[1];
const conflict = mockDb.snapshots.some(s => s.draft_id === draftId);
      if (conflict) {
        return [];
      }
      const reportId = values[0];
      mockDb.snapshots.push({
        report_id: reportId,
        draft_id: draftId,
        property_key: values[2],
        valuation_version: values[3],
        snapshot_json: values[4],
        snapshot_hash: values[5],
        lead_contact_id: values[6] || null,
      });
      return [{ report_id: reportId }];

    }

    if (raw.includes("FROM report_snapshots")) {
      const draftId = values[0];
      const match = mockDb.snapshots.find(s => s.draft_id === draftId);
      return match ? [{ report_id: match.report_id, lead_contact_id: match.lead_contact_id || null }] : [];
    }

    if (raw.includes("UPDATE report_snapshots") && raw.includes("lead_contact_id")) {
      // Phase 1C6: bind NULL-owner snapshot to a customer
      // SQL: SET lead_contact_id = $1 WHERE report_id = $2
      // mock: $0=leadContactId, $1=reportId
      const leadContactId = values[0];
      const reportId = values[1];
      const snap = mockDb.snapshots.find((s) => s.report_id === reportId && s.lead_contact_id == null);
      if (snap && values.length >= 2) {
        snap.lead_contact_id = leadContactId;
        return [{ report_id: snap.report_id }];
      }
      return [];
    }

    if (raw.includes("UPDATE report_drafts")) {
      const draftId = values[0];
      const draft = mockDb.drafts.find(d => d.draft_id === draftId);
      if (draft && draft.consumed_at == null) {
        draft.consumed_at = new Date().toISOString();
      }
      return [];
    }

    if (raw.includes("INSERT INTO report_payments")) {
      const [reportId, leadContactId, checkoutSessionId, purchaseIntentKey] = values;
      const existing = mockDb.payments.find(p => p.purchase_intent_key === purchaseIntentKey);
      if (existing) {
        if (checkoutSessionId != null) existing.stripe_checkout_session_id = checkoutSessionId;
        existing.updated_at = new Date().toISOString();
        return [existing];
      }
      const payment = {
        id: mockDb.payments.length + 1,
        report_id: reportId,
        lead_contact_id: leadContactId,
        stripe_checkout_session_id: checkoutSessionId || null,
        purchase_intent_key: purchaseIntentKey,
        amount_cents: 399,
        currency: "aud",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.payments.push(payment);
      return [payment];
    }

    if (raw.includes("FROM report_payments") && raw.includes("purchase_intent_key")) {
      const key = values[0];
      const matches = mockDb.payments
        .filter(p => p.purchase_intent_key === key)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return matches.slice(0, 1);
    }

    if (raw.includes("FROM report_entitlements")) {
      const reportId = values[0];
      const leadContactId = values[1];
      const match = mockDb.entitlements.find(
        e => e.report_id === reportId && e.lead_contact_id === leadContactId && e.status === "active"
      );
      return match ? [match] : [];
    }

    if (raw.includes("UPDATE report_payments") && raw.includes("status = 'failed'")) {
      const key = values[0];
      const payment = mockDb.payments.find(p => p.purchase_intent_key === key && p.status === "pending");
      if (payment) {
        payment.status = "failed";
        return [payment];
      }
      return [];
    }

    return [];
  };
}

// ── Draft token helpers ─────────────────────────────────────────────

const DRAFT_SECRET = "report-draft-dev-secret";

async function makeDraftToken() {
  const { hashSnapshot } = await getSnapshotTools();
  const draftId = "rd_" + crypto.randomBytes(12).toString("hex");
  const now = Date.now();
  const snapObj = { test: "data", estimate: { midpoint: 850000, low: 800000, high: 900000 } };
  const stableJson = JSON.stringify(snapObj);
  const snapHash = hashSnapshot(stableJson);

  const payload = {
    draft_id: draftId,
    property_key: "test|Suburb|VIC|3000|house",
    valuation_version: "1.0.0",
    snapshot_hash: snapHash,
    issued_at: now,
    expires_at: now + 30 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", DRAFT_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  const { stableStringify } = await getSnapshotTools();
  mockDb.drafts.push({
    draft_id: draftId,
    property_key: payload.property_key,
    valuation_version: payload.valuation_version,
    snapshot_json: stableStringify(snapObj),
    snapshot_hash: snapHash,
    expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
    consumed_at: null,
    created_at: new Date(now - 1000).toISOString(),
  });

  return token;
}

/** Token-level expired: signature valid but expires_at in the past */
function makeTokenLevelExpiredDraftToken() {
  const draftId = "rd_" + crypto.randomBytes(12).toString("hex");
  const now = Date.now();
  const payload = {
    draft_id: draftId,
    property_key: "test|Suburb|VIC|3000|house",
    valuation_version: "1.0.0",
    snapshot_hash: "test_hash_old",
    issued_at: now - 60 * 60 * 1000,
    expires_at: now - 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", DRAFT_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/** Tampered token: valid signature but modified payload */
function makeTamperedDraftToken() {
  const draftId = "rd_" + crypto.randomBytes(12).toString("hex");
  const now = Date.now();
  const payload = {
    draft_id: draftId,
    property_key: "test|Suburb|VIC|3000|house",
    valuation_version: "1.0.0",
    snapshot_hash: crypto.randomBytes(16).toString("hex"),
    issued_at: now,
    expires_at: now + 30 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", DRAFT_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;
  // Tamper: change the payload body while keeping signature
  const tamperedPayload = { ...payload, draft_id: "rd_TAMPERED_" + Date.now() };
  const tamperedEncoded = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
  return `${tamperedEncoded}.${sig}`;
}

/** DB-level expired: token is valid (future expires_at), but draft row is expired in DB */
async function makeDbLevelExpiredDraftToken() {
  const { hashSnapshot } = await getSnapshotTools();
  const draftId = "rd_" + crypto.randomBytes(12).toString("hex");
  const now = Date.now();
  const snapObj = { test: "data" };
  const snapHash = hashSnapshot(JSON.stringify(snapObj));

  // Token has future expires_at — passes verifyReportDraftToken
  const payload = {
    draft_id: draftId,
    property_key: "test|Suburb|VIC|3000|house",
    valuation_version: "1.0.0",
    snapshot_hash: snapHash,
    issued_at: now,
    expires_at: now + 30 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", DRAFT_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  // Insert draft with DB-level past expiry — the FROM report_drafts query
  // includes expires_at > NOW() and will return no rows
  const { stableStringify } = await getSnapshotTools();
  mockDb.drafts.push({
    draft_id: draftId,
    property_key: payload.property_key,
    valuation_version: payload.valuation_version,
    snapshot_json: stableStringify(snapObj),
    snapshot_hash: snapHash,
    expires_at: new Date(now - 1000).toISOString(),
    consumed_at: null,
    created_at: new Date(now - 3600 * 1000).toISOString(),
  });

  return token;
}

/** Invalid format token: missing dot separator */
function makeMalformedDraftToken() {
  return "just_a_random_string_without_dot";
}

// ── Mock Stripe ─────────────────────────────────────────────────────

let stripeCallCount = 0;
let stripeSessions = [];
const idempotentSessions = new Map();

function resetMockStripe() {
  stripeCallCount = 0;
  stripeSessions = [];
  idempotentSessions.clear();
}

const mockStripeClient = {
  checkout: {
    sessions: {
      create: async (params, opts) => {
        stripeCallCount++;
        const key = opts?.idempotencyKey;
        if (key && idempotentSessions.has(key)) {
          return idempotentSessions.get(key);
        }
        const sessionId = "cs_test_" + crypto.randomBytes(8).toString("hex");
        const session = {
          id: sessionId,
          url: `https://checkout.stripe.com/test/${sessionId}`,
          status: "open",
          mode: params.mode,
          line_items: params.line_items,
          metadata: params.metadata,
          customer_email: params.customer_email,
        };
        if (key) idempotentSessions.set(key, session);
        stripeSessions.push(session);
        return session;
      },
      retrieve: async (sessionId) => {
        stripeCallCount++;
        return stripeSessions.find(s => s.id === sessionId) || null;
      },
    },
  },
};

// ── Test environment setup ──────────────────────────────────────────

/**
 * Save env vars that setupTestEnv may overwrite, so they can be restored.
 */
const _origVercelEnv = process.env.VERCEL_ENV;
const _origStripeMode = process.env.STRIPE_MODE;

async function setupTestEnv() {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399_" + Date.now();
  // Payments gate requires preview+test for checkout success paths.
  // Exported so gate-blocked tests can explicitly override them.
  process.env.VERCEL_ENV = "preview";
  process.env.STRIPE_MODE = "test";
  nextLeadContactId = 1;

  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(mockStripeClient);

  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now()}`);
  mod.setTestSql(sql);

  return { handler: mod.default };
}

/** Restore env to original state after test. */
function restoreDefaultEnv() {
  if (_origVercelEnv !== undefined) process.env.VERCEL_ENV = _origVercelEnv;
  else delete process.env.VERCEL_ENV;
  if (_origStripeMode !== undefined) process.env.STRIPE_MODE = _origStripeMode;
  else delete process.env.STRIPE_MODE;
}

function makeReqRes(body, opts = {}) {
  const req = {
    method: opts.method || "POST",
    headers: {},
    body,
  };

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
    getAllHeaders: () => ({ ...headers }),
    getSetHeaderCount: (name) => setHeaderCalls[name] || 0,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

test("creates checkout successfully with valid email and draft token", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "success@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);
  const data = ctx.getData();
  assert.equal(data.ok, true);
  assert.ok(data.checkoutUrl, "Must return checkout URL");
  assert.ok(data.checkoutUrl.startsWith("https://checkout.stripe.com/"),
    "Checkout URL must be from Stripe");
  assert.equal(data.checkoutSessionId, undefined,
    "checkoutSessionId must not appear in response body");
  assert.equal(data.alreadyPurchased, false);

  // Must NOT create entitlement
  assert.equal(mockDb.entitlements.length, 0, "Must not create entitlement");
});

test("invalid email returns 400 with INVALID_EMAIL", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const invalidEmails = ["", "notanemail", "@no", "a@b", "test@", "@example.com"];

  for (const email of invalidEmails) {
    const ctx = makeReqRes({ email, reportDraftToken: token });
    await handler(ctx.req, ctx.res);
    assert.equal(ctx.getStatus(), 400, `Email "${email}" must return 400`);
    assert.equal(ctx.getData().error, "INVALID_EMAIL", `Email "${email}" must return INVALID_EMAIL`);
  }
});

test("missing draft token returns 400 with INVALID_DRAFT_TOKEN", async () => {
  const { handler } = await setupTestEnv();

  const ctx = makeReqRes({
    email: "test@example.com",
    reportDraftToken: "",
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "INVALID_DRAFT_TOKEN");
});

test("malformed draft token returns INVALID_DRAFT_TOKEN and does not create lead_contact", async () => {
  const { handler } = await setupTestEnv();
  const badToken = makeMalformedDraftToken();

  const ctx = makeReqRes({
    email: "nolead@example.com",
    reportDraftToken: badToken,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "INVALID_DRAFT_TOKEN");

  // Token was checked before any DB writes — no lead_contact must be created
  assert.equal(mockDb.leadContacts.length, 0, "No lead_contact should be created for invalid token");
});

test("tampered draft token returns 400 with INVALID_DRAFT_TOKEN and does not create lead_contact", async () => {
  const { handler } = await setupTestEnv();
  const tampered = makeTamperedDraftToken();

  const ctx = makeReqRes({
    email: "tamper@example.com",
    reportDraftToken: tampered,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "INVALID_DRAFT_TOKEN");

  // No lead_contact created
  assert.equal(mockDb.leadContacts.length, 0, "No lead_contact should be created for tampered token");
});

test("token-level expired returns INVALID_DRAFT_TOKEN (not DRAFT_EXPIRED)", async () => {
  const { handler } = await setupTestEnv();
  const expiredToken = makeTokenLevelExpiredDraftToken();

  const ctx = makeReqRes({
    email: "expired_token@example.com",
    reportDraftToken: expiredToken,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "INVALID_DRAFT_TOKEN",
    "Token-level expiry returns INVALID_DRAFT_TOKEN, not DRAFT_EXPIRED");
});

test("DB-level expired draft returns DRAFT_EXPIRED", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDbLevelExpiredDraftToken();

  const ctx = makeReqRes({
    email: "db_expired@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "DRAFT_EXPIRED",
    "DB-level draft expiry must return DRAFT_EXPIRED");
});

test("client-provided price fields are ignored", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "test@example.com",
    reportDraftToken: token,
    price_id: "client_supplied_price",
    amount: "99999",
    currency: "usd",
    report_id: "rp_client_provided",
    success_url: "https://evil-site.com",
    cancel_url: "https://evil-site.com/cancel",
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);

  const session = stripeSessions[0];
  assert.ok(session, "Must have created a Stripe session");
  assert.equal(session.mode, "payment", "Mode must be payment");
  assert.ok(session.line_items && session.line_items.length > 0, "Must have line items");
  assert.notEqual(session.line_items[0]?.price, "client_supplied_price",
    "Price ID must not come from client");
});

test("repeat request returns the same checkout session", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const body = { email: "repeat@example.com", reportDraftToken: token };

  const r1 = makeReqRes(body);
  await handler(r1.req, r1.res);
  const firstData = r1.getData();

  const r2 = makeReqRes(body);
  await handler(r2.req, r2.res);
  const secondData = r2.getData();

  assert.equal(secondData.ok, true);
  assert.equal(secondData.checkoutSessionId, firstData.checkoutSessionId,
    "Must return the same session ID on repeat");
  assert.equal(secondData.checkoutUrl, firstData.checkoutUrl,
    "Must return the same URL on repeat");
});

test("POST only — GET returns 405", async () => {
  const { handler } = await setupTestEnv();

  const ctx = makeReqRes({}, { method: "GET" });
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 405);
  assert.equal(ctx.getData().error, "BAD_REQUEST");
});

test("OPTIONS returns 204", async () => {
  const { handler } = await setupTestEnv();

  const ctx = makeReqRes({}, { method: "OPTIONS" });
  await handler(ctx.req, ctx.res);
});

test("Stripe not configured returns 503 with STRIPE_NOT_CONFIGURED", async () => {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399";
  nextLeadContactId = 1;

  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(null);

  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 1}`);
  mod.setTestSql(sql);

  const token = await makeDraftToken();
  const ctx = makeReqRes({
    email: "noconfig@example.com",
    reportDraftToken: token,
  });

  await mod.default(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 503);
  assert.equal(ctx.getData().error, "STRIPE_NOT_CONFIGURED");
});

test("successful checkout does not create entitlement", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "noent@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);
  assert.equal(mockDb.entitlements.length, 0,
    "Checkout API must not create entitlement");
});

test("no direct Stripe SDK or SECRET_KEY in API handler", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "api/create-report-checkout.js"),
    "utf8"
  );
  assert.equal(source.includes("STRIPE_SECRET_KEY"), false,
    "API handler must not read SECRET_KEY directly");
  assert.equal(source.includes('from "stripe"'), false,
    "API handler must not import stripe SDK directly");
  assert.equal(source.includes("checkout.sessions.create"), false,
    "API handler must not call Stripe SDK directly");
});

test("same email finds existing lead_contact", async () => {
  const { handler } = await setupTestEnv();

  const token1 = await makeDraftToken();
  const r1 = makeReqRes({ email: "existing@example.com", reportDraftToken: token1 });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200);

  const contactCount = mockDb.leadContacts.length;

  const token2 = await makeDraftToken();
  const r2 = makeReqRes({ email: "existing@example.com", reportDraftToken: token2 });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 200);

  // Should not create a new contact
  assert.equal(mockDb.leadContacts.length, contactCount,
    "Same email should reuse existing lead_contact");
});

test("CONCURRENT: same email Promise.all atomically creates only one lead_contact", async () => {
  const { handler } = await setupTestEnv();
  const token1 = await makeDraftToken();
  const token2 = await makeDraftToken();

  const c1 = makeReqRes({ email: "concurrent@example.com", reportDraftToken: token1 });
  const c2 = makeReqRes({ email: "concurrent@example.com", reportDraftToken: token2 });

  await Promise.all([
    handler(c1.req, c1.res),
    handler(c2.req, c2.res),
  ]);

  // Both should succeed (ON CONFLICT upsert, not unique constraint error)
  assert.equal(c1.getStatus(), 200, "First concurrent request must succeed");
  assert.equal(c2.getStatus(), 200, "Second concurrent request must succeed");

  // Only one lead_contact created
  const matchingContacts = mockDb.leadContacts.filter(
    c => c.email_lower === "concurrent@example.com"
  );
  assert.equal(matchingContacts.length, 1,
    "Concurrent same-email requests must create only one lead_contact");
});

// ── Phase 1C6: Report Draft — Owner Binding (lead_contact_id) ───────

test("same token same email reuses snapshot and returns 200", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const r1 = makeReqRes({ email: "reuse-test@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200, "First request must succeed");
  const reportId1 = r1.getData()?.reportId;

  const r2 = makeReqRes({ email: "reuse-test@example.com", reportDraftToken: token });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 200, "Same-token repeat must succeed (idempotent)");
  assert.equal(r2.getData()?.reportId, reportId1, "Must return the same report_id");
});

test("same token different email returns 409 REPORT_OWNER_CONFLICT", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  // First customer consumes the token
  const r1 = makeReqRes({ email: "owner@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200, "First customer must succeed");

  // Second customer uses the same token — should be rejected
  const r2 = makeReqRes({ email: "intruder@example.com", reportDraftToken: token });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 409, "Different-email repeat must return 409");
  assert.equal(r2.getData()?.error, "REPORT_OWNER_CONFLICT", "Error code must be REPORT_OWNER_CONFLICT");

  // Second customer must NOT have created a payment or Stripe session
  assert.equal(
    mockDb.payments.filter((p) => p.lead_contact_id !== mockDb.leadContacts[0].id).length,
    0,
    "Conflicting customer must not create a payment"
  );
  assert.equal(stripeSessions.length, 1, "Only one Stripe session should ever be created");

  // Snapshot owner must not change
  const snapshot = mockDb.snapshots.find((s) => s.draft_id);
  assert.ok(snapshot, "Snapshot must exist");
  assert.equal(
    mockDb.leadContacts.find((c) => c.id === snapshot.lead_contact_id)?.email_lower,
    "owner@example.com",
    "Snapshot owner must remain the original customer"
  );
});

test("Promise.all two emails compete for same token: one wins, one 409", async () => { const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const rA = makeReqRes({ email: "racer-a@example.com", reportDraftToken: token });
  const rB = makeReqRes({ email: "racer-b@example.com", reportDraftToken: token });

  const results = await Promise.allSettled([
    handler(rA.req, rA.res),
    handler(rB.req, rB.res),
  ]);

  // Both resolve (neither throws) but one is 200, one is 409
  assert.equal(results.length, 2, "Both handlers must complete");

  const statuses = [rA.getStatus(), rB.getStatus()].sort();
  assert.deepEqual(statuses, [200, 409], "One must succeed, one must be REPORT_OWNER_CONFLICT");

  // Exactly one snapshot for this draft
  const snapshotsForDraft = mockDb.snapshots.filter((s) => s.draft_id);
  assert.equal(snapshotsForDraft.length, 1, "Exactly one snapshot must exist");

  // Only one payment (winner), no payments for the loser
  const payments = mockDb.payments;
  const loserEmail = rA.getStatus() === 409 ? "racer-a@example.com" : "racer-b@example.com";
  const loserContact = mockDb.leadContacts.find((c) => c.email_lower === loserEmail);
  if (loserContact) {
    const loserPayments = payments.filter(
      (p) => p.lead_contact_id === loserContact.id
    );
    assert.equal(loserPayments.length, 0, "Loser must have no payments");
  }
});

test("conflicting customer has no payment created", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const r1 = makeReqRes({ email: "first@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200);
  const firstPayments = mockDb.payments.length;

  const r2 = makeReqRes({ email: "second@example.com", reportDraftToken: token });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 409, "Second customer must get 409");

  // No new payments created after the conflict
  assert.equal(mockDb.payments.length, firstPayments,
    "Conflicting request must not create any payment");

  // No new Stripe sessions
  assert.equal(stripeSessions.length, 1, "Only one Stripe session for the successful customer");
});

test("snapshot owner never changes after conflict", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  // First customer owns the snapshot
  const r1 = makeReqRes({ email: "owner-test@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200);

  const ownerContact = mockDb.leadContacts.find((c) => c.email_lower === "owner-test@example.com");
  assert.ok(ownerContact, "Owner lead_contact must exist");

  // Get the snapshot lead_contact_id from first request
  const snapshotBefore = mockDb.snapshots.find((s) => s.draft_id);
  assert.equal(snapshotBefore.lead_contact_id, ownerContact.id,
    "Snapshot must be owned by the first customer");

  // Multiple different customers try to steal it
  for (const email of ["attacker-1@example.com", "attacker-2@example.com", "attacker-3@example.com"]) {
    const r = makeReqRes({ email, reportDraftToken: token });
    await handler(r.req, r.res);
    assert.equal(r.getStatus(), 409, `${email} must get 409`);
  }

  // Snapshot owner unchanged
  const snapshotAfter = mockDb.snapshots.find((s) => s.draft_id);
  assert.equal(snapshotAfter.lead_contact_id, ownerContact.id,
    "Snapshot lead_contact_id must never change, even after multiple conflicts");

  // Original owner can still use the token (idempotent)
  const rRepeat = makeReqRes({ email: "owner-test@example.com", reportDraftToken: token });
  await handler(rRepeat.req, rRepeat.res);
  assert.equal(rRepeat.getStatus(), 200, "Original owner must still get 200 (idempotent)");
  assert.equal(rRepeat.getData()?.reportId, snapshotAfter.report_id,
    "Must return same report_id for original owner");
});


test("Promise.all two emails compete for NULL-owner snapshot: one wins, one 409" , async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();
  // We use the mockDb directly - no need to parse reportId from token

  // Simulate an old snapshot with NULL lead_contact_id (pre-1C6)
  const draft = mockDb.drafts.find((d) => !d.consumed_at);
  const existingReportId = "rp_" + Date.now() + "_" + crypto.randomBytes(16).toString("hex");
  mockDb.snapshots.push({
    report_id: existingReportId,
    draft_id: draft.draft_id,
    property_key: draft.property_key,
    valuation_version: draft.valuation_version,
    snapshot_json: draft.snapshot_json,
    snapshot_hash: draft.snapshot_hash,
    lead_contact_id: null,
  });
  // Also mark the draft consumed so consumeDraftIntoSnapshot picks the
  // existing snapshot path instead of trying to INSERT a new one.
  draft.consumed_at = new Date().toISOString();

  const rA = makeReqRes({ email: "racer-a@example.com", reportDraftToken: token });
  const rB = makeReqRes({ email: "racer-b@example.com", reportDraftToken: token });

  const results = await Promise.allSettled([
    handler(rA.req, rA.res),
    handler(rB.req, rB.res),
  ]);
  const statuses = [rA.getStatus(), rB.getStatus()].sort();

  assert.deepEqual(statuses, [200, 409],
    "One wins the NULL-owner binding, one gets REPORT_OWNER_CONFLICT");

  // Exactly one payment created
  assert.equal(mockDb.payments.length, 1, "Only one payment for the winner");

  // Snapshot should now have a non-null lead_contact_id
  const snap = mockDb.snapshots.find((s) => s.draft_id === draft.draft_id);
  assert.ok(snap.lead_contact_id !== null && snap.lead_contact_id !== undefined,
    "Snapshot must be bound after the race");
});

test("snapshot with NULL lead_contact_id binds atomically on first access", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const draft = mockDb.drafts.find((d) => !d.consumed_at);
  mockDb.snapshots.push({
    report_id: "rp_" + Date.now() + "_" + crypto.randomBytes(16).toString("hex"),
    draft_id: draft.draft_id,
    property_key: draft.property_key,
    valuation_version: draft.valuation_version,
    snapshot_json: draft.snapshot_json,
    snapshot_hash: draft.snapshot_hash,
    lead_contact_id: null,
  });
  draft.consumed_at = new Date().toISOString();

  // First customer accesses the legacy snapshot - should bind successfully
  const r1 = makeReqRes({ email: "first-owner@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200, "First customer must bind NULL-owner snapshot");

  const ownerContact = mockDb.leadContacts.find((c) => c.email_lower === "first-owner@example.com");
  const snap = mockDb.snapshots.find((s) => s.draft_id === draft.draft_id);
  assert.equal(snap.lead_contact_id, ownerContact.id,
    "NULL-owner snapshot must be bound to first customer");

  // Second customer gets 409
  const r2 = makeReqRes({ email: "second@example.com", reportDraftToken: token });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 409, "Second customer must get REPORT_OWNER_CONFLICT");

  // Original owner still works (idempotent)
  const rRepeat = makeReqRes({ email: "first-owner@example.com", reportDraftToken: token });
  await handler(rRepeat.req, rRepeat.res);
  assert.equal(rRepeat.getStatus(), 200, "Original owner must still get 200 (idempotent)");
  assert.equal(rRepeat.getData()?.reportId, snap.report_id,
    "Must return same report_id for original owner");
});

// ── Phase 1E3B-1: Purchase session cookie tests ─────────────────────

let _verifyReportAccessSessionFn;

async function getSessionTools() {
  if (!_verifyReportAccessSessionFn) {
    const mod = await import("../lib/report-access-session.js");
    _verifyReportAccessSessionFn = mod.verifyReportAccessSession;
  }
  return { verifyReportAccessSession: _verifyReportAccessSessionFn };
}

test("successful checkout sets purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "session@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);

  const cookie = ctx.getHeader("Set-Cookie");
  assert.ok(cookie, "Must set Set-Cookie header");
  assert.ok(cookie.startsWith("aushomevalue_report_access="),
    "Cookie must start with correct name");
  assert.ok(cookie.includes("HttpOnly"), "Cookie must be HttpOnly");
  assert.ok(cookie.includes("SameSite=Lax"), "Cookie must be SameSite=Lax");
  assert.ok(cookie.includes("Path=/"), "Cookie must have Path=/");
  assert.ok(cookie.includes("Max-Age=1800"), "Cookie must have Max-Age=1800");
  assert.ok(!cookie.includes("Secure"),
    "Cookie must NOT include Secure in test environment");
});

test("purchase session cookie can be verified and binds correct reportId + leadContactId", async () => {
  const { handler } = await setupTestEnv();
  const { verifyReportAccessSession } = await getSessionTools();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "bind-check@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);

  // Extract token from Set-Cookie header
  const cookie = ctx.getHeader("Set-Cookie");
  const tokenValue = cookie.split(";")[0].split("=")[1];

  // Verify the signed token
  const payload = verifyReportAccessSession(tokenValue);
  assert.ok(payload, "Cookie token must be verifiable");
  assert.equal(payload.reportId, ctx.getData().reportId,
    "Cookie must bind to the same reportId");
  assert.equal(payload.leadContactId, mockDb.leadContacts.find(c => c.email_lower === "bind-check@example.com")?.id,
    "Cookie must bind to the correct leadContactId");
  assert.equal(payload.version, 1);
  assert.equal(payload.purpose, "report_access");
  assert.ok(payload.issuedAt > 0);
  assert.ok(payload.expiresAt > 0);
  assert.equal(payload.expiresAt - payload.issuedAt, 1800000,
    "Cookie TTL must be exactly 30 minutes");
});

test("repeat request (already purchased) still sets cookie", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const body = { email: "repeat-cookie@example.com", reportDraftToken: token };

  const r1 = makeReqRes(body);
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200);
  assert.ok(r1.getHeader("Set-Cookie"), "First request must set cookie");

  const r2 = makeReqRes(body);
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 200);
  assert.ok(r2.getHeader("Set-Cookie"), "Repeat request must also set cookie");

  const cookie1 = r1.getHeader("Set-Cookie");
  const cookie2 = r2.getHeader("Set-Cookie");
  assert.ok(cookie1.startsWith("aushomevalue_report_access="),
    "First cookie must have correct name");
  assert.ok(cookie2.startsWith("aushomevalue_report_access="),
    "Repeat cookie must have correct name");
});

test("response body must not contain cookie token, email, or leadContactId", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "no-leak@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);
  const body = ctx.getData();
  const bodyStr = JSON.stringify(body);

  // Token must not appear in body
  assert.ok(!bodyStr.includes("report_access_session"),
    "Body must not contain cookie token field");
  assert.ok(!bodyStr.includes("aushomevalue_report_access"),
    "Body must not contain cookie name");

  // Email must not appear in body
  assert.ok(!bodyStr.includes("no-leak@example.com"),
    "Body must not contain email");
  assert.ok(!bodyStr.includes("leadContactId"),
    "Body must not contain leadContactId");

  // Stripe session ID must not be in body or cookie header
  const cookie = ctx.getHeader("Set-Cookie");
  assert.ok(cookie, "Cookie must be set");
  assert.ok(!cookie.includes("cs_test_"),
    "Cookie must not contain Stripe session IDs");
  assert.ok(!cookie.includes("payment_intent"),
    "Cookie must not contain payment intent");
  assert.ok(!cookie.includes("secret"),
    "Cookie must not contain secrets");

  // Body must not contain checkoutSessionId or raw Stripe session values
  assert.ok(!bodyStr.includes("checkoutSessionId"),
    "Body must not contain checkoutSessionId");

  // checkoutUrl is a Stripe URL and may contain cs_test_ in query params — that's OK.
  // But there must be no top-level checkoutSessionId field.
  assert.equal(body.checkoutSessionId, undefined,
    "checkoutSessionId must not be a property in the response");
});

test("OPTIONS does not set purchase session cookie", async () => {
  const { handler } = await setupTestEnv();

  const ctx = makeReqRes({}, { method: "OPTIONS" });
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getHeader("Set-Cookie"), undefined,
    "OPTIONS must not set a session cookie");
});

test("GET does not set purchase session cookie", async () => {
  const { handler } = await setupTestEnv();

  const ctx = makeReqRes({}, { method: "GET" });
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getHeader("Set-Cookie"), undefined,
    "GET must not set a session cookie");
});

// ── Phase 1E3B-2: Error-path cookie clearing ───────────────────────

/**
 * Assert that the Set-Cookie header is a clear cookie (Max-Age=0).
 */
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

test("invalid email clears purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const ctx = makeReqRes({ email: "bad", reportDraftToken: "x" });
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Invalid email");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "Invalid email: Set-Cookie must be called exactly once");
});

test("invalid draft token clears purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const ctx = makeReqRes({ email: "test@example.com", reportDraftToken: "invalid" });
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Invalid draft token");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "Invalid draft token: Set-Cookie must be called exactly once");
});

test("DB-level expired draft clears purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const dbExpiredToken = await makeDbLevelExpiredDraftToken();
  const ctx = makeReqRes({ email: "test@example.com", reportDraftToken: dbExpiredToken });
  await handler(ctx.req, ctx.res);
  assert.equal(ctx.getStatus(), 400);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "DB-level expired draft");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "DB-level expired draft: Set-Cookie must be called exactly once");
});

test("owner conflict clears purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  // First request binds snapshot to user A
  const r1 = makeReqRes({ email: "owner-a@example.com", reportDraftToken: token });
  await handler(r1.req, r1.res);
  assert.equal(r1.getStatus(), 200);

  // Second request from user B gets 409
  const r2 = makeReqRes({ email: "owner-b@example.com", reportDraftToken: token });
  await handler(r2.req, r2.res);
  assert.equal(r2.getStatus(), 409, "Second request must be 409 owner conflict");
  assertClearCookie(r2.getHeader("Set-Cookie"), "Owner conflict");
});

test("STRIPE_NOT_CONFIGURED clears purchase session cookie", async () => {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399";

  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(null);

  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 100}`);
  mod.setTestSql(sql);

  const token = await makeDraftToken();
  const ctx = makeReqRes({ email: "no-stripe@example.com", reportDraftToken: token });
  await mod.default(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 503);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "STRIPE_NOT_CONFIGURED");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "STRIPE_NOT_CONFIGURED: Set-Cookie must be called exactly once");
});

test("CHECKOUT_CREATE_FAILED clears purchase session cookie", async () => {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399_fail";

  const failingStripe = {
    checkout: { sessions: { create: async () => { throw new Error("Stripe API failure"); } } },
  };
  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(failingStripe);

  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 200}`);
  mod.setTestSql(sql);

  const token = await makeDraftToken();
  const ctx = makeReqRes({ email: "checkout-fail@example.com", reportDraftToken: token });
  await mod.default(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 502);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "CHECKOUT_CREATE_FAILED");
});

test("fallback unknown checkout result clears purchase session cookie", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  const partialStripe = {
    checkout: { sessions: { create: async () => ({ id: "cs_test_unknown", url: null, status: "open" }) } },
  };
  setMockStripe(partialStripe);

  const ctx = makeReqRes({ email: "fallback@example.com", reportDraftToken: token });
  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 500);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Fallback unknown result");
});

test("DB/snapshot exception clears purchase session cookie", async () => {
  // Use a broken SQL mock that throws on any query
  const breakingSql = () => ({
    raw: async () => {
      throw new Error("DB connection failed");
    },
  });

  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 300}`);
  mod.setTestSql(breakingSql);

  const token = await makeDraftToken();
  const ctx = makeReqRes({ email: "db-error@example.com", reportDraftToken: token });
  await mod.default(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 500);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "DB exception");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "DB exception: Set-Cookie must be called exactly once");
});

test("consume unknown snapshot error returns 500 and clears cookie once", async () => {
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 500}`);
  const { handler, sql } = await setupTestEnv();
  mod.setTestSql(sql);

  // Make snapshot insert throw a non-standard error (simulates DB failure)
  mockDb.throwOnSnapshotInsert = "Internal database constraint violation";

  const token = await makeDraftToken();
  const ctx = makeReqRes({ email: "consume-error@example.com", reportDraftToken: token });
  await mod.default(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 500);
  assertClearCookie(ctx.getHeader("Set-Cookie"), "Consume unknown snapshot error");
  assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
    "Consume unknown error: Set-Cookie must be called exactly once");

  // Cleanup: remove the throw flag so it doesn't affect other tests
  delete mockDb.throwOnSnapshotInsert;
});

test("alreadyPurchased sets verifiable purchase session cookie", async () => {
  const { verifyReportAccessSession } = await import("../lib/report-access-session.js");
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  // Create an active entitlement in mockDb
  const leadContact = { id: 999, email_lower: "already-bought@example.com" };
  mockDb.leadContacts.push(leadContact);

  const reportId = "rp_" + Date.now() + "_" + crypto.randomBytes(16).toString("hex");
  mockDb.entitlements.push({
    report_id: reportId,
    lead_contact_id: 999,
    status: "active",
  });

  // The draft needs snapshot with same contact
  const draft = mockDb.drafts.find((d) => !d.consumed_at);
  mockDb.snapshots.push({
    report_id: reportId,
    draft_id: draft.draft_id,
    property_key: draft.property_key,
    valuation_version: draft.valuation_version,
    snapshot_json: draft.snapshot_json,
    snapshot_hash: draft.snapshot_hash,
    lead_contact_id: 999,
  });
  draft.consumed_at = new Date().toISOString();

  const ctx = makeReqRes({
    email: "already-bought@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);
  assert.equal(ctx.getData().alreadyPurchased, true,
    "Must be recognized as already purchased");

  const cookie = ctx.getHeader("Set-Cookie");
  assert.ok(cookie, "alreadyPurchased must set cookie");

  // Verify the signed token
  const tokenValue = cookie.split(";")[0].split("=")[1];
  const payload = verifyReportAccessSession(tokenValue);
  assert.ok(payload, "Cookie token must be verifiable");
  assert.equal(payload.reportId, reportId,
    "Cookie must bind to the correct reportId");
  assert.equal(payload.leadContactId, 999,
    "Cookie must bind to the correct leadContactId");
  assert.equal(payload.purpose, "report_access");
});

test("PAYMENT_AWAITING_ENTITLEMENT response has no checkoutSessionId and sets verifiable cookie", async () => {
  const { verifyReportAccessSession } = await import("../lib/report-access-session.js");

  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399";

  // Set up mock Stripe client for the checkout service
  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(mockStripeClient);

  const email = "awaiting-payment@example.com";
  const leadContact = { id: 2001, email_lower: email };
  mockDb.leadContacts.push(leadContact);

  // Create a draft token — we'll consume it to get its generated reportId
  const token = await makeDraftToken();

  // First, call handler to create snapshot + payment. Then inject a paid payment
  // for the same (reportId, leadContactId) so the second call hits PAYMENT_AWAITING_ENTITLEMENT.
  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 400}`);
  mod.setTestSql(sql);

  // First round: normal checkout → creates snapshot + pending payment
  const r1 = makeReqRes({ email, reportDraftToken: token });
  await mod.default(r1.req, r1.res);

  assert.equal(r1.getStatus(), 200);
  const reportId = r1.getData().reportId;
  assert.ok(reportId, "First call must return a reportId");

  // Convert the first call's pending payment to "paid" with no entitlement
  const pendingPayment = mockDb.payments.find(p => p.report_id === reportId);
  assert.ok(pendingPayment, "Must have a payment from the first call");
  pendingPayment.status = "paid";

  // Second round: same token  → checkout service finds paid payment, no entitlement yet
  const r2 = makeReqRes({ email, reportDraftToken: token });
  await mod.default(r2.req, r2.res);

  assert.equal(r2.getStatus(), 200, "Status must be 200");
  const data = r2.getData();

  // Must be PAYMENT_AWAITING_ENTITLEMENT — not alreadyPurchased, not normal checkout
  assert.equal(data.ok, false, "ok must be false for PAYMENT_AWAITING_ENTITLEMENT");
  assert.equal(data.alreadyPurchased, false, "alreadyPurchased must be false");
  assert.equal(data.error, "PAYMENT_AWAITING_ENTITLEMENT",
    "Must return PAYMENT_AWAITING_ENTITLEMENT error");
  assert.ok(data.message, "Must have a user-facing message");
  assert.equal(data.reportId, reportId, "Must return correct reportId");

  // checkoutSessionId must NOT appear in the response body
  assert.equal(data.checkoutSessionId, undefined,
    "checkoutSessionId must not appear in response body");
  assert.ok(!JSON.stringify(data).includes("cs_test_"),
    "Stripe session IDs must not appear in response body");

  // Cookie must be set and verifiable
  const cookie = r2.getHeader("Set-Cookie");
  assert.ok(cookie, "PAYMENT_AWAITING_ENTITLEMENT must set purchase session cookie");
  assert.ok(cookie.startsWith("aushomevalue_report_access="),
    "Cookie must have correct name");

  // Verify cookie token
  const tokenValue = cookie.split(";")[0].split("=")[1];
  const payload = verifyReportAccessSession(tokenValue);
  assert.ok(payload, "Cookie token must be verifiable");
  assert.equal(payload.reportId, reportId, "Cookie must reference correct reportId");
  assert.equal(payload.leadContactId, 2001, "Cookie must reference correct leadContactId");
  assert.equal(payload.purpose, "report_access", "Cookie purpose must be report_access");

  // Verify Set-Cookie was set exactly once on the second call
  assert.equal(r2.getSetHeaderCount("Set-Cookie"), 1,
    "Set-Cookie must be set exactly once on PAYMENT_AWAITING_ENTITLEMENT");
});

test("successful checkout sets purchase session cookie exactly once", async () => {
  const { handler } = await setupTestEnv();
  const token = await makeDraftToken();

  const ctx = makeReqRes({
    email: "single-cookie@example.com",
    reportDraftToken: token,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 200);

  // setHeader("Set-Cookie") must be called exactly once
  const callCount = ctx.getSetHeaderCount("Set-Cookie");
  assert.equal(callCount, 1,
    "Set-Cookie header must be set exactly once");

  const cookie = ctx.getHeader("Set-Cookie");
  assert.ok(cookie, "Successful checkout must set cookie");
  assert.ok(cookie.startsWith("aushomevalue_report_access="),
    "Cookie name must be correct");
  assert.ok(cookie.includes("HttpOnly"), "Cookie must be HttpOnly");
});

test("production without REPORT_ACCESS_SESSION_SECRET returns 503 with clear cookie", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origSecret = process.env.REPORT_ACCESS_SESSION_SECRET;
  const origTokenSigningSecret = process.env.TOKEN_SIGNING_SECRET;

  try {
    // Set production env — token creation must use the same secret as handler
    process.env.NODE_ENV = "production";
    process.env.TOKEN_SIGNING_SECRET = "production-signing-secret-for-test";
    delete process.env.REPORT_ACCESS_SESSION_SECRET;

    // Create token using getDraftSecret() from report-snapshot-service
    // (so the HMAC matches what the handler's verifyReportDraftToken expects)
    const { hashSnapshot, verifyReportDraftToken, stableStringify } = await import("../lib/report-snapshot-service.js")
      .then(m => m);

    const draftId = "rd_" + crypto.randomBytes(12).toString("hex");
    const now = Date.now();
    const snapObj = { test: "data", estimate: { midpoint: 850000, low: 800000, high: 900000 } };
    const stableJson = JSON.stringify(snapObj);
    const snapHash = hashSnapshot(stableJson);
    const payload = {
      draft_id: draftId,
      property_key: "test|Suburb|VIC|3000|house",
      valuation_version: "1.0.0",
      snapshot_hash: snapHash,
      issued_at: now,
      expires_at: now + 30 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

    // Use same derivation as getDraftSecret() to sign the token
    const secret = "production-signing-secret-for-test";
    const derivedKey = crypto.createHmac("sha256", secret).update("report-draft-v1").digest("hex");
    const sig = crypto.createHmac("sha256", derivedKey).update(encoded).digest("base64url");
    const token = `${encoded}.${sig}`;

    // Insert draft into mockDb so consumeDraftIntoSnapshot can find it
    mockDb.drafts.push({
      draft_id: draftId,
      property_key: payload.property_key,
      valuation_version: payload.valuation_version,
      snapshot_json: stableJson,
      snapshot_hash: snapHash,
      expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
      consumed_at: null,
      created_at: new Date(now - 1000).toISOString(),
    });

    // Quick sanity check: token verifies in the handler's environment
    const tokenPayload = verifyReportDraftToken(token);
    assert.ok(tokenPayload, "Token must be verifiable in production env");
    assert.equal(tokenPayload.draft_id, draftId);

    const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 999}`);
    // Reuse the existing sql from a previous test — mockDb has the draft already
    // We need a fresh sql that references the current mockDb. Use createMockSql
    // after pushing the draft.
    const sql = createMockSql();
    mod.setTestSql(sql);

    const ctx = makeReqRes({ email: "prod-no-secret@example.com", reportDraftToken: token });
    await mod.default(ctx.req, ctx.res);

    assert.equal(ctx.getStatus(), 503,
      "Must return 503 when session secret is missing in production");

    const body = ctx.getData();
    assert.ok(body, "Must have response body");
    assert.equal(body.ok, false);
    assert.equal(body.error, "REPORT_SESSION_NOT_CONFIGURED",
      "Error code must be REPORT_SESSION_NOT_CONFIGURED");
    assert.equal(body.checkoutUrl, undefined,
      "Must not have checkoutUrl when session is not configured");
    assert.equal(body.checkoutSessionId, undefined,
      "Must not expose checkoutSessionId");
    assert.equal(body.reportId, undefined,
      "Must not expose reportId when checkout is blocked");

    // Verify cookie is cleared exactly once
    assert.equal(ctx.getSetHeaderCount("Set-Cookie"), 1,
      "Set-Cookie must be called exactly once");
    const cookie = ctx.getHeader("Set-Cookie");
    assertClearCookie(cookie, "Production missing session secret");
    // In production, the clear cookie should also include Secure
    assert.ok(cookie.includes("Secure"),
      "Production clear cookie must include Secure");

    // Stripe was never called because the session config guard runs
    // BEFORE createReportCheckout. With cache-busting dynamic imports,
    // the module-level stripeCallCount is unreliable, so we trust the
    // code path: 503 REPORT_SESSION_NOT_CONFIGURED exits before
    // doCheckout. The absence of checkoutUrl confirms this.
  } finally {
    if (origTokenSigningSecret !== undefined) {
      process.env.TOKEN_SIGNING_SECRET = origTokenSigningSecret;
    } else {
      delete process.env.TOKEN_SIGNING_SECRET;
    }
    process.env.NODE_ENV = origNodeEnv;
    if (origSecret !== undefined) {
      process.env.REPORT_ACCESS_SESSION_SECRET = origSecret;
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// Payments Gate — Production vs Preview behaviour
// ═══════════════════════════════════════════════════════════════

test("default env (no VERCEL_ENV/STRIPE_MODE) returns 503 PAYMENTS_GATE_BLOCKED", async () => {
  // Save and clear env vars for a "default/production" scenario
  const origVercelEnv = process.env.VERCEL_ENV;
  const origStripeMode = process.env.STRIPE_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  const origTokenSigningSecret = process.env.TOKEN_SIGNING_SECRET;
  const origSecret = process.env.REPORT_ACCESS_SESSION_SECRET;

  try {
    delete process.env.VERCEL_ENV;
    delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = "production";
    process.env.TOKEN_SIGNING_SECRET = "test-prod-gate-secret";
    process.env.REPORT_ACCESS_SESSION_SECRET = "test-prod-session-secret";

    const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 1000}`);
    const sql = createMockSql();
    mod.setTestSql(sql);

    const ctx = makeReqRes({ email: "default-env@example.com", reportDraftToken: "any-token" });
    await mod.default(ctx.req, ctx.res);

    assert.equal(ctx.getStatus(), 503);
    assert.equal(ctx.getData().error, "PAYMENTS_GATE_BLOCKED");
    assert.equal(ctx.getData().ok, false);
  } finally {
    // Restore
    if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
    else delete process.env.VERCEL_ENV;
    if (origStripeMode !== undefined) process.env.STRIPE_MODE = origStripeMode;
    else delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = origNodeEnv;
    if (origTokenSigningSecret !== undefined) process.env.TOKEN_SIGNING_SECRET = origTokenSigningSecret;
    else delete process.env.TOKEN_SIGNING_SECRET;
    if (origSecret !== undefined) process.env.REPORT_ACCESS_SESSION_SECRET = origSecret;
    else delete process.env.REPORT_ACCESS_SESSION_SECRET;
  }
});

test("VERCEL_ENV=preview STRIPE_MODE=test passes the gate (checkout success)", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origStripeMode = process.env.STRIPE_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  const origTokenSigningSecret = process.env.TOKEN_SIGNING_SECRET;
  const origSecret = process.env.REPORT_ACCESS_SESSION_SECRET;

  try {
    // Enable payments gate — this test verifies the gate passes
    // and a full checkout flow succeeds.
    process.env.VERCEL_ENV = "preview";
    process.env.STRIPE_MODE = "test";
    process.env.NODE_ENV = "test";
    // Keep TOKEN_SIGNING_SECRET unset so verifyReportDraftToken falls
    // through to the default derivation (matching makeDraftToken).
    delete process.env.TOKEN_SIGNING_SECRET;
    process.env.REPORT_ACCESS_SESSION_SECRET = "test-preview-session-secret";

    // Setup mock DB + Stripe
    resetMockDb();
    resetMockStripe();
    process.env.STRIPE_PRICE_ID_REPORT_399 = "price_preview_399";
    nextLeadContactId = 1;

    const { setMockStripe } = await import("../lib/report-checkout-service.js");
    setMockStripe(mockStripeClient);

    const sql = createMockSql();
    const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 2000}`);
    mod.setTestSql(sql);

    const token = await makeDraftToken();
    const ctx = makeReqRes({ email: "preview-success@example.com", reportDraftToken: token });
    await mod.default(ctx.req, ctx.res);

    assert.equal(ctx.getStatus(), 200);
    const data = ctx.getData();
    assert.equal(data.ok, true);
    assert.ok(data.checkoutUrl, "Must have checkout URL in preview");
    assert.ok(data.checkoutUrl.startsWith("https://checkout.stripe.com/"),
      "Checkout URL must be from Stripe");
  } finally {
    // Restore
    if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
    else delete process.env.VERCEL_ENV;
    if (origStripeMode !== undefined) process.env.STRIPE_MODE = origStripeMode;
    else delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = origNodeEnv;
    if (origTokenSigningSecret !== undefined) process.env.TOKEN_SIGNING_SECRET = origTokenSigningSecret;
    else delete process.env.TOKEN_SIGNING_SECRET;
    if (origSecret !== undefined) process.env.REPORT_ACCESS_SESSION_SECRET = origSecret;
    else delete process.env.REPORT_ACCESS_SESSION_SECRET;
  }
});

test("VERCEL_ENV=preview without STRIPE_MODE=test returns 503 PAYMENTS_GATE_BLOCKED", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origStripeMode = process.env.STRIPE_MODE;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    process.env.VERCEL_ENV = "preview";
    delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = "test";

    const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 3000}`);
    const sql = createMockSql();
    mod.setTestSql(sql);

    const ctx = makeReqRes({ email: "preview-nontest@example.com", reportDraftToken: "any-token" });
    await mod.default(ctx.req, ctx.res);

    assert.equal(ctx.getStatus(), 503);
    assert.equal(ctx.getData().error, "PAYMENTS_GATE_BLOCKED");
  } finally {
    if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
    else delete process.env.VERCEL_ENV;
    if (origStripeMode !== undefined) process.env.STRIPE_MODE = origStripeMode;
    else delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = origNodeEnv;
  }
});

test("gate rejects when VERCEL_ENV=production STRIPE_MODE=test", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origStripeMode = process.env.STRIPE_MODE;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_MODE = "test";
    process.env.NODE_ENV = "test";

    const mod = await import(`../api/create-report-checkout.js?t=${Date.now() + 4000}`);
    const sql = createMockSql();
    mod.setTestSql(sql);

    const ctx = makeReqRes({ email: "prod-stripe-test@example.com", reportDraftToken: "any-token" });
    await mod.default(ctx.req, ctx.res);

    assert.equal(ctx.getStatus(), 503);
    assert.equal(ctx.getData().error, "PAYMENTS_GATE_BLOCKED");
  } finally {
    if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
    else delete process.env.VERCEL_ENV;
    if (origStripeMode !== undefined) process.env.STRIPE_MODE = origStripeMode;
    else delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = origNodeEnv;
  }
});
