// ── api/unlock-opportunity.js ──
// Phase 1B (fix): Fills lead_contacts/preferences/events/consent,
// sets HttpOnly cookie, returns personalised Top 10 via independent
// ranking engine (no growth_3y, no fallback static data).
//
// GET  /api/unlock-opportunity       → { ok, status: "none"|"active" }
// POST /api/unlock-opportunity       → validates → upsert contact → issue cookie → return Top 10

import crypto from "node:crypto";
import { ensureCustomerFunnelSchema, getSql } from "./_db.js";
import {
  createToken,
  generateSessionId,
  verifyToken,
  setTokenCookie,
  clearTokenCookie,
  getTokenFromCookies,
} from "../lib/signed-token.js";
import { rankPersonalised } from "../lib/personalised-opportunity-ranking.js";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function hashIp(ip) {
  if (!ip) return "";
  const salt = process.env.IP_HASH_SALT || "aushomevalue";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex");
}

/**
 * Safely get a number from a value, returning null if not a valid finite number.
 */
function safeNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch raw opportunity data with strategy=smart, then re-rank in this module.
 * Returns null on failure (caller returns 503).
 */
async function fetchRawOpportunities(preferences) {
  const propertyType = preferences.property_type || "house";
  const state = preferences.state || "";
  const budgetMin = safeNumber(preferences.budget_min);
  const budgetMax = safeNumber(preferences.budget_max);

  const params = new URLSearchParams({
    strategy: "smart", // FIX 4: always strategy=smart
    propertyType,
    maxResults: "30",
  });
  if (state) params.set("state", state);
  if (budgetMin !== null) params.set("minPrice", String(budgetMin));
  if (budgetMax !== null) params.set("maxPrice", String(budgetMax));

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://127.0.0.1:3000";
  const url = `${baseUrl}/api/opportunity?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Opportunity API returned ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok || !Array.isArray(data.opportunities)) {
    throw new Error("Invalid opportunity API response");
  }

  // Defensive sanitize — ensure numeric fields are numbers (FIX 6)
  return data.opportunities.map((o) => ({
    suburb: String(o.suburb || ""),
    state: String(o.state || ""),
    opportunityScore: safeNumber(o.opportunityScore) || 0,
    rentalYield: safeNumber(o.rentalYield),
    schoolScore: safeNumber(o.schoolScore),
    vacancyRate: safeNumber(o.vacancyRate),
    supplyRatio: safeNumber(o.supplyRatio),
    comparableCount: safeNumber(o.comparableCount),
    dataUpdated: String(o.dataUpdated || ""),
    medianHousePrice: safeNumber(o.medianHousePrice),
    medianUnitPrice: safeNumber(o.medianUnitPrice),
  }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const sql = getSql();
    await ensureCustomerFunnelSchema(sql);

    // ── GET: Check session status from cookie ──
    if (req.method === "GET") {
      const token = getTokenFromCookies(req);
      let status = "none";
      let email = null;

      if (token) {
        const payload = verifyToken(token);
        if (payload && payload.gate_level === "opportunity") {
          status = "active";
          email = payload.email;
        }
      }

      return res.status(200).json({ ok: true, status, email });
    }

    // ── POST only ──
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // Extract fields
    const email = clean(body.email, 254).toLowerCase();
    const name = clean(body.name, 150);
    const phone = clean(body.phone, 50);
    const budgetMin = Number.isFinite(Number(body.budgetMin))
      ? Math.round(Number(body.budgetMin))
      : null;
    const budgetMax = Number.isFinite(Number(body.budgetMax))
      ? Math.round(Number(body.budgetMax))
      : null;
    const state = clean(body.state, 20);
    const goal = clean(body.goal, 50);
    const propertyType = clean(body.propertyType, 50);
    const serviceConsent = Boolean(body.serviceConsent);
    const marketingConsent = Boolean(body.marketingConsent);
    const sessionId = clean(body.sessionId, 100) || generateSessionId();
    const ip = hashIp(
      req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket?.remoteAddress ||
        ""
    );

    // Validate required fields
    if (!email || !email.includes("@")) {
      return res
        .status(400)
        .json({ ok: false, error: "Valid email is required" });
    }
    if (!serviceConsent) {
      return res.status(400).json({
        ok: false,
        error: "Service processing consent is required to proceed",
      });
    }
    if (!state) {
      return res.status(400).json({ ok: false, error: "State is required" });
    }
    if (!goal) {
      return res
        .status(400)
        .json({ ok: false, error: "Investment goal is required" });
    }

    // ── Write to database ──

    // 1. Upsert lead_contacts
    const existingContact = await sql`
      SELECT id, name, phone FROM lead_contacts WHERE email_lower = ${email} LIMIT 1
    `;

    let contactId;
    if (existingContact.length > 0) {
      const updateFields = [];
      if (name) updateFields.push(sql`name = ${name}`);
      if (phone) updateFields.push(sql`phone = ${phone}`);
      updateFields.push(sql`updated_at = NOW()`);

      await sql`
        UPDATE lead_contacts SET ${sql.join(
          updateFields,
          sql`, `
        )} WHERE id = ${existingContact[0].id}
      `;
      contactId = existingContact[0].id;
    } else {
      const newContact = await sql`
        INSERT INTO lead_contacts (email, email_lower, name, phone)
        VALUES (${email}, ${email}, ${name || null}, ${phone || null})
        RETURNING id
      `;
      contactId = newContact[0].id;
    }

    // 2. Upsert lead_preferences
    const existingPrefs = await sql`
      SELECT id FROM lead_preferences WHERE lead_contact_id = ${contactId} LIMIT 1
    `;

    if (existingPrefs.length > 0) {
      await sql`
        UPDATE lead_preferences SET
          session_id = ${sessionId},
          budget_min = COALESCE(${budgetMin}, budget_min),
          budget_max = COALESCE(${budgetMax}, budget_max),
          state = ${state},
          goal = ${goal},
          property_type = ${propertyType || null},
          updated_at = NOW()
        WHERE id = ${existingPrefs[0].id}
      `;
    } else {
      await sql`
        INSERT INTO lead_preferences (lead_contact_id, session_id, budget_min, budget_max, state, goal, property_type)
        VALUES (${contactId}, ${sessionId}, ${budgetMin}, ${budgetMax}, ${state}, ${goal}, ${propertyType || null})
      `;
    }

    // 3. Write consent_records
    if (serviceConsent) {
      await sql`
        INSERT INTO consent_records (lead_contact_id, consent_type, granted, ip_hash, source_reference)
        VALUES (${contactId}, 'service_processing', TRUE, ${ip || null}, 'unlock-opportunity-form')
      `;
    }
    if (marketingConsent) {
      await sql`
        INSERT INTO consent_records (lead_contact_id, consent_type, granted, ip_hash, source_reference)
        VALUES (${contactId}, 'marketing', TRUE, ${ip || null}, 'unlock-opportunity-form')
      `;
    }

    // 4. Write lead_events
    await sql`
      INSERT INTO lead_events (lead_contact_id, session_id, event_type, event_data)
      VALUES (${contactId}, ${sessionId}, 'opportunity_unlock', ${JSON.stringify(
      { goal, state, propertyType, budgetMin, budgetMax }
    )})
    `;

    // ── FIX 10: Session binding — return 409 if conflict ──
    const existingBinding = await sql`
      SELECT lead_contact_id FROM lead_session_contacts WHERE session_id = ${sessionId} LIMIT 1
    `;
    if (
      existingBinding.length > 0 &&
      existingBinding[0].lead_contact_id !== contactId
    ) {
      return res.status(409).json({
        ok: false,
        error:
          "Session already bound to a different contact. Please start fresh or use the original registration session.",
      });
    }

    await sql`
      INSERT INTO lead_session_contacts (session_id, lead_contact_id)
      VALUES (${sessionId}, ${contactId})
      ON CONFLICT (session_id) DO UPDATE SET lead_contact_id = ${contactId}
    `;

    // ── Fetch raw opportunities with strategy=smart, then re-rank ──
    // Cookie is set AFTER successful data fetch (FIX 6)
    let top10 = [];
    let top10Status = "ok";
    try {
      const raw = await fetchRawOpportunities({
        goal,
        property_type: propertyType,
        state,
        budget_min: budgetMin,
        budget_max: budgetMax,
      });
      top10 = rankPersonalised(raw, {
        goal,
        property_type: propertyType,
        state,
        budget_min: budgetMin,
        budget_max: budgetMax,
      });
    } catch (err) {
      console.error(
        "[unlock-opportunity] fetch/rank error:",
        err.message
      );
      // FIX 5: No fallback — return 503
      clearTokenCookie(res);
      return res.status(503).json({
        ok: false,
        status: "data_unavailable",
        dataError:
          "Opportunity data temporarily unavailable. Please try again later.",
      });
    }

    // ── Only set cookie after successful data fetch (FIX 6) ──
    const token = createToken({ email, gate_level: "opportunity" });
    setTokenCookie(res, token);

    return res.status(200).json({
      ok: true,
      status: "active",
      sessionId,
      contact: { id: contactId, email, name },
      top10,
      top10Count: top10.length,
      disclaimer:
        "The personalised Top 10 is based on publicly available data and algorithmic scoring. It does not constitute financial advice. Always conduct independent research and consult licensed professionals before making property decisions.",
    });
  } catch (error) {
    console.error("[unlock-opportunity]", error.message);
    return res
      .status(500)
      .json({ ok: false, error: "Service temporarily unavailable" });
  }
}
