import assert from "node:assert/strict";
import test from "node:test";
import {
  hashMemberFingerprint,
  normalizeMemberEmail,
  requestMemberMagicLink,
  resolveMemberBaseUrl,
} from "../lib/member-magic-link-service.js";
import {
  MEMBER_SESSION_COOKIE,
  MEMBER_SESSION_TTL_SECONDS,
  buildClearMemberSessionCookie,
  buildMemberSessionCookie,
  consumeMagicLinkAndCreateSession,
  extractMemberSessionToken,
  hashOpaqueToken,
  resolveMemberSession,
  revokeMemberSession,
  sanitizeReturnTo,
} from "../lib/member-session-service.js";

function renderSql(strings, values) {
  return strings.map((part, index) =>
    index < values.length ? `${part}$${index}` : part
  ).join("");
}

function deterministicBytes(size) {
  return Buffer.alloc(size, 7);
}

function makeMagicLinkSql(options = {}) {
  const state = {
    inserts: [],
    invalidations: 0,
    consents: [],
    memberships: [],
  };
  const sql = async (strings, ...values) => {
    const raw = renderSql(strings, values);
    if (raw.includes("INSERT INTO lead_contacts")) return [{ id: 42 }];
    if (raw.includes("INSERT INTO investor_watch_memberships")) {
      state.memberships.push({ leadContactId: values[0], status: "free" });
      return [];
    }
    if (raw.includes("INSERT INTO consent_records")) {
      state.consents.push({
        leadContactId: values[0],
        ipHash: values[1],
      });
      return [];
    }
    if (raw.includes("FROM member_login_tokens") && raw.includes("contact_count")) {
      return [{
        contact_count: options.contactCount || 0,
        ip_count: options.ipCount || 0,
      }];
    }
    if (raw.includes("UPDATE member_login_tokens")) {
      state.invalidations += 1;
      return [];
    }
    if (raw.includes("INSERT INTO member_login_tokens")) {
      state.inserts.push({
        leadContactId: values[0],
        tokenHash: values[1],
        ipHash: values[2],
        userAgentHash: values[3],
        expiresAt: values[4],
      });
      return [];
    }
    throw new Error(`Unexpected SQL: ${raw.slice(0, 100)}`);
  };
  return { sql, state };
}

test("member email normalisation is strict", () => {
  assert.equal(normalizeMemberEmail("  User@Example.COM "), "user@example.com");
  assert.equal(normalizeMemberEmail("not-an-email"), null);
  assert.equal(normalizeMemberEmail("a@b"), null);
  assert.equal(normalizeMemberEmail(""), null);
  assert.equal(normalizeMemberEmail(null), null);
  assert.equal(normalizeMemberEmail(`${"a".repeat(250)}@x.com`), null);
});

test("returnTo permits local paths and rejects external redirects", () => {
  assert.equal(sanitizeReturnTo("/investor-watch/?tab=suburbs"), "/investor-watch/?tab=suburbs");
  assert.equal(sanitizeReturnTo("https://evil.example/path"), "/investor-watch/");
  assert.equal(sanitizeReturnTo("//evil.example/path"), "/investor-watch/");
  assert.equal(sanitizeReturnTo("/safe\\evil"), "/investor-watch/");
  assert.equal(sanitizeReturnTo("/safe\nInjected"), "/investor-watch/");
});

test("base URL requires HTTPS outside local development", () => {
  assert.equal(
    resolveMemberBaseUrl({ APP_BASE_URL: "https://preview.example/path" }),
    "https://preview.example"
  );
  assert.equal(
    resolveMemberBaseUrl({ VERCEL_URL: "preview.vercel.app" }),
    "https://preview.vercel.app"
  );
  assert.equal(
    resolveMemberBaseUrl({ NODE_ENV: "test" }),
    "http://localhost:3000"
  );
  assert.throws(
    () => resolveMemberBaseUrl({ APP_BASE_URL: "http://production.example" }),
    /HTTPS/
  );
});

test("requestMemberMagicLink stores only token hash and sends one-time URL", async () => {
  const { sql, state } = makeMagicLinkSql();
  let delivered;
  const result = await requestMemberMagicLink(sql, {
    email: "Member@Example.com",
    returnTo: "/investor-watch/?tab=properties",
    ipAddress: "203.0.113.8",
    userAgent: "Test Browser",
  }, {
    baseUrl: "https://preview.example",
    secret: "fingerprint-secret",
    randomBytes: deterministicBytes,
    now: () => 1_800_000_000_000,
    sendEmail: async (message) => { delivered = message; },
  });

  assert.deepEqual(result, { accepted: true, sent: true, rateLimited: false });
  assert.equal(state.inserts.length, 1);
  assert.deepEqual(state.memberships, [{ leadContactId: 42, status: "free" }]);
  assert.equal(state.consents.length, 1);
  assert.equal(state.consents[0].leadContactId, 42);
  assert.equal(state.consents[0].ipHash.length, 64);
  assert.equal(state.inserts[0].leadContactId, 42);
  assert.equal(state.inserts[0].tokenHash.length, 64);
  assert.equal(state.inserts[0].ipHash.length, 64);
  assert.equal(state.inserts[0].userAgentHash.length, 64);
  assert.equal(delivered.email, "member@example.com");

  const url = new URL(delivered.magicLink);
  const rawToken = url.searchParams.get("token");
  assert.ok(rawToken);
  assert.equal(hashOpaqueToken(rawToken), state.inserts[0].tokenHash);
  assert.equal(url.searchParams.get("returnTo"), "/investor-watch/?tab=properties");
  assert.equal(JSON.stringify(state.inserts).includes(rawToken), false);
});

