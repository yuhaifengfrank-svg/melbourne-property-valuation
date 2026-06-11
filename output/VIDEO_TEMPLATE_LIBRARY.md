# Video Template Library

**Date:** 2026-06-11  
**Version:** V2  
**Format:** 5 video templates for short-form social (Douyin, TikTok, Reels, Kuaishou)

---

## Core Guidelines (All Templates)

### V3 Upgrade — Growth + Opportunity Framework

Every template now requires the **4 mandatory elements**:

1. **Benchmark Growth** — every growth stat must include a comparison
   > ❌ "一年涨了 25%"  
   > ✅ "一年涨了 25%，同期墨尔本约 15%，跑赢大盘"

2. **Future Driver** — why growth may continue (pop/infra/price gap)
   > "人口还在外流，基建持续落地"

3. **Risk Factor** — why growth may NOT continue (mandatory per suburb)
   > "学区评分只有 45" / "已经涨了 25%，短期可能放缓"

4. **Past ≠ Future** — never imply past growth = future return
   > ❌ "连续 3 年涨，值得入手"  
   > ✅ "过去涨了不代表未来一定涨，关键是..."

### Base Rules

- **NO Opportunity Score as lead.** Lead with: growth %, price, school score, vacancy rate, yield %.
- **Hook-first but with a twist.** First 3 seconds must contain a number AND a caveat signal.
  > V2: "涨了 30%！"  
  > V3: "涨了 30%——但涨得快不代表适合你"
- **Conversational Chinese.** Write like a friend explaining a finding. Not like a research report.
- **One suburb per video** (except rankings). Deep-focus visuals prevent cognitive overload.
- **Text overlay** every segment: suburb name always visible in first 5 seconds.
- **Screenshots from real pages** → see Screenshots Needed section in each template.

---

## Template A: Why {Suburb} Scores Highly

**Use when:** A specific suburb has outperform metrics across multiple dimensions (growth + school + affordability combo).

**Title:**
```
{suburb} 凭什么是高分？{N} 个数据告诉你
```
Example: *"Werribee 凭什么是高分？3 个数据告诉你"*

**Thumbnail:**
```
[Suburb name]  |  [Key stat]  |  [Score badge]
"Werribee"     |  "+30%"      |  "数据力证 ✅"
```

### V3 30s Script

```
[0-3s — Hook with twist]
🎬 Freeze frame on suburb ranking card, red circle on suburb name
🎙 "{suburb} 凭什么数据这么好看——但数据好看不代表适合你。"
📝 "{suburb} 🔥 但？"

[3-8s — Benchmark reveal]
🎬 Screenshot of growth section with benchmark overlay
🎙 "第一，一年涨了 {growth_1y}。墨尔本同期约 {benchmark}，跑赢大盘。"
📝 "📈 +{growth_1y} vs 大盘 +{benchmark}"

[8-15s — Driver]
🎬 Map / infrastructure screenshot
🎙 "涨的逻辑：{driver}。不是虚涨，背后有支撑。"
📝 "🚇 {driver_short}"

[15-20s — Risk]
🎬 Screenshot of risk section / weakness data
🎙 "但短板也很清楚：{risk}。"
📝 "⚠️ {risk_short}"

[20-25s — Balanced takeaway]
🎬 Black screen, white text: "过去 ≠ 未来"
🎙 "过去涨了不等于未来一定涨。关键看 {key_watch}。"
📝 "过去 ≠ 未来"

[25-30s — CTA]
🎬 Website screenshot, URL highlighted
🎙 "去官网输入地址，看完整数据自己判断。链接在主页简介。"
📝 "aushomevalue.com.au"
```

### V3 Data Insertion (additional fields)

