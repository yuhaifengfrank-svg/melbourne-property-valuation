import logoutHandler from "../lib/member-api/logout.js";
import meHandler from "../lib/member-api/me.js";
import requestLinkHandler from "../lib/member-api/request-link.js";
import verifyHandler from "../lib/member-api/verify.js";
import leadConsentHandler from "../lib/member-api/lead-consent.js";

const ACTIONS = Object.freeze({
  logout: logoutHandler,
  me: meHandler,
  "request-link": requestLinkHandler,
  verify: verifyHandler,
  "lead-consent": leadConsentHandler,
});

export default async function handler(request, response) {
  const action = typeof request.query?.action === "string"
    ? request.query.action
    : "";
  const actionHandler = ACTIONS[action];
  if (!actionHandler) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(404).json({ ok: false, error: "NOT_FOUND" });
  }
  return actionHandler(request, response);
}
