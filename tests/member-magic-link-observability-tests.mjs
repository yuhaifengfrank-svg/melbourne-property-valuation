import assert from "node:assert/strict";
import test from "node:test";
import {
  requestMemberMagicLink,
  sendMemberMagicLinkEmail,
} from "../lib/member-magic-link-service.js";
import { sendResendEmail } from "../lib/resend-client.js";
import requestLinkHandler, {
  setTestDependencies,
} from "../lib/member-api/request-link.js";

function renderSql(strings, values) {
  return strings.map((part, index) =>
    index < values.length ? `${part}$${index}` : part
  ).join("");
}

function makeSql(failingPhase = null) {
  return async (strings, ...values) => {
    const raw = renderSql(strings, values);
    let phase;
    if (raw.includes("INSERT INTO lead_contacts")) phase = "contact-upsert";
    else if (raw.includes("INSERT INTO investor_watch_memberships")) phase = "membership-upsert";
    else if (raw.includes("contact_count")) phase = "rate-limit-check";
    else if (raw.includes("INSERT INTO consent_records")) phase = "consent-write";
    else if (raw.includes("member_login_tokens")) phase = "token-write";
    if (phase === failingPhase) throw new Error("postgresql://secret@db/private");
    if (phase === "contact-upsert") return [{ id: 42 }];
    if (phase === "rate-limit-check") return [{ contact_count: 0, ip_count: 0 }];
    return [];
  };
}

function request() {
  return {
    method: "POST",
    body: {
      email: "member@example.com",
      serviceConsent: true,
      returnTo: "/investor-watch/",
    },
    query: {},
    headers: { "user-agent": "Test Browser" },
    socket: { remoteAddress: "203.0.113.9" },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

test("configured EMAIL_FROM is sent to Resend with both body formats", async () => {
  let payload;
  await sendMemberMagicLinkEmail({
    email: "member@example.com",
    magicLink: "https://example.com/api/member/verify?token=secret-token",
  }, {
    env: {
      EMAIL_FROM: "AusHomeValue <noreply@example.com>",
      RESEND_API_KEY: "unused-because-explicit-option-is-not-forwarded",
    },
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(payload.from, "AusHomeValue <noreply@example.com>");
  assert.match(payload.html, /Sign in securely/);
  assert.match(payload.text, /Sign in to Investor Watch/);
});

test("Resend failures expose only whitelisted status codes", async () => {
  for (const [status, code] of [
    [401, "EMAIL_PROVIDER_401"],
    [403, "EMAIL_PROVIDER_403"],
    [422, "EMAIL_PROVIDER_422"],
    [429, "EMAIL_PROVIDER_429"],
    [503, "EMAIL_PROVIDER_5XX"],
    [418, "EMAIL_PROVIDER_OTHER"],
  ]) {
    await assert.rejects(
      sendResendEmail({ from: "a", to: "b", subject: "c", html: "d", text: "e" }, {
        apiKey: "secret-key",
        fetchImpl: async () => ({ ok: false, status }),
      }),
      (error) => {
        assert.equal(error.name, "EmailDeliveryError");
        assert.equal(error.code, code);
        assert.equal(error.message, "Email delivery failed");
        return true;
      }
    );
  }
});

test("database failures carry the exact safe phase without leaking details", async () => {
  for (const phase of [
    "contact-upsert",
    "membership-upsert",
    "rate-limit-check",
    "consent-write",
    "token-write",
  ]) {
    await assert.rejects(
      requestMemberMagicLink(makeSql(phase), {
        email: "member@example.com",
        ipAddress: "203.0.113.9",
        userAgent: "Test",
      }, {
        baseUrl: "https://preview.example",
        secret: "fingerprint-secret",
        sendEmail: async () => {},
      }),
      (error) => {
        assert.equal(error.phase, phase);
        assert.equal(error.code, "OTHER");
        assert.doesNotMatch(error.message, /postgresql|secret|private/);
        return true;
      }
    );
  }
});

test("request-link logs safe email phase and code without secrets", async () => {
  const originalError = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args);
  try {
    setTestDependencies({
      sql: makeSql(),
      sendEmail: async () => {
        const error = new Error("provider response included token=secret-token");
        error.code = "EMAIL_PROVIDER_422";
        throw error;
      },
      options: { baseUrl: "https://preview.example", secret: "fingerprint-secret" },
    });
    const res = response();
    await requestLinkHandler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "SIGN_IN_LINK_UNAVAILABLE");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0][1], {
      phase: "email-send",
      type: "MemberMagicLinkPhaseError",
      code: "EMAIL_PROVIDER_422",
    });
    const serialized = JSON.stringify(captured);
    assert.doesNotMatch(serialized, /secret-token|provider response|member@example|postgresql|SQL/);
  } finally {
    console.error = originalError;
    setTestDependencies({});
  }
});

test("consent=true completes DB stages, sends email and returns 200", async () => {
  let sends = 0;
  setTestDependencies({
    sql: makeSql(),
    sendEmail: async () => { sends += 1; },
    options: { baseUrl: "https://preview.example", secret: "fingerprint-secret" },
  });
  try {
    const res = response();
    await requestLinkHandler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(sends, 1);
  } finally {
    setTestDependencies({});
  }
});
