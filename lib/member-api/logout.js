import { getSql } from "../../api/_db.js";
import {
  buildClearMemberSessionCookie,
  revokeMemberSession,
} from "../member-session-service.js";

let testSql = null;
let testOptions = null;

export function setTestDependencies(dependencies = {}) {
  testSql = dependencies.sql || null;
  testOptions = dependencies.options || null;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const sql = testSql || getSql();
    await revokeMemberSession(sql, request);
  } catch (error) {
    console.error("[member logout] revoke failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
  }

  response.setHeader(
    "Set-Cookie",
    buildClearMemberSessionCookie(testOptions || {})
  );
  return response.status(204).end();
}
