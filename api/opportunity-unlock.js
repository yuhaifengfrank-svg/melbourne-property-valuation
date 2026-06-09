/**
 * api/opportunity-unlock.js — Register/unlock for Top Opportunities
 *
 * POST /api/opportunity-unlock
 *   Body: { name, email, phone, contactConsent, language, strategy,
 *           budgetMin, budgetMax, propertyType, state }
 *   Returns: { ok, lead, isNew, status: "full"|"partial"|"duplicate" }
 *
 * GET /api/opportunity-unlock?email=<email>
 *   Check registration status for a given email.
 *   Returns: { ok, status: "full"|"partial"|"none", lead }
 *
 * Behaviour:
 *   "full"  = name + email + phone + consent existing → no re-prompt
 *   "partial" = name + email but no phone/consent → prompt for phone + consent
 *   "none" = nothing on record → full registration flow
 */

import crypto from "node:crypto";
import { ensureSchema, getSql } from "./_db.js";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function getIp(request) {
  return clean(request.headers["x-forwarded-for"]?.split(",")[0] || request.socket?.remoteAddress || "", 100);
}

function hashIp(ip) {
  if (!ip) return "";
  const salt = process.env.IP_HASH_SALT || "aushomevalue";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);

    /* ── GET: Check registration status ── */
    if (req.method === "GET") {
      const email = clean(req.query.email, 254).toLowerCase();
      if (!email || !email.includes("@")) {
        return res.status(200).json({ ok: false, status: "none", error: "Valid email required" });
      }

      const rows = await sql`
        SELECT id, name, email, phone, contact_consent, consent_timestamp, source,
               strategy, budget_min, budget_max, property_type, destination_state,
               created_at, updated_at
        FROM leads
        WHERE LOWER(email) = ${email}
          AND source = 'top_opportunities'
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      if (!rows.length) {
        return res.status(200).json({ ok: true, status: "none", lead: null });
      }

      const lead = rows[0];
      const isFull = lead.phone && lead.contact_consent;
      return res.status(200).json({
        ok: true,
        status: isFull ? "full" : "partial",
        lead: {
          name: lead.name,
          email: lead.email,
          hasPhone: !!lead.phone,
          hasConsent: !!lead.contact_consent,
          consentTimestamp: lead.consent_timestamp,
          strategy: lead.strategy,
          budget_min: lead.budget_min,
          budget_max: lead.budget_max,
          property_type: lead.property_type,
          state: lead.destination_state
        }
      });
    }

    /* ── POST: Register or update ── */
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const name = clean(body.name, 150);
    const email = clean(body.email, 254).toLowerCase();
    const phone = clean(body.phone, 80);
    const language = clean(body.language, 10) || "en";
    const strategy = clean(body.strategy, 80) || null;
    const propertyType = clean(body.propertyType, 80) || null;
    const destState = clean(body.state, 10) || null;
    const budgetMin = Number.isFinite(Number(body.budgetMin)) ? Math.round(Number(body.budgetMin)) : null;
    const budgetMax = Number.isFinite(Number(body.budgetMax)) ? Math.round(Number(body.budgetMax)) : null;
    const contactConsent = Boolean(body.contactConsent);
    const ip = getIp(req);

    /* Validation */
    if (!name || !email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "Name and valid email are required" });
    }
    if (!phone) {
      return res.status(400).json({ ok: false, error: "Phone number is required to unlock opportunities" });
    }
    if (!contactConsent) {
      return res.status(400).json({ ok: false, error: "Contact consent is required to unlock opportunities" });
    }

    /* Check if existing lead for this email + source */
    const existing = await sql`
      SELECT id, name, email, phone, contact_consent
      FROM leads
      WHERE LOWER(email) = ${email}
        AND source = 'top_opportunities'
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    let isNew = false;
    let leadResult;
    const now = new Date().toISOString();

    if (existing.length) {
      /* Update existing — don't insert duplicate */
      leadResult = await sql`
        UPDATE leads
        SET
          name = ${name},
          phone = ${phone},
          contact_consent = ${contactConsent},
          consent_timestamp = ${now}::timestamptz,
          strategy = COALESCE(${strategy}, strategy),
          budget_min = COALESCE(${budgetMin}, budget_min),
          budget_max = COALESCE(${budgetMax}, budget_max),
          property_type = COALESCE(${propertyType}, property_type),
          destination_state = COALESCE(${destState}, destination_state),
          language = COALESCE(${language}, language),
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, created_at, updated_at, name, email, phone, contact_consent, consent_timestamp, source, strategy
      `;
      isNew = false;
    } else {
      const hasExistingName = await sql`
        SELECT id FROM leads WHERE LOWER(email) = ${email} LIMIT 1
      `;

      leadResult = await sql`
        INSERT INTO leads (
          name, email, phone, contact_consent, consent_timestamp, source,
          strategy, budget_min, budget_max, property_type, destination_state,
          language, event_type, property_address, lead_score, priority, ip_hash,
          ip_country, ip_region, ip_city, user_agent
        ) VALUES (
          ${name},
          ${email},
          ${phone},
          ${contactConsent},
          ${now}::timestamptz,
          'top_opportunities',
          ${strategy},
          ${budgetMin},
          ${budgetMax},
          ${propertyType},
          ${destState},
          ${language},
          'opportunity_unlock',
          'Top Opportunities',
          50,
          ${contactConsent ? 'Warm' : 'Early'},
          ${hashIp(ip) || null},
          ${clean(req.headers["x-vercel-ip-country"], 10) || null},
          ${clean(req.headers["x-vercel-ip-country-region"], 100) || null},
          ${clean(req.headers["x-vercel-ip-city"], 150) || null},
          ${clean(req.headers["user-agent"], 500) || null}
        )
        RETURNING id, created_at, name, email, phone, contact_consent, consent_timestamp, source, strategy
      `;
      isNew = !hasExistingName.length;
    }

    return res.status(200).json({
      ok: true,
      status: "full",
      isNew,
      lead: {
        id: leadResult[0].id,
        name: leadResult[0].name,
        email: leadResult[0].email,
        hasPhone: !!leadResult[0].phone,
        hasConsent: !!leadResult[0].contact_consent,
        consentTimestamp: leadResult[0].consent_timestamp
      }
    });

  } catch (error) {
    console.error("[opportunity-unlock]", error.message);
    return res.status(500).json({ error: "Registration service unavailable" });
  }
}
