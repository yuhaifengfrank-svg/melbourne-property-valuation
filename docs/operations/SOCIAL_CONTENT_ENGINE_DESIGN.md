# Social Content Engine V1 — Design Document

**Date:** 2026-06-10  
**Author:** 玄甲  
**Status:** Design Only — No Implementation  

---

## 1. Overview

The Social Content Engine (SCE) converts pre-computed property intelligence into cross-platform social content. It is **not a publication tool** — it generates structured content drafts and screenshot checklists that a human (or a downstream automation) can publish.

### Why an engine, not a template?

Each piece of content needs:
- Real data (not placeholders)
- Platform-specific formatting (小红书 ≠ 微信 ≠ Douyin)
- Screenshot guidance (what to capture from the website)
- Consistent branding across platforms

A script that takes a suburb name / category → generates all 6 outputs eliminates manual copy-paste while keeping editorial control.

---

## 2. System Architecture

```
┌─────────────────────────────────────┐
│           Input Sources              │
│  ┌─────┐ ┌────┐ ┌──────┐ ┌──────┐ │
│  │ API  │ │ DB │ │Pages │ │Files │ │
│  └──┬──┘ └───┬┘ └──┬───┘ └──┬───┘ │
└─────┼────────┼─────┼────────┼──────┘
      │        │     │        │
      ▼        ▼     ▼        ▼
┌─────────────────────────────────────┐
│     Content Generator (script)      │
│                                     │
│  Topic Selection → Data Fetching    │
│         → Template Rendering        │
│         → Output Assembly           │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│         Output Package              │
│                                     │
│  ├─ Content Title                   │
│  ├─ 小红书 Post                      │
│  ├─ WeChat Article Outline          │
│  ├─ 30s Video Script                │
│  ├─ 60s Video Script                │
│  └─ Screenshot Plan                 │
└─────────────────────────────────────┘
```

### 2.1 Design Principle: Write-once, template-render

The generator queries data once per topic, then renders 5 content templates + 1 screenshot plan from that same data context. No repeated API calls.

---

## 3. Input Sources

### 3.1 API Endpoints

| Source | Endpoint | Returns |
|--------|----------|---------|
| Top Growth | `GET /api/opportunity?strategy=growth` | Top suburbs by growth_3y/5y weighted |
| Top Value | `GET /api/opportunity?strategy=value` | Top suburbs by value score |
| Top Yield | `GET /api/opportunity?strategy=yield` | Top suburbs by gross_yield |
| Top School | `GET /api/opportunity?strategy=school` | Top suburbs by school_score |
| Top Supply-Constrained | `GET /api/opportunity?strategy=supply` | Top suburbs by supply_constraint |
| Single Suburb | `GET /api/suburb-intelligence?suburb=Werribee` | Full 9-factor breakdown + explanations |

### 3.2 Key Data Fields (per suburb_metrics row)

```typescript
interface SuburbMetrics {
  // Identity
  suburb: string;           // "Werribee"
  state: string;            // "VIC"

  // Pricing
  median_house_price: number | null;   // 691750
  median_unit_price: number | null;    // 482500
  gross_yield: number | null;          // 2.37

  // Growth
  growth_1y: number | null;    // 30.0
  growth_3y: number | null;    // 25.0
  growth_5y: number | null;    // (null for many suburbs)

  // School
  school_score: number | null; // 48.5

  // Vacancy / Supply
  vacancy_rate: number | null;                 // 7.6
  supply_constraint_score: number | null;       // from new schema
  supply_is_growth_corridor: boolean | null;

  // Demographics
  population_growth: number | null;
  supply_unemployment_rate: number | null;     // 5.7

  // Scores
  opportunity_score: number;       // 36
  overall_confidence: number;      // 81.1
  opportunity_type: string;        // "Growth Opportunity"
}
```

### 3.3 Data Quality Notes

- **~230 suburbs** have actual data. Resort areas (Portsea, Sorrento, Lorne) have sparse growth/yield/school data.
- **growth_5y is NULL for ~70% of suburbs** — scripts should fall back to growth_3y or growth_1y.
- **overall_confidence** now 100% populated (after the confidence fix).
- **opportunity_type** distribution: Balanced (129), Growth (69), School Zone (38), Cashflow (2).

