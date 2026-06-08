// ── AusHomeValue Vercel Serverless API ──
// 与 dev-server.mjs 共享 lib/valuation-service.js

import { runValuation } from "../lib/valuation-service.js";

// 客户端安全过滤：只暴露客户可看字段，隐藏内部审计信息
// 客户端安全过滤：只暴露客户可查看的字段，删除所有内部审计信息
function sanitizeForClient(obj, debug = false) {
  const safe = JSON.parse(JSON.stringify(obj));

  // 删除内部字段（顶层）
  delete safe.sourceResults;
  delete safe.isSingleSource;
  delete safe.isFallback;
  delete safe.evidenceMode;

  // 替换为客户友好的数据状态
  safe.customerDataStatus = mapCustomerDataStatus(obj);

  // 简化 confidence.reasons — 只保留最终标签 + 分数
  if (safe.valuation?.confidence) {
    // 清除包含来源数量、验证比例的内部理由
    // 替换为简短、客户友好的理由
    const label = safe.valuation.confidence.label;
    const score = safe.valuation.confidence.dataScore;
    safe.valuation.confidence = {
      label,
      dataScore: score
    };
  }

  // 过滤 acceptedComparables — 只保留客户可见字段
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

  // 顶层 comparables 同样过滤
  if (safe.comparables?.length) {
    safe.comparables = safe.comparables.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      distanceMeters: c.distanceMeters
    }));
  }

  // 删除 rejectedComparables（包含 sourceUrl + 内部 reasons）
  delete safe.rejectedComparables;
  if (safe.valuation?.rejectedComparables) delete safe.valuation.rejectedComparables;

  // 删除 methodology / statisticalIntervals（内部建模信息）
  delete safe.methodology;
  if (safe.valuation?.methodology) delete safe.valuation.methodology;
  if (safe.valuation?.statisticalIntervals) delete safe.valuation.statisticalIntervals;

  // 删除 estimate 内部字段（保留 midpoint/low/high）
  if (safe.valuation?.estimate && !debug) {
    const { midpoint, low, high } = safe.valuation.estimate;
    safe.valuation.estimate = { midpoint, low, high };
  }

  // 删除 subject 中的内部字段（坐标、sa2Code 等）
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
  // evidenceMode 转换逻辑（从 runValuation 的原始响应中计算）
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
        customerDataStatus: "unavailable",
        disclaimer: "本估值基于评估时可获得的公开市场信息、房产特征及统计分析生成，仅供一般信息和研究参考。数据可能存在延迟、不完整或第三方记录差异。本报告并非正式估价、信贷决定、法律、税务或财务建议。作出交易或融资决定前，请咨询持牌专业人士。"
      }));
  }
}
