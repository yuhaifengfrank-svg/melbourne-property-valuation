// ── AusHomeValue Vercel Serverless API ──
// Phase 1B: Returns free summary with locked preview for full report
// Full report requires token via /api/valuation-full
//
// Cold-start optimized: heavy imports are lazy-loaded inside the handler.
// Only built-in functions (sanitizeForClient, buildFreeSummary, etc.) stay at module scope.

function sanitizeForClient(obj, debug = false) {
  const safe = JSON.parse(JSON.stringify(obj));

  delete safe.sourceResults;
  delete safe.isSingleSource;
  delete safe.evidenceMode;

  safe.customerDataStatus = mapCustomerDataStatus(obj);

  if (safe.valuation?.confidence) {
    const label = safe.valuation.confidence.label;
    const score = safe.valuation.confidence.dataScore;
    safe.valuation.confidence = { label, dataScore: score };
  }

  if (safe.valuation?.acceptedComparables) {
    safe.valuation.acceptedComparables = safe.valuation.acceptedComparables.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      distanceMeters: c.distanceMeters,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      carSpaces: c.carSpaces,
      landSize: c.landSize
    }));
  }

  if (safe.comparables?.length) {
    safe.comparables = safe.comparables.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      distanceMeters: c.distanceMeters
    }));
  }

  delete safe.rejectedComparables;
  if (safe.valuation?.rejectedComparables) delete safe.valuation.rejectedComparables;
  delete safe.methodology;
  if (safe.valuation?.methodology) delete safe.valuation.methodology;
  if (safe.valuation?.statisticalIntervals) delete safe.valuation.statisticalIntervals;

  if (safe.valuation?.estimate && !debug) {
    const { midpoint, low, high } = safe.valuation.estimate;
    safe.valuation.estimate = { midpoint, low, high };
  }

  if (safe.subject) {
    delete safe.subject.coordinates;
    delete safe.subject.lat;
    delete safe.subject.lng;
    delete safe.subject.latitude;
    delete safe.subject.longitude;
    delete safe.subject.sa2Code;
  }

  return safe;
}

function mapCustomerDataStatus(obj) {
  if (obj.customerDataStatus === 'model_based') return 'model_based';
  if (!obj.valuation?.ok || !obj.valuation?.estimate) return "unavailable";
  const acc = obj.valuation?.acceptedComparables || [];
  const crossVerified = acc.filter(c => c.verificationStatus === "cross_source_verified").length;
  const singleObserved = acc.filter(c => c.verificationStatus === "single_source_observed").length;
  const totalOk = acc.length;

  if (crossVerified >= 1) return "sufficient";
  if (singleObserved >= 3 || totalOk >= 3) return "limited";
  if (totalOk >= 1) return "limited";
  return "unavailable";
}

/**
 * Build a free summary from full valuation data.
 * Only shows: address, type, land area, midpoint, range(low-high), confidence,
 * date, comparable count, 1-2 key factors, data limitations, disclaimer.
 */
