const SITE_ORIGIN = "https://www.aushomevalue.com.au";

export const PLATFORM_DEFINITIONS = Object.freeze({
  linkedin: { language: "en", mode: "api_after_approval" },
  facebook: { language: "en", mode: "api_after_approval" },
  instagram: { language: "en", mode: "api_after_approval" },
  google_business: { language: "en", mode: "api_after_approval" },
  wechat: { language: "zh", mode: "manual_publish" },
  xiaohongshu: { language: "zh", mode: "manual_publish" },
  tiktok: { language: "en", mode: "draft_upload_after_approval" },
  newsletter: { language: "bilingual", mode: "provider_after_approval" },
});

export function publicScoreValue(opportunity) {
  const value = opportunity?.score?.value;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function trackedUrl(pathname, { platform, campaignId, contentId }) {
  const url = new URL(pathname, SITE_ORIGIN);
  url.searchParams.set("utm_source", platform);
  url.searchParams.set("utm_medium", platform === "newsletter" ? "email" : "organic_social");
  url.searchParams.set("utm_campaign", campaignId);
  url.searchParams.set("utm_content", contentId);
  return url.toString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayPrice(value) {
  if (!Number.isFinite(value)) return "data unavailable";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeOpportunity(opportunity, rank) {
  const score = publicScoreValue(opportunity);
  if (!opportunity?.suburb || score == null) {
    throw new Error(`Opportunity ${rank} is missing suburb or canonical score.value`);
  }
  const slug = `${slugify(opportunity.suburb)}-${String(opportunity.state || "vic").toLowerCase()}`;
  return {
    rank,
    suburb: opportunity.suburb,
    state: opportunity.state || "VIC",
    score,
    scoreDisplay: `${score}/100`,
    band: opportunity.score?.band || opportunity.band || "",
    type: opportunity.score?.type || opportunity.opportunityType || "",
    confidence: opportunity.confidence || opportunity.confidenceBand || "",
    medianPrice: displayPrice(opportunity.selectedMedianPrice ?? opportunity.medianHousePrice),
    path: `/suburb/${slug}.html`,
  };
}

function platformDraft(platform, campaignId, strategy, items) {
  const top = items[0];
  const contentId = `${strategy}-${slugify(top.suburb)}`;
  const link = trackedUrl(top.path, { platform, campaignId, contentId });
  const listEn = items.map((item) => `${item.rank}. ${item.suburb} — ${item.scoreDisplay}`).join("\n");
  const listZh = items.map((item) => `${item.rank}. ${item.suburb} — ${item.scoreDisplay}`).join("\n");
  const disclaimerEn = "Directional 3–5 year opportunity signal, not a price forecast or financial advice.";
  const disclaimerZh = "3–5 年方向性机会信号，不是价格预测，也不构成财务或投资建议。";

  if (["wechat", "xiaohongshu"].includes(platform)) {
    return {
      headline: `维州房产机会观察：${top.suburb} 本期排名领先`,
      body: `本期 ${strategy} 区域机会榜：\n\n${listZh}\n\n查看完整数据：${link}\n\n${disclaimerZh}`,
      callToAction: "查看完整区域研究",
    };
  }

  if (platform === "newsletter") {
    return {
      headline: `Weekly Victoria opportunity watch / 维州区域机会周报`,
      body: `${listEn}\n\nFull research: ${link}\n\n${disclaimerEn}\n${disclaimerZh}`,
      callToAction: "View the research / 查看完整研究",
    };
  }

  return {
    headline: `Victoria property opportunity watch: ${top.suburb} leads this week`,
    body: `${listEn}\n\nExplore the evidence: ${link}\n\n${disclaimerEn}`,
    callToAction: "Learn more",
  };
}

export function buildCampaign(opportunities, options = {}) {
  const strategy = options.strategy || "balanced";
  const date = options.date || new Date().toISOString().slice(0, 10);
  const campaignId = options.campaignId || `ahv-${strategy}-${date}`;
  const items = opportunities
    .slice(0, options.maxResults || 5)
    .map((opportunity, index) => normalizeOpportunity(opportunity, index + 1));
  if (!items.length) throw new Error("No eligible opportunities supplied");

  const drafts = Object.fromEntries(Object.entries(PLATFORM_DEFINITIONS).map(([platform, config]) => [
    platform,
    {
      platform,
      language: config.language,
      deliveryMode: config.mode,
      status: "draft",
      approvalRequired: true,
      ...platformDraft(platform, campaignId, strategy, items),
    },
  ]));

  return {
    schemaVersion: 1,
    campaignId,
    generatedAt: `${date}T00:00:00.000Z`,
    strategy,
    status: "draft",
    publishingEnabled: false,
    approval: { status: "pending", approvedBy: null, approvedAt: null },
    source: { contract: "public opportunity score", field: "score.value" },
    items,
    drafts,
  };
}
