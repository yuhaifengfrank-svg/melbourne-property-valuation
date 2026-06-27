import crypto from "node:crypto";

export const MEMBER_SESSION_COOKIE = "aushomevalue_member_session";
export const MEMBER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MEMBER_SESSION_TTL_MS = MEMBER_SESSION_TTL_SECONDS * 1000;

export function generateOpaqueToken(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token) {
  if (!token || typeof token !== "string") return null;
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sanitizeReturnTo(value) {
  if (typeof value !== "string" || !value) return "/investor-watch/";
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/investor-watch/";
  }
  if (value.includes("\\") || /[\r\n\0]/.test(value)) {
    return "/investor-watch/";
  }
  try {
    const parsed = new URL(value, "https://aushomevalue.com.au");
    if (parsed.origin !== "https://aushomevalue.com.au") {
      return "/investor-watch/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/investor-watch/";
  }
}

function parseCookies(header) {
  const cookies = {};
  if (!header || typeof header !== "string") return cookies;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    cookies[name] = value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1)
      : value;
  }
  return cookies;
}

export function extractMemberSessionToken(request) {
  const cookies = parseCookies(request?.headers?.cookie);
  return cookies[MEMBER_SESSION_COOKIE] || null;
}

export function buildMemberSessionCookie(token, options = {}) {
  if (!token || typeof token !== "string") {
    throw new Error("Member session token is required");
  }
  const secure = options.secure ?? !["development", "test"].includes(
    process.env.NODE_ENV || "development"
  );
  const parts = [
    `${MEMBER_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MEMBER_SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearMemberSessionCookie(options = {}) {
  const secure = options.secure ?? !["development", "test"].includes(
    process.env.NODE_ENV || "development"
  );
  const parts = [
    `${MEMBER_SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function consumeMagicLinkAndCreateSession(
  sql,
  loginToken,
  options = {}
) {
  if (typeof sql !== "function") throw new Error("SQL client is required");
  const loginTokenHash = hashOpaqueToken(loginToken);
  if (!loginTokenHash) return null;

  const sessionToken = generateOpaqueToken(options.randomBytes);
  const sessionTokenHash = hashOpaqueToken(sessionToken);
  const expiresAt = new Date((options.now?.() ?? Date.now()) + MEMBER_SESSION_TTL_MS);

  const rows = await sql`
    WITH consumed AS (
      UPDATE member_login_tokens
         SET consumed_at = NOW()
       WHERE token_hash = ${loginTokenHash}
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING lead_contact_id
    )
    INSERT INTO member_sessions (
      lead_contact_id,
      session_token_hash,
      expires_at
    )
    SELECT lead_contact_id, ${sessionTokenHash}, ${expiresAt}
      FROM consumed
    RETURNING lead_contact_id, expires_at
  `;

  if (!rows?.[0]?.lead_contact_id) return null;
  return {
    token: sessionToken,
    leadContactId: rows[0].lead_contact_id,
    expiresAt: rows[0].expires_at || expiresAt,
  };
}

export async function resolveMemberSession(sql, request) {
  if (typeof sql !== "function") throw new Error("SQL client is required");
  const token = extractMemberSessionToken(request);
  const tokenHash = hashOpaqueToken(token);
  if (!tokenHash) return null;

  const rows = await sql`
    SELECT
      ms.id AS session_id,
      ms.lead_contact_id,
      ms.expires_at AS session_expires_at,
      iwm.id AS membership_id,
      iwm.status AS membership_status,
      iwm.report_limit,
      iwm.current_period_start,
      iwm.current_period_end,
      iwm.cancel_at_period_end,
      COALESCE((
        SELECT COUNT(*)::int
          FROM membership_report_usage mru
         WHERE mru.membership_id = iwm.id
           AND iwm.current_period_start IS NOT NULL
           AND mru.billing_period_start = iwm.current_period_start
      ), 0) AS reports_used
    FROM member_sessions ms
    LEFT JOIN investor_watch_memberships iwm
      ON iwm.lead_contact_id = ms.lead_contact_id
    WHERE ms.session_token_hash = ${tokenHash}
      AND ms.revoked_at IS NULL
      AND ms.expires_at > NOW()
    LIMIT 1
  `;

  const row = rows?.[0];
  if (!row) return null;
  const reportLimit = row.report_limit === null || row.report_limit === undefined
    ? 0
    : Number(row.report_limit);
  const reportsUsed = Number(row.reports_used || 0);
  return {
    sessionId: row.session_id,
    leadContactId: row.lead_contact_id,
    sessionExpiresAt: row.session_expires_at,
    membershipId: row.membership_id || null,
    membershipStatus: row.membership_status || "none",
    reportLimit,
    reportsUsed,
    reportsRemaining: Math.max(0, reportLimit - reportsUsed),
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  };
}

export async function revokeMemberSession(sql, request) {
  if (typeof sql !== "function") throw new Error("SQL client is required");
  const token = extractMemberSessionToken(request);
  const tokenHash = hashOpaqueToken(token);
  if (!tokenHash) return false;
  const rows = await sql`
    UPDATE member_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE session_token_hash = ${tokenHash}
    RETURNING id
  `;
  return Boolean(rows?.[0]?.id);
}