| Slot | Example | Notes |
|------|---------|-------|
| `{benchmark}` | 15% | Melbourne/regional benchmark |
| `{driver}` | 人口往西走，M1 通勤 | Why growth continues |
| `{driver_short}` | 人口+基建 | Short overlay text |
| `{risk}` | 学区评分只有 49/100 | Why growth may stop |
| `{risk_short}` | 学区 49/100 | Short overlay text |
| `{key_watch}` | 学区和基建配套 | What to monitor |

### 60s Script (Adds more context + second strength)

```
[0-3s — Hook]
Same as 30s

[3-10s — Strength 1]
🎬 Screenshot: suburb page, growth section highlighted
🎙 "第一，一年涨 {growth_1y}。连续 3 年涨 {growth_3y}。不是一年突然爆发，是稳定跑赢大盘。"
📝 "📈 +{growth_1y} / +{growth_3y}"

[10-18s — Strength 2]
🎬 Screenshot: school score or infrastructure data
🎙 "第二，{school_score != 'low' ? '学区评分 ' + school_score + '/100，在同等价位的区里算不错' : '虽然没有名校，但学校评分 {school_score}/100，不拖后腿'}。"
📝 "🏫 学区 {school_score}/100"

[18-25s — Context / Why]
🎬 Map zoom showing location, transport corridors
🎙 "第三，它的位置决定了增长逻辑——{location_reason}。"
📝 "📍 {location_reason_short}"

[25-35s — Risk / Nuance]
🎬 Screenshot: risk section or vacancy layer
🎙 "当然，也有要注意的。空置率 {vacancy}，{vacancy_note}。还有一个问题是 {secondary_risk}。"
📝 "⚠️ 空置率 {vacancy}"

[35-45s — Comparison]
🎬 Split screen: this suburb vs comparable suburb
🎙 "同样的涨幅，{suburb_b} 只要 {price_b}。但 {suburb_b_weakness}。怎么选？"
📝 "{suburb} vs {suburb_b}"

[45-55s — Data Deep Dive]
🎬 Screenshot of the confidence/quality section
🎙 "我们的数据来自 realestate.com.au 真实成交和 ABS 普查数据，{confidence_level}。不是瞎猜。"
📝 "数据可信度: {confidence_level}"

[55-60s — CTA]
🎬 Website screenshot, URL highlighted
🎙 "去官网输入任何地址，0 元出评估报告。"
📝 "aushomevalue.com.au"
```

### Screenshots Needed

| Screenshot | Source | Notes |
|------------|--------|-------|
| Suburb ranking card | `/top-growth-suburbs-victoria.html` or `/top-school-zone-suburbs-victoria.html` | Red circle the suburb name |
| Confidence card | Suburb page (`/suburb/{slug}-vic.html`) | The data quality / confidence badge area |
| Strength section | Suburb page | The "Growth Drivers" or positive factors list |
| Risk section | Suburb page | The "Risk Factors" or negative factors list |
| Map view | Google Maps or equivalent | Show location relative to CBD |

---

### V3 Demo Rewrite — Werribee (30s)

