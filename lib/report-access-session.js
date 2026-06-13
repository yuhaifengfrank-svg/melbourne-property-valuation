// ── lib/report-access-session.js ──
// Phase 1E3A: Purchase Session Cookie — base module.
//
// When checkout is created, the server MAY issue a short-lived HttpOnly
// cookie identifying the purchasing customer.  This cookie does NOT
// grant report access — final entitlement must always query the DB.
//
// Cookie name: aushomevalue_report_access
// Attributes: HttpOnly, Secure (production), SameSite=Lax, Path=/, Max-Age=1800
// TTL: 30 minutes (1800 seconds)
//
// Session payload:
// {
//   version: 1,
//   purpose: "report_access",
//   reportId: "rp_...",
//   leadContactId: 123,
//   issuedAt: <epoch ms>,
//   expiresAt: <epoch ms>
// }
//
// Uses HMAC-SHA256 with env var REPORT_ACCESS_SESSION_SECRET.
// Production env without the secret → throws on any operation.

import crypto from "node:crypto";

// ── Constants ───────────────────────────────────────────────────────

const PURPOSE = "report_access";
const VERSION = 1;
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const TTL_SECONDS = 1800;
const COOKIE_NAME = "aushomevalue_report_access";

// ── Secret management ──────────────────────────────────────────────

/**
 * Resolve the signing secret.
 *
 * Production: requires REPORT_ACCESS_SESSION_SECRET env var — throws if missing.
 * Development/test: uses provided mockSecret or a dev-only fallback.
 * NEVER uses a fixed default in production.
 * NEVER writes the secret to code, response, or logs.
 */
function getSecret(overrides = {}) {
  const env = process.env.NODE_ENV || "development";
  const secret = overrides.mockSecret || process.env.REPORT_ACCESS_SESSION_SECRET;

  if (secret) return secret;

  if (env === "development" || env === "test") {
    return "report-access-session-dev-secret";
  }

  throw new Error(
    "REPORT_ACCESS_SESSION_SECRET environment variable is required in production"
  );
}

// ── Input validation ───────────────────────────────────────────────

/**
 * Validate reportId format: rp_<timestamp_ms>_<hex_16plus>
 */
function isValidReportId(reportId) {
  return typeof reportId === "string" && /^rp_\d+_[0-9a-f]{16,}$/i.test(reportId);
}

/**
 * Validate leadContactId is a positive integer.
 */
function isValidLeadContactId(id) {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

// ── Create session ─────────────────────────────────────────────────

/**
 * Create a signed report access session token.
 *
 * @param {object} params
 * @param {string} params.reportId  — Report id (rp_<ts>_<hex>)
 * @param {number} params.leadContactId  — Lead contact id (positive integer)
 * @param {object} [options]
 * @param {string} [options.mockSecret]  — For testing; override production secret
 * @returns {string}  — Signed token: base64url(payload).base64url(sig)
 * @throws {Error}  — If secret missing or input invalid
 */
export function createReportAccessSession({ reportId, leadContactId }, options = {}) {
  // ── Validate inputs ──────────────────────────────────────────
  if (!isValidReportId(reportId)) {
    throw new Error("Invalid reportId format");
  }
  if (!isValidLeadContactId(leadContactId)) {
    throw new Error("Invalid leadContactId");
  }

  const now = Date.now();
  const payload = {
    version: VERSION,
    purpose: PURPOSE,
    reportId,
    leadContactId,
    issuedAt: now,
    expiresAt: now + TTL_MS,
  };

  const secret = getSecret(options);
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${sig}`;
}

// ── Verify session ─────────────────────────────────────────────────

/**
 * Verify and decode a report access session token.
 *
 * @param {string} token  — Signed token string
 * @param {object} [options]
 * @param {string} [options.mockSecret]  — For testing
 * @returns {object|null}  — Decoded payload, or null if invalid/expired
 */
export function verifyReportAccessSession(token, options = {}) {
  try {
    const secret = getSecret(options);
    if (!token || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [encoded, sig] = parts;

    // ── Verify signature with timingSafeEqual ──────────────────
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    // ── Decode payload ─────────────────────────────────────────
    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return null;
    }

    // ── Validate payload structure ─────────────────────────────
    if (!payload || typeof payload !== "object") return null;
    if (payload.version !== VERSION) return null;
    if (payload.purpose !== PURPOSE) return null;
    if (!isValidReportId(payload.reportId)) return null;
    if (!isValidLeadContactId(payload.leadContactId)) return null;

    // ── Check expiration ───────────────────────────────────────
    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── Cookie building ────────────────────────────────────────────────

/**
 * Build the Set-Cookie header value for the report access session.
 *
 * @param {string} token  — Signed token (from createReportAccessSession)
 * @param {object} [options]
 * @param {boolean} [options.secure]  — Default: true in production
 * @returns {string}  — Full Set-Cookie value
 */
export function buildReportAccessCookie(token, options = {}) {
  const isSecure = options.secure !== undefined
    ? options.secure
    : (process.env.NODE_ENV === "production");

  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${TTL_SECONDS}`,
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Build a Set-Cookie value that clears the report access cookie.
 *
 * @param {object} [options]
 * @param {boolean} [options.secure]  — Default: true in production
 * @returns {string}  — Full Set-Cookie value with Max-Age=0
 */
export function buildClearReportAccessCookie(options = {}) {
  const isSecure = options.secure !== undefined
    ? options.secure
    : (process.env.NODE_ENV === "production");

  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

// ── Cookie parsing ─────────────────────────────────────────────────

/**
 * Parse the Cookie header into a name→value map.
 * Manual parser — no external dependency.
 *
 * @param {string} header  — Raw Cookie header value
 * @returns {object}
 */
function parseCookies(header) {
  const cookies = {};
  if (!header || typeof header !== "string") return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) {
      cookies[pair.trim()] = "";
    } else {
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[name] = val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
    }
  });
  return cookies;
}

/**
 * Extract the report access session token from the request.
 *
 * @param {object} request  — Node/Express request object with .headers.cookie
 * @returns {string|null}  — Token value, or null if missing
 */
export function extractReportAccessCookie(request) {
  if (!request || !request.headers) return null;
  const cookies = parseCookies(request.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}
