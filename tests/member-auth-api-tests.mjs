import assert from "node:assert/strict";
import test from "node:test";
import { MEMBER_SESSION_COOKIE, hashOpaqueToken } from "../lib/member-session-service.js";
import requestLinkHandler, {
  setTestDependencies as setRequestLinkDependencies,
} from "../lib/member-api/request-link.js";
import verifyHandler, {
  setTestDependencies as setVerifyDependencies,
} from "../lib/member-api/verify.js";
import meHandler, {
  setTestDependencies as setMeDependencies,
} from "../lib/member-api/me.js";
import logoutHandler, {
  setTestDependencies as setLogoutDependencies,
} from "../lib/member-api/logout.js";

function renderSql(strings, values) {
  return strings.map((part, index) =>
    index < values.length ? `${part}$${index}` : part
  ).join("");
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end(value) { this.body = value ?? null; this.ended = true; return this; },
  };
}

function makeRequest(method, options = {}) {
  return {
    method,
    body: options.body,
    query: options.query || {},
    headers: options.headers || {},
    socket: { remoteAddress: "203.0.113.8" },
  };
}

function makeRequestLinkSql(options = {}) {
  return async (strings, ...values) => {
    const raw = renderSql(strings, values);
    if (raw.includes("INSERT INTO lead_contacts")) return [{ id: 42 }];
    if (raw.includes("INSERT INTO consent_records")) return [];
    if (raw.includes("contact_count")) {
      return [{ contact_count: options.rateLimited ? 3 : 0, ip_count: 0 }];
    }
    if (raw.includes("UPDATE member_login_tokens")) return [];
    if (raw.includes("INSERT INTO member_login_tokens")) return [];
    throw new Error(`Unexpected SQL: ${raw.slice(0, 100)}`);
  };
}

test("request-link requires POST, valid email and service consent", async () => {
  setRequestLinkDependencies({ sql: makeRequestLinkSql() });

  const wrongMethod = makeResponse();
  await requestLinkHandler(makeRequest("GET"), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);

  const invalidEmail = makeResponse();
  await requestLinkHandler(makeRequest("POST", {
    body: { email: "bad", serviceConsent: true },
  }), invalidEmail);
  assert.equal(invalidEmail.statusCode, 400);
  assert.equal(invalidEmail.body.error, "INVALID_EMAIL");

  const missingConsent = makeResponse();
  await requestLinkHandler(makeRequest("POST", {
    body: { email: "member@example.com" },
  }), missingConsent);
  assert.equal(missingConsent.statusCode, 400);
  assert.equal(missingConsent.body.error, "SERVICE_CONSENT_REQUIRED");
});

test("request-link response is generic and does not expose identity or token", async () => {
  let delivered;
  setRequestLinkDependencies({
    sql: makeRequestLinkSql(),
    sendEmail: async (message) => { delivered = message; },
    options: {
      baseUrl: "https://preview.example",
      secret: "test-secret",
      randomBytes: (size) => Buffer.alloc(size, 4),
    },
  });
  const response = makeResponse();
  await requestLinkHandler(makeRequest("POST", {
    body: {
      email: "Member@Example.com",
      serviceConsent: true,
      returnTo: "/investor-watch/",
    },
    headers: { "user-agent": "Test" },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ["message", "ok"]);
  const publicJson = JSON.stringify(response.body);
  assert.equal(publicJson.includes("member@example.com"), false);
  assert.equal(publicJson.includes("token"), false);
  assert.ok(delivered.magicLink.includes("/api/member/verify?token="));
});

test("rate-limited request-link keeps the same public response", async () => {
  let sends = 0;
  setRequestLinkDependencies({
    sql: makeRequestLinkSql({ rateLimited: true }),
    sendEmail: async () => { sends += 1; },
    options: { baseUrl: "https://preview.example", secret: "test-secret" },
  });
  const response = makeResponse();
  await requestLinkHandler(makeRequest("POST", {
    body: { email: "member@example.com", serviceConsent: true },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(sends, 0);
});

test("verify consumes token, sets HttpOnly cookie and redirects locally", async () => {
  let tokenHash;
  setVerifyDependencies({
    sql: async (strings, ...values) => {
      tokenHash = values[0];
      return [{ lead_contact_id: 42, expires_at: values[2] }];
    },
    options: {
      secure: true,
      randomBytes: (size) => Buffer.alloc(size, 5),
      now: () => 1_800_000_000_000,
    },
  });
  const response = makeResponse();
  await verifyHandler(makeRequest("GET", {
    query: {
      token: "one-time-login-token",
      returnTo: "/investor-watch/?tab=suburbs",
    },
  }), response);
  assert.equal(response.statusCode, 303);
  assert.equal(tokenHash, hashOpaqueToken("one-time-login-token"));
  assert.match(response.headers["Set-Cookie"], new RegExp(`^${MEMBER_SESSION_COOKIE}=`));
  assert.match(response.headers["Set-Cookie"], /HttpOnly/);
  assert.match(response.headers["Set-Cookie"], /Secure/);
  assert.equal(response.headers.Location, "/investor-watch/?tab=suburbs&login=success");
});

test("verify rejects replay/invalid token and blocks external returnTo", async () => {
  setVerifyDependencies({ sql: async () => [], options: { secure: true } });
  const response = makeResponse();
  await verifyHandler(makeRequest("GET", {
    query: {
      token: "used-token",
      returnTo: "https://evil.example/steal",
    },
  }), response);
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.Location, "/investor-watch/?login=invalid");
  assert.equal(response.headers["Set-Cookie"], undefined);
});

test("me returns only membership summary", async () => {
  setMeDependencies({
    sql: async () => [{
      session_id: 8,
      lead_contact_id: 42,
      session_expires_at: new Date("2026-07-27T00:00:00Z"),
      membership_id: 9,
      membership_status: "active",
      report_limit: 10,
      reports_used: 2,
      current_period_start: new Date("2026-06-27T00:00:00Z"),
      current_period_end: new Date("2026-07-27T00:00:00Z"),
      cancel_at_period_end: false,
    }],
    options: { secure: true },
  });
  const response = makeResponse();
  await meHandler(makeRequest("GET", {
    headers: { cookie: `${MEMBER_SESSION_COOKIE}=session-token` },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.member, {
    membershipStatus: "active",
    reportsUsed: 2,
    reportLimit: 10,
    reportsRemaining: 8,
    periodStart: new Date("2026-06-27T00:00:00Z"),
    periodEnd: new Date("2026-07-27T00:00:00Z"),
    cancelAtPeriodEnd: false,
  });
  const body = JSON.stringify(response.body);
  assert.equal(body.includes("leadContactId"), false);
  assert.equal(body.includes("email"), false);
  assert.equal(body.includes("stripe"), false);
});

test("me clears invalid session cookie", async () => {
  setMeDependencies({ sql: async () => [], options: { secure: true } });
  const response = makeResponse();
  await meHandler(makeRequest("GET", {
    headers: { cookie: `${MEMBER_SESSION_COOKIE}=invalid` },
  }), response);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
});

test("logout revokes the current session and always clears cookie", async () => {
  let revokedHash;
  setLogoutDependencies({
    sql: async (strings, ...values) => {
      revokedHash = values[0];
      return [{ id: 8 }];
    },
    options: { secure: true },
  });
  const response = makeResponse();
  await logoutHandler(makeRequest("POST", {
    headers: { cookie: `${MEMBER_SESSION_COOKIE}=session-token` },
  }), response);
  assert.equal(response.statusCode, 204);
  assert.equal(revokedHash, hashOpaqueToken("session-token"));
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
});
