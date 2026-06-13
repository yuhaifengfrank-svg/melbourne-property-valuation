// ── tests/report-access-session-tests.mjs ──
// Phase 1E3A: Purchase Session Cookie — tests.
//
// Tests for lib/report-access-session.js.
// No Stripe network, no production DB.
// Uses mock secret for all signing operations.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

// ── Constants ───────────────────────────────────────────────────────

const MOCK_SECRET = "test-secret-123";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function makeReportId() {
  const ts = Date.now();
  const hex = crypto.randomBytes(16).toString("hex");
  return `rp_${ts}_${hex}`;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a mock request object with a Cookie header.
 */
function makeRequest(cookieValue) {
  return {
    headers: {
      cookie: cookieValue ? `aushomevalue_report_access=${cookieValue}` : "",
    },
  };
}

/**
 * Fast-forward Date.now() by a given number of milliseconds.
 * Returns a cleanup function.
 */
function advanceTime(ms) {
  const originalNow = Date.now;
  const start = originalNow();
  Date.now = () => start + ms;
  return () => { Date.now = originalNow; };
}

// ── Load module ─────────────────────────────────────────────────────

let mod;
async function loadMod() {
  if (!mod) {
    mod = await import("../lib/report-access-session.js");
  }
  return mod;
}

// ── Tests ───────────────────────────────────────────────────────────

test("create and verify valid session", async () => {
  const { createReportAccessSession, verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  const token = createReportAccessSession({ reportId, leadContactId }, { mockSecret: MOCK_SECRET });
  assert.ok(token, "Token should be non-empty");
  assert.equal(token.split(".").length, 2, "Token should have two parts");

  const payload = verifyReportAccessSession(token, { mockSecret: MOCK_SECRET });
  assert.ok(payload, "Payload should verify");
  assert.equal(payload.reportId, reportId);
  assert.equal(payload.leadContactId, leadContactId);
  assert.equal(payload.version, 1);
  assert.equal(payload.purpose, "report_access");
  assert.ok(payload.issuedAt > 0);
  assert.ok(payload.expiresAt > 0);
});

test("payload only contains allowed fields", async () => {
  const { createReportAccessSession, verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  const token = createReportAccessSession({ reportId, leadContactId }, { mockSecret: MOCK_SECRET });
  const payload = verifyReportAccessSession(token, { mockSecret: MOCK_SECRET });

  const allowedKeys = ["version", "purpose", "reportId", "leadContactId", "issuedAt", "expiresAt"];
  const actualKeys = Object.keys(payload);
  for (const key of actualKeys) {
    assert.ok(allowedKeys.includes(key), `Unexpected key in payload: ${key}`);
  }
  assert.equal(actualKeys.length, allowedKeys.length, "Payload should have exactly 6 keys");
});

test("TTL is exactly 30 minutes", async () => {
  const { createReportAccessSession, verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  const token = createReportAccessSession({ reportId, leadContactId }, { mockSecret: MOCK_SECRET });
  const payload = verifyReportAccessSession(token, { mockSecret: MOCK_SECRET });

  const ttl = payload.expiresAt - payload.issuedAt;
  assert.equal(ttl, TTL_MS, `TTL should be ${TTL_MS}ms`);
});

test("tampered token rejected", async () => {
  const { createReportAccessSession, verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  const token = createReportAccessSession({ reportId, leadContactId }, { mockSecret: MOCK_SECRET });
  const parts = token.split(".");

  // Tamper with signature
  const tamperedSig = `${parts[0]}.invalidsignature`;
  assert.equal(verifyReportAccessSession(tamperedSig, { mockSecret: MOCK_SECRET }), null);

  // Tamper with payload
  const fakePayload = { ...JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")), reportId: "rp_0_fake" };
  const fakeEncoded = Buffer.from(JSON.stringify(fakePayload)).toString("base64url");
  const tamperedPayload = `${fakeEncoded}.${parts[1]}`;
  assert.equal(verifyReportAccessSession(tamperedPayload, { mockSecret: MOCK_SECRET }), null);

  // Bad format
  assert.equal(verifyReportAccessSession("not-a-token", { mockSecret: MOCK_SECRET }), null);
  assert.equal(verifyReportAccessSession("too.many.parts", { mockSecret: MOCK_SECRET }), null);
  assert.equal(verifyReportAccessSession("", { mockSecret: MOCK_SECRET }), null);
  assert.equal(verifyReportAccessSession(null, { mockSecret: MOCK_SECRET }), null);
});

test("token with missing expiresAt returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with expiresAt=0 returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: Date.now(),
    expiresAt: 0,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with string expiresAt returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: Date.now(),
    expiresAt: "far-future",
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with missing issuedAt returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    expiresAt: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with future issuedAt (>60s clock skew) returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const futureIssue = Date.now() + 120000; // 2 minutes in the future
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: futureIssue,
    expiresAt: futureIssue + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with TTL > 30 minutes returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const now = Date.now();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: now,
    expiresAt: now + TTL_MS + 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with TTL < 30 minutes returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const now = Date.now();
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: now,
    expiresAt: now + TTL_MS - 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("token with expiresAt equal to current time returns null", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const now = Date.now();
  // expiresAt == now triggers the `<=` check
  const payload = {
    version: 1,
    purpose: "report_access",
    reportId,
    leadContactId: 123,
    issuedAt: now - TTL_MS,
    expiresAt: now,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("expired token rejected", async () => {
  const { createReportAccessSession, verifyReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  const token = createReportAccessSession({ reportId, leadContactId }, { mockSecret: MOCK_SECRET });

  // Advance clock past expiry
  const restoreTime = advanceTime(TTL_MS + 1000);
  try {
    const payload = verifyReportAccessSession(token, { mockSecret: MOCK_SECRET });
    assert.equal(payload, null, "Expired token should be rejected");
  } finally {
    restoreTime();
  }
});

test("wrong purpose rejected", async () => {
  const { createReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  // Create a token with wrong purpose by manually building one
  const wrongPayload = {
    version: 1,
    purpose: "opportunity_gate",
    reportId,
    leadContactId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(wrongPayload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  const { verifyReportAccessSession } = await loadMod();
  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("wrong version rejected", async () => {
  const { createReportAccessSession } = await loadMod();
  const reportId = makeReportId();
  const leadContactId = 123;

  // Create a token with wrong version
  const wrongPayload = {
    version: 99,
    purpose: "report_access",
    reportId,
    leadContactId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(wrongPayload)).toString("base64url");
  const sig = crypto.createHmac("sha256", MOCK_SECRET).update(encoded).digest("base64url");
  const token = `${encoded}.${sig}`;

  const { verifyReportAccessSession } = await loadMod();
  assert.equal(verifyReportAccessSession(token, { mockSecret: MOCK_SECRET }), null);
});

test("invalid reportId rejected at creation", async () => {
  const { createReportAccessSession } = await loadMod();

  assert.throws(() => {
    createReportAccessSession({ reportId: "invalid", leadContactId: 123 }, { mockSecret: MOCK_SECRET });
  }, /Invalid reportId/);

  assert.throws(() => {
    createReportAccessSession({ reportId: "", leadContactId: 123 }, { mockSecret: MOCK_SECRET });
  }, /Invalid reportId/);

  assert.throws(() => {
    createReportAccessSession({ reportId: null, leadContactId: 123 }, { mockSecret: MOCK_SECRET });
  }, /Invalid reportId/);
});

test("invalid leadContactId rejected at creation", async () => {
  const { createReportAccessSession } = await loadMod();
  const reportId = makeReportId();

  assert.throws(() => {
    createReportAccessSession({ reportId, leadContactId: 0 }, { mockSecret: MOCK_SECRET });
  }, /Invalid leadContactId/);

  assert.throws(() => {
    createReportAccessSession({ reportId, leadContactId: -1 }, { mockSecret: MOCK_SECRET });
  }, /Invalid leadContactId/);

  assert.throws(() => {
    createReportAccessSession({ reportId, leadContactId: 1.5 }, { mockSecret: MOCK_SECRET });
  }, /Invalid leadContactId/);

  assert.throws(() => {
    createReportAccessSession({ reportId, leadContactId: null }, { mockSecret: MOCK_SECRET });
  }, /Invalid leadContactId/);
});

test("production env without secret throws on create", async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.REPORT_ACCESS_SESSION_SECRET;

  process.env.NODE_ENV = "production";
  delete process.env.REPORT_ACCESS_SESSION_SECRET;

  try {
    const { createReportAccessSession } = await loadMod();
    const reportId = makeReportId();
    assert.throws(() => {
      createReportAccessSession({ reportId, leadContactId: 123 });
    }, /REPORT_ACCESS_SESSION_SECRET/);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.REPORT_ACCESS_SESSION_SECRET = originalSecret;
  }
});

test("production env without secret returns null on verify", async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.REPORT_ACCESS_SESSION_SECRET;

  process.env.NODE_ENV = "production";
  delete process.env.REPORT_ACCESS_SESSION_SECRET;

  try {
    const { verifyReportAccessSession } = await loadMod();
    const result = verifyReportAccessSession("some.token.here");
    assert.equal(result, null);
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret) process.env.REPORT_ACCESS_SESSION_SECRET = originalSecret;
  }
});

test("timingSafeEqual with different length buffers — no exception leak", async () => {
  const { verifyReportAccessSession } = await loadMod();
  const token = "short.invalidsigthatistoolongbutdifferentlength";
  // Should return null gracefully, not throw
  const result = verifyReportAccessSession(token, { mockSecret: MOCK_SECRET });
  assert.equal(result, null);
});

test("cookie includes HttpOnly", async () => {
  const { createReportAccessSession, buildReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const cookie = buildReportAccessCookie(token, { secure: false });
  assert.ok(cookie.includes("HttpOnly"), "Cookie should include HttpOnly");
});

test("production cookie includes Secure", async () => {
  const { createReportAccessSession, buildReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const cookie = buildReportAccessCookie(token, { secure: true });
  assert.ok(cookie.includes("Secure"), "Production cookie should include Secure");
});

test("non-production cookie does not include Secure", async () => {
  const { createReportAccessSession, buildReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const cookie = buildReportAccessCookie(token, { secure: false });
  assert.ok(!cookie.includes("Secure"), "Non-production cookie should not include Secure");
});

test("cookie includes SameSite=Lax", async () => {
  const { createReportAccessSession, buildReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const cookie = buildReportAccessCookie(token, { secure: false });
  assert.ok(cookie.includes("SameSite=Lax"), "Cookie should include SameSite=Lax");
});

test("cookie has Max-Age=1800", async () => {
  const { createReportAccessSession, buildReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const cookie = buildReportAccessCookie(token, { secure: false });
  assert.ok(cookie.includes("Max-Age=1800"), "Cookie should have Max-Age=1800");
});

test("clear cookie uses Max-Age=0", async () => {
  const { buildClearReportAccessCookie } = await loadMod();

  const clear = buildClearReportAccessCookie({ secure: false });
  assert.ok(clear.includes("Max-Age=0"), "Clear cookie should have Max-Age=0");
  assert.ok(clear.includes("HttpOnly"), "Clear cookie should include HttpOnly");
  assert.ok(clear.includes("SameSite=Lax"), "Clear cookie should include SameSite=Lax");
});

test("extractReportAccessCookie reads correctly", async () => {
  const { createReportAccessSession, extractReportAccessCookie } = await loadMod();
  const reportId = makeReportId();
  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  const req = makeRequest(token);
  const extracted = extractReportAccessCookie(req);
  assert.equal(extracted, token);
});

test("extractReportAccessCookie returns null when no cookie", async () => {
  const { extractReportAccessCookie } = await loadMod();

  assert.equal(extractReportAccessCookie({ headers: {} }), null);
  assert.equal(extractReportAccessCookie({}), null);
  assert.equal(extractReportAccessCookie(null), null);
});

test("opportunity cookie not readable as report access", async () => {
  const { extractReportAccessCookie } = await loadMod();

  // Set only the opportunity gate cookie
  const req = {
    headers: {
      cookie: "aushomevalue_opportunity_gate=some_token_value",
    },
  };
  const extracted = extractReportAccessCookie(req);
  assert.equal(extracted, null, "Must not read opportunity gate cookie");
});

test("cookie does not contain email, Stripe IDs, or sensitive info", async () => {
  const { createReportAccessSession } = await loadMod();
  const reportId = makeReportId();

  const token = createReportAccessSession({ reportId, leadContactId: 123 }, { mockSecret: MOCK_SECRET });

  // Decode the payload from the token
  const encoded = token.split(".")[0];
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");

  // These must never appear in the session payload
  assert.ok(!decoded.includes("email"), "Payload must not contain email");
  assert.ok(!decoded.includes("stripe"), "Payload must not contain stripe");
  assert.ok(!decoded.includes("payment_intent"), "Payload must not contain payment_intent");
  assert.ok(!decoded.includes("checkout_session"), "Payload must not contain checkout_session");
  assert.ok(!decoded.includes("snapshot"), "Payload must not contain snapshot");
  assert.ok(!decoded.includes("amount"), "Payload must not contain amount");
  assert.ok(!decoded.includes("price"), "Payload must not contain price");
});

test("does not connect to real Stripe or production DB", () => {
  assert.equal(typeof process.env.DATABASE_URL === "string" ? "string" : "undefined", "undefined");
  assert.equal(typeof process.env.STRIPE_SECRET_KEY === "string" ? "string" : "undefined", "undefined");
});