### 3.4 Factor Scores (from suburb-intelligence API)

Each suburb page displays 9 factors with scores 0-100:

| Factor | Werribee Example | Interpretation |
|--------|-----------------|----------------|
| Value Score | 70 (B+) | Affordable entry with room |
| Growth Score | 85 (A) | 25% 3yr growth, above market |
| Yield Score | 23 (C) | 2.37%, below 3% threshold |
| Vacancy Score | 50 (B) | 7.6%, elevated |
| School Score | 45 (C) | Average schooling |
| Income Score | 50 (C+) | Mid-range, stable employment |
| Population Score | 45 (C) | Mature demographic |
| Supply Score | 63 (B) | Moderate constraint, growth corridor |
| Infrastructure Score | 85 (A) | Major investment nearby |

---

## 4. Topic Selection

### 4.1 Static Topics (always generated)

| Topic ID | Title Pattern | Data Source | Why it works |
|----------|--------------|-------------|-------------|
| `top-growth` | 2026 维州增长最快的郊区 | `GET /api/opportunity?strategy=growth&maxResults=10` | Timely, comparative |
| `top-value` | 2026 被低估的宝藏郊区 | `GET /api/opportunity?strategy=value&maxResults=10` | Aspirational, "secret" |
| `top-yield` | 2026 租金回报最高的郊区 | `GET /api/opportunity?strategy=yield&maxResults=10` | Practical, actionable |
| `top-school` | 墨尔本顶级学区不到$1M | `GET /api/opportunity?strategy=school&maxResults=10` | Niche audience, high engagement |
| `top-supply` | 2026 供应最紧张的郊区 | `GET /api/opportunity?strategy=supply&maxResults=10` | Scarcity, FOMO |
| `top-overall` | 2026 维州最佳投资郊区 | `GET /api/opportunity?maxResults=10` | Broadest appeal |

### 4.2 Dynamic Topics (AI-selected based on data drift)

| Topic ID | Trigger | Example |
|----------|---------|---------|
| `surge-1y` | suburb where growth_1y > 2× market avg | "Werribee 一年涨 30%，现在还能追吗？" |
| `yield-surprise` | suburb with yield > 5% AND growth > 10% | "既要租金又要涨幅：这5个郊区可以兼顾" |
| `value-deep` | suburb with value score 85+ but opportunity high | "被低估的富人区：Brighton 还能买吗？" |
| `entry-level` | top suburbs under $600K with school score > 50 | "60万以下也能买学区房？3个墨尔本低门槛选择" |

### 4.3 Suburb-Level Topics (single suburb deep-dive)

Triggered by: user interest, high search volume, request.

| Topic ID | Example |
|----------|---------|
| `deep-dive` | "Werribee 投资分析：81分高置信度，Growth 85，Infra 85" |

---

## 5. Output Templates

### 5.1 Template: Content Title

The title generator produces **3 variants** per topic (中文 × 2 + English × 1).

**Algorithm:**
1. Read the first suburb's key strengths
2. Choose a narrative angle:
   - **Aspirational:** "2026 年最值得关注的 10 个维州郊区"
   - **Question:** "预算 60 万在墨尔本还能买哪？"
   - **Comparative:** "同样是 70 万，选 Growth 还是选 Yield？"
   - **Data-driven:** "从 9 个维度评分，这 5 个郊区脱颖而出"

**Title Structure:**
- 中文字数: 12-25 chars
- English chars: 30-60 chars
- Must include year + location signal
- For ranking topics: must include number (top 5 / 10)

**Example outputs for "top-growth" topic:**

```
Variant 1: 2026 维州增长最快的 10 个郊区：年涨幅最高达 30%
Variant 2: 墨尔本这些郊区还在涨？最新数据告诉你答案
Variant 3: Victoria's Fastest-Growing Suburbs in 2026 — Up 30% in 12 Months
```

### 5.2 Template: 小红书 Post

小红书 content has a specific rhythm: hook → data → personal take → CTA.

