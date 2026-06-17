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

// Lazy-loaded inside handler for cold-start optimization

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

  // Lazy-import heavy modules on first real request
  const [{ runValuation }, { getSql }] = await Promise.all([
    import("../lib/valuation-service.js"),
    import("./_db.js")
  ]);

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

    // ── Suburb-level data (location, planning, suburb fundamentals) ──
    const suburbName = result.subject?.suburb || body.suburb || "";
    const stateName = result.subject?.state || body.state || "VIC";
    const propType = (result.subject?.propertyType || body.propertyType || "house").toLowerCase();
    const isUnitLike = propType === "unit" || propType === "apartment";

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

    // ── Suburb metrics from DB ──
    let medianPrice = result.medianPrice || null;
    let suburbMetrics = {};
    if (suburbName) {
      try {
        const [metric] = await sql`
          SELECT median_house_price, median_unit_price, vacancy_rate,
                 dwelling_separate_house, dwelling_flat, dwelling_semi_detached,
                 dwelling_occupancy_rate, dwelling_3br_plus, dwelling_1br_2br,
                 supply_housing_stock AS dwelling_housing_stock, supply_unemployment_rate,
                 growth_1y, growth_3y, growth_5y
          FROM suburb_metrics
          WHERE LOWER(suburb) = LOWER(${suburbName})
            AND state = ${stateName}
          LIMIT 1
        `;
        if (metric) {
          suburbMetrics = metric;
          const priceCol = isUnitLike ? "median_unit_price" : "median_house_price";
          if (metric[priceCol] != null) {
            medianPrice = Number(metric[priceCol]);
          }
        }
      } catch (_e) {
        // Suburb metrics are optional
      }
    }

    // ── School zone data ──
    let schools = [];
    if (suburbName) {
      try {
        const rows = await sql`
          SELECT l.school_name, l.school_type, l.school_sector AS sector,
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

    // ── Micro-Location Assessment (registered tier) ──
    // Based on property type + suburb profile to generate meaningful street-level data
    function inferLocationRank(housingStock, separateHousePct, unempRate) {
      if (separateHousePct >= 75) return unempRate < 3 ? "High" : "Medium-High";
      if (separateHousePct >= 50) return unempRate < 4 ? "Medium-High" : "Medium";
      return "Medium";
    }
    function inferStreetType(separateHousePct, flatPct) {
      if (separateHousePct >= 80) return "Residential — predominately detached homes";
      if (flatPct >= 20) return "Mixed — detached homes with low/medium density";
      return "Mixed-use residential";
    }
    function inferAmenityAccess(unempRate) {
      if (unempRate < 3) return "Good — low unemployment suggests good amenity access";
      if (unempRate < 5) return "Moderate — typical suburban amenity level";
      return "Below average — limited amenity options";
    }
    function inferParkingPressure(flatPct, housingPerCapita) {
      if (flatPct > 30) return "Elevated — higher density area, on-street parking may be competitive";
      if (flatPct > 15) return "Moderate — mix of off-street and on-street parking";
      return "Low — predominately off-street parking with driveways";
    }

    const sm = suburbMetrics;
    const separateHousePct = sm.dwelling_separate_house != null ? Number(sm.dwelling_separate_house) : 70;
    const flatPct = sm.dwelling_flat != null ? Number(sm.dwelling_flat) : 10;
    const unempRate = sm.supply_unemployment_rate != null ? Number(sm.supply_unemployment_rate) : 4;
    const occRate = sm.dwelling_occupancy_rate != null ? Number(sm.dwelling_occupancy_rate) : 2.6;
    const housingStock = sm.dwelling_housing_stock != null ? Number(sm.dwelling_housing_stock) : null;

    const location = {
      rank: inferLocationRank(housingStock, separateHousePct, unempRate),
      type: inferStreetType(separateHousePct, flatPct),
      amenity: inferAmenityAccess(unempRate),
      parking: inferParkingPressure(flatPct, separateHousePct)
    };

    // ── Suburb Fundamentals (registered tier) ──
    const suburbFundamentals = [];
    if (separateHousePct != null) {
      suburbFundamentals.push(`Housing mix: ${separateHousePct.toFixed(0)}% detached homes, ${flatPct.toFixed(0)}% apartments/flats, ${sm.dwelling_semi_detached != null ? Number(sm.dwelling_semi_detached).toFixed(0) : '-'}% semi-detached`);
    }
    if (occRate != null) {
      suburbFundamentals.push(`Average household occupancy: ${occRate.toFixed(2)} persons per dwelling`);
    }
    if (sm.dwelling_3br_plus != null) {
      suburbFundamentals.push(`Family-sized dwellings (3+ bedrooms): ${Number(sm.dwelling_3br_plus).toFixed(0)}%`);
    }
    if (unempRate != null) {
      suburbFundamentals.push(`Unemployment rate: ${unempRate.toFixed(1)}% (${unempRate < 3.5 ? "below" : "near"} state average)`);
    }
    if (sm.vacancy_rate != null) {
      suburbFundamentals.push(`Rental vacancy rate: ${Number(sm.vacancy_rate).toFixed(1)}% — ${Number(sm.vacancy_rate) < 3 ? "tight" : Number(sm.vacancy_rate) < 6 ? "balanced" : "soft"} market`);
    }
    if (sm.growth_1y != null) {
      suburbFundamentals.push(`1-year price growth: ${Number(sm.growth_1y) > 0 ? "+" : ""}${Number(sm.growth_1y).toFixed(1)}%`);
    }
    if (suburbName) {
      suburbFundamentals.push(`SA2-level census data available for ${suburbName}: income, employment, occupation, household composition`);
    }
    if (suburbFundamentals.length === 0) {
      suburbFundamentals.push("Suburb fundamentals data pending for this location");
    }

    // ── Planning / Zoning Potential (registered tier) ──
    // In production, this would query vicplan API or a cached zoning table
    const planning = {
      landSource: isUnitLike ? "Existing title — unit/apartment" : "Existing title — single dwelling",
      granny: isUnitLike ? "Subject to strata by-laws" : separateHousePct >= 70 ? "Possible — check council overlay" : "Potential limited by local density",
      approval: separateHousePct >= 70 ? "Standard — subject to VicSmart or permit" : "Check council planning scheme"
    };

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

      // Mid-tier detail panels
      location,
      suburb: suburbFundamentals,
      planning,

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
