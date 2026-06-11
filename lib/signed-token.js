// ── Signed Token Helpers (HS256-like JWT, no external deps) ──
// Short-lived signed tokens stored in localStorage.
// Vercel serverless compatible — uses crypto.createHmac.
// Future: migrate to HttpOnly cookie session store.

import crypto from "node:crypto";

const SECRET = process.env.TOKEN_SIGNING_SECRET || process.env.SESSION_SECRET || "aushomevalue-dev-secret-change-in-prod";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a signed token string: base64(payload).base64(signature)
 * payload = { email, gate_level, iat }
 */
export function createToken(payload) {
  const data = {
    email: payload.email,
    gate_level: payload.gate_level || "opportunity",
    iat: Date.now(),
    exp: Date.now() + TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a signed token.
 * Returns null if invalid or expired.
 */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expectedSig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header, query param, or request body.
 */
export function extractToken(req) {
  // Authorization: Bearer <token>
  const auth = req.headers?.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const t = auth.slice(7);
    if (t) return t;
  }
  // Query param
  if (req.query?.token) return req.query.token;
  // Body
  if (req.body?.token) return req.body.token;
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
    res.status(401).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ ok: false, error: "Unauthorized — valid token required" }));
    return null;
  }
  if (data.gate_level !== requiredLevel) {
    res.status(403).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ ok: false, error: `Token does not grant '${requiredLevel}' access` }));
    return null;
  }
  return data;
}

/**
 * Generate a crypto-random session ID for anonymous tracking.
 */
export function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}
