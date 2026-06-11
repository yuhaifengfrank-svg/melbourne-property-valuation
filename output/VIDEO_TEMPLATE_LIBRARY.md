# Video Template Library

**Date:** 2026-06-11 (V3 update)  
**Version:** V3  
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

## Template C: Top 3 Value Suburbs (V3)

**Use when:** Highlighting the most affordable suburbs with upside potential. **V3: Don't just pitch cheap + growth. Show why they're cheap, what the trade-off is.**

**Title (V3):**
```
最便宜的 3 个区，涨得也不错。但便宜有便宜的原因
```
Example: *"最便宜的 3 个区，涨得也不错。但便宜有便宜的原因"*

**Thumbnail:**
```
"💰 最便宜"  |  "{price_low}起"  |  "涨幅 +{growth_min}% ✅"
"💰 最便宜"  |  "41.7万起"      |  "但？"
```

### V3 30s Script

```
[0-3s — Hook with caveat]
🎬 低价快速闪过，最后定格在 "但？"
🎙 "墨尔本最便宜的 3 个区，涨得也不错。但便宜有便宜的原因。"
📝 "💰 最便宜 | 但？"

[3-10s — #3 with benchmark + risk]
🎬 #3 卡片 + 风险标注
🎙 "第 3 名：{suburb_3}。中位价 {price_3}，涨了 {growth_1y_3}，跑赢大盘。但 {risk_3_short}。"
📝 "🥉 {suburb_3} | 💰 {price_3} | ⚠️ {risk_3_short}"

[10-17s — #2 with benchmark + risk]
🎬 #2 卡片 + 风险标注
🎙 "第 2 名：{suburb_2}。中位价 {price_2}。价格低，但 {risk_2_short}。"
📝 "🥈 {suburb_2} | 💰 {price_2} | ⚠️ {risk_2_short}"

[17-24s — #1 balanced]
🎬 #1 放大 + price callout + 风险
🎙 "第 1 名：{suburb_1}。中位价只 要 {price_1}。涨了 {growth_1y_1}。但学区（{school_1}）偏低。"
📝 "🥇 {suburb_1} | 💰 {price_1} | 📈 +{growth_1y_1} | ⚠️ 学区 {school_1}"

[24-27s — Caveat]
🎬 "过去 ≠ 未来" + "便宜 ≠ 好投资"
🎙 "便宜有便宜的逻辑。价格低不一定 是价值洼地，可能是基本面弱。"
📝 "便宜 ≠ 价值洼地"

[27-30s — CTA]
🎬 官网截图
🎙 "去官网输地址，查每个区的估值和风险。"
📝 "aushomevalue.com.au"
```

---

### V3 Demo Rewrite — Top 3 Value (30s)

> ```
> [Title: "最便宜的 3 个区，涨得也不错。但便宜有便宜的原因"]
> [Thumbnail: 💰 最便宜 | 41.7万起 | 但？]
>
> [0-3s]
> 🎬 低价闪过：$500K → $490K → $417K → 定格 "但？"
> 🎙 "墨尔本最便宜的 3 个区，涨得也不错。但便宜有便宜的原因。"
> 📝 "💰 最便宜 | 但？"
>
> [3-10s]
> 🎬 #3 Murrumbeena + 风险标注
> 🎙 "第 3 名：Murrumbeena。中位价 $500K，涨了约 20%，跑赢大盘。但学区只有 40+，不算好。"
> 📝 "🥉 Murrumbeena | 💰 $500K | ⚠️ 学区 40+"
>
> [10-17s]
> 🎬 #2 West Melbourne + 风险标注
> 🎙 "第 2 名：West Melbourne。中位价 $490K。靠近市区，但涨幅主要靠 CBD 外溢，自身基本面不强。"
> 📝 "🥈 West Melbourne | 💰 $490K | ⚠️ 基本面弱"
>
> [17-24s]
> 🎬 #1 Caulfield East 放大
> 🎙 "第 1 名：Caulfield East。中位价只要 $417K。涨了 20%+，但学区评分低。"
> 📝 "🥇 Caulfield East | 💰 $417K | ⚠️ 学区偏低"
>
> [24-27s]
> 🎬 "过去 ≠ 未来"
> 🎙 "便宜有便宜的逻辑。价格低不一定 是价值洼地，可能是基本面弱。"
> 📝 "便宜 ≠ 价值洼地"
>
> [27-30s]
> 🎬 官网截图
> 🎙 "去官网输地址，查每个区的估值和风险。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template D: Top School Zone Suburbs Under $1M (V3)

**Use when:** Targeting families or buyers who prioritize school zones. **V3: Don't just pitch cheap + good school. Show the trade-off — good school zones often have lower growth.**

**Title (V3):**
```
好学区不一定要花 100 万，但便宜学区房一定有代价
```
Example: *"好学区不一定要花 100 万，但便宜学区房一定有代价"*

**Thumbnail:**
```
"🏫 好学区"  |  "💰 <$1M"  |  "代价？"
"🏫 好学区"  |  "💰 54万起"  |  "⚠️"
```

### V3 30s Script

```
[0-3s — Hook with twist]
🎬 学区徽章 + 价格标签并排，
🎙 "好学区不一定要花 100 万。但便宜学区房一定有代价。"
📝 "🏫 好学区 <$1M | 代价？"

