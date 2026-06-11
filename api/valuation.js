// ── AusHomeValue Vercel Serverless API ──
// Phase 1B: Returns free summary with locked preview for full report
// Full report requires token via /api/valuation-full

import { runValuation } from "../lib/valuation-service.js";

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

  // Determine key factors (1-2 from valuation reasons)
  const reasons = val.reasons || fullResult.reasons || [];
  const keyFactors = reasons.slice(0, 2).map(r => {
    if (typeof r === 'string') return r;
    return r.text || r.label || String(r);
  });

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
    cta: "Unlock Full Valuation Report — Introductory Offer AUD $3.99",
    // Billing terms
    terms: "One-time payment. PDF download included."
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const result = await runValuation(body, {
      fetch: false,
      useDatabaseFallback: true
    });

    // Build free summary instead of returning full sanitized data
    const freeSummary = buildFreeSummary(result);

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
