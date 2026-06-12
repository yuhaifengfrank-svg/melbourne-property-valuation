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
  clearTokenCookie,
  createToken,
  generateSessionId,
  verifyToken,
  setTokenCookie,
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

  const baseUrl = process.env.PRODUCTION_URL
    ? `https://${process.env.PRODUCTION_URL}`
    : process.env.VERCEL_URL
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
  // FIX 13: Use supplyConstraintScore (from DB), not supplyRatio/comparableCount
  return data.opportunities.map((o) => ({
    suburb: String(o.suburb || ""),
    state: String(o.state || ""),
    opportunityScore: safeNumber(o.opportunityScore) || 0,
    rentalYield: safeNumber(o.rentalYield),
    schoolScore: safeNumber(o.schoolScore),
    vacancyRate: safeNumber(o.vacancyRate),
    supplyConstraintScore: safeNumber(o.supplyConstraintScore),
    overallConfidence: safeNumber(o.overallConfidence),
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

    // ── GET: Check session status from cookie, optionally re-rank ──
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

      // FIX: If authenticated and re_rank=1 provided, load from DB prefs or use query params
      if (status === "active" && req.query && req.query.re_rank === "1") {
        try {
          // When no explicit filter params are set (only re_rank=1), load from stored DB preferences
          var storedGoal = req.query.goal;
          var storedPropertyType = req.query.propertyType;
          var storedState = req.query.state;
          var storedBudgetMin = req.query.budgetMin;
          var storedBudgetMax = req.query.budgetMax;

          var hasActiveFilters = storedGoal || storedPropertyType || storedState || storedBudgetMin || storedBudgetMax;

          if (!hasActiveFilters && email) {
            // Load stored preferences from DB — join through lead_contacts for email_lower
            var prefs = await sql`
              SELECT lp.goal, lp.property_type, lp.state, lp.budget_min, lp.budget_max
              FROM lead_preferences lp
              JOIN lead_contacts lc ON lc.id = lp.lead_contact_id
              WHERE lc.email_lower = ${email}
              ORDER BY lp.updated_at DESC
              LIMIT 1
            `;
            if (prefs && prefs.length > 0) {
              storedGoal = prefs[0].goal || "balanced";
              storedPropertyType = prefs[0].property_type || null;
              storedState = prefs[0].state || "vic";
              storedBudgetMin = prefs[0].budget_min != null ? String(prefs[0].budget_min) : null;
              storedBudgetMax = prefs[0].budget_max != null ? String(prefs[0].budget_max) : null;
            }
          }

          if (!storedGoal) storedGoal = "balanced";
          if (!storedState) storedState = "vic";

          const raw = await fetchRawOpportunities({
            goal: storedGoal,
            property_type: storedPropertyType || null,
            state: storedState,
            budget_min: Number(storedBudgetMin) || 0,
            budget_max: Number(storedBudgetMax) || 99999999,
          });
          const top10 = rankPersonalised(raw, {
            goal: storedGoal,
            property_type: storedPropertyType || null,
            state: storedState,
            budget_min: Number(storedBudgetMin) || 0,
            budget_max: Number(storedBudgetMax) || 99999999,
          });
          return res.status(200).json({ ok: true, status: "active", email, top10, top10Count: top10.length });
        } catch (err) {
          console.error("[unlock-opportunity GET] re-rank error:", err.message);
          return res.status(200).json({ ok: true, status: "active", email, top10: [], top10Count: 0 });
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
    // Read session ID from header first (X-Session-Id), fallback to body, then auto-generate
    const sessionId = clean(
      req.headers['x-session-id'] || req.headers['X-Session-Id'] || body.sessionId,
      100
    ) || generateSessionId();
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

    // ── Write to database (wrapped in transaction, session check FIRST) ──
    // Generate session ID if not provided
    const activeSessionId = sessionId;

    // ── Sequential DB writes (no real transaction — idempotent upserts) ──
    // Session conflict check FIRST before any writes
    const existingBinding = await sql`
      SELECT lead_contact_id FROM lead_session_contacts WHERE session_id = ${activeSessionId} LIMIT 1
    `;
    const existingContact = await sql`
      SELECT id, name, phone FROM lead_contacts WHERE email_lower = ${email} LIMIT 1
    `;

    // Session conflict detection
    function hasSessionConflict() {
      if (existingBinding.length > 0 && existingContact.length > 0) {
        return existingBinding[0].lead_contact_id !== existingContact[0].id;
      }
      // If session is bound to someone else and we're creating a new contact — conflict
      if (existingBinding.length > 0 && existingContact.length === 0) {
        return true;
      }
      return false;
    }

    if (hasSessionConflict()) {
      return res.status(409).json({
        ok: false,
        error: "Session already bound to a different contact. Please start fresh or use the original registration session."
      });
    }

    // Step 2: Upsert lead_contacts
    let cid;
    if (existingContact.length > 0) {
      await sql`
        UPDATE lead_contacts SET
          name = COALESCE(${name || null}, name),
          phone = COALESCE(${phone || null}, phone),
          updated_at = NOW()
        WHERE id = ${existingContact[0].id}
      `;
      cid = existingContact[0].id;
    } else {
      const newContact = await sql`
        INSERT INTO lead_contacts (email, email_lower, name, phone)
        VALUES (${email}, ${email}, ${name || null}, ${phone || null})
        RETURNING id
      `;
      cid = newContact[0].id;
    }

    // Step 3: Session binding — application-level conflict check
    // We check before INSERT because production DB may lack the PRIMARY KEY constraint.
    const existingBind = await sql`
      SELECT lead_contact_id FROM lead_session_contacts WHERE session_id = ${activeSessionId} LIMIT 1
    `;
    if (existingBind.length > 0) {
      if (existingBind[0].lead_contact_id !== cid) {
        return res.status(409).json({
          ok: false,
          error: "Session already bound to a different contact. Please start fresh or use the original registration session."
        });
      }
    } else {
      await sql`
        INSERT INTO lead_session_contacts (session_id, lead_contact_id)
        VALUES (${activeSessionId}, ${cid})
        ON CONFLICT (session_id) DO NOTHING
      `;
      const bound = await sql`
        SELECT lead_contact_id FROM lead_session_contacts
        WHERE session_id = ${activeSessionId}
      `;
      if (bound.length === 0 || bound[0].lead_contact_id !== cid) {
        return res.status(409).json({
          ok: false,
          error: "Session already bound to a different contact. Please start fresh or use the original registration session."
        });
      }
    }

    // Step 4: Upsert lead_preferences
    // lead_preferences has no UNIQUE constraint on lead_contact_id, so use manual upsert
    const existingPrefs = await sql`
      SELECT id FROM lead_preferences WHERE lead_contact_id = ${cid} LIMIT 1
    `;

    if (existingPrefs.length > 0) {
      await sql`
        UPDATE lead_preferences SET
          session_id = ${activeSessionId},
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
        VALUES (${cid}, ${activeSessionId}, ${budgetMin}, ${budgetMax}, ${state}, ${goal}, ${propertyType || null})
      `;
    }

    // Step 5: Write consent_records
    if (serviceConsent) {
      await sql`
        INSERT INTO consent_records (lead_contact_id, consent_type, granted, ip_hash, source_reference)
        VALUES (${cid}, 'service_processing', TRUE, ${ip || null}, 'unlock-opportunity-form')
      `;
    }
    if (marketingConsent) {
      await sql`
        INSERT INTO consent_records (lead_contact_id, consent_type, granted, ip_hash, source_reference)
        VALUES (${cid}, 'marketing', TRUE, ${ip || null}, 'unlock-opportunity-form')
      `;
    }

    // Step 6: Write lead_events
    await sql`
      INSERT INTO lead_events (lead_contact_id, session_id, event_type, event_data)
      VALUES (${cid}, ${activeSessionId}, 'opportunity_unlock', ${JSON.stringify(
      { goal, state, propertyType, budgetMin, budgetMax }
    )})
    `;

    const contactId = cid;

    // ── Fetch raw opportunities with strategy=smart, then re-rank ──
    // Cookie is set AFTER successful data fetch (FIX 6)
    let top10 = [];
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
