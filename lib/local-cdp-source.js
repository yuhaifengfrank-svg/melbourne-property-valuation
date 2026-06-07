// ── 本地 CDP 采集适配器 ──
// 仅供本地开发使用。Vercel 不得调用。<parameter>
// 依赖于运行在 127.0.0.1:18800 的 Chrome（OpenClaw CDP）

import { ComparableSource } from "./comparable-source.js";
import { collectComparableResearch } from "./comparable-research-collector.js";

export class LocalCdpComparableSource extends ComparableSource {
  isAvailable() {
    // 只有在非 Vercel 环境且本机有 Chrome 时才可用
    if (process.env.VERCEL) return false;
    return true;
  }

  async fetch(subject) {
    const result = await collectComparableResearch({
      address: subject.address,
      suburb: subject.suburb,
      state: subject.state,
      propertyType: subject.propertyType,
      bedrooms: subject.bedrooms || 3,
      bathrooms: subject.bathrooms || 2,
      carSpaces: subject.carSpaces || 2,
      landSize: subject.landSize || 400
    }, { fetch: true });

    if (!result.ok || !result.comparables?.length) {
      return [];
    }

    return result.comparables.map(c => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      sourceUrl: c.sourceUrl || "",
      propertyType: c.propertyType,
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      carSpaces: c.carSpaces,
      landSize: c.landSize,
      distanceMeters: c.distanceMeters,
      qualityScore: c.qualityScore,
      qualityBand: c.qualityBand,
      adjustedPrice: c.adjustedPrice
    }));
  }
}
