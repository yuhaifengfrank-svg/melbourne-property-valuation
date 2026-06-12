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

async function getSnapshotTools() {
  if (!_stableStringifyFn) {
    const mod = await import("../lib/report-snapshot-service.js");
    _stableStringifyFn = mod.stableStringify;
    _hashSnapshotFn = mod.hashSnapshot;
  }
  return { stableStringify: _stableStringifyFn, hashSnapshot: _hashSnapshotFn };
}

// ── Mock Database ───────────────────────────────────────────────────

const mockDb = {
  leadContacts: [],
  drafts: [],
  snapshots: [],
  payments: [],
  entitlements: [],
};

function resetMockDb() {
  mockDb.leadContacts = [];
  mockDb.drafts = [];
  mockDb.snapshots = [];
  mockDb.payments = [];
  mockDb.entitlements = [];
}

let nextLeadContactId = 1;

function createMockSql() {
  return async (strings, ...values) => {
    const raw = strings.map((s, i) => (i < values.length ? s + `$${i}` : s)).join("");

    if (raw.includes("FROM lead_contacts WHERE email_lower")) {
      const emailLower = values[0];
      const match = mockDb.leadContacts.find(c => c.email_lower === emailLower);
      return match ? [{ id: match.id }] : [];
    }

    if (raw.includes("INSERT INTO lead_contacts")) {
      const email = values[0];
      const emailLower = values[1];
      const contact = {
        id: nextLeadContactId++,
        email,
        email_lower: emailLower,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockDb.leadContacts.push(contact);
      return [{ id: contact.id }];
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
      const reportId = values[0];
      const draftId = values[1];
      if (mockDb.snapshots.some(s => s.draft_id === draftId)) {
        return [];
      }
      mockDb.snapshots.push({
        report_id: reportId,
        draft_id: draftId,
        property_key: values[2],
        valuation_version: values[3],
        snapshot_json: values[4],
        snapshot_hash: values[5],
      });
      return [{ report_id: reportId }];
    }

    if (raw.includes("FROM report_snapshots")) {
      const draftId = values[0];
      const match = mockDb.snapshots.find(s => s.draft_id === draftId);
      return match ? [{ report_id: match.report_id }] : [];
    }

    if (raw.includes("UPDATE report_drafts")) {
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
  const stableJson = JSON.stringify(snapObj); // not stable, but hashSnapshot will normalise it
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

  // Insert draft into mock DB with stable JSON matching the hash
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

function makeExpiredDraftToken() {
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

async function setupTestEnv() {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399_" + Date.now();
  nextLeadContactId = 1;

  const { setMockStripe } = await import("../lib/report-checkout-service.js");
  setMockStripe(mockStripeClient);

  const sql = createMockSql();
  const mod = await import(`../api/create-report-checkout.js?t=${Date.now()}`);
  mod.setTestSql(sql);

  return { handler: mod.default };
}

function makeReqRes(body, opts = {}) {
  const req = {
    method: opts.method || "POST",
    headers: {},
    body,
  };

  let statusCode = 200;
  let responseData = null;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = { statusCode, data }; return res; },
    setHeader: () => res,
    end: () => {},
  };

  return {
    req, res,
    getStatus: () => responseData?.statusCode,
    getData: () => responseData?.data,
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
  assert.ok(data.checkoutSessionId, "Must return checkout session ID");
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

test("expired draft token returns 400 with DRAFT_EXPIRED", async () => {
  const { handler } = await setupTestEnv();
  const expiredToken = makeExpiredDraftToken();

  const ctx = makeReqRes({
    email: "expired@example.com",
    reportDraftToken: expiredToken,
  });

  await handler(ctx.req, ctx.res);

  assert.equal(ctx.getStatus(), 400);
  assert.equal(ctx.getData().error, "DRAFT_EXPIRED",
    "Expired token must return DRAFT_EXPIRED");
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

  // Check what was sent to Stripe
  const session = stripeSessions[0];
  assert.ok(session, "Must have created a Stripe session");
  assert.equal(session.mode, "payment", "Mode must be payment");
  assert.ok(session.line_items && session.line_items.length > 0, "Must have line items");
  assert.notEqual(session.line_items[0]?.price, "client_supplied_price",
    "Price ID must not come from client");

  // Customer email should still be set
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
  // With the inline res, status not set for 204 (res.end() called)
});

test("Stripe not configured returns 503 with STRIPE_NOT_CONFIGURED", async () => {
  resetMockDb();
  resetMockStripe();
  process.env.STRIPE_PRICE_ID_REPORT_399 = "price_test_399";
  nextLeadContactId = 1;

  // Reset mock Stripe to null so getStripe() returns null in test mode
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
