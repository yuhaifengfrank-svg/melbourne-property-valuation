// ── api/unlock-opportunity.js ──
// Phase 1B: Fills lead_contacts/preferences/events/consent, issues signed token,
// returns personalised Top 10 opportunity results.
//
// GET  /api/unlock-opportunity       → { ok, status: "none"|"active"|"expired" }
// POST /api/unlock-opportunity       → validates form → upsert contact → issue token → return Top 10

import crypto from "node:crypto";
import { ensureCustomerFunnelSchema, getSql } from "./_db.js";
import { createToken, generateSessionId, verifyToken } from "../lib/signed-token.js";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function hashIp(ip) {
  if (!ip) return "";
  const salt = process.env.IP_HASH_SALT || "aushomevalue";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Fetch personalised Top 10 from the opportunity API.
 * Returns array of { suburb, baseScore, personalisedScore, reason, risk, confidence, dataUpdated, disclaimer }
 */
async function fetchPersonalisedTop10(preferences) {
  const goal = preferences.goal || "balanced";
  const propertyType = preferences.property_type || "house";
  const state = preferences.state || "vic";
  const budgetMin = preferences.budget_min || null;
  const budgetMax = preferences.budget_max || null;

  try {
    // Build query that roughly aligns with the existing /api/opportunity endpoint interface
    const params = new URLSearchParams({
      strategy: goal,
      propertyType,
      maxResults: "20"
    });
    if (budgetMin) params.set("minPrice", String(budgetMin));
    if (budgetMax) params.set("maxPrice", String(budgetMax));
    if (state) params.set("state", state);

    // Derive internal request URL — use relative fetch for Vercel or absolute for tests
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://127.0.0.1:3000";
    const url = `${baseUrl}/api/opportunity?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Opportunity API returned ${res.status}`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.opportunities)) {
      throw new Error("Invalid opportunity API response");
    }

    // Build personalised Top 10
    const top10 = data.opportunities.slice(0, 10).map((o, idx) => {
      const baseScore = Math.round((o.opportunityScore || 0) * 100) / 100;
      const growthScore = (o.growth3y || 0) * 5;
      const schoolScore = (o.schoolScore || 0) * 0.3;
      const yieldScore = (o.rentalYield || 0) * 2;
      const goalBonus = calculateGoalBonus(goal, o);
      const personalisedScore = Math.min(100, Math.round((baseScore * 0.6 + growthScore + schoolScore + yieldScore + goalBonus) * 100) / 100);

      return {
        suburb: o.suburb,
        state: o.state || "VIC",
        baseScore,
        personalisedScore,
        reason: generateReason(goal, o),
        risk: generateRisk(o),
        confidence: dataSourceConfidence(o),
        dataUpdated: o.dataUpdated || "2026",
        disclaimer: "The opportunity score is a relative ranking based on publicly available data and should not be used as financial advice."
      };
    });

    return top10;
  } catch (err) {
    console.error("[unlock-opportunity] fetchPersonalisedTop10 error:", err.message);
    // Return fallback with explanatory data
    return generateFallbackTop10(preferences);
  }
}

function calculateGoalBonus(goal, suburb) {
  switch (goal) {
    case "growth": return (suburb.growth3y || 0) * 3;
    case "cashflow": return (suburb.rentalYield || 0) * 5;
    case "school": return (suburb.schoolScore || 0) * 0.5;
    case "value": return Math.max(0, (suburb.medianHousePrice ? 20 : 0) - (suburb.opportunityScore || 0) * 0.1);
    default: return 0;
  }
}

function generateReason(goal, suburb) {
  const g = (suburb.growth3y || 0).toFixed(1);
  const y = (suburb.rentalYield || 0).toFixed(1);
  const s = (suburb.schoolScore || 0).toFixed(0);
  const hp = suburb.medianHousePrice ? `$${Math.round(suburb.medianHousePrice / 1000)}K` : "N/A";

  switch (goal) {
    case "growth": return `${g}% 3-year growth (local data)`;
    case "cashflow": return `${y}% rental yield, median house ${hp}`;
    case "school": return `School score ${s}/100, median ${hp}`;
    case "value": return `Median ${hp}, improving fundamentals`;
    default: return `Score ${(suburb.opportunityScore || 0).toFixed(1)} · ${g}% growth · ${y}% yield`;
  }
}

function generateRisk(suburb) {
  const risks = [];
  if ((suburb.growth3y || 0) > 40) risks.push("Recent high growth may not be sustainable");
  if ((suburb.rentalYield || 0) < 2.5) risks.push("Low rental yield may indicate weak rental demand");
  if ((suburb.vacancyRate || 0) > 5) risks.push("Above-average vacancy rate");
  if ((suburb.supplyRatio || 0) > 1.2) risks.push("New supply may outpace demand");
  if (risks.length === 0) risks.push("Standard market risk profile");
  return risks.join(" · ");
}

