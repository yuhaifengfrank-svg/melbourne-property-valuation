import crypto from "node:crypto";
import { getSql } from "./_db.js";
import { resolveMemberSession } from "../lib/member-session-service.js";
import { captureSuburbWatchScores } from "../lib/investor-watch-monitor-service.js";
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

function hasCronAccess(request) {
  const expected = process.env.CRON_SECRET || "";
  const supplied = String(request.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

const CLIENT_ERRORS = new Set([
  "INVALID_ITEM_ID", "INVALID_ITEM_TYPE", "INVALID_STATE", "INVALID_POSTCODE",
  "INVALID_INVESTMENT_GOAL", "SUBURB_REQUIRED", "ADDRESS_REQUIRED", "INVALID_ADDRESS",
]);

// ── Safe Error Logging ──
// Only phase, error name, and a whitelisted safe code are logged.
// DO NOT log: error.message, error.stack, DATABASE_URL, connection strings,
//             SQL queries or parameters, cookies, tokens, emails, request headers.
const KNOWN_SAFE_CODES = new Set([
  "WATCH_LIMIT_REACHED",
  "WATCH_ITEM_NOT_FOUND",
  "INVALID_ITEM_ID", "INVALID_ITEM_TYPE", "INVALID_STATE", "INVALID_POSTCODE",
  "INVALID_INVESTMENT_GOAL", "SUBURB_REQUIRED", "ADDRESS_REQUIRED",
  "INVALID_ADDRESS", "INVALID_JSON",
  "DATABASE_URL is not configured",
  "Preview database host is not approved",
  "DATABASE_URL is invalid",
  "SQL client is required",
]);

function safeLog(phase, error) {
  const type = error?.name || "UnknownError";
  const msg = typeof error?.message === "string" ? error.message : "";
  let safeCode = "OTHER";
  if (KNOWN_SAFE_CODES.has(msg)) safeCode = msg;
  else {
    for (const known of KNOWN_SAFE_CODES) {
      if (msg.includes(known)) { safeCode = known; break; }
    }
  }
  // Log format: [investor-watch] PHASE Type SAFECODE
  // Never includes: raw error.message, stack, URLs, SQL, cookies, tokens, emails.
  console.error(`[investor-watch] ${phase} ${type} ${safeCode}`);
}

// ── Cookie Check (no DB access) ──
function memberCookieExists(headers) {
  const header = headers?.cookie;
  if (!header || typeof header !== "string") return false;
  for (const pair of header.split(";")) {
    const sep = pair.indexOf("=");
    if (sep < 0) continue;
    if (pair.slice(0, sep).trim() === "aushomevalue_member_session") return true;
  }
  return false;
}

// ── Mapped action names for error logging ──
const ACTION_PHASES = Object.freeze({
  status: "status-query", items: "items-query", history: "history-query",
  add: "add-item", update: "update-item", remove: "remove-item",
});

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  // ---------------------------------------------------------------
  // Phase 1: extract action & validate HTTP method
  // ---------------------------------------------------------------
  const action = typeof request.query?.action === "string" ? request.query.action : "items";

  // ---------------------------------------------------------------
  // Phase 2: monitor — no cookie needed, CRON_SECRET Bearer only
  // ---------------------------------------------------------------
  if (action === "monitor") {
    if (request.method !== "GET") return response.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    if (!hasCronAccess(request)) return response.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    let sql;
    try { sql = testSql || getSql(); } catch (error) {
      safeLog("database-init", error);
      return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
    }
    try {
      const summary = await captureSuburbWatchScores(sql);
      return response.status(200).json({ ok: true, summary });
    } catch (error) {
      safeLog("cron-execution", error);
      return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
    }
  }

  // ---------------------------------------------------------------
  // Phase 3: cookie check — no cookie → 401 (no DB access, no SQL)
  // ---------------------------------------------------------------
  if (!memberCookieExists(request.headers)) {
    return response.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
  }

  // ---------------------------------------------------------------
  // Phase 4: database initialization (only reached if cookie exists)
  // ---------------------------------------------------------------
  let sql;
  try {
    sql = testSql || getSql();
  } catch (error) {
    safeLog("database-init", error);
    return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
  }

  // ---------------------------------------------------------------
  // Phase 5: session resolution (uses DB — only reached if DB init OK)
  // ---------------------------------------------------------------
  let member;
  try {
    member = await resolveMemberSession(sql, request);
  } catch (error) {
    safeLog("session-resolution", error);
    return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
  }
  if (!member) {
    return response.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
  }

  // ---------------------------------------------------------------
  // Phase 6: action dispatch (member-authenticated)
  // ---------------------------------------------------------------
  try {
    if (action === "status" && request.method === "GET") {
      const membership = await getWatchStatus(sql, member.leadContactId);
      return response.status(200).json({ ok: true, membership });
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
      const item = await addWatchItem(sql, member.leadContactId, bodyOf(request));
      return response.status(201).json({ ok: true, item });
    }
    if (action === "update" && request.method === "PATCH") {
      const item = await updateWatchItem(sql, member.leadContactId, bodyOf(request));
      return response.status(200).json({ ok: true, item });
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
    const phase = ACTION_PHASES[action] || "unknown";
    safeLog(phase, error);
    return response.status(503).json({ ok: false, error: "INVESTOR_WATCH_UNAVAILABLE" });
  }
}

// ── Test Support ──
export function __test__setDependencies(deps = {}) {
  if (deps.sql) setTestSql(deps.sql);
  return { clear: () => setTestSql(null) };
}