[3-8s — Benchmark]
🎬 排名页 + 大盘对比
🎙 "这些区学区评分 80+，远高于墨尔本平均的 50 分。价格都在 100 万以下。"
📝 "🏫 80+ vs 平均 50"

[8-15s — #3 & #2 with risk]
🎬 #3 和 #2 并排
🎙 "Ivanhoe 评分 80.1，Burwood 评分 80.6。价格友好，学区优秀。"
📝 "🥉 Ivanhoe 🏫 80.1 | 🥈 Burwood 🏫 80.6"

[15-20s — #1 balanced]
🎬 #1 Fairfield 放大
🎙 "第 1 名：Fairfield。评分 82.2，中位价 $542K。看起来完美。"
📝 "🥇 Fairfield 🏫 82.2 | 💰 $542K"

[20-25s — Risk]
🎬 增长数据低亮
🎙 "但 Fairfield 过去一年涨幅一般。好学区 ≠ 高增长。有时候两者不可兼得。"
📝 "⚠️ 涨幅一般"

[25-27s — Caveat]
🎬 "学区 vs 增长 你怎么选？"
🎙 "想清楚你更看重什么——上学方便还是房价增值。两者都好很难同时出现。"
📝 "学区 ↔ 增长"

[27-30s — CTA]
🎬 官网截图
🎙 "去官网输地址，看每个区的数据和对比。"
📝 "aushomevalue.com.au"
```

---

### V3 Demo Rewrite — Top School Zones Under $1M (30s)

> ```
> [Title: "好学区不一定要花 100 万，但便宜学区房一定有代价"]
> [Thumbnail: 🏫 好学区 | 💰 54万起 | ⚠️]
>
> [0-3s]
> 🎬 学区评分 82 + 价格 $542K 并排
> 🎙 "好学区不一定要花 100 万。但便宜学区房一定有代价。"
> 📝 "🏫 好学区 <$1M | 代价？"
>
> [3-8s]
> 🎬 学区排名页 + 大盘标注
> 🎙 "这些区评分 80+，远高于墨尔本平均 50 分。价格都在 100 万以下。"
> 📝 "🏫 80+ vs 平均 50"
>
> [8-15s]
> 🎬 Ivanhoe + Burwood 并排
> 🎙 "Ivanhoe 评分 80.1，Burwood 评分 80.6。价格友好，学区优秀。"
> 📝 "🥉 Ivanhoe 80.1 | 🥈 Burwood 80.6"
>
> [15-20s]
> 🎬 Fairfield 放大
> 🎙 "第 1 名：Fairfield。评分 82.2，中位价 $542K。看起来完美。"
> 📝 "🥇 Fairfield 🏫 82.2 | 💰 $542K"
>
> [20-25s]
> 🎬 Fairfield 涨幅灰色标注
> 🎙 "但它的涨幅一般。好学区 ≠ 高增长。"
> 📝 "⚠️ 涨幅一般"
>
> [25-27s]
> 🎬 "学区 vs 增长"
> 🎙 "上学方便还是房价涨？想清楚你更看重什么。"
> 📝 "学区 ↔ 增长"
>
> [27-30s]
> 🎬 官网截图
> 🎙 "去官网输地址，看每个区的数据和对比。"
> 📝 "aushomevalue.com.au"
> ```

---

## Template E: Best First Home Buyer Suburbs (V3)

**Use when:** Targeting first-home buyers. **V3: Don't just pitch "affordable + growing."  First-home buyers need to know what they're trading off. Every cheap option has a weakness.**

**Title (V3):**
```
首次置业 3 个区——价格友好、也在涨，但每个都有代价
```
Example: *"首次置业 3 个区——价格友好、也在涨，但每个都有代价"*

**Thumbnail:**
```
"🏡 首次置业"  |  "💰 {price_low}起"  |  "代价？"
"🏡 首次置业"  |  "💰 44万起"      |  "⚠️"
```

### V3 30s Script

```
[0-3s — Hook with twist]
🎬 三张卡片快速闪过，文字 "代价？"
🎙 "第一次买房的 3 个区——价格友好、也在涨。但每个都有代价。"
📝 "🏡 首次置业 | 代价？"

[3-8s — Benchmark overview]
🎬 三区价格对比大盘
🎙 "3 个区中位价都在 40-60 万左右，远低于墨尔本均价。"
📝 "💰 40-60万 vs 墨尔本均价"

[8-15s — #3 with risk]
🎬 #3 卡片 + 风险标注
🎙 "{suburb_3}，中位价 {price_3}。便宜。但 {risk_3_short}。"
📝 "🥉 {suburb_3} | 💰 {price_3} | ⚠️ {risk_3_short}"

[15-22s — #2 with risk]
🎬 #2 卡片 + 风险标注
🎙 "{suburb_2}，中位价 {price_2}。涨了 {growth_1y_2}，跑赢大盘。不过 {risk_2_short}。"
📝 "🥈 {suburb_2} | 💰 {price_2} | ⚠️ {risk_2_short}"

[22-27s — #1 balanced]
🎬 #1 卡片 + 驱动 vs 风险
🎙 "第 1 名：{suburb_1}。{price_1}。驱动：{driver_1_short}。风险：{risk_1_short}。"
📝 "🥇 {suburb_1} | 💰 {price_1} | 🚇 {driver_short} | ⚠️ {risk_short}"

[27-30s — CTA]
🎬 官网截图
🎙 "去官网输你的预算，看数据自己判断。"
📝 "aushomevalue.com.au"
```

---

### V3 Demo Rewrite — Best First Home Buyer (30s, using Rockbank + Dandenong + Sunshine)

> ```
> [Title: "首次置业 3 个区——价格友好、也在涨，但每个都有代价"]
> [Thumbnail: 🏡 首次置业 | 💰 44万起 | ⚠️]
>
> [0-3s]
> 🎬 三张卡片闪过 + "代价？"
> 🎙 "第一次买房的 3 个区——价格友好、也在涨。但每个都有代价。"
> 📝 "🏡 首次置业 | 代价？"
>
> [3-8s]
> 🎬 三区价格 vs 墨尔本均价
> 🎙 "3 个区中位价在 44-58 万，远低于墨尔本均价。"
> 📝 "💰 44-58万 vs 均价"
>
> [8-15s]
> 🎬 #3 Rockbank + 风险标注
> 🎙 "Rockbank，中位价 $583K。西边独立屋，价格友好。但位置偏，配套还在建设中。"
> 📝 "🥉 Rockbank | 💰 $583K | ⚠️ 位置偏"
>
> [15-22s]
> 🎬 #2 Dandenong + 风险标注
> 🎙 "Dandenong，中位价 $446K。涨了 25%，跑赢大盘。但学区评分只有 33/100。"
> 📝 "🥈 Dandenong | 💰 $446K | ⚠️ 学区 33"
>
> [22-27s]
> 🎬 #1 Sunshine 驱动 vs 风险
> 🎙 "Sunshine，$780K。偏贵但学区 47 有增长 +30%。驱动：人口外溢。风险：已经涨了不少。"
> 📝 "🥇 Sunshine | 💰 $780K | 🚇 人口外溢 | ⚠️ 已涨"
>
> [27-30s]
> 🎬 官网截图
> 🎙 "去官网输你的预算，看数据自己判断。"
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

### V3 Additional Insertion Fields

| Key | Example | Notes |
|-----|---------|-------|
| `{benchmark}` | 15% | Melbourne/regional benchmark growth |
| `{driver}` | 人口往西走，M1 通勤 | Why growth may continue |
| `{driver_short}` | 人口+基建 | Short overlay text |
| `{risk}` / `{risk_1/2/3}` | 学区评分只有 49 | Why growth may NOT continue |
| `{risk_short}` / `{risk_1_short}` | 学区 49 | Short overlay risk text |
| `{key_watch}` | 学区和基建配套 | What to monitor over next 12-24m |

---

*Template Library V3 — Growth + Opportunity Framework*