> ```
> [Title: "Werribee 涨了 30%，跑赢大盘。但不一定适合你"]
> [Thumbnail: Werribee | +30% vs +15% | ⚠️]
>
> [0-3s]
> 🎬 Werribee 排名卡片 + 文字 "但？"
> 🎙 "Werribee 涨了 30%——但涨得快不代表适合你。"
> 📝 "Werribee +30% | 但？"
>
> [3-8s]
> 🎬 增长数据 vs 大盘对比
> 🎙 "第一，一年涨了 30%，墨尔本同期约 15%，跑赢一倍。"
> 📝 "📈 +30% vs 大盘 +15%"
>
> [8-15s]
> 🎬 M1 高速 + 西区基建图
> 🎙 "涨的逻辑：人口往西走 + M1 通勤 30 分钟，基建在跟进。"
> 📝 "🚇 人口 + 基建"
>
> [15-20s]
> 🎬 学区评分截图
> 🎙 "但短板：学区 49/100。涨得快说明需求硬，但不是靠学区拉起来的。"
> 📝 "⚠️ 学区 49/100"
>
> [20-25s]
> 🎬 黑底白字 "过去 ≠ 未来"
> 🎙 "过去涨了不等于未来也涨。关键看人口流入能不能持续、学区配套跟不跟得上。"
> 📝 "过去 ≠ 未来"
>
> [25-30s]
> 🎬 官网截图
> 🎙 "去官网输地址，看完整数据自己判断。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template B: Growth + Opportunity Suburbs (V3)

**Use when:** A ranking refresh or quarter-end roundup. Now framed as "Growth + Opportunity" not just "Top Growth".

**Title (V3):**
```
墨尔本涨最快的 {N} 个区——但不是每个都适合你
```
Example: *"墨尔本涨最快的 3 个区——但不是每个都适合你"*

**Thumbnail:**
```
"Growth + Opp"  |  "#1 {suburb}"  |  "+{growth_1y} vs +15%"
"涨+机会"       |  "#1 Werribee"  |  "+30% vs +15%"
```

### V3 30s Script

```
[0-3s — Hook with twist]
🎬 Ranking page title zoom in + "但？" overlay
🎙 "墨尔本涨最快的 3 个区——但涨得快不一定是你的菜。"
📝 "TOP 3 上涨 | 但？"

