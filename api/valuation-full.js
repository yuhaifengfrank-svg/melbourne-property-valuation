// ── api/valuation-full.js ──
// Phase 1B (fix): Full valuation report endpoint.
// ALWAYS returns "coming_soon" / waitlist in Phase 1B.
// No full report content is served regardless of token.
//
// Per FIX 11: All CTAs are Coming Soon / waitlist only.
// Stripe/payment integration is Phase 2+.

import { getTokenFromCookies } from "../lib/signed-token.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response
      .status(405)
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ error: "Method not allowed" }));
  }

  // Phase 1B: Always return coming_soon regardless of token.
  // Full report will be served in Phase 2+ after Stripe integration.
  return response
    .status(200)
    .setHeader("Content-Type", "application/json")
    .setHeader("Cache-Control", "no-store")
    .send(
      JSON.stringify({
        ok: false,
        status: "coming_soon",
        message:
          "Full valuation reports are coming soon. Introductory price AUD $3.99 one-time.",
        price: "AUD $3.99",
        priceLabel: "Introductory Offer",
        cta: "Coming Soon — Full Valuation Report",
        lockedPreview: {
          chapters: [
            {
              title: "Comparable Sales Analysis",
              teaser:
                "Detailed breakdown of comparable properties with price per m², condition adjustments and distance weighting.",
            },
            {
              title: "Micro-Location Assessment",
              teaser:
                "Street-level proximity to amenities, transport, schools, parking pressure and noise.",
            },
            {
              title: "Planning & Zoning Review",
              teaser:
                "Land zoning, overlay restrictions, subdivision potential and development constraints.",
            },
            {
              title: "Suburb Profile & Trends",
              teaser:
                "Median price trends, days on market, supply/demand balance and demographics.",
            },
            {
              title: "Confidence Assessment",
              teaser:
                "Full breakdown of data sources, verification status and adjustment rationale.",
            },
            {
              title: "Investment Suitability",
              teaser:
                "Rental yield estimate, capital growth outlook, risk factors and LVR.",
            },
          ],
          price: "AUD $3.99",
          priceLabel: "Introductory Offer",
          cta: "Coming Soon — Full Valuation Report",
          terms: "One-time payment. PDF download included.",
        },
      })
    );
}
