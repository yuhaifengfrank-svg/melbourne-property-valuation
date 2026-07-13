import { getSql } from "./_db.js";
import { resolveMemberSession } from "../lib/member-session-service.js";
import {
  addWatchItem,
  archiveWatchItem,
  getWatchStatus,
  listWatchItems,
  listWatchHistory,
  updateWatchItem,
} from "../lib/investor-watch-service.js";

let testSql = null;
export function setTestSql(sql) { testSql = sql || null; }

function bodyOf(request) {
  if (!request.body) return {};
  return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
}

const CLIENT_ERRORS = new Set([
  "INVALID_ITEM_ID", "INVALID_ITEM_TYPE", "INVALID_STATE", "INVALID_POSTCODE",
  "INVALID_INVESTMENT_GOAL", "SUBURB_REQUIRED", "ADDRESS_REQUIRED", "INVALID_ADDRESS",
]);

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  try {
    const sql = testSql || getSql();
    const member = await resolveMemberSession(sql, request);
    if (!member) return response.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    const action = typeof request.query?.action === "string" ? request.query.action : "items";

    if (action === "status" && request.method === "GET") {
      return response.status(200).json({ ok: true, membership: await getWatchStatus(sql, member.leadContactId) });
    }
    if (action === "items" && request.method === "GET") {
      const items = await listWatchItems(sql, member.leadContactId, request.query?.archived === "1");
      return response.status(200).json({ ok: true, items });
    }
    if (action === "history" && request.method === "GET") {
      const history = await listWatchHistory(sql, member.leadContactId, request.query?.id, request.query?.limit);
      return response.status(200).json({ ok: true, history });
    }
    if (action === "add" && request.method === "POST") {
      return response.status(201).json({ ok: true, item: await addWatchItem(sql, member.leadContactId, bodyOf(request)) });
    }
    if (action === "update" && request.method === "PATCH") {
      return response.status(200).json({ ok: true, item: await updateWatchItem(sql, member.leadContactId, bodyOf(request)) });
    }
    if (action === "remove" && request.method === "DELETE") {
      const removed = await archiveWatchItem(sql, member.leadContactId, request.query?.id);
      return response.status(removed ? 200 : 404).json({ ok: removed, ...(removed ? {} : { error: "WATCH_ITEM_NOT_FOUND" }) });
    }
    response.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return response.status(404).json({ ok: false, error: "ACTION_NOT_FOUND" });
  } catch (error) {
    const code = error instanceof SyntaxError ? "INVALID_JSON" : error?.message;
    if (code === "WATCH_LIMIT_REACHED") return response.status(409).json({ ok: false, error: code });
    if (code === "WATCH_ITEM_NOT_FOUND") return response.status(404).json({ ok: false, error: code });
    if (code === "INVALID_JSON" || CLIENT_ERRORS.has(code)) return response.status(400).json({ ok: false, error: code });
    console.error("[investor-watch] request failed", { type: error?.name || "UnknownError" });
    return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
  }
}
