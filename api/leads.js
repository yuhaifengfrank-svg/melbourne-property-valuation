import crypto from "node:crypto";
import { ensureSchema, getSql } from "./_db.js";

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(JSON.stringify(body));
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function getIp(request) {
  return clean(request.headers["x-forwarded-for"]?.split(",")[0] || request.socket?.remoteAddress || "", 100);
}

function cleanHeader(value, max = 150) {
  const raw = clean(value, max);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function hashIp(ip) {
  if (!ip) return "";
  const salt = process.env.IP_HASH_SALT || "aushomevalue";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function scoreLead(body) {
  let score = 10;
  if (clean(body.phone)) score += 25;
  if (body.contactConsent) score += 25;
  if (body.pdfDownload) score += 20;
  if (Number(body.selectedLvr) >= 60) score += 5;
  if (clean(body.eventType) === "pdf_download") score += 5;
  if (Number(body.midpointValue) >= 1500000) score += 5;
  if (body.analysis?.planning) score += 5;

  const capped = Math.min(score, 100);
  return {
    score: capped,
    priority: capped >= 75 ? "Hot" : capped >= 45 ? "Warm" : "Early"
  };
}

function isAdmin(request) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const supplied = clean(request.headers.authorization).replace(/^Bearer\s+/i, "");
  return supplied && supplied === expected;
}

export default async function handler(request, response) {
  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (request.method === "GET") {
      if (!isAdmin(request)) return json(response, 401, { error: "Unauthorized" });

      const leads = await sql`
        SELECT
          id, created_at, name, email, phone, contact_consent, pdf_download,
          property_address, property_suburb, property_state, property_type, estimated_value, midpoint_value,
          confidence, selected_lvr, language, event_type, lead_score, priority,
          ip_country, ip_region, ip_city, analysis
        FROM leads
        ORDER BY lead_score DESC, created_at DESC
        LIMIT 500
      `;

      const summary = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE priority = 'Hot')::int AS hot,
          COUNT(*) FILTER (WHERE contact_consent = TRUE)::int AS consented,
          COUNT(*) FILTER (WHERE pdf_download = TRUE)::int AS pdf_requests
        FROM leads
      `;

      return json(response, 200, { leads, summary: summary[0] });
    }

    if (request.method === "DELETE") {
      if (!isAdmin(request)) return json(response, 401, { error: "Unauthorized" });

      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return json(response, 400, { error: "Valid lead id is required" });

      const deleted = await sql`
        DELETE FROM leads
        WHERE id = ${id} AND name ILIKE '%DO NOT CONTACT%'
        RETURNING id
      `;
      if (!deleted.length) return json(response, 404, { error: "Only test records marked DO NOT CONTACT can be deleted" });
      return json(response, 200, { ok: true, deletedId: deleted[0].id });
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST, DELETE");
      return json(response, 405, { error: "Method not allowed" });
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const name = clean(body.name, 150);
    const email = clean(body.email, 254).toLowerCase();
    const propertyAddress = clean(body.propertyAddress, 300);
    const propertySuburb = clean(body.propertySuburb, 120);
    const propertyState = clean(body.propertyState, 10).toUpperCase();
    const eventType = clean(body.eventType, 80) || "report_unlock";

    if (!name || !email || !propertyAddress || !email.includes("@")) {
      return json(response, 400, { error: "Name, email and property address are required" });
    }

    const { score, priority } = scoreLead(body);
    const ip = getIp(request);
    const analysis = body.analysis && typeof body.analysis === "object" ? body.analysis : {};
    const ipCountry = cleanHeader(request.headers["x-vercel-ip-country"], 10) || null;
    const ipRegion = cleanHeader(request.headers["x-vercel-ip-country-region"], 100) || null;
    const ipCity = cleanHeader(request.headers["x-vercel-ip-city"], 150) || null;
    const existingNotification = await sql`
      SELECT id
      FROM leads
      WHERE LOWER(email) = LOWER(${email})
        AND LOWER(property_address) = LOWER(${propertyAddress})
        AND event_type = ${eventType}
      ORDER BY created_at ASC
      LIMIT 1
    `;

    const rows = await sql`
      INSERT INTO leads (
        name, email, phone, contact_consent, pdf_download, property_address,
        property_suburb, property_state,
        property_type, estimated_value, midpoint_value, confidence, selected_lvr,
        language, event_type, lead_score, priority, ip_hash, ip_country, ip_region,
        ip_city, user_agent, analysis
      ) VALUES (
        ${name},
        ${email},
        ${clean(body.phone, 80) || null},
        ${Boolean(body.contactConsent)},
        ${Boolean(body.pdfDownload)},
        ${propertyAddress},
        ${propertySuburb || null},
        ${propertyState || null},
        ${clean(body.propertyType, 80) || null},
        ${clean(body.estimatedValue, 100) || null},
        ${Number.isFinite(Number(body.midpointValue)) ? Math.round(Number(body.midpointValue)) : null},
        ${clean(body.confidence, 80) || null},
        ${Number.isFinite(Number(body.selectedLvr)) ? Math.round(Number(body.selectedLvr)) : null},
        ${clean(body.language, 10) || null},
        ${eventType},
        ${score},
        ${priority},
        ${hashIp(ip) || null},
        ${ipCountry},
        ${ipRegion},
        ${ipCity},
        ${clean(request.headers["user-agent"], 500) || null},
        ${JSON.stringify(analysis)}::jsonb
      )
      RETURNING id, created_at, lead_score, priority, ip_country, ip_region, ip_city
    `;

    return json(response, 201, {
      ok: true,
      lead: rows[0],
      notification: {
        should_send: existingNotification.length === 0,
        duplicate_of: existingNotification[0]?.id || null
      }
    });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "Database service is not available" });
  }
}
