// ── api/valuation-lead.js ──
// Phase 2: Registered-user valuation endpoint — returns mid-tier data
// for users who have submitted lead consent but not paid.
//
// POST only.
// Body: { address, propertyType, leadContactId }
//
// Returns:
//   - Free summary fields (midpoint, low, high, confidence, etc.)
//   - Top 3 accepted comparables with details
//   - Suburb median price trend
//   - School zones nearby
//   - Opportunity preview (top 3 for this suburb)
//
// Does NOT create a report draft (no draftToken).
// Does NOT require Stripe.

import { runValuation } from "../lib/valuation-service.js";
import { getSql } from "./_db.js";

// ── Constants ──

const COMPARABLES_DISPLAY_COUNT = 3;
const OPPORTUNITY_PREVIEW_COUNT = 3;

// ── Handler ──

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const rawLeadContactId = body.leadContactId;

  // ── Validate leadContactId ──
  const leadContactId = Number(rawLeadContactId);
  if (!rawLeadContactId || !Number.isFinite(leadContactId) || leadContactId < 1) {
    return res.status(400).json({ ok: false, error: "INVALID_LEAD_CONTACT_ID" });
  }

  try {
    const sql = getSql();

    // ── Verify lead contact exists ──
    const [contact] = await sql`
      SELECT id, email FROM lead_contacts WHERE id = ${leadContactId}
    `;
    if (!contact) {
      return res.status(404).json({ ok: false, error: "LEAD_CONTACT_NOT_FOUND" });
    }

    // ── Run valuation (same engine as /api/valuation) ──
    const result = await runValuation(body, {
      fetch: false,
      useDatabaseFallback: true
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        status: result.status || "valuation-failed",
        error: "Valuation could not be completed."
      });
    }

    // ── Build registered-tier response ──
    const val = result.valuation || {};
    const est = val.estimate || {};
    const subject = result.subject || {};
    const allComparables = result.comparables || val.acceptedComparables || [];
    const confidence = val.confidence || {};

    // Top N comparables with full details
    const comparables = allComparables.slice(0, COMPARABLES_DISPLAY_COUNT).map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      distanceMeters: c.distanceMeters,
      bedrooms: c.bedrooms || null,
      bathrooms: c.bathrooms || null,
      carSpaces: c.carSpaces || null,
      landSize: c.landSize || null
    }));

    // ── Suburb median price trend ──
    // Try result.medianPrice first, then query suburb_metrics as fallback
    let medianPrice = result.medianPrice || null;
    const suburbName = result.subject?.suburb || body.suburb || "";
    const stateName = result.subject?.state || body.state || "VIC";
    if (medianPrice == null && suburbName) {
      try {
        const propType = (result.subject?.propertyType || body.propertyType || "house").toLowerCase();
        const priceCol = propType === "unit" || propType === "apartment" ? "median_unit_price" : "median_house_price";
        const [metric] = await sql`
          SELECT ${sql.unsafe(priceCol)} AS median_price
          FROM suburb_metrics
          WHERE LOWER(suburb) = LOWER(${suburbName})
            AND state = ${stateName}
            AND ${sql.unsafe(priceCol)} IS NOT NULL
          LIMIT 1
        `;
        if (metric && metric.median_price != null) {
          medianPrice = Number(metric.median_price);
        }
      } catch (_e) {
        // Median price is optional
      }
    }

    // ── School zone data ──
    let schools = [];
    if (suburbName) {
      try {
        const rows = await sql`
          SELECT l.school_name, l.school_type, l.sector,
                 ROUND(p.icsea::numeric, 0) AS icsea,
                 p.score_reading, p.score_writing, p.score_spelling,
                 p.score_grammar, p.score_numeracy, p.enrolled
          FROM school_locations l
          LEFT JOIN school_profiles p ON l.acara_sml_id = p.acara_sml_id
          WHERE LOWER(l.suburb) = LOWER(${suburbName})
            AND l.state = ${stateName}
          ORDER BY p.icsea DESC NULLS LAST
          LIMIT 5
        `;
        schools = rows.map(r => ({
          name: r.school_name,
          type: r.school_type,
          sector: r.sector || null,
          icsea: r.icsea ? Number(r.icsea) : null,
          enrolled: r.enrolled ? Number(r.enrolled) : null
        }));
      } catch (_e) {
        // School data is optional
      }
    }

    // ── Opportunity preview for this suburb ──
    let opportunities = [];
    if (suburbName) {
      try {
        const oppRows = await sql`
          SELECT suburb, state, opportunity_score, opportunity_type,
                 median_house_price, growth_1y, growth_3y, gross_yield,
                 school_score, vacancy_rate
          FROM suburb_metrics
          WHERE LOWER(suburb) = LOWER(${suburbName})
            AND opportunity_score IS NOT NULL
          ORDER BY opportunity_score DESC
          LIMIT ${OPPORTUNITY_PREVIEW_COUNT}
        `;
        opportunities = oppRows.map(r => ({
          suburb: r.suburb,
          state: r.state || "VIC",
          type: r.opportunity_type || "Balanced",
          score: Number(r.opportunity_score) || 0,
          medianHousePrice: r.median_house_price ? Number(r.median_house_price) : null,
          growth1y: r.growth_1y ? Number(r.growth_1y) : null,
          growth3y: r.growth_3y ? Number(r.growth_3y) : null,
          grossYield: r.gross_yield ? Number(r.gross_yield) : null,
          schoolScore: r.school_score ? Number(r.school_score) : null,
          vacancyRate: r.vacancy_rate ? Number(r.vacancy_rate) : null
        }));
      } catch (_e) {
        // Opportunity data is optional
      }
    }

    // ── Build key factors for display ──
    const reasons = val.reasons || result.reasons || [];
    const keyFactors = reasons.slice(0, 3).map(r => {
      if (typeof r === "string") return r;
      return r.text || r.label || String(r);
    });

    // ── Assemble response ──
    const leadResponse = {
      ok: true,
      status: result.status,
      address: subject.address || body.address || "",
      propertyType: subject.propertyType || body.propertyType || "house",
      leadContactId,

      // Core estimate (same as free tier)
      estimate: {
        midpoint: est.midpoint || null,
        low: est.low || null,
        high: est.high || null
      },
      confidence: {
        label: confidence.label || "",
        dataScore: confidence.dataScore || null
      },
      comparableCount: allComparables.length,
      keyFactors,

      // ── Registered-tier extras ──
      comparables,
      medianPrice,

      schools,
      opportunityPreview: {
        total: opportunities.length,
        opportunities
      },

      // No draft token — user needs to pay for full report
      reportDraftToken: null,
      paymentsEnabled: false,

      disclaimer: "This registered-tier valuation includes additional data for research purposes only. Data may be delayed or incomplete. Full report requires payment.",
      dataTier: "registered",
      valuationMode: result.valuationMode || "standard_house"
    };

    return res.status(200)
      .setHeader("Cache-Control", "no-store")
      .json(leadResponse);

  } catch (err) {
    console.error("valuation-lead error:", err);
    return res.status(500).json({
      ok: false,
      error: "VALUATION_ERROR",
      message: "An error occurred processing your valuation request."
    });
  }
}
