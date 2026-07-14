import test from "node:test";
import assert from "node:assert/strict";
import handler, { setTestSql } from "../api/investor-watch.js";
import { hashOpaqueToken } from "../lib/member-session-service.js";

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

// ── getSql call counter ──
let getSqlCallCount = 0;

function getSqlCounter() {
  getSqlCallCount++;
  return async () => [];
}

// ── Request builders ──
function noCookieRequest(method, action, body) {
  return { method, body, query: { action }, headers: {} };
}

function cookieRequest(method, action, body, value) {
  return {
    method, body, query: { action },
    headers: { cookie: `aushomevalue_member_session=${value || "opaque-session"}` },
  };
}

// ========================================================================
// 1. No cookie → 401, getSql() never called
// ========================================================================

for (const action of ["status", "items", "history"]) {
  test(`no cookie on ${action} returns 401 and never calls getSql`, async () => {
    getSqlCallCount = 0;
    setTestSql(getSqlCounter);
    const response = responseRecorder();
    await handler(noCookieRequest("GET", action), response);
    assert.equal(response.statusCode, 401, `${action} should be 401`);
    assert.equal(response.body.error, "UNAUTHENTICATED");
    assert.equal(getSqlCallCount, 0, `getSql must NOT be called for no-cookie ${action}`);
  });
}

// ========================================================================
// 2. Monitor is exception — CRON_SECRET, no cookie
// ========================================================================

test("monitor without Bearer returns 401 UNAUTHENTICATED", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  setTestSql(async () => []);
  const response = responseRecorder();
  await handler(noCookieRequest("GET", "monitor"), response);
  assert.equal(response.statusCode, 401);
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
});

test("monitor with valid Bearer succeeds (no cookie required)", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  setTestSql(async (strings) => {
    assert.match(strings.join("?"), /FROM investor_watch_items/);
    return [];
  });
  const response = responseRecorder();
  await handler({
    method: "GET", query: { action: "monitor" },
    headers: { authorization: "Bearer test-cron-secret" },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.summary, { candidates: 0, captured: 0, events: 0 });
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
});

// ========================================================================
// 3. Cookie + DB throws → 503, safeLog with phase + whitelisted code
//    Notes: testSql bypasses _db.js getSql(), so the throw surfaces in
//    resolveMemberSession → safeLog phase=session-resolution, not database-init.
// ========================================================================

test("cookie + DB throws DATABASE_URL not configured → 503 + safeLog", async () => {
  const logs = [];
  const origError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  setTestSql(() => { throw new Error("DATABASE_URL is not configured"); });
  const response = responseRecorder();
  await handler(cookieRequest("GET", "status"), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, "INVESTOR_WATCH_UNAVAILABLE");

  assert.equal(logs.length >= 1, true);
  // Phase indicates where the throw surfaced: session-resolution
  assert.match(logs[0], /session-resolution/);
  // Whitelisted code in log
  assert.match(logs[0], /DATABASE_URL is not configured/);
  // Must NOT contain raw secrets
  assert.equal(logs[0].includes("postgresql://"), false, "must not leak connection string");
  assert.equal(logs[0].includes("neondb_owner"), false, "must not leak DB user");
  assert.equal(logs[0].includes("Error:"), false, "must not leak raw Error: prefix");

  console.error = origError;
});

test("cookie + DB throws host not approved → 503 + safeLog", async () => {
  const logs = [];
  const origError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  setTestSql(() => { throw new Error("Preview database host is not approved"); });
  const response = responseRecorder();
  await handler(cookieRequest("GET", "status"), response);
  assert.equal(response.statusCode, 503);
  assert.equal(logs.length >= 1, true);
  assert.match(logs[0], /session-resolution/);
  assert.match(logs[0], /Preview database host is not approved/);
  assert.equal(logs[0].includes("postgresql://"), false);
  assert.equal(logs[0].includes("Error:"), false);
  console.error = origError;
});

// ========================================================================
// 4. Cookie + resolveMemberSession query throws → 503
// ========================================================================

test("cookie + resolveMemberSession throws at query → 503 + session-resolution log", async () => {
  const logs = [];
  const origError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  setTestSql(async () => { throw new Error("SQL client is required"); });
  const response = responseRecorder();
  await handler(cookieRequest("GET", "status"), response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, "INVESTOR_WATCH_UNAVAILABLE");
  assert.equal(logs.length >= 1, true);
  assert.match(logs[0], /session-resolution/);
  assert.match(logs[0], /SQL client is required/);
  assert.equal(logs[0].includes("postgresql://"), false);
  console.error = origError;
});

// ========================================================================
// 5. safeLog whitelist enforcement — no raw message leak
// ========================================================================

test("safeLog respects whitelist — connection string classified as OTHER, not leaked", async () => {
  const logs = [];
  const origError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  // Throw with a connection-string-like message that is NOT in whitelist
  setTestSql(() => {
    throw new Error("postgresql://user:pass@neondb_owner123.us-east-2.aws.neon.tech/neondb");
  });
  const response = responseRecorder();
  await handler(cookieRequest("GET", "status"), response);
  assert.equal(response.statusCode, 503);

  assert.equal(logs.length >= 1, true);
  // Since message is not whitelisted → safeCode = "OTHER"
  assert.match(logs[0], /OTHER/);
  // Must NOT contain the raw error.message
  assert.equal(logs[0].includes("postgresql://"), false, "must not leak connection string");
  assert.equal(logs[0].includes("neondb_owner"), false, "must not leak DB user");
  assert.equal(logs[0].includes("session_token"), false, "must not leak session token");
  assert.equal(logs[0].includes("Error:"), false, "must not leak raw Error: prefix");

  console.error = origError;
});

// ========================================================================
// 6. Valid cookie + valid session → status returns 200
// ========================================================================

function memberSql(nextQuery) {
  return async (strings, ...values) => {
    const raw = strings.join("?");
    if (raw.includes("FROM member_sessions")) {
      return [{
        session_id: 1, lead_contact_id: 42, membership_id: 2,
        membership_status: "free", report_limit: 0, reports_used: 0,
      }];
    }
    if (typeof nextQuery === "function") return nextQuery(raw, values);
    return [];
  };
}

test("valid cookie session → status returns 200 with membership data", async () => {
  setTestSql(memberSql((raw) => {
    assert.match(raw, /FROM investor_watch_memberships/);
    return [{
      status: "free", suburb_limit: 3, property_limit: 3, report_limit: 3,
      suburbs_used: 1, properties_used: 0,
    }];
  }));
  const response = responseRecorder();
  await handler(cookieRequest("GET", "status"), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.membership.status, "free");
  assert.equal(response.body.membership.suburbs_used, 1);
});