test("rate-limited request returns accepted without token insert or email", async () => {
  const { sql, state } = makeMagicLinkSql({ contactCount: 3 });
  let sends = 0;
  const result = await requestMemberMagicLink(sql, {
    email: "member@example.com",
    ipAddress: "203.0.113.8",
  }, {
    baseUrl: "https://preview.example",
    secret: "fingerprint-secret",
    sendEmail: async () => { sends += 1; },
  });
  assert.deepEqual(result, { accepted: true, sent: false, rateLimited: true });
  assert.equal(state.inserts.length, 0);
  assert.equal(state.consents.length, 0);
  assert.equal(sends, 0);
});

test("email delivery failure invalidates the newly-created login token", async () => {
  const { sql, state } = makeMagicLinkSql();
  await assert.rejects(
    requestMemberMagicLink(sql, {
      email: "member@example.com",
      ipAddress: "203.0.113.8",
    }, {
      baseUrl: "https://preview.example",
      secret: "fingerprint-secret",
      randomBytes: deterministicBytes,
      sendEmail: async () => { throw new Error("provider down"); },
    }),
    /provider down/
  );
  assert.equal(state.inserts.length, 1);
  assert.equal(state.invalidations, 2);
});

test("fingerprints are deterministic HMAC values", () => {
  const first = hashMemberFingerprint("203.0.113.8", { secret: "secret" });
  const second = hashMemberFingerprint("203.0.113.8", { secret: "secret" });
  const other = hashMemberFingerprint("203.0.113.9", { secret: "secret" });
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.length, 64);
  assert.equal(hashMemberFingerprint("", { secret: "secret" }), null);
});

test("Magic Link consumption creates an opaque 30-day session", async () => {
  let captured;
  const sql = async (strings, ...values) => {
    captured = { raw: renderSql(strings, values), values };
    return [{ lead_contact_id: 42, expires_at: values[2] }];
  };
  const loginToken = "login-token";
  const session = await consumeMagicLinkAndCreateSession(sql, loginToken, {
    randomBytes: deterministicBytes,
    now: () => 1_800_000_000_000,
  });
  assert.equal(session.leadContactId, 42);
  assert.equal(captured.values[0], hashOpaqueToken(loginToken));
  assert.equal(captured.values[1], hashOpaqueToken(session.token));
  assert.equal(captured.raw.includes("consumed_at IS NULL"), true);
  assert.equal(captured.raw.includes("expires_at > NOW()"), true);
  assert.equal(session.expiresAt.getTime(), 1_800_000_000_000 + MEMBER_SESSION_TTL_SECONDS * 1000);
});

test("used or expired Magic Link produces no member session", async () => {
  const sql = async () => [];
  assert.equal(await consumeMagicLinkAndCreateSession(sql, "used-token"), null);
  assert.equal(await consumeMagicLinkAndCreateSession(sql, ""), null);
});

test("member session cookies are HttpOnly, scoped and clearable", () => {
  const cookie = buildMemberSessionCookie("opaque-token", { secure: true });
  assert.match(cookie, new RegExp(`^${MEMBER_SESSION_COOKIE}=opaque-token`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp(`Max-Age=${MEMBER_SESSION_TTL_SECONDS}`));
  assert.equal(extractMemberSessionToken({ headers: { cookie } }), "opaque-token");

  const cleared = buildClearMemberSessionCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
  assert.match(cleared, /Secure/);
});

test("resolveMemberSession exposes membership summary without email or Stripe IDs", async () => {
  const sql = async (strings, ...values) => {
    assert.equal(values[0], hashOpaqueToken("session-token"));
    return [{
      session_id: 8,
      lead_contact_id: 42,
      session_expires_at: new Date("2026-07-27T00:00:00Z"),
      membership_id: 9,
      membership_status: "active",
      report_limit: 10,
      reports_used: 3,
      current_period_start: new Date("2026-06-27T00:00:00Z"),
      current_period_end: new Date("2026-07-27T00:00:00Z"),
      cancel_at_period_end: false,
    }];
  };
  const member = await resolveMemberSession(sql, {
    headers: { cookie: `${MEMBER_SESSION_COOKIE}=session-token` },
  });
  assert.equal(member.membershipStatus, "active");
  assert.equal(member.reportsUsed, 3);
  assert.equal(member.reportsRemaining, 7);
  assert.equal("email" in member, false);
  assert.equal("stripeCustomerId" in member, false);
});

test("revokeMemberSession hashes cookie token and is idempotent for missing cookie", async () => {
  let receivedHash;
  const sql = async (strings, ...values) => {
    receivedHash = values[0];
    return [{ id: 8 }];
  };
  const request = { headers: { cookie: `${MEMBER_SESSION_COOKIE}=session-token` } };
  assert.equal(await revokeMemberSession(sql, request), true);
  assert.equal(receivedHash, hashOpaqueToken("session-token"));
  assert.equal(await revokeMemberSession(sql, { headers: {} }), false);
});