[3-10s — #3 with risk]
🎬 Suburb card + risk callout
🎙 "第 3 名：{suburb_3}。中位价 {price_3}，涨 {growth_1y_3}。但 {risk_3_short}。"
📝 "🥉 {suburb_3} +{growth_1y_3} | ⚠️ {risk_3_short}"

[10-17s — #2 with risk]
🎬 Second suburb card + risk callout
🎙 "第 2 名：{suburb_2}。中位价 {price_2}，涨 {growth_1y_2}。不过 {risk_2_short}。"
📝 "🥈 {suburb_2} +{growth_1y_2} | ⚠️ {risk_2_short}"

[17-24s — #1 balanced]
🎬 First place card + 2 text lines (driver vs risk)
🎙 "第 1 名：{suburb_1}。涨 {growth_1y_1}，跑赢大盘。驱动：{driver_1}。风险：{risk_1}。"
📝 "🥇 {suburb_1} | 🚇 {driver_short} | ⚠️ {risk_short}"

[24-27s — Caveat]
🎬 "过去 ≠ 未来" white text on black
🎙 "过去涨了不代表未来一定涨。三个区各有各的逻辑和代价。"
📝 "过去 ≠ 未来"

[27-30s — CTA]
🎬 Website screenshot
🎙 "去官网输地址，看哪个区的数据适合你。"
📝 "aushomevalue.com.au"
```

### 60s Script (More detail per suburb)

```
[0-3s — Hook]
Same as 30s

[3-18s — #3]
🎬 #3 suburb card screenshot with stat callouts
🎙 "第 3 名：{suburb_3}。中位价 {price_3}，涨 {growth_1y_3}，3 年涨了 {growth_3y_3}。空置率 {vacancy_3}，学区 {school_3}。总体数据很扎实。"
📝 "🥉 {suburb_3} | 💰 {price_3} | 📈 +{growth_1y_3}"

[18-33s — #2]
🎬 #2 suburb card, different visual (pan down from #3)
🎙 "第 2 名：{suburb_2}。中位价 {price_2}，同样涨 {growth_1y_2}。跟第 3 名最大的区别是——{key_diff_2}。"
📝 "🥈 {suburb_2} | 💰 {price_2} | {key_diff_2_short}"

[33-48s — #1]
🎬 #1 suburb card full-screen, zoom in on price + growth
🎙 "第 1 名：{suburb_1}。中位价 {price_1}，涨 {growth_1y_1}，3 年涨了 {growth_3y_1}。为什么它能排第一？因为 {reason_1}。"
📝 "🥇 {suburb_1} | 📈 +{growth_1y_1} | {reason_1_short}"

[48-55s — Wrap / Takeaway]
🎬 All 3 cards tiled on screen
🎙 "3 个区涨幅一样，但价格、学区、空置率差别很大。你的预算适合哪个？"
📝 "哪个适合你？👇"

[55-60s — CTA]
🎬 Website screenshot
🎙 "去官网输入地址，看你家在不在榜上。"
📝 "aushomevalue.com.au"
```

### Screenshots Needed

| Screenshot | Source |
|------------|--------|
| Ranking page title + top section | `/top-growth-suburbs-victoria.html` |
| #3 suburb card | Same page, scroll to rank 3 |
| #2 suburb card | Same page, scroll to rank 2 |
| #1 suburb card | Same page, scroll to rank 1 |
| (60s only) Detail page of #1 | `/suburb/{slug}-vic.html` |

---

### V3 Demo Rewrite — Top 3 Growth (30s)

> ```
> [Title: "墨尔本涨最快的 3 个区——但不是每个都适合你"]
> [Thumbnail: 涨+机会 | #1 Werribee | +30% vs +15%]
>
> [0-3s]
> 🎬 排名页标题放大 + "但？"
> 🎙 "墨尔本涨最快的 3 个区——但涨得快不一定是你的菜。"
> 📝 "TOP 3 上涨 | 但？"
>
> [3-10s]
> 🎬 #3 Sunshine + 风险标注
> 🎙 "第 3 名：Sunshine。中位价 $780K，涨 30%。但已经是三个里最贵的。"
> 📝 "🥉 Sunshine +30% | ⚠️ 最贵"
>
> [10-17s]
> 🎬 #2 Dandenong + 风险标注
> 🎙 "第 2 名：Dandenong。中位价 $446K，不到 45 万。但学区评分只有 33。"
> 📝 "🥈 Dandenong +30% | ⚠️ 学区 33"
>
> [17-24s]
> 🎬 #1 Werribee 驱动 vs 风险
> 🎙 "第 1 名：Werribee。涨 30%，跑赢大盘。驱动：人口+基建。风险：学区 49。"
> 📝 "🥇 Werribee | 🚇 人口+基建 | ⚠️ 学区 49"
>
> [24-27s]
> 🎬 "过去 ≠ 未来"
> 🎙 "过去涨了不代表未来一定涨。三个区各有各的逻辑和代价。"
> 📝 "过去 ≠ 未来"
>
> [27-30s]
> 🎬 官网截图
> 🎙 "去官网输地址，看哪个区的数据适合你。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template C: Top 3 Value Suburbs

**Use when:** Highlighting the most affordable suburbs with upside potential. Great for first-home buyer series.

**Title:**
```
最便宜但最有潜力的 {N} 个区
```
Example: *"最便宜但最有潜力的 3 个区"*

**Thumbnail:**
```
"最便宜 TOP 3"  |  "💰 ${price_start}"  |  "#1 {suburb}"
"最便宜 TOP 3"  |  "💰 41.7万起"        |  "#1 Caulfield East"
```

### 30s Script

```
[0-3s — Hook]
🎬 Quick montage of low prices flashing on screen
🎙 "墨尔本最便宜但涨得不错的 3 个区，猜猜最低多少钱？"
📝 "💰 最便宜 TOP 3"

[3-13s — #3 Suburb]
🎬 Value ranking page screenshot, #3 highlighted
🎙 "第 3 名：{suburb_3}。中位价 {price_3}，不到 {price_3_rounded}。"
📝 "🥉 {suburb_3} | 💰 {price_3}"

[13-23s — #2 Suburb]
🎬 #2 highlighted on ranking page
🎙 "第 2 名：{suburb_2}。中位价 {price_2}。涨得怎么样？{growth_note_2}。"
📝 "🥈 {suburb_2} | 💰 {price_2}"

[23-28s — #1 Suburb]
🎬 #1 zoom in, price callout big
🎙 "第 1 名：{suburb_1}。中位价只要 {price_1}。这是墨尔本 100 个区里性价比最高的。"
📝 "🥇 {suburb_1} | 💰 {price_1} 🏆"

[28-30s — CTA]
🎬 Value ranking page full screen
🎙 "完整榜单在官网，主页有链接。"
📝 "aushomevalue.com.au"
```

### 60s Script (Add growth + school context to each)

```
[0-3s — Hook]
Same as 30s - extend to 5s with slower reveal

[3-18s — #3]
🎬 #3 suburb card + their detail page price section
🎙 "第 3 名：{suburb_3}。中位价 {price_3}。你觉得便宜没好货？数据告诉你——3 年涨了 {growth_3y_3}。"
📝 "🥉 {suburb_3} | 💰 {price_3} | 📈 +{growth_3y_3}"

[18-33s — #2]
🎬 #2 suburb card + school score callout
🎙 "第 2 名：{suburb_2}。中位价 {price_2}。学区评分 {school_2}，在这个价位段算不错的。"
📝 "🥈 {suburb_2} | 💰 {price_2} | 🏫 {school_2}"

[33-48s — #1]
🎬 #1 suburb card full-screen + value badge
🎙 "第 1 名：{suburb_1}。中位价 {price_1}，全维州性价比最高的区。一年涨 {growth_1y_1}。"
📝 "🥇 {suburb_1} | 💰 {price_1} | 📈 +{growth_1y_1}"

[48-55s — Takeaway]
🎬 All 3 cards tiled
🎙 "3 个区，最低 40 多万就能入手。不是所有便宜区都没有增长。"
📝 "便宜 ≠ 没增长 🏠"

[55-60s — CTA]
🎬 Website screenshot
🎙 "输任何地址，免费查价值排名。"
📝 "aushomevalue.com.au"
```

### Screenshots Needed

| Screenshot | Source |
|------------|--------|
| Value ranking page top | `/top-value-suburbs-victoria.html` |
| #3 suburb card | Same page |
| #2 suburb card | Same page |
| #1 suburb card | Same page |
| (60s) Detail page price section | `/suburb/{slug}-vic.html` |
| (60s) School score section | Same detail page |

---

### Demo Rewrite — Top 3 Value (30s)

> ```
> [Title: "最便宜但最有潜力的 3 个区"]
> [Thumbnail: 最便宜 TOP 3 | 💰 41.7万起 | #1 Caulfield East]
>
> [0-3s]
> 🎬 低价快速闪过：$446K → $490K → $417K
> 🎙 "墨尔本最便宜但涨得不错的 3 个区，猜猜最低多少钱？"
> 📝 "💰 最便宜 TOP 3"
>
> [3-13s]
> 🎬 #3 Murrumbeena 价值排名截图
> 🎙 "第 3 名：Murrumbeena。中位价 $500K，不到 50 万。"
> 📝 "🥉 Murrumbeena | 💰 $500K"
>
> [13-23s]
> 🎬 #2 West Melbourne 截图
> 🎙 "第 2 名：West Melbourne。中位价 $490K。靠近市区，这个价格很难得。"
> 📝 "🥈 West Melbourne | 💰 $490K"
>
> [23-28s]
> 🎬 #1 Caulfield East 放大
> 🎙 "第 1 名：Caulfield East。中位价只要 $417,500，这是 100 个区里性价比最高的。"
> 📝 "🥇 Caulfield East | 💰 $417K 🏆"
>
> [28-30s]
> 🎬 价值排名页全屏
> 🎙 "完整榜单在官网，主页有链接。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template D: Top School Zone Suburbs Under $1M

**Use when:** Targeting families or buyers who prioritize school zones. Underscore that good schools don't require million-dollar entry.

**Title:**
```
好学区不一定要花 100 万
```
Example: *"好学区不一定要花 100 万，这 3 个区值得看"*

**Thumbnail:**
```
"🏫 好学区"  |  "💰 <$1M"  |  "评分 {school_score}+"
"🏫 好学区"  |  "💰 54万起"  |  "评分 80+"
```

### 30s Script

```
[0-3s — Hook]
🎬 School score badge zoom in quickly
🎙 "好学区不一定要花 100 万。给你 3 个数据。"
📝 "🏫 好学区 <$1M"

[3-13s — #3]
🎬 #3 suburb card from school ranking page
🎙 "{suburb_3}，学区评分 {school_3}，中位价 {price_3}，不到 {price_3_rounded} 万。"
📝 "🥉 {suburb_3} | 🏫 {school_3} | 💰 {price_3}"

[13-23s — #2]
🎬 #2 suburb card with school score highlighted
🎙 "{suburb_2}，评分 {school_2}。价格 {price_2}，在这个学区水平里算便宜的了。"
📝 "🥈 {suburb_2} | 🏫 {school_2} | 💰 {price_2}"

[23-28s — #1]
🎬 #1 suburb card zoom in, school score big
🎙 "{suburb_1}，评分 {school_1}，中位价 {price_1}。评分高，价格还不到 100 万。"
📝 "🥇 {suburb_1} | 🏫 {school_1} | 💰 {price_1}"

[28-30s — CTA]
🎬 School ranking page full screen
🎙 "完整榜单在官网，主页有链接。"
📝 "aushomevalue.com.au"
```

### 60s Script (More school + price analysis)

```
[0-5s — Hook]
🎬 School score badge + price tag side by side
🎙 "好学区一定要花 100 万以上吗？数据告诉我们不是。"
📝 "🏫 好学区 <$1M ❓"

[5-18s — #3 — School + Price]
🎬 #3 suburb card + detail page school section
🎙 "第 3 名：{suburb_3}。评分 {school_3}/100，这是维州 top-tier 的学区水平。中位价只要 {price_3}。"
📝 "🥉 {suburb_3} | 🏫 {school_3} | 💰 {price_3}"

[18-33s — #2 — School + Growth Angle]
🎬 #2 suburb + map showing location
🎙 "第 2 名：{suburb_2}。学区 {school_2}。增长怎么样？一年涨了 {growth_1y_2}。学区又保值，又有增长空间。"
📝 "🥈 {suburb_2} | 🏫 {school_2} | 📈 +{growth_1y_2}"

[33-48s — #1 — Best Combo]
🎬 #1 suburb full detail page
🎙 "第 1 名：{suburb_1}。评分 {school_1}，中位价 {price_1}。在 top 10 学区里，这个价格是最低的之一。"
📝 "🥇 {suburb_1} | 🏫 {school_1} | 💰 {price_1}"

[48-55s — Takeaway]
🎬 Tiled view: school scores vs prices
🎙 "好学区不一定要高价。关键是找到评分和价格的平衡点。"
📝 "评分 ↔ 价格 如何选？👇"

[55-60s — CTA]
🎬 Website screenshot
🎙 "去官网查你家附近的学区排名。"
📝 "aushomevalue.com.au"
```

### Screenshots Needed

| Screenshot | Source |
|------------|--------|
| School ranking page top | `/top-school-zone-suburbs-victoria.html` |
| #3 suburb card (school highlighted) | Same page |
| #2 suburb card | Same page |
| #1 suburb card | Same page |
| (60s) Detail page school section | `/suburb/{slug}-vic.html` |
| (60s) Suburb location map | Google Maps |

---

### Demo Rewrite — Top School Zones Under $1M (30s)

> ```
> [Title: "好学区不一定要花 100 万"]
> [Thumbnail: 🏫 好学区 | 💰 54万起 | 评分 80+]
>
> [0-3s]
> 🎬 学区评分 82 的徽章放大
> 🎙 "好学区不一定要花 100 万。给你 3 个数据。"
> 📝 "🏫 好学区 <$1M"
>
> [3-13s]
> 🎬 #3 Ivanhoe 学区排名截图
> 🎙 "Ivanhoe，学区评分 80.1，中位价不到 100 万。80 以上的区里它算便宜的。"
> 📝 "🥉 Ivanhoe | 🏫 80.1 | 💰 $???"
>
> [13-23s]
> 🎬 #2 Burwood 学区截图
> 🎙 "Burwood，评分 80.6。华人喜欢的区之一，价格在好学区的范围里算友好。"
> 📝 "🥈 Burwood | 🏫 80.6"
>
> [23-28s]
> 🎬 #1 Fairfield 放大
> 🎙 "Fairfield，评分 82.2，维州学区最好的区之一，中位价 $542K。"
> 📝 "🥇 Fairfield | 🏫 82.2 | 💰 $542K"
>
> [28-30s]
> 🎬 学区排名页全屏
> 🎙 "完整 100 名在官网，主页有链接。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template E: Best First Home Buyer Suburbs

**Use when:** Targeting first-home buyers — balance affordability + growth + school in one package. Don't just chase the cheapest; show the best value combo.

**Title:**
```
首次置业，这 {N} 个区最值得看
```
Example: *"首次置业，这 3 个区最值得看"*

**Thumbnail:**
```
"🏡 首次置业"  |  "💰 {price_low}-{price_high}"  |  "+{growth_min}% ↗️"
"🏡 首次置业"  |  "💰 44万-58万"  |  "+25% ↗️"
```

### 30s Script

```
[0-3s — Hook]
🎬 Multiple suburb cards flash on screen
🎙 "第一次买房，看这 3 个区就够了。不贵，还在涨。"
📝 "🏡 首次置业 TOP 3"

[3-13s — #3 — Affordability Focus]
🎬 #3 suburb card from value ranking page
🎙 "{suburb_3}，中位价 {price_3}。第一次上车，这个价格压力小。"
📝 "🥉 {suburb_3} | 💰 {price_3}"

[13-23s — #2 — Growth + Affordability Balance]
🎬 #2 suburb card + growth section
🎙 "{suburb_2}，中位价 {price_2}。价格靠谱，过去 3 年还涨了 {growth_3y_2}。"
📝 "🥈 {suburb_2} | 💰 {price_2} | 📈 +{growth_3y_2}"

[23-28s — #1 — Best All-Rounder]
🎬 #1 suburb card with all 3 badges (value + growth + school)
🎙 "{suburb_1}，中位价 {price_1}。价格好，有增长，学区也说得过去。三个条件都满足。"
📝 "🥇 {suburb_1} | 💰 {price_1} | 🏆 三项达标"

[28-30s — CTA]
🎬 Website screenshot, URL highlighted
🎙 "输预算，我们帮你筛。链接在简介。"
📝 "aushomevalue.com.au"
```

### 60s Script (More context for each pick)

```
[0-5s — Hook]
🎬 Slow pan across 3 suburb cards
🎙 "第一次买房，选择比努力重要。这 3 个区，我们从 3 个维度帮你筛出来的。"
📝 "🏡 首次置业 | 3 个维度筛选"

[5-20s — #3 — Price as Primary]
🎬 #3 suburb card + value ranking page
🎙 "第 3 名：{suburb_3}。首要注意的是价格——中位价 {price_3}，首次置业攒几年就能付首付。"
📝 "🥉 {suburb_3} | 💰 {price_3} | 🏠 价格友好"

[20-35s — #2 — Price + Growth]
🎬 #2 suburb card + growth ranking mention
🎙 "第 2 名：{suburb_2}。中位价 {price_2}，一年涨 {growth_1y_2}。买得起 + 在涨，这是首次置业最舒服的配置。"
📝 "🥈 {suburb_2} | 💰 {price_2} | 📈 +{growth_1y_2}"

[35-50s — #1 — The Balanced Pick]
🎬 All 3 ranking pages (value + growth + school) shown
🎙 "第 1 名：{suburb_1}。价值排名靠前，增长排名靠前，学区排名也不差。三个维度最平衡的选择。"
📝 "🥇 {suburb_1} | 🏆 三榜全中"

[50-55s — Decision Framework]
🎬 3 comparison metrics displayed: price, growth, school
🎙 "不适合？没关系。每个人条件不同。但方向比速度重要——选对的区，比选便宜的区更重要。"
📝 "选对的区，不是选便宜的区 👇"

[55-60s — CTA]
🎬 Website screenshot with CTA overlay
🎙 "去官网输你的地址和预算，系统帮你匹配。"
📝 "aushomevalue.com.au"
```

### Screenshots Needed

| Screenshot | Source |
|------------|--------|
| Value ranking page (for affordability) | `/top-value-suburbs-victoria.html` |
| Growth ranking page (for upside) | `/top-growth-suburbs-victoria.html` |
| School ranking page (for school balance) | `/top-school-zone-suburbs-victoria.html` |
| Each suburb's detail page price section | `/suburb/{slug}-vic.html` |
| (60s only) Triple ranking comparison | Composite 3 screenshots |

---

### Demo Rewrite — Best First Home Buyer (30s, using Rockbank + Dandenong + Sunshine)

> ```
> [Title: "首次置业，这 3 个区最值得看"]
> [Thumbnail: 🏡 首次置业 | 💰 44万-58万 | +25% ↗️]
>
> [0-3s]
> 🎬 房子卡片快闪
> 🎙 "第一次买房，看这 3 个区就够了。不贵，还在涨。"
> 📝 "🏡 首次置业 TOP 3"
>
> [3-13s]
> 🎬 Rockbank 价值排名截图
> 🎙 "Rockbank，中位价 $583K。这个价格在墨尔本买独立屋，压力小多了。"
> 📝 "🥉 Rockbank | 💰 $583K"
>
> [13-23s]
> 🎬 Dandenong 增长截图
> 🎙 "Dandenong，中位价 $446K，不到 45 万。而且 3 年涨了 25%。买得起还在涨。"
> 📝 "🥈 Dandenong | 💰 $446K | 📈 +25%"
>
> [23-28s]
> 🎬 Sunshine 三合一卡片
> 🎙 "Sunshine，中位价 $780K。价格偏高但有学区（47/100）有增长（+30%）。三个条件平衡。"
> 📝 "🥇 Sunshine | 💰 $780K | 🏆 三项达标"
>
> [28-30s]
> 🎬 官网截图
> 🎙 "输预算，我们帮你筛。链接在简介。"
> 📝 "aushomevalue.com.au"
> ```

---

## Quick Reference: Screenshot Sources

| Page | URL Path | Used In |
|------|----------|---------|
| Growth ranking | `/top-growth-suburbs-victoria.html` | Templates A, B, E |
| Value ranking | `/top-value-suburbs-victoria.html` | Templates C, E |
| School ranking | `/top-school-zone-suburbs-victoria.html` | Templates D, E |
| Suburb detail page | `/suburb/{slug}-vic.html` | All templates (for data calls) |
| Map / location | Google Maps | Templates A, D |

---

## Quick Reference: Data Insertion Keys

| Key | Example | Used In |
|-----|---------|---------|
| `{suburb}` / `{suburb_1/2/3}` | Werribee / Dandenong / Rockbank | All |
| `{price}` / `{price_1/2/3}` | $692K / $446K / $583K | All |
| `{growth_1y}` | 30% | All |
| `{growth_3y}` | 25% | A, C, E |
| `{school}` / `{school_score}` | 49 / 82.2 | A, D, E |
| `{vacancy}` | 2.44% | A, B |
| `{location_reason}` | "靠 M1，30 分钟到市区" | A |
| `{confidence_level}` | "数据可信度高" | A (60s) |
| `{key_diff_2}` | "Dandenong 价格更低" | B (60s) |

---

*Template Library V2 — Ready for use by editors and integration into scripts/generate-content.mjs*
