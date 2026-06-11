// ── Signed Token Helpers (HMAC-SHA256, no external deps) ──
// Tokens are short-lived and stored in HttpOnly cookies.
// Never in localStorage, query params, or response JSON body.
//
// Vercel serverless compatible — uses crypto.createHmac.

import crypto from "node:crypto";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the signing secret.
 * Production: TOKEN_SIGNING_SECRET is required — throws if missing.
 * Development (NODE_ENV=development): uses a dev-only fallback.
 * NEVER uses a fixed default in production.
 */
function getSecret() {
  const env = process.env.NODE_ENV || "development";
  const secret = process.env.TOKEN_SIGNING_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    if (env === "development" || env === "test") {
      return "aushomevalue-dev-secret-change-in-prod";
    }
    throw new Error(
      "TOKEN_SIGNING_SECRET environment variable is required in production"
    );
  }
  return secret;
}

/**
 * Create a signed token string: base64(payload).base64(signature)
 * payload = { email, gate_level, iat, exp }
 */
export function createToken(payload) {
  const secret = getSecret();
  const data = {
    email: payload.email,
    gate_level: payload.gate_level || "opportunity",
    iat: Date.now(),
    exp: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a signed token.
 * Returns null if invalid, expired, or secret is missing.
 */
export function verifyToken(token) {
  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  // FIX 11: Check buffer length before timingSafeEqual
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header ONLY.
 * NEVER from query params or request body (security).
 */
export function extractToken(req) {
  const auth = req.headers?.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  return null;
}

/**
 * Require a valid token for a given gate_level.
 * Returns 401/403 JSON response if invalid.
 */
export function requireGateToken(req, res, requiredLevel = "opportunity") {
  const raw = extractToken(req);
  const data = verifyToken(raw);
  if (!data) {
    res
      .status(401)
      .setHeader("Content-Type", "application/json")
      .send(
        JSON.stringify({
          ok: false,
          error: "Unauthorized — valid token required",
        })
      );
    return null;
  }
  if (data.gate_level !== requiredLevel) {
    res
      .status(403)
      .setHeader("Content-Type", "application/json")
      .send(
        JSON.stringify({
          ok: false,
          error: `Token does not grant '${requiredLevel}' access`,
        })
      );
    return null;
  }
  return data;
}

/**
 * Set HttpOnly Secure SameSite=Lax cookie with the token.
 */
export function setTokenCookie(res, token) {
  const maxAge = 86400; // 24 hours in seconds
  res.setHeader(
    "Set-Cookie",
    `aushomevalue_opportunity_gate=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

/**
 * Clear the auth cookie (logout/expire).
 */
export function clearTokenCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `aushomevalue_opportunity_gate=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

/**
 * Parse Cookie header manually (no external dep).
 * Returns an object of cookie name → value.
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
      // Remove surrounding quotes if present
      if (val.startsWith('"') && val.endsWith('"')) {
        cookies[name] = val.slice(1, -1);
      } else {
        cookies[name] = val;
      }
    }
  });
  return cookies;
}

/**
 * Get the gate token from HttpOnly cookie.
 */
export function getTokenFromCookies(req) {
  const cookies = parseCookies(req.headers?.cookie);
  return cookies.aushomevalue_opportunity_gate || null;
}

/**
 * Generate a crypto-random session ID for anonymous tracking.
 */
export function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}