**Structure:**

```
[HEADLINE] — 1 line, 15-25 chars, emoji optional
  例：「📈 2026 维州增长最快的 10 个郊区」

[BODY] — 4-6 paragraphs, 200-400 characters total
  Para 1: Hook. Why this matters today. (30-60 chars)
    例：「墨尔本房市回暖？不是所有郊区都在涨。」
  Para 2: The data. Top 3 suburbs with numbers. (60-100 chars)
  Para 3: One deep dive. Most interesting suburb with factor detail. (60-80 chars)
  Para 4: The surprise. What's counterintuitive. (40-60 chars)
  Para 5: CTA. What the reader should do. (30-50 chars)

[HASHTAGS] — 8-12 tags
  - 3-4 core: #墨尔本买房 #澳洲房产 #维州房产 #房产投资
  - 2-3 topic-specific: #学区房 #郊区增长 #首次置业
  - 1-2 data signal: #房产数据 #2026房市
  - 1-2 brand: #AusHomeValue #澳洲房产评估
  - 1 location: #墨尔本 #维州
```

**Data interpolation points (from the 10-suburb ranking):**

| Placeholder | Source |
|-------------|--------|
| `{TOP1_SUBURB}` | First suburb name |
| `{TOP1_SCORE}` | First suburb opportunity score |
| `{TOP1_GROWTH}` | First suburb growth_3y |
| `{TOP1_YIELD}` | First suburb gross_yield |
| `{TOP1_MEDIAN}` | First suburb median_house_price |
| `{TOP1_TYPE}` | First suburb opportunity_type |
| `{TOP1_STRENGTHS}` | Top 2 factor scores ≥70 |
| `{TOP5_LIST}` | "1. Clyde North (+20%) 2. Deer Park (+20%) …" |
| `{RANGE_PRICE}` | "中位价 $650K - $1.2M" (min-max of top 10) |
| `{RANGE_GROWTH}` | "涨幅 8% - 30%" (min-max of top 10) |
| `{DEEP_DIVE_SUBURB}` | Most interesting suburb (highest growth + confidence) |
| `{DEEP_DIVE_STRENGTH}` | Top factor explanation |

### 5.3 Template: WeChat Article Outline

WeChat articles are longer-form. The outline gives structure for a writer (or AI-generated draft).

**Structure:**

```
# Title (same as Content Title, variant 1)

## 1. 引子 (50-80 words)
   Context setting. Why now? What's the market doing?

## 2. 方法论 (30-50 words)
   How we ranked these suburbs. 9 factors. Data sources. Confidence scoring.

## 3. 前 5 名详解 (150-250 words per suburb)
   For each of the top 5:
   - 郊区名称 + 得分 + 类型标签
   - 数据亮点（中位价、涨幅、租金回报）
   - 2-3 句分析（为什么要关注这个郊区）
   - 风险提示（低分因子）
   - 截图指引：（见下方截图计划）

## 4. 第 6-10 名速览 (80-120 words)
   Brief table or bullet list

## 5. 投资建议 (80-120 words)
   - 不同预算如何选
   - 不同类型投资者建议
   - 提醒：数据仅供参考，需实地考察

## 6. 附：数据来源 (30-50 words)
   ACARA, ABS, realestate.com.au, VGV
```

### 5.4 Template: 30-Second Video Script

**Format:** Short-form (Douyin, TikTok, Reels, Kuaishou). Fast cuts, on-screen data.

