import { getSql } from "../_db.js";
import {
  buildClearMemberSessionCookie,
  resolveMemberSession,
} from "../../lib/member-session-service.js";

let testSql = null;
let testOptions = null;

export function setTestDependencies(dependencies = {}) {
  testSql = dependencies.sql || null;
  testOptions = dependencies.options || null;
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const sql = testSql || getSql();
    const member = await resolveMemberSession(sql, request);
    if (!member) {
      response.setHeader(
        "Set-Cookie",
        buildClearMemberSessionCookie(testOptions || {})
      );
      return response.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }
    return response.status(200).json({
      ok: true,
      member: {
        membershipStatus: member.membershipStatus,
        reportsUsed: member.reportsUsed,
        reportLimit: member.reportLimit,
        reportsRemaining: member.reportsRemaining,
        periodStart: member.currentPeriodStart,
        periodEnd: member.currentPeriodEnd,
        cancelAtPeriodEnd: member.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    console.error("[member me] lookup failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return response.status(503).json({ ok: false, error: "MEMBER_DATA_UNAVAILABLE" });
  }
}
