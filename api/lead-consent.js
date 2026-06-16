// ── api/lead-consent.js ──
// Phase 1E3D-3: Lead consent collection for valuation funnel.
//
// POST only. Input: { "email": "...", "phone": "..." } (phone optional)
//
// Flow:
//   1. Validate email format
//   2. Ensure customer funnel schema
//   3. Upsert lead_contacts by email_lower (atomic ON CONFLICT)
//   4. Return { ok: true, leadContactId: number }
//
// No Stripe, no payment, no draft consumption.
// Designed for use by the valuation funnel modal before full report unlock.

import { ensureCustomerFunnelSchema, getSql } from "./_db.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // ── Validate email ──
  const rawEmail = (req.body && req.body.email || "").trim();
  if (!rawEmail) {
    return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
  }
  if (!EMAIL_RE.test(rawEmail)) {
    return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
  }

  const emailLower = rawEmail.toLowerCase();
  const phone = (req.body && req.body.phone || "").trim() || null;

  try {
    const sql = getSql();
    await ensureCustomerFunnelSchema(sql);

    // ── Upsert lead_contact ──
    const result = await sql`
      INSERT INTO lead_contacts (email, email_lower, phone)
      VALUES (${rawEmail}, ${emailLower}, ${phone})
      ON CONFLICT (email_lower)
      DO UPDATE SET
        updated_at = NOW(),
        phone = COALESCE(lead_contacts.phone, EXCLUDED.phone)
      RETURNING id
    `;

    const leadContactId = result?.[0]?.id;
    if (!leadContactId || typeof leadContactId !== "number") {
      throw new Error("Failed to create or retrieve lead contact");
    }

    return res.status(200).json({ ok: true, leadContactId });
  } catch (err) {
    console.error("lead-consent error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