```
--- 00:00-00:05 ---
VISUAL: [Screenshot of ranking page title / Top 1 suburb card]
AUDIO: "2026 维州增长最快的 10 个郊区，第一名你绝对猜不到。"

--- 00:05-00:10 ---
VISUAL: [Quick montage: 3 suburb score cards, 0.5s each]
AUDIO: "No.1 {TOP1_SUBURB}，机会分 {TOP1_SCORE}，年涨幅 {TOP1_GROWTH}%。"
TEXT OVERLAY: "📈 +{TOP1_GROWTH}% | #{TOP1_SUBURB}"

--- 00:10-00:20 ---
VISUAL: [Factor breakdown screenshot — highlight top 2 factors]
AUDIO: "我们的 9 维评分系统给它打了高分——{TOP1_STRENGTHS}。"
TEXT OVERLAY: "{TOP1_STRENGTHS_FACTORS} → {TOP1_STRENGTHS_SCORES}/100"

--- 00:20-00:25 ---
VISUAL: [Fair use clip / stock footage of the suburb or property]
AUDIO: "中位价 {TOP1_MEDIAN_FMT}，还有上涨空间。"

--- 00:25-00:30 ---
VISUAL: [CTA screen — website screenshot with URL highlighted]
AUDIO: "查你家附近估值？→ 主页链接在简介里。"
TEXT OVERLAY: "aushomevalue.com.au"
```

### 5.5 Template: 60-Second Video Script

**Format:** Longer-form (Bilibili, YouTube Shorts, longer Reels). More depth, more suburbs.

```
--- 00:00-00:08 ---
VISUAL: [Ranking page full screenshot, slow zoom]
AUDIO: "2026 年维州哪个郊区增长最猛？我们从 238 个郊区里面筛选了 Top 10。注意，数据可能会让你意外。"

--- 00:08-00:20 ---
VISUAL: [Suburb 1 card + factor grid]
AUDIO: "第 1 名 {TOP1_SUBURB}，机会分 {TOP1_SCORE}。{TOP1_STRENGTHS}——这就是它排第一的原因。"
TEXT: Opp Score: {TOP1_SCORE} ⭐

--- 00:20-00:30 ---
VISUAL: [Suburb 2 card + confidence badge]
AUDIO: "第 2 名 {TOP2_SUBURB}，得分 {TOP2_SCORE}。如果说 {TOP1_SUBURB} 是进击的选手，那 {TOP2_SUBURB} 更像是稳健型选手——"
TEXT: Opp Score: {TOP2_SCORE}

--- 00:30-00:40 ---
VISUAL: [Suburb 3 card + price highlight]
AUDIO: "第 3 名 {TOP3_SUBURB}，中位价 {TOP3_MEDIAN_FMT}。和前两名不同，它的亮点是{TOP3_DIFFERENTIATOR}。"
TEXT: Median: {TOP3_MEDIAN_FMT}

--- 00:40-00:50 ---
VISUAL: [Scrolling top 10 list, highlight interesting fact]
AUDIO: "完整榜单在我们的网站上，每个郊区都有 9 维评分分析和详细解释。特别值得关注的是 {DEEP_DIVE_SUBURB}——这个郊区{UNEXPECTED_INSIGHT}。"

--- 00:50-00:60 ---
VISUAL: [CTA — website homepage + confidence badge]
AUDIO: "数据来源：ACARA 学校评分、ABS 人口普查、VGV 政府增长数据。我们把这些数据变成了可操作的投資参考。"
TEXT: AusHomeValue.com.au
```

### 5.6 Template: Screenshot Plan

The screenshot plan is a checklist — no actual screenshots, just "capture this page at this section" instructions.

---

**📷 Screenshot Plan — {TOPIC_TITLE}**

| # | Page URL | Section | What to Capture | Visual Note |
|---|----------|---------|----------------|-------------|
| 1 | `/top-{topic}-suburbs-victoria.html` | Page title + subtitle | Full heading area showing "Top 10 ... Suburbs" | Include the green topbar |
| 2 | `/top-{topic}-suburbs-victoria.html` | First 3 ranking cards | Suburb name + score + meta stats | Crop for square (1:1) |
| 3 | `/top-{topic}-suburbs-victoria.html` | Scrolled to cards 6-10 | Full list aesthetic | Portrait mode |
| 4 | `/top-{topic}-suburbs-victoria.html` | Mobile viewport | Responsive card layout | 390×844 iPhone mockup |
| 5 | `/suburb/{slug}-vic.html` | Confidence badge card | Confidence score + label | Center the dot-ring if renderable |
| 6 | `/suburb/{slug}-vic.html` | Factor grid — all 9 cards | Full factor breakdown | Show min 6 cards |
| 7 | `/suburb/{slug}-vic.html` | Top 3 strengths section | Why {suburb} Scores Highly | Green "why it works" block |
| 8 | `/suburb/{slug}-vic.html` | Mobile view — factor section | Scrolled factor cards | Responsive single-column |
| 9 | `/suburb/{slug}-vic.html` | Breadcrumb + all top-links | "Home / Opportunities / {suburb}" + Growth/Value/School links | Navigation context |
| 10 | `/` (homepage) | Hero section + opportunity start | Site context | Full-width hero |

