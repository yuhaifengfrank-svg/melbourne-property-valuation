// ── api/valuation-full.js ──
// Phase 1B: Full valuation report — requires valid signed token (valuation gate level).
// Also serves as "Coming Soon" / waitlist if no token provider configured yet.

import { runValuation } from "../lib/valuation-service.js";
import { verifyToken, extractToken } from "../lib/signed-token.js";

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
      landSize: c.landSize,
      pricePerSqm: c.pricePerSqm,
      conditionNotes: c.conditionNotes
    }));
  }

  if (safe.comparables?.length) {
    safe.comparables = safe.comparables.map(c => ({
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

  // Add locked/unlocked marker for frontend
  safe._accessLevel = "full";

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

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ error: "Method not allowed" }));
  }

  // Verify signed token for valuation access
  const tokenData = verifyToken(extractToken(request));
  if (!tokenData || tokenData.gate_level !== "valuation") {
    // For Phase 1B: Return "coming soon" / waitlist message instead of error
    return response.status(200)
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify({
        ok: false,
        status: "coming_soon",
        message: "Full valuation reports are coming soon. Unlock for $3.99 (introductory offer).",
        price: "AUD $3.99",
        priceLabel: "Introductory Offer",
        cta: "Unlock Full Valuation Report — Introductory Offer AUD $3.99",
        // Show chapter preview even when locked
        lockedPreview: {
          chapters: [
            { title: "Comparable Sales Analysis", teaser: "Detailed breakdown of comparable properties with price per m², condition adjustments and distance weighting." },
            { title: "Micro-Location Assessment", teaser: "Street-level proximity to amenities, transport, schools, parking pressure and noise." },
            { title: "Planning & Zoning Review", teaser: "Land zoning, overlay restrictions, subdivision potential and development constraints." },
            { title: "Suburb Profile & Trends", teaser: "Median price trends, days on market, supply/demand balance and demographics." },
            { title: "Confidence Assessment", teaser: "Full breakdown of data sources, verification status and adjustment rationale." },
            { title: "Investment Suitability", teaser: "Rental yield estimate, capital growth outlook, risk factors and LVR." }
          ],
          price: "AUD $3.99",
          priceLabel: "Introductory Offer",
          cta: "Unlock Full Valuation Report — Introductory Offer AUD $3.99",
          terms: "One-time payment. PDF download included."
        }
      }));
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const result = await runValuation(body, {
      fetch: false,
      useDatabaseFallback: true
    });
    const debug = request.query?.debug === 'true' || body.debug === true;
    const safe = sanitizeForClient(result, debug);
    return response.status(result.ok ? 200 : 400)
      .setHeader("Content-Type", "application/json")
      .setHeader("Cache-Control", "no-store")
      .send(JSON.stringify(safe));
  } catch (error) {
    console.error(error);
    return response.status(500)
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify({
        ok: false,
        status: "error",
        error: error.message,
        valuation: null,
        customerDataStatus: "unavailable"
      }));
  }
}
