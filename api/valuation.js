// ── AusHomeValue Vercel Serverless API ──
// 与 dev-server.mjs 共享 lib/valuation-service.js

import { runValuation } from "../lib/valuation-service.js";

// 环境特征：Vercel 不用 CDP，但会尝试数据库
const IS_VERCEL = !!process.env.VERCEL;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).setHeader("Content-Type", "application/json")
      .send(JSON.stringify({ error: "Method not allowed" }));
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    // Vercel 环境：禁 CDP，但启用数据库 source
    // 数据库 source 在 valuation-service.js 内部延迟连接
    const result = await runValuation(body, {
      fetch: false,
      useDatabaseFallback: true
    });
    return response.status(result.ok ? 200 : 400)
      .setHeader("Content-Type", "application/json")
      .setHeader("Cache-Control", "no-store")
      .send(JSON.stringify(result));
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