**Suburb selection for deep-dive screenshots:**
- {DEEP_DIVE_SUBURB} — most interesting suburb from the ranking
- {DEEP_DIVE2_SUBURB} — budget-friendly option if in list
- {DEEP_DIVE3_SUBURB} — high confidence suburb with surprising score

---

## 6. Data Fetching Layer

### 6.1 Fetch Pattern (pseudocode)

```python
def generate_topic(topic_id, max_results=10):
    # 1. Fetch ranking data
    ranking = api.get(f"/api/opportunity?strategy={strategy}&maxResults={max_results}")
    if not ranking.get("opportunities"):
        raise NoData(f"No opportunities for strategy={strategy}")

    # 2. Fetch deep-dive data for top 3 suburbs
    deep_dive_suburbs = []
    for opp in ranking["opportunities"][:3]:
        intelligence = api.get(f"/api/suburb-intelligence?suburb={opp['suburb']}")
        deep_dive_suburbs.append(intelligence)

    # 3. Merge data contexts
    ctx = {
        "topic_id": topic_id,
        "title": generate_title(topic_id, ranking),
        "top_10": ranking["opportunities"],
        "deep_dives": deep_dive_suburbs,
        "range_price": price_range(ranking["opportunities"]),
        "range_growth": growth_range(ranking["opportunities"]),
        "highest_growth": max(...),
        "best_yield": max(..., key="yield"),
    }

    # 4. Render all outputs from ctx
    return OutputPackage(
        title=render("title", ctx),
        xiaohongshu=render("xiaohongshu", ctx),
        wechat_outline=render("wechat", ctx),
        video_30s=render("video_30s", ctx),
        video_60s=render("video_60s", ctx),
        screenshot_plan=render("screenshot_plan", ctx),
    )
```

### 6.2 Template Rendering Strategy

**Option A: String templates** (simpler, V1-suitable)

Use Python f-strings / JavaScript template literals with named placeholders. The generator script populates `ctx` dict, then feeds it into format strings.

```javascript
const TITLE_TEMPLATES = {
  "top-growth": [
    (ctx) => `2026 维州增长最快的 ${ctx.top_10.length} 个郊区：年涨幅最高达 ${ctx.range_growth.max}%`,
    (ctx) => `墨尔本这些郊区还在涨？最新数据告诉你答案`,
    (ctx) => `Victoria's Fastest-Growing Suburbs in 2026 — Up ${ctx.range_growth.max}% in 12 Months`,
  ]
};
```

**Option B: Handlebars/Nunjucks** (V2 consideration)

Full template engine for richer WeChat outlines and screenshot plans. Worth it if the number of templates grows beyond ~10.

---

## 7. Output Format

### 7.1 File Structure (per generation run)

```
output/
  top-growth/
    metadata.json              # Generation time, topic, data freshness
    content-title.md           # 3 variants
    xiaohongshu.md             # Full post
    wechat-article-outline.md  # Outline
    video-30s.md               # Script
    video-60s.md               # Script
    screenshot-plan.md         # Checklist