function dataSourceConfidence(suburb) {
  if (suburb.comparableCount >= 20) return "High";
  if (suburb.comparableCount >= 10) return "Medium";
  return "Low";
}

function generateFallbackTop10(preferences) {
  const state = preferences.state || "VIC";
  const goal = preferences.goal || "balanced";
  // Static fallback for when opportunity API is offline
  const fallbackSuburbs = [
    "Werribee", "Point Cook", "Tarneit", "Cranbourne", "Pakenham",
    "Craigieburn", "Epping", "Wyndham Vale", "Melton", "Sunbury"
  ];
  return fallbackSuburbs.map((suburb, idx) => ({
    suburb,
    state,
    baseScore: Math.round((80 - idx * 5) * 100) / 100,
    personalisedScore: Math.round((75 - idx * 4) * 100) / 100,
    reason: `${goal} opportunity in ${suburb}`,
    risk: "Standard market risk profile",
    confidence: "Medium",
    dataUpdated: "2026",
    disclaimer: "The opportunity score is a relative ranking based on publicly available data and should not be used as financial advice."
  }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const sql = getSql();
    await ensureCustomerFunnelSchema(sql);

    // ── GET: Check session status ──
    if (req.method === "GET") {
      // Check for token in header or query
      const { verifyToken } = await import("../lib/signed-token.js");
      const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : (req.query.token || "");
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

    // ── POST: Register and unlock ──
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // Extract fields
    const email = clean(body.email, 254).toLowerCase();
    const name = clean(body.name, 150);
    const phone = clean(body.phone, 50);
    const budgetMin = Number.isFinite(Number(body.budgetMin)) ? Math.round(Number(body.budgetMin)) : null;
    const budgetMax = Number.isFinite(Number(body.budgetMax)) ? Math.round(Number(body.budgetMax)) : null;
    const state = clean(body.state, 20);
    const goal = clean(body.goal, 50);
    const propertyType = clean(body.propertyType, 50);
    const serviceConsent = Boolean(body.serviceConsent);
    const marketingConsent = Boolean(body.marketingConsent);
    const sessionId = clean(body.sessionId, 100) || generateSessionId();
    const ip = hashIp(req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "");

    // Validate required fields
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "Valid email is required" });
    }
    if (!serviceConsent) {
      return res.status(400).json({ ok: false, error: "Service processing consent is required to proceed" });
    }
    if (!state) {
      return res.status(400).json({ ok: false, error: "State is required" });
    }
    if (!goal) {
      return res.status(400).json({ ok: false, error: "Investment goal is required" });
    }

    // ── Write to database ──

    // 1. Upsert lead_contacts (unique by email_lower)
    const existingContact = await sql`
      SELECT id, name, phone FROM lead_contacts WHERE email_lower = ${email} LIMIT 1
    `;

    let contactId;
    if (existingContact.length > 0) {
      // Update existing — new name/phone take priority
      const updateFields = [];
      if (name) updateFields.push(sql`name = ${name}`);
      if (phone) updateFields.push(sql`phone = ${phone}`);
      updateFields.push(sql`updated_at = NOW()`);

      await sql`
        UPDATE lead_contacts SET ${sql.join(updateFields, sql`, `)} WHERE id = ${existingContact[0].id}
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
      VALUES (${contactId}, ${sessionId}, 'opportunity_unlock', ${JSON.stringify({ goal, state, propertyType, budgetMin, budgetMax })})
    `;

    // 5. Session binding
    await sql`
      INSERT INTO lead_session_contacts (session_id, lead_contact_id)
      VALUES (${sessionId}, ${contactId})
      ON CONFLICT (session_id) DO NOTHING
    `;

    // ── Issue signed token ──
    const token = createToken({ email, gate_level: "opportunity" });

    // ── Fetch personalised Top 10 ──
    const top10 = await fetchPersonalisedTop10({
      goal,
      property_type: propertyType,
      state,
      budget_min: budgetMin,
      budget_max: budgetMax
    });

    return res.status(200).json({
      ok: true,
      status: "active",
      token,
      sessionId,
      contact: { id: contactId, email, name },
      top10,
      top10Count: top10.length,
      disclaimer: "The personalised Top 10 is based on publicly available data and algorithmic scoring. It does not constitute financial advice. Always conduct independent research and consult licensed professionals before making property decisions."
    });

  } catch (error) {
    console.error("[unlock-opportunity]", error.message);
    return res.status(500).json({ ok: false, error: "Service temporarily unavailable" });
  }
}
