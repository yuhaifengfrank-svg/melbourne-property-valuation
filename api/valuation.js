import { collectComparableResearch } from "../lib/comparable-research-collector.js";
import { valueProperty } from "../lib/valuation-engine.js";

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    const result = await collectComparableResearch(
      {
        address: body.address,
        suburb: body.suburb,
        state: body.state,
        propertyType: body.propertyType
      },
      {
        fetch: body.fetch !== false
      }
    );
    const valuation = Array.isArray(body.comparables)
      ? valueProperty({
          subject: {
            ...(body.subject || {}),
            address: result.subject?.address || body.address,
            propertyType: result.subject?.propertyType || body.propertyType
          },
          comparables: body.comparables,
          asOfDate: body.asOfDate,
          annualMarketGrowthRate: body.annualMarketGrowthRate,
          // ── 注入公共数据作为隐式调整因子 ──
          publicData: {
            absProfile: result.absProfile || null,
            rbaRates: result.rbaRates || null,
            vicplan: result.vicplan || null
          }
        })
      : null;
    return json(response, result.ok ? 200 : 400, {
      ...result,
      valuation
    });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "Live comparable research service failed" });
  }
}