```

### 7.2 metadata.json Schema

```json
{
  "topic": "top-growth",
  "generated_at": "2026-06-10T19:00:00+10:00",
  "data_age_hours": 4,
  "source_strategy": "growth",
  "max_results": 10,
  "suburb_count": 10,
  "deep_dive_suburb": "Werribee",
  "deep_dive_confidence": 81.1,
  "title_variant_used": "zh_aspirational",
  "filename_base": "2026-top-growth-victoria"
}
```

---

## 8. Screenshot Automation (Future)

V1 produces **instructions** for a human to take screenshots. V2 could automate:

```
┌──────────────────────────────┐
│  Playwright script opens     │
│  ranking page → screenshot   │
│  suburb page → screenshots   │
│  mobile viewport → screenshots│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Crops, resizes, names       │
│  per screenshot plan          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Output: assets/             │
│  001-ranking-title.png       │
│  002-top3-cards.png          │
│  003-factor-grid.png         │
│  ...                         │
└──────────────────────────────┘
```

For V1, screenshot instructions are sufficient. Browser automation can be added when the content volume justifies it.

---

## 9. Topic Rotation Strategy

### Default schedule (suggested, not part of implementation)

| Day | Topic | Platform Focus |
|-----|-------|----------------|
| Monday | Top Growth | 小红书 |
| Tuesday | Top School Zone | 微信 |
| Wednesday | Top Value | 小红书 |
| Thursday | Top Yield | 微信 |
| Friday | Top Supply-Constrained | Video (for weekend) |
| Weekend | Deep-dive single suburb | All platforms |

This creates a predictable publishing cadence. Each topic gets ~1 week between rotations (5 static + 2 dynamic per week).

---

## 10. Edge Cases & Guardrails

### 10.1 No data for a suburb

If `suburb-intelligence` returns 404 or null data, skip deep-dive screenshots for that suburb. Use the next suburb in the ranking.

### 10.2 Confidence too low (< 50)

If the top suburb has `overall_confidence < 50`, inject a note:
> "注意：{suburb} 的数据覆盖面有限，建议结合实地考察"

### 10.3 All suburbs in same price band

If all top 10 are in a narrow price range (±15%), adjust the range narrative from "从 $X 到 $Y" to "集中在 $X 左右".

### 10.4 Vacation/resort suburbs in rankings

Resort suburbs (Portsea, Sorrento, Lorne) have sparse school/growth data. The script should detect them by vacancy_rate > 30% OR supply_constraint IS NULL, and skip them from school-zone and supply topics unless they legitimately rank.

### 10.5 English vs Chinese content

- 小红书 + WeChat: 中文为主，英文地名保留原文（"Werribee" 不译）
- English variant title: only generated as variant 3, not as full content
- If the input suburb has an established Chinese name (Box Hill = 博士山), use the Chinese name for 小红书/WeChat

---

## 11. Implementation Steps (Future)

| Step | Scope | Effort |
|------|-------|--------|
| 1 | `scripts/generate-content.mjs` — core generator with template engine | 3-4h |
| 2 | Topic selector + data fetch layer | 1-2h |
| 3 | Template files (6 × 6 = 36 templates) | 2-3h |
| 4 | Output writer (file structure + metadata) | 0.5h |
| 5 | CLI interface (node scripts/generate-content.mjs --topic top-growth) | 0.5h |
| 6 | Dry-run mode (no output, just preview) | 0.5h |
| 7 | Screenshot automation (Playwright, V2) | 2-3h |
| 8 | Topic rotation scheduler (cron job) | 0.5h |

**Total V1:** ~8-10 hours  
**V2 (with screenshot automation):** +3-5 hours

---

## 12. Appendix: Platform Requirements

### 小红书
- Image ratio: 3:4 (1080×1440) for single image, 1:1 for carousel
- Text limit: 1000 characters per post
- Hashtags: up to 15 per post
- Content tone: Personal, opinionated, "I found this" style
- Avoid: Pure data dumps, unattributed numbers, overly promotional language

### 微信公众号
- Article limit: No hard limit, but 1500-2000 words recommended
- Must include: 标题 + 作者 + 正文 + 声明 (数据仅供参考)
- Images: 3-5 per article for structure
- Content tone: Educational, authoritative, "we analyzed" style
- Avoid: Short video timestamps, overly casual language

### 抖音 / 小红书视频
- 30s: Fast cuts, 1-2 suburbs, one key insight
- 60s: 3-5 suburbs, comparison, data overlay
- Text overlay must be large and high-contrast
- First 2 seconds must have hook text on screen
- Audio: Energetic Chinese voiceover

---

*Design v1 — 2026-06-10 — Ready for Codex review.*
