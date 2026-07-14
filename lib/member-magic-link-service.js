import crypto from "node:crypto";
import { generateOpaqueToken, hashOpaqueToken, sanitizeReturnTo } from "./member-session-service.js";
import { sendResendEmail } from "./resend-client.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const CONTACT_WINDOW_LIMIT = 3;
const IP_WINDOW_LIMIT = 10;

export function normalizeMemberEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function resolveMemberBaseUrl(env = process.env) {
  const configured = env.APP_BASE_URL || env.PUBLIC_BASE_URL;
  if (configured) {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") throw new Error("MEMBER_BASE_URL_MUST_USE_HTTPS");
    return parsed.origin;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return "http://localhost:3000";
  }
  throw new Error("MEMBER_BASE_URL_NOT_CONFIGURED");
}

function getFingerprintSecret(env = process.env) {
  const secret = env.MEMBER_AUTH_PEPPER || env.TOKEN_SIGNING_SECRET || env.SESSION_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return "member-auth-development-pepper";
  }
  throw new Error("MEMBER_AUTH_PEPPER_NOT_CONFIGURED");
}

export function hashMemberFingerprint(value, options = {}) {
  if (!value || typeof value !== "string") return null;
  return crypto
    .createHmac("sha256", options.secret || getFingerprintSecret(options.env))
    .update(value.trim())
    .digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendMemberMagicLinkEmail({ email, magicLink }, options = {}) {
  const safeLink = escapeHtml(magicLink);
  return sendResendEmail({
    from: "AusHomeValue <notifications@aushomevalue.com.au>",
    to: email,
    subject: "Sign in to Investor Watch",
    text: `Sign in to Investor Watch: ${magicLink}\n\nThis link expires in 15 minutes and can be used once.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#17211d">
        <h1 style="font-size:24px">Sign in to Investor Watch</h1>
        <p>Use the secure link below to open your Investor Watch dashboard.</p>
        <p style="margin:24px 0"><a href="${safeLink}" style="background:#0d6b57;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Sign in securely</a></p>
        <p style="color:#66736d;font-size:13px">This link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email.</p>
      </div>
    `,
  }, options);
}

export async function requestMemberMagicLink(sql, input, options = {}) {
  if (typeof sql !== "function") throw new Error("SQL client is required");
  const email = normalizeMemberEmail(input.email);
  if (!email) throw new Error("INVALID_EMAIL");

  const returnTo = sanitizeReturnTo(input.returnTo);
  const ipHash = hashMemberFingerprint(input.ipAddress, options);
  const userAgentHash = hashMemberFingerprint(input.userAgent, options);
  const now = options.now?.() ?? Date.now();
  const expiresAt = new Date(now + MAGIC_LINK_TTL_MS);

  const contacts = await sql`
    INSERT INTO lead_contacts (email, email_lower)
    VALUES (${email}, ${email})
    ON CONFLICT (email_lower)
    DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  const leadContactId = contacts?.[0]?.id;
  if (!leadContactId) throw new Error("CONTACT_UPSERT_FAILED");

  await sql`
    INSERT INTO investor_watch_memberships (lead_contact_id, status)
    VALUES (${leadContactId}, 'free')
    ON CONFLICT (lead_contact_id) DO NOTHING
  `;

  const rateRows = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE lead_contact_id = ${leadContactId}
      )::int AS contact_count,
      COUNT(*) FILTER (
        WHERE ${ipHash}::text IS NOT NULL
          AND requested_ip_hash = ${ipHash}
      )::int AS ip_count
    FROM member_login_tokens
    WHERE created_at > NOW() - INTERVAL '15 minutes'
  `;
  const contactCount = Number(rateRows?.[0]?.contact_count || 0);
  const ipCount = Number(rateRows?.[0]?.ip_count || 0);
  if (contactCount >= CONTACT_WINDOW_LIMIT || ipCount >= IP_WINDOW_LIMIT) {
    return { accepted: true, sent: false, rateLimited: true };
  }

  await sql`
    INSERT INTO consent_records (
      lead_contact_id,
      consent_type,
      granted,
      ip_hash,
      source_reference
    )
    VALUES (
      ${leadContactId},
      'service_processing',
      TRUE,
      ${ipHash},
      'investor-watch-magic-link-request'
    )
  `;

  await sql`
    UPDATE member_login_tokens
       SET consumed_at = COALESCE(consumed_at, NOW())
     WHERE lead_contact_id = ${leadContactId}
       AND consumed_at IS NULL
  `;

  const rawToken = generateOpaqueToken(options.randomBytes);
  const tokenHash = hashOpaqueToken(rawToken);
  await sql`
    INSERT INTO member_login_tokens (
      lead_contact_id,
      token_hash,
      requested_ip_hash,
      requested_user_agent_hash,
      expires_at
    )
    VALUES (
      ${leadContactId},
      ${tokenHash},
      ${ipHash},
      ${userAgentHash},
      ${expiresAt}
    )
  `;

  const baseUrl = options.baseUrl || resolveMemberBaseUrl(options.env);
  const magicLink = `${baseUrl}/api/member/verify?token=${encodeURIComponent(rawToken)}&returnTo=${encodeURIComponent(returnTo)}`;
  const sendEmail = options.sendEmail || sendMemberMagicLinkEmail;

  try {
    await sendEmail({ email, magicLink });
  } catch (error) {
    await sql`
      UPDATE member_login_tokens
         SET consumed_at = COALESCE(consumed_at, NOW())
       WHERE token_hash = ${tokenHash}
    `;
    throw error;
  }

  return { accepted: true, sent: true, rateLimited: false };
}
