import { getSql } from "../_db.js";
import {
  normalizeMemberEmail,
  requestMemberMagicLink,
  sendMemberMagicLinkEmail,
} from "../../lib/member-magic-link-service.js";

let testSql = null;
let testSendEmail = null;
let testOptions = null;

export function setTestDependencies(dependencies = {}) {
  testSql = dependencies.sql || null;
  testSendEmail = dependencies.sendEmail || null;
  testOptions = dependencies.options || null;
}

function setHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

function requestIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "";
}

const ACCEPTED_MESSAGE =
  "If this email can be used, a sign-in link has been sent.";

export default async function handler(request, response) {
  setHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  let body;
  try {
    body = parseBody(request);
  } catch {
    return response.status(400).json({ ok: false, error: "INVALID_JSON" });
  }

  if (!normalizeMemberEmail(body.email)) {
    return response.status(400).json({ ok: false, error: "INVALID_EMAIL" });
  }
  if (body.serviceConsent !== true) {
    return response.status(400).json({
      ok: false,
      error: "SERVICE_CONSENT_REQUIRED",
    });
  }

  try {
    const sql = testSql || getSql();
    await requestMemberMagicLink(
      sql,
      {
        email: body.email,
        returnTo: body.returnTo,
        ipAddress: requestIp(request),
        userAgent: request.headers?.["user-agent"] || "",
      },
      {
        ...(testOptions || {}),
        sendEmail: testSendEmail || sendMemberMagicLinkEmail,
      }
    );
    return response.status(200).json({ ok: true, message: ACCEPTED_MESSAGE });
  } catch (error) {
    console.error("[member request-link] request failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return response.status(503).json({
      ok: false,
      error: "SIGN_IN_LINK_UNAVAILABLE",
      message: "Sign-in email is temporarily unavailable. Please try again later.",
    });
  }
}
