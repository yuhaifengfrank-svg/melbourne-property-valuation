#!/usr/bin/env node

/**
 * generate-content.mjs — Social Content Engine V1
 *
 * Generates 6 content packages per topic from live API data.
 *
 * Usage:
 *   node scripts/generate-content.mjs --topic top-growth
 *   node scripts/generate-content.mjs --all
 *
 * Output: /output/{topic-slug}/
 *   - metadata.json
 *   - content-title.md       (3 variants)
 *   - xiaohongshu.md          (小红书 post)
 *   - wechat-article-outline.md
 *   - video-30s.md
 *   - video-60s.md
 *   - screenshot-plan.md
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(ROOT, "output");
const API_BASE = "https://www.aushomevalue.com.au/api";

// ── Topic definitions ──

const TOPICS = {
  "top-growth": {
    strategy: "growth",
    titleZh: "增长最快",
    titleEn: "Fastest-Growing",
    description: "Top suburbs by growth_3y/5y weighted",
  },
  "top-value": {
    strategy: "value",
    titleZh: "被低估",
    titleEn: "Best-Value",
    description: "Top suburbs by value score",
  },
  "top-yield": {
    strategy: "yield",
    titleZh: "租金回报最高",
    titleEn: "Highest-Yield",
    description: "Top suburbs by gross_yield",
  },
  "top-school": {
    strategy: "school",
    titleZh: "顶级学区",
    titleEn: "Best-School",
    description: "Top suburbs by school_score",
  },
  "top-supply": {
    strategy: "supply",
    titleZh: "供应最紧张",
    titleEn: "Most Supply-Constrained",
    description: "Top suburbs by supply constraint",
  },
  "top-overall": {
    strategy: "overall",
    titleZh: "最佳投资",
    titleEn: "Best-Overall",
    description: "Top suburbs by overall opportunity score",
  },
};

const MAX_RESULTS = 10;
const FORMAT_CURRENCY = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

// ── Helpers ──

function fmtPrice(n) {
  if (n == null) return "N/A";
  return FORMAT_CURRENCY.format(n);
}

function fmtPercent(n) {
  if (n == null) return "N/A";
  return `${n >= 0 ? "+" : ""}${n}%`;
}

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── API Layer ──

async function fetchRanking(strategy) {
  const url = `${API_BASE}/opportunity${strategy ? `?strategy=${strategy}` : ""}&maxResults=${MAX_RESULTS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  const body = await res.json();
  if (!body.ok || !Array.isArray(body.opportunities)) {
    throw new Error(`API returned no opportunities for strategy=${strategy}`);
  }
  return body.opportunities;
}

// ── Context Builder ──

function buildContext(topicId, opportunities) {
  const topic = TOPICS[topicId];
  const top = opportunities;

  // Price & growth ranges
  const prices = top.map(o => o.medianHousePrice).filter(p => p != null);
  const growths = top.map(o => o.growth3y ?? o.growth1y).filter(g => g != null);
  const yields = top.map(o => o.grossYield).filter(y => y != null);

  const rangePriceMin = prices.length ? Math.min(...prices) : null;
  const rangePriceMax = prices.length ? Math.max(...prices) : null;
  const rangeGrowthMin = growths.length ? Math.min(...growths) : null;
  const rangeGrowthMax = growths.length ? Math.max(...growths) : null;

  // Find most interesting suburb (highest growth + confidence combo)
  const scored = top.map(o => ({
    ...o,
    _interestScore: (o.growth3y || o.growth1y || 0) + (o.opportunityScore || 0),
  }));
  scored.sort((a, b) => b._interestScore - a._interestScore);
  const deepDive = scored[0];

  // Top 3 differentiatediators
  const top3 = top.slice(0, 3);

  // Suburb name mapping (Chinese names where known)
  const CN_NAMES = {
    "Box Hill": "博士山",
    "Glen Waverley": "格伦韦弗利",
    "Doncaster": "唐卡斯特",
    "Balwyn": "博文",
    "Kew": "丘",
    "Brighton": "布莱顿",
    "Toorak": "图拉克",
    "Werribee": "威里比",
    "Point Cook": "库克角",
    "Sunshine": "阳光区",
    "Footscray": "富茨克雷",
    "Richmond": "里士满",
    "Preston": "普雷斯顿",
    "Bundoora": "本多拉",
    "Tarneit": "塔内特",
    "Cranbourne": "克兰本",
    "Pakenham": "帕克纳姆",
  };
  const cnName = (s) => CN_NAMES[s] || s;
  const cnFull = (o) => {
    const cn = CN_NAMES[o.suburb];
    return cn ? `${o.suburb}（${cn}）` : o.suburb;
  };

  // Build top5 list string
  const top5List = top.slice(0, 5).map((o, i) => {
    const g = fmtPercent(o.growth3y ?? o.growth1y);
    return `${i + 1}. ${cnFull(o)}（${g}）`;
  }).join("；");

  // Top1 strengths description
  const strengths = [];
  if (deepDive.growth3y != null) strengths.push(`增长 ${fmtPercent(deepDive.growth3y)}`);
  if (deepDive.schoolScore != null) strengths.push(`学区 ${deepDive.schoolScore}/100`);
  if (deepDive.medianHousePrice != null) strengths.push(`中位价 ${fmtPrice(deepDive.medianHousePrice)}`);

  // Unexpected insight for deep-dive suburb
  const unexpectedInsights = [
    `的涨幅是过去一年中最引人注目的`,
    `数据告诉我们它的潜力可能被低估了`,
    `在高增长的同时，还保持着相对合理的价格`,
    `虽然不在传统热门区，但各项评分很均衡`,
    `市场关注度正在快速上升`,
  ];

  return {
    topicId,
    strategy: topic.strategy,
    topicTitleZh: topic.titleZh,
    topicTitleEn: topic.titleEn,
    year: new Date().getFullYear(),
    generatedAt: new Date().toISOString(),

    // Top 10
    top10: top,
    top10Count: top.length,

    // Top 1
    top1: top[0],
    top1Suburb: top[0]?.suburb || "",
    top1SuburbCn: cnFull(top[0]),
    top1Score: top[0]?.opportunityScore ?? "N/A",
    top1Growth: fmtPercent(top[0]?.growth3y ?? top[0]?.growth1y),
    top1Yield: top[0]?.grossYield != null ? `${top[0].grossYield}%` : "N/A",
    top1Median: fmtPrice(top[0]?.medianHousePrice),
    top1Type: top[0]?.opportunityType || "",
    top1Strengths: strengths.length ? strengths.join("，") : "综合评分领先",
    top1StrengthFactors: deepDive.growth3y != null ? "增长" : "评分",
    top1StrengthScores: deepDive.opportunityScore ?? "N/A",

    // Top 2
    top2Suburb: top[1]?.suburb || "",
    top2SuburbCn: cnFull(top[1]),
    top2Score: top[1]?.opportunityScore ?? "N/A",
    top2Median: fmtPrice(top[1]?.medianHousePrice),

    // Top 3
    top3Suburb: top[2]?.suburb || "",
    top3SuburbCn: cnFull(top[2]),
    top3Score: top[2]?.opportunityScore ?? "N/A",
    top3Median: fmtPrice(top[2]?.medianHousePrice),
    top3Differentiator: top[2]?.schoolScore != null
      ? `学区评分 ${top[2].schoolScore}/100`
      : pick(["稳定的增长数据", "相对较低的价位", "租金回报可观", "综合评分均衡"]),

    // Ranges
    rangePrice: rangePriceMin != null && rangePriceMax != null
      ? `${fmtPrice(rangePriceMin)} - ${fmtPrice(rangePriceMax)}`
      : "N/A",
    rangeGrowth: rangeGrowthMin != null && rangeGrowthMax != null
      ? `${fmtPercent(rangeGrowthMin)} — ${fmtPercent(rangeGrowthMax)}`
      : "N/A",

    // Deep dive
    deepDiveSuburb: deepDive?.suburb || "",
    deepDiveSuburbCn: cnFull(deepDive),
    deepDiveConfidence: deepDive?.opportunityScore ?? "N/A",
    unexpectedInsight: pick(unexpectedInsights),

    // Top 5 list as text
    top5List,
  };
}

// ── Title Generator ──

function generateTitles(ctx) {
  const year = ctx.year;
  const count = ctx.top10Count;
  const maxGrowth = ctx.rangeGrowth;

  const templates = {
    "top-growth": [
      `${year} 维州增长最快的 ${count} 个郊区：年涨幅最高达 ${maxGrowth}`,
      `维州这些郊区还在涨？${year} 最新数据告诉你答案`,
      `${year} Victoria's ${count} Fastest-Growing Suburbs — Up to ${maxGrowth}`,
    ],
    "top-value": [
      `${year} 维州被低估的 ${count} 个宝藏郊区`,
      `预算有限也能上车？${year} 维州这些郊区性价比最高`,
      `${year} Top ${count} Most Undervalued Suburbs in Victoria`,
    ],
    "top-yield": [
      `${year} 维州租金回报最高的 ${count} 个郊区：躺平收租指南`,
      `买房出租看这里：维州 ${count} 个租金回报率最高的郊区`,
      `${year} Victoria's Highest Rental Yield Suburbs — Top ${count}`,
    ],
    "top-school": [
      `${year} 墨尔本顶级学区不到$1M：${count} 个高性价比选择`,
      `为了孩子买房？${year} 维州 ${count} 个学区评分最高的郊区`,
      `${year} Best School Zones Under $1M — Top ${count} Suburbs`,
    ],
    "top-supply": [
      `${year} 维州供应最紧张的 ${count} 个郊区：供不应求意味着什么？`,
      `想要稀缺性？维州这些郊区供应量最少，价值最稳`,
      `${year} Most Supply-Constrained Suburbs in Victoria — Top ${count}`,
    ],
    "top-overall": [
      `${year} 维州 ${count} 个最佳投资郊区：综合评分最高`,
      `从 9 个维度评分，${year} 年这 ${count} 个郊区脱颖而出`,
      `${year} Victoria's Best Suburbs for Investment — Top ${count}`,
    ],
  };

  const t = templates[ctx.topicId];
  if (!t) return ["内容标题", "Title Variant B", "Title Variant C"];

  // Fill template slots
  return t.map(tmpl =>
    tmpl
      .replace("${year}", year)
      .replace("${count}", count)
      .replace("${maxGrowth}", maxGrowth)
  );
}

// ── Template Renders ──

function renderXiaohongshu(ctx) {
  const [title] = generateTitles(ctx);
  const t1 = ctx.top1;
  const t2 = ctx.top10[1];
  const t3 = ctx.top10[2];

  const body = `【${title}】

🏠 数据来源：AusHomeValue 多维度评分系统

━━━━━━━━━━━━━━━━

墨尔本房市回暖？不是所有郊区都在涨。我们从 ${
    ctx.top10Count
  } 个数据维度筛选了 "${ctx.topicTitleZh}" 郊区，看看哪些真正值得关注。

━━━━━━━━━━━━━━━━

📊 TOP 3：

NO.1 ${ctx.top1SuburbCn} — 机会分 ${ctx.top1Score}${t1 ? `，${ctx.topicTitleZh === "增长最快" ? "年涨幅" : "综合评分"}领先` : ""}
${t1?.medianHousePrice != null ? `💰 中位价 ${fmtPrice(t1.medianHousePrice)}` : ""}
${t1?.growth3y != null ? `📈 ${fmtPercent(t1.growth3y)}（3年涨幅）` : ""}
${t1?.schoolScore != null ? `🏫 学区评分 ${t1.schoolScore}` : ""}

NO.2 ${ctx.top2SuburbCn} — 机会分 ${ctx.top2Score}
${t2?.medianHousePrice != null ? `💰 中位价 ${fmtPrice(t2.medianHousePrice)}` : ""}
${t2?.growth3y != null ? `📈 ${fmtPercent(t2.growth3y)}（3年涨幅）` : ""}

NO.3 ${ctx.top3SuburbCn} — 机会分 ${ctx.top3Score}
${t3?.medianHousePrice != null ? `💰 中位价 ${fmtPrice(t3.medianHousePrice)}` : ""}
${t3?.growth3y != null ? `📈 ${fmtPercent(t3.growth3y)}（3年涨幅）` : ""}

━━━━━━━━━━━━━━━━

💡 深度分析：

${ctx.deepDiveSuburbCn} 是这份榜单中最值得关注的郊区。${
    ctx.deepDiveConfidence
  } 分的综合评分说明我们的模型对它非常有信心。${ctx.unexpectedInsight}。

完整榜单（TOP ${ctx.top10Count}）在我们的网站上可以查看，每个郊区有 9 维评分分析和详细解释。

━━━━━━━━━━━━━━━━

⚠️ 数据仅供参考，不构成投资建议。房产投资需结合实地考察和专业意见。

#澳洲房产 #维州房产 #墨尔本买房 #房产投资 #${ctx.topicTitleZh} #AusHomeValue #澳洲房产评估`;

  return body;
}

function renderWeChatOutline(ctx) {
  const [title] = generateTitles(ctx);

  let perSuburbSection = "";
  for (let i = 0; i < Math.min(5, ctx.top10.length); i++) {
    const o = ctx.top10[i];
    const cn = ctx.topicId === "top-growth"
      ? `增长 ${fmtPercent(o.growth3y ?? o.growth1y)}`
      : `机会分 ${o.opportunityScore}`;
    perSuburbSection += `
### ${i + 1}. ${o.suburb}（${o.opportunityType}）— 机会分 ${o.opportunityScore}
- 💰 中位价：${fmtPrice(o.medianHousePrice)} | Unit：${fmtPrice(o.medianUnitPrice)}
- 📈 涨幅：1年 ${fmtPercent(o.growth1y)} | 3年 ${fmtPercent(o.growth3y)} | 5年 ${fmtPercent(o.growth5y)}
- 🏫 学校评分：${o.schoolScore ?? "N/A"} | 空置率：${o.vacancyRate ?? "N/A"}%
- **分析**：${cn}，属于 "${o.opportunityType}" 类型。
${i === 0 ? `- ⚠️ 风险提示：没有数据是完美的，建议实地考察后再做决策。` : ""}
- 📷 截图指引：截取该郊区在 ranking 页面的卡片区域。

`;
  }

  return `# ${title}

## 1. 引子（50-80 字）
${new Date().getFullYear()} 年的维州房市有哪些变化？我们从 ${ctx.top10Count} 个数据维度出发，用 9 维评分系统筛选出了 "${ctx.topicTitleZh}" 的郊区。数据来源包括 ACARA 学校评分、ABS 人口普查、VGV 政府增长数据。

## 2. 方法论
我们的评分系统涵盖价值、增长、租金回报、空置率、学校、收入、人口、供应、基建 9 个维度。每个维度 0-100 分，最终加权得到"机会分"。此榜单基于 ${ctx.strategy} 策略排序。

## 3. 前 5 名详解
${perSuburbSection}

## 4. 第 6-${ctx.top10Count} 名速览
${ctx.top10.slice(5).map((o, i) => `${i + 6}. ${o.suburb}（机会分 ${o.opportunityScore}，${fmtPrice(o.medianHousePrice)}）`).join("\n")}

## 5. 投资建议
- **不同预算**：榜单覆盖从 ${ctx.rangePrice} 的范围，适合不同预算的投资者
- **不同策略**：${ctx.topicTitleZh} 类型郊区适合 ${ctx.topicId === "top-growth" ? "追求资本增长的投资者" : ctx.topicId === "top-value" ? "寻找价值洼地的投资者" : ctx.topicId === "top-yield" ? "现金流导向的投资者" : "不同需求的投资者"}
- **重要提醒**：数据仅供参考，所有投资决策需结合实地考察和市场调研

## 6. 附：数据来源
ACARA, ABS, realestate.com.au, VGV

---

*本文由 AusHomeValue Social Content Engine V1 生成 — ${new Date().toISOString()}*
`;
}

function renderVideo30s(ctx) {
  const [title] = generateTitles(ctx);

  return `# 30-Second Video Script — ${title}

---
**Format:** Short-form (Douyin, TikTok, Reels, Kuaishou)

---

### ---- 00:00-00:05 ----
**VISUAL:** [Screenshot of ranking page title / Top 1 suburb card]
**AUDIO:** "${title}，第一名你绝对猜不到。"
**TEXT OVERLAY:** "${ctx.topicTitleZh} TOP ${ctx.top10Count}"

### ---- 00:05-00:10 ----
**VISUAL:** [Quick montage: 3 suburb score cards, 0.5s each]
**AUDIO:** "No.1 ${ctx.top1Suburb}，机会分 ${ctx.top1Score}，${ctx.top1Growth}。"
**TEXT OVERLAY:** "📈 ${ctx.top1Growth} | #${ctx.top1Suburb}"

### ---- 00:10-00:20 ----
**VISUAL:** [Factor breakdown screenshot — highlight top factors]
**AUDIO:** "我们的 9 维评分系统给它打了高分——${ctx.top1Strengths}。"
**TEXT OVERLAY:** "评分 → ${ctx.top1Score}/100"

### ---- 00:20-00:25 ----
**VISUAL:** [Fair use clip / stock footage of the suburb or property]
**AUDIO:** "中位价 ${ctx.top1Median}，还有上涨空间。"

### ---- 00:25-00:30 ----
**VISUAL:** [CTA screen — website screenshot with URL highlighted]
**AUDIO:** "查你家附近估值？→ 主页链接在简介里。"
**TEXT OVERLAY:** "aushomevalue.com.au"
`;
}

function renderVideo60s(ctx) {
  const [title] = generateTitles(ctx);

  return `# 60-Second Video Script — ${title}

---
**Format:** Longer-form (Bilibili, YouTube Shorts, longer Reels)

---

### ---- 00:00-00:08 ----
**VISUAL:** [Ranking page full screenshot, slow zoom]
**AUDIO:** "${title.replace("：", "。")}注意，数据可能会让你意外。"
**TEXT OVERLAY:** "${ctx.topicTitleZh} TOP ${ctx.top10Count} 🏆"

### ---- 00:08-00:20 ----
**VISUAL:** [Suburb 1 card + factor grid]
**AUDIO:** "第 1 名 ${ctx.top1Suburb}，机会分 ${ctx.top1Score}。${ctx.top1Strengths}——这就是它排第一的原因。"
**TEXT OVERLAY:** "Opp Score: ${ctx.top1Score} ⭐"

### ---- 00:20-00:30 ----
**VISUAL:** [Suburb 2 card + confidence badge]
**AUDIO:** "第 2 名 ${ctx.top2Suburb}，得分 ${ctx.top2Score}。如果说 ${ctx.top1Suburb} 是进击的选手，那 ${ctx.top2Suburb} 更像是稳健型选手——"
**TEXT OVERLAY:** "Opp Score: ${ctx.top2Score}"

### ---- 00:30-00:40 ----
**VISUAL:** [Suburb 3 card + price highlight]
**AUDIO:** "第 3 名 ${ctx.top3Suburb}，中位价 ${ctx.top3Median}。和前两名不同，它的亮点是${ctx.top3Differentiator}。"
**TEXT OVERLAY:** "Median: ${ctx.top3Median}"

### ---- 00:40-00:50 ----
**VISUAL:** [Scrolling top 10 list, highlight interesting fact]
**AUDIO:** "完整榜单在我们的网站上，每个郊区都有 9 维评分分析和详细解释。特别值得关注的是 ${ctx.deepDiveSuburb}——这个郊区${ctx.unexpectedInsight}。"

### ---- 00:50-00:60 ----
**VISUAL:** [CTA — website homepage + confidence badge]
**AUDIO:** "数据来源：ACARA 学校评分、ABS 人口普查、VGV 政府增长数据。我们把这些数据变成了可操作的投资参考。"
**TEXT OVERLAY:** "AusHomeValue.com.au"
`;
}

function renderScreenshotPlan(ctx) {
  const [title] = generateTitles(ctx);
  const topicSlug = ctx.topicId;
  const top1Slug = slugify(ctx.top1Suburb);

  return `# 📷 Screenshot Plan — ${title}

| # | Page URL | Section | What to Capture | Visual Note |
|---|----------|---------|----------------|-------------|
| 1 | \`/top-${topicSlug}-suburbs-victoria.html\` | Page title + subtitle | Full heading area showing "Top ${ctx.top10Count} ... Suburbs" | Include the green topbar |
| 2 | \`/top-${topicSlug}-suburbs-victoria.html\` | First 3 ranking cards | Suburb name + score + meta stats | Crop for square (1:1) |
| 3 | \`/top-${topicSlug}-suburbs-victoria.html\` | Scrolled to cards 6-10 | Full list aesthetic | Portrait mode |
| 4 | \`/top-${topicSlug}-suburbs-victoria.html\` | Mobile viewport | Responsive card layout | 390×844 iPhone mockup |
| 5 | \`/suburb/${top1Slug}-vic.html\` | Confidence badge card | Confidence score + label | Center the dot-ring if renderable |
| 6 | \`/suburb/${top1Slug}-vic.html\` | Factor grid — all 9 cards | Full factor breakdown | Show min 6 cards |
| 7 | \`/suburb/${top1Slug}-vic.html\` | Top strengths section | Why ${ctx.top1Suburb} Scores Highly | Green "why it works" block |
| 8 | \`/suburb/${top1Slug}-vic.html\` | Mobile view — factor section | Scrolled factor cards | Responsive single-column |
| 9 | \`/suburb/${top1Slug}-vic.html\` | Breadcrumb + all top-links | "Home / Opportunities / ${ctx.top1Suburb}" + Growth/Value/School links | Navigation context |
| 10 | \`/\` (homepage) | Hero section + opportunity start | Site context | Full-width hero |

### Suburb Selection for Deep-Dive Screenshots
- **${ctx.deepDiveSuburb}** — most interesting suburb from the ranking
- ${ctx.top10.length > 1 ? `**${ctx.top10[1]?.suburb}** — budget-friendly option if in list` : ""}
- ${ctx.top10.length > 2 ? `**${ctx.top10[2]?.suburb}** — high confidence suburb with surprising score` : ""}
`;
}

// ── Output Writer ──

function writeOutput(topicId, opportunities) {
  const ctx = buildContext(topicId, opportunities);
  const slug = topicId;
  const outDir = resolve(OUTPUT_DIR, slug);
  const titles = generateTitles(ctx);

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // 1. metadata.json
  const metadata = {
    topic: topicId,
    strategy: ctx.strategy,
    titleZh: ctx.topicTitleZh,
    titleEn: ctx.topicTitleEn,
    generatedAt: ctx.generatedAt,
    dataAgeHours: null, // not tracked yet
    suburbCount: ctx.top10Count,
    deepDiveSuburb: ctx.deepDiveSuburb,
    deepDiveConfidence: ctx.deepDiveConfidence,
    titleVariantUsed: "zh_aspirational",
    filenameBase: `${ctx.year}-${slug}-victoria`,
  };
  writeFileSync(resolve(outDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf-8");

  // 2. content-title.md
  writeFileSync(resolve(outDir, "content-title.md"),
    "# Content Titles\n\n" +
    titles.map((t, i) => `### Variant ${i + 1}\n${t}\n`).join("\n") + "\n",
    "utf-8"
  );

  // 3. xiaohongshu.md
  writeFileSync(resolve(outDir, "xiaohongshu.md"), renderXiaohongshu(ctx) + "\n", "utf-8");

  // 4. wechat-article-outline.md
  writeFileSync(resolve(outDir, "wechat-article-outline.md"), renderWeChatOutline(ctx) + "\n", "utf-8");

  // 5. video-30s.md
  writeFileSync(resolve(outDir, "video-30s.md"), renderVideo30s(ctx) + "\n", "utf-8");

  // 6. video-60s.md
  writeFileSync(resolve(outDir, "video-60s.md"), renderVideo60s(ctx) + "\n", "utf-8");

  // 7. screenshot-plan.md
  writeFileSync(resolve(outDir, "screenshot-plan.md"), renderScreenshotPlan(ctx) + "\n", "utf-8");

  return outDir;
}

// ── CLI ──

async function main() {
  const args = process.argv.slice(2);
  const topicFlag = args.find(a => a.startsWith("--topic="));
  const topic = topicFlag ? topicFlag.split("=")[1] : null;
  const all = args.includes("--all");

  if (!topic && !all) {
    console.error("Usage: node scripts/generate-content.mjs --topic <topic> | --all");
    console.error("Topics: " + Object.keys(TOPICS).join(", "));
    process.exit(1);
  }

  const topicsToRun = all ? Object.keys(TOPICS) : [topic];

  for (const t of topicsToRun) {
    if (!TOPICS[t]) {
      console.error(`Unknown topic: ${t}. Valid: ${Object.keys(TOPICS).join(", ")}`);
      continue;
    }

    console.log(`\n📡 Fetching "${t}" (${TOPICS[t].titleZh})...`);
    try {
      const opportunities = await fetchRanking(TOPICS[t].strategy);
      console.log(`   ✅ ${opportunities.length} suburbs fetched`);

      const outDir = writeOutput(t, opportunities);
      console.log(`   ✅ Output → ${outDir}`);
    } catch (err) {
      console.error(`   ❌ FAILED: ${err.message}`);
    }
  }

  console.log("\n🎉 Done!");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