function buildFreeSummary(fullResult) {
  const val = fullResult.valuation || {};
  const est = val.estimate || {};
  const subject = fullResult.subject || {};
  const comparables = val.acceptedComparables || fullResult.comparables || [];
  const confidence = val.confidence || {};

  // Why this estimate: data source + model description + disclaimer
  const keyFactors = [
    "This estimate is generated from comparable sales data, public property records and suburb-level market analysis.",
    "Our valuation model applies multi-factor adjustments (property attributes, location, education, vacancy, supply constraints, census consistency) and is calibrated against thousands of accepted comparable sale transactions.",
    "Disclaimer: This is a free summary for general information and research purposes only. Not a formal valuation, credit decision, legal, tax or financial advice. Consult licensed professionals before making transaction or financing decisions."
  ];

  // Data limitations
  const limitations = [];
  if (comparables.length < 3) limitations.push("Limited comparable sales data in this area");
  if (confidence.label === "Low") limitations.push("Valuation confidence is low — further evidence may improve accuracy");
  if (!est.midpoint) limitations.push("Estimate is based on available public data only");
  if (limitations.length === 0) limitations.push("Valuation is based on publicly available market data");

  return {
    ok: fullResult.ok,
    address: subject.address || fullResult.address || "",
    propertyType: subject.propertyType || subject.type || fullResult.type || "",
    landSize: subject.landSize || null,
    estimate: {
      midpoint: est.midpoint || null,
      low: est.low || null,
      high: est.high || null
    },
    confidence: {
      label: confidence.label || "",
      dataScore: confidence.dataScore || null
    },
    valuationDate: val.date || fullResult.date || new Date().toISOString().split("T")[0],
    comparableCount: comparables.length,
    keyFactors: keyFactors,
    dataLimitations: limitations,
    customerDataStatus: mapCustomerDataStatus(fullResult),
    propertyFutureOutlook: fullResult.propertyFutureOutlook || null,
    suburbFutureOutlook: fullResult.suburbFutureOutlook || null,
    planningSignals: fullResult.planningSignals || null,
    disclaimer: "This free valuation summary is based on publicly available market data, property characteristics and statistical analysis for general information and research purposes only. Data may be delayed, incomplete or subject to third-party recording differences. This is not a formal valuation, credit decision, legal, tax or financial advice. Consult licensed professionals before making transaction or financing decisions.",
    // Locked preview — show what the full report contains
    lockedPreview: buildLockedPreview(fullResult)
  };
}

/**
 * Build a locked preview of the full report — chapter list, teasers, pricing.
 */
function buildLockedPreview(fullResult) {
  const val = fullResult.valuation || {};
  const comparables = val.acceptedComparables || fullResult.comparables || [];
  const mult = val.multiSourceAnalysis || null;

  const chapters = [
    { title: "Comparable Sales Analysis", teaser: `${comparables.length} comparable properties with distance, price per m², condition and adjustment details.` },
    { title: "Micro-Location Assessment", teaser: "Street-level analysis including proximity to amenities, transport, schools, parking pressure and noise factors." },
    { title: "Planning & Zoning Review", teaser: "Land zoning, overlay restrictions, subdivision potential and development constraints." },
    { title: "Suburb Profile & Trends", teaser: "Median price trends, days on market, supply/demand balance and demographic indicators." },
    { title: "Confidence Assessment", teaser: val.confidence?.label ? `Current confidence: ${val.confidence.label}. Full breakdown of data sources, verification status and adjustment rationale.` : "Detailed methodology, data source verification and adjustment rationale." },
    { title: "Investment Suitability", teaser: "Rental yield estimate, capital growth outlook, risk factors and loan-to-value considerations based on this property." }
  ];

  // Add multi-source analysis if available
  if (mult) {
    chapters.push({
      title: "Multi-Source Cross-Verification",
      teaser: "Valuation compared across independent data sources showing convergence and divergence."
    });
  }

  return {
    chapters,
    price: "AUD $3.99",
    priceLabel: "Introductory Offer",
    cta: "Coming Soon — Full Valuation Report",
    // Billing terms
    terms: "One-time payment. PDF download included."
  };
}

