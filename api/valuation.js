// ── AusHomeValue Vercel Serverless API ──
// 与 dev-server.mjs 共享 lib/valuation-service.js

import { runValuation } from "../lib/valuation-service.js";

// 客户端安全过滤：只暴露客户可看字段，隐藏内部审计信息
function sanitizeForClient(obj) {
  const safe = JSON.parse(JSON.stringify(obj));
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
  // 顶层 comparables（如果存在）也过滤
  if (safe.comparables?.length) {
    safe.comparables = safe.comparables.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      distanceMeters: c.distanceMeters
    }));
  }
  return safe;
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
    const safe = sanitizeForClient(result);
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
        evidenceMode: "unavailable",
        isFallback: false
      }));
  }
}
