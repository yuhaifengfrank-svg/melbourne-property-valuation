import { getSql } from "../_db.js";
import {
  buildMemberSessionCookie,
  consumeMagicLinkAndCreateSession,
  sanitizeReturnTo,
} from "../../lib/member-session-service.js";

let testSql = null;
let testOptions = null;

export function setTestDependencies(dependencies = {}) {
  testSql = dependencies.sql || null;
  testOptions = dependencies.options || null;
}

function redirect(response, location) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Location", location);
  return response.status(303).end();
}

function withLoginStatus(returnTo, status) {
  const url = new URL(sanitizeReturnTo(returnTo), "https://aushomevalue.com.au");
  url.searchParams.set("login", status);
  return `${url.pathname}${url.search}${url.hash}`;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const token = typeof request.query?.token === "string"
    ? request.query.token
    : "";
  const returnTo = sanitizeReturnTo(request.query?.returnTo);
  if (!token || token.length > 256) {
    return redirect(response, withLoginStatus(returnTo, "invalid"));
  }

  try {
    const sql = testSql || getSql();
    const session = await consumeMagicLinkAndCreateSession(
      sql,
      token,
      testOptions || {}
    );
    if (!session) {
      return redirect(response, withLoginStatus(returnTo, "invalid"));
    }
    response.setHeader(
      "Set-Cookie",
      buildMemberSessionCookie(session.token, testOptions || {})
    );
    return redirect(response, withLoginStatus(returnTo, "success"));
  } catch (error) {
    console.error("[member verify] verification failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return redirect(response, withLoginStatus(returnTo, "error"));
  }
}