export default async function handler(request, response) {
  // ── UV/Undervaluation endpoint (GET only) ──
  if (request.method === 'GET' && (request.query?.uv || request.query?.opportunities)) {
    const uvService = require('./uv');
    return uvService(request, response);
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ error: "Method not allowed" }));
  }

  // Lazy-import heavy modules only when actually handling a request (cold-start win)
  const [
    { runValuation },
    { createReportDraft },
    { getSql, ensureCustomerFunnelSchema, ensureReportPaymentSchema },
    { isPaymentsEnabled },
    { scoreFutureOpportunity, scorePropertyFutureOpportunity }
  ] = await Promise.all([
    import("../lib/valuation-service.js"),
    import("../lib/report-snapshot-service.js"),
    import("./_db.js"),
    import("../lib/payment-gate.js"),
    import("../lib/future-opportunity-outlook.js")
  ]);

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const result = await runValuation(body, {
      // DB 为第一数据源，CDP 浏览器仅在 DB 数据不足时作为补充
      // Vercel 环境无需 CDP（AWS Lambda 无 Chrome）
      fetch: false
    });

    let sql = null;

    // Attach property-level Future Opportunity Outlook before snapshot creation.
    try {
      if (result.ok) {
        sql = getSql();
        const subject = result.subject || {};
        const suburbName = subject.suburb || body.suburb || "";
        const stateName = subject.state || body.state || "VIC";
        if (suburbName) {
          const rows = await sql`
            SELECT suburb, state,
                   median_house_price, median_unit_price,
                   gross_yield, school_score, vacancy_rate,
                   supply_constraint_score, infrastructure_score,
                   overall_confidence, updated_at
            FROM suburb_metrics
            WHERE LOWER(suburb) = LOWER(${suburbName})
              AND state = ${stateName}
            LIMIT 1
          `;
          const metric = rows && rows[0];
          if (metric) {
            const propertyType = subject.propertyType || body.propertyType || "house";
            const suburbOutlook = scoreFutureOpportunity(metric, {
              strategy: "balanced",
              propertyType
            });
            result.suburbFutureOutlook = suburbOutlook;
            result.propertyFutureOutlook = scorePropertyFutureOpportunity({
              suburbOutlook,
              property: {
                propertyType,
                landSize: subject.landSize || body.landSize || null,
                bedrooms: subject.bedrooms || body.bedrooms || null,
                bathrooms: subject.bathrooms || body.bathrooms || null,
                carSpaces: subject.carSpaces || body.carSpaces || null
              }
            });
          }
        }
      }
    } catch (futureErr) {
      console.error("Future outlook failed (non-fatal):", futureErr.message);
    }

    try {
      if (result.ok) {
        // Query planning signals
        if (!sql) sql = getSql();
        const { getPlanningSignals } = await import("../lib/planning-signal-service.js");
        const coords = result.subject?.coordinates;
        if (coords && coords.lat != null && coords.lon != null) {
          result.planningSignals = await getPlanningSignals(sql, Number(coords.lat), Number(coords.lon));
        } else if (body.lat != null && body.lng != null) {
          result.planningSignals = await getPlanningSignals(sql, Number(body.lat), Number(body.lng));
        }
      }
    } catch (planningErr) {
      console.error("Planning signals query failed (non-fatal):", planningErr.message);
    }

    // Generate short-lived draft token for this valuation
    let draftToken = null;
    let draftExpiresAt = null;
    try {
      if (result.ok) {
        if (!sql) sql = getSql();
        // Ensure dependent schemas exist before writing report_drafts
        await ensureCustomerFunnelSchema(sql);
        await ensureReportPaymentSchema(sql);
        const draft = await createReportDraft(result, sql);
        draftToken = draft.draftToken;
        draftExpiresAt = draft.draftExpiresAt;
      }
    } catch (draftErr) {
      // Draft creation failure should not break the free valuation
      console.error("Draft creation failed (non-fatal):", draftErr.message);
    }

    // Build free summary instead of returning full sanitized data
    const freeSummary = buildFreeSummary(result);
    freeSummary.reportDraftToken = draftToken;
    freeSummary.draftExpiresAt = draftExpiresAt;

    // Payments gate: shared single source of truth
    freeSummary.paymentsEnabled = isPaymentsEnabled();

    return response.status(result.ok ? 200 : 400)
      .setHeader("Content-Type", "application/json")
      .setHeader("Cache-Control", "no-store")
      .send(JSON.stringify(freeSummary));
  } catch (error) {
    console.error(error);
    return response.status(500)
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify({
        ok: false,
        status: "error",
        error: error.message,
        estimate: null,
        customerDataStatus: "unavailable",
        disclaimer: "This free valuation summary is based on publicly available market data for general information only. This is not a formal valuation."
      }));
  }
}
