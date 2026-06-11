# Content Style V2 Report

**Date:** 2026-06-11  
**Type:** Social content template system · V2 rewrite  
**Purpose:** Transform academic/research-report content into native social media content for 5 platform formats

---

## Core Rules (V2, reaffirmed)

| Rule | V1 (Bad) | V2 (Good) |
|------|----------|----------|
| Hook-first | "2026 维州增长最快的 10 个郊区" | "73 万能在墨尔本买一个涨了 25% 的区" |
| Lead with real data | "NO.1 Deer Park — 机会分 36" | "中位价 $730,000，一年涨 30%。为什么还能涨？" |
| Conversational Chinese | "我们的 9 维评分系统给它打了高分" | "你打开地图，Deer Park 在墨尔本西边——以前没人看的地方" |
| Include investor POV | 陈述事实，没有互动 | 每段结尾抛一个"你来判断"的问题 |
| No Opportunity Score as lead | 机会分 36 标明 | 机会分不出现在标题或前两句，仅作内部参考 |
| Data before score | 评分系统 → 数据 | 数据 → 评分仅在上下文里带过 |

---

## A. Xiaohongshu Template

### Hook Sentence Formulas (3 variants)

**Variant 1 — The "Guess the Number" Hook**
```
{price} 能在墨尔本买一个涨了 {growth_percent} 的区，你猜是哪里？
```
Example: *"69 万能在墨尔本买一个涨了 25% 的区，你猜是哪里？"*

**Variant 2 — The "You Missed It" Hook**
```
墨尔本这个区悄悄涨了 {growth_percent}，但很多人还不知道
```
Example: *"墨尔本这个区悄悄涨了 30%，但很多人还不知道"*

**Variant 3 — The "Price Shock" Hook**
```
不到 {price} 就能在墨尔本买到 {topic_key} 的房子，你敢信？
```
Example: *"不到 45 万就能在墨尔本买到涨幅靠前的房子，你敢信？"*

### Body Structure

No labelled sections. No headers like "深度分析：" or "TOP 3：". Content flows as one conversational post.

- **Paragraph 1 (hook):** Lead with the surprise. One strong data point. Ends with a mini-reveal.
- **Paragraph 2 (context):** 1-2 lines explaining what we looked at. Use 你/你的.
- **Paragraph 3 (data cards):** 3-4 bullet lines, each prefixed with one emoji. Each card is one data point: label + value + one-line takeaway. No labeled structure.
- **Paragraph 4 (the twist):** A counterpoint or comparison that makes the reader think. Ends with a question.
- **Paragraph 5 (CTA):** Soft, low-pressure. "我们有一个免费工具…"

**Format rules enforced:**
- Max 2-3 lines per paragraph
- One emoji per paragraph max (except data card section where each card gets one)
- No header labels like `💡 深度分析：` or `━━━━━━━━━━━`
- Reader addressed directly (你/你的/你会)
- No labels before data (not "NO.1 Deer Park — 机会分 36" but "Deer Park 中位价 $730,000，涨幅…")

### Data Insertion Points

| Slot | Variable | Example Value |
|------|----------|---------------|
| Hook price | `{price}` | 73 万 / $730,000 |
| Hook growth | `{growth_percent}` | 30% / 25% |
| Suburb name | `{suburb}` | Werribee / Deer Park / Sunshine |
| Topic context | `{topic_key}` | 涨最快的 / 性价比最高的 / 学区最好的 |
| Secondary suburb | `{suburb_2}` | Clyde North / Rockbank |
| Comparison price | `{price_2}` | $770,000 / $583,000 |
| School score | `{school_score}` | 40.2 / 56.2 / 82 |
| Vacancy rate | `{vacancy}` | 2.44% / 3.66% |
| Growth 1y | `{growth_1y}` | +30% |
| Growth 3y | `{growth_3y}` | +25% |

### Hashtag Formula

4-6 hashtags: mix of high-volume general + niche suburb-specific.

```
#[general_property] #[city_property] #[suburb_name] #[topic_keyword] #[tool_brand]
```

Pattern:
1. High-volume general: `#墨尔本买房` or `#澳洲房产`
2. City/province specific: `#维州房产` or `#墨尔本房产`
3. Suburb name: `#DeerPark` or `#Werribee` (English, no spaces)
4. Topic keyword: `#买房攻略` or `#首次置业` or `#学区房`
5. Tool brand: `#AusHomeValue` (always last)
6. Optional niche: `#澳洲投资` or `#房产评估`

Example: `#墨尔本买房 #维州房产 #DeerPark #买房攻略 #澳洲投资 #AusHomeValue`

### CTA Patterns

| Tone | Pattern | Example |
|------|---------|---------|
| Question-based | "你会选 A 还是 B？评论区聊聊 👇" | "你会选 Deer Park 还是 Clyde North？" |
| Tool promotion | "输入地址就能看到数据，链接在主页简介" | "我们有一个免费工具，主页简介里有链接" |
| Soft ask | "你觉得这个区值得入手吗？" | "你觉得这个区怎么样？" |
| Direct link | "完整榜单 → aushomevalue.com.au" | "完整榜单在官网，进主页就能看到" |

**Never end with:** "数据仅供参考，不构成投资建议" as the closing line. Move disclaimers to a comment reply or very bottom, never as the final visible line.

---

### Demo Rewrite — Xiaohongshu Top Growth

> Deer Park 一年涨了 30% 🚀
>
> 猜猜现在中位价多少——$730,000。你没看错。
>
> 我们看了维州增长最快的 10 个郊区，这个西边的区排在第一位。
>
> 💰 中位价 $730,000，比墨尔本均价低一大截
> 📈 一年涨 30%，三年涨 25% ——不是爆发式，是连续涨
> 🏠 空置率 2.44% ——100 套只有 2 套空着
>
> 有意思的是：它的学区评分才 40.2，不算好。但涨幅还是第一。
>
> 这说明什么？它的涨不是靠学区溢价撑的。是真实的人口流入和基建在拉。
>
> 当然，第二名 Clyde North 学区 56.2，中位价 $770,000，只贵了 $40,000。同样的涨幅，不同的逻辑。
>
> 你会选哪个？
>
> 我们有一个免费工具，输入地址就能查增长数据，链接在主页简介里 👇
>
> #墨尔本买房 #维州房产 #DeerPark #买房攻略 #澳洲投资 #AusHomeValue

---

## B. Short Video Template (30s)

### Segment Structure

| Time | Function | Formula | Visual Direction |
|------|----------|---------|------------------|
| 0-3s | **Hook** | "墨尔本过去一年涨得最快的地方——你可能没听说过" | Start with a freeze frame or zoom-in on suburb card. Red arrow / circle highlight. |
| 3-8s | **Reveal** | "[Suburb], 一年涨 [X]%, 中位价 [Y]" | 3 quick cards flash: price → growth → vacancy. Each 0.5s. Text overlay. |
| 8-15s | **Context** | "为什么涨？因为 [1 clear reason]" | Map push-in showing location, transport line, or infrastructure. |
| 15-20s | **Engagement Question** | "你会选 [Suburb A] 还是 [Suburb B]？" | Black screen, white text. Pause for dramatic effect. |
| 20-25s | **Risk/Nuance Note** | "一个数据值得注意——[one counterpoint]" | Chart/graph overlay that adds depth beyond the hook. |
| 25-30s | **CTA** | "查你家附近涨没涨？链接在主页简介" | Website screenshot, URL highlighted. Clean exit. |

### Hook Formulas for Video (0-3s)

1. **The "You've Never Heard" Hook:** "墨尔本过去一年涨得最快的地方——你可能没听说过。"
2. **The "Price Reveal" Hook:** "[Price] 能在墨尔本买个涨了 [X]% 的房子，在哪里？"
3. **The "Counter-Intuitive" Hook:** "大家都在看的区不一定涨，但这个大家没注意到的区涨了 [X]%。"

### Text Overlay Rules

- Keep overlays to 6-8 characters max per line
- Use emoji prefixes: 💰 price, 📈 growth, 🏠 vacancy, 🏫 school, 🚇 transport
- Always show the suburb name on screen within first 5 seconds

### Data Insertion Points

| Time Slot | Variable | Visual |
|-----------|----------|--------|
| 0-3s | `{suburb}` + `{growth_1y}` | Suburb card screenshot |
| 3-8s | `{suburb}` + `{price}` + `{growth_1y}` + `{growth_3y}` | 3 flash cards |
| 8-15s | `{suburb}` + `{price}` + `{topic_explain}` | Map + infrastructure |
| 15-20s | `{suburb_a}` vs `{suburb_b}` | Black screen text |
| 20-25s | `{vacancy}` or `{school_score}` | Chart / data callout |
| 25-30s | Website URL | Screenshot + highlight |

### 30s Script Template (Fill-in)

```
[0-3s]
🎬 [Freeze frame on {suburb} card with red circle]
🎙 "墨尔本过去一年涨得最快的地方——你可能没听说过。"
📝 "{suburb} 🏡 +{growth_1y}"

[3-8s]
🎬 [Three flash cards: price / growth / vacancy, each 0.5s]
🎙 "{suburb}，一年涨 {growth_1y}，中位价 {price}。"
📝 "📈 +{growth_1y} | 💰 {price}"

[8-15s]
🎬 [Map zoom to {suburb}, show distance / transport]
🎙 "为什么涨？因为 {one_line_reason}。而这里价格还是洼地。"
📝 "📍 {distance}km to CBD"

[15-20s]
🎬 [Black screen, white text]
🎙 "你会选涨最快的 {suburb}，还是学区更好的 {suburb2}？"
📝 "你怎么选？👇"

[20-25s]
🎬 [Chart showing vacancy or school score]
🎙 "一组数字：{suburb} 空置率只有 {vacancy}。"
📝 "{vacancy} 空置率"

[25-30s]
🎬 [Website screenshot, URL highlighted]
🎙 "查你家附近涨没涨？链接在主页简介。"
📝 "aushomevalue.com.au"
```

---

### Demo — 30s Video: Top Growth (Werribee)

> ```
> [0-3s]
> 🎬 Werribee 排名卡片，红圈标记
> 🎙 "墨尔本过去一年涨得最快的地方——你可能没听说过。"
> 📝 "Werribee 🏡 +30%"
>
> [3-8s]
> 🎬 三张卡：$692K / +30% / 空置率 2.44%
> 🎙 "Werribee，一年涨 30%，中位价才 69 万。"
> 📝 "📈 +30% | 💰 $692K"
>
> [8-15s]
> 🎬 地图推近到 Werribee，显示 M1 高速
> 🎙 "为什么涨？人口往外走，西边基建跟上，这里还是价格洼地。"
> 📝 "🚗 M1 30min to CBD"
>
> [15-20s]
> 🎬 黑底白字留白
> 🎙 "你会选 Werribee 还是 Sunshine？两个涨幅一样，方向不同。"
> 📝 "你怎么选？👇"
>
> [20-25s]
> 🎬 图表突出 Werribee 空置率
> 🎙 "一组数字：Werribee 空置率只有 2.44%。100 套不到 3 套空着。"
> 📝 "2.44% 空置率"
>
> [25-30s]
> 🎬 网站截图，链接高亮
> 🎙 "查你家附近涨没涨？主页简介有链接。"
> 📝 "aushomevalue.com.au"
> ```

---

## C. WeChat Moments / Article Template

### Headline Formulas (Chinese headline patterns that drive clicks)

**Formula 1 — The "Number + Surprise" Headline**
```
{number} 个数字告诉你，为什么 {suburb} 在悄悄涨
```
Example: *"3 个数字告诉你，为什么 Werribee 在悄悄涨"*

**Formula 2 — The "Question Headline"**
```
中位价不到 {price}，涨幅 {growth}% 的区，现在还能买吗？
```
Example: *"中位价不到 70 万，涨幅 25% 的区，现在还能买吗？"*

**Formula 3 — The "Comparison Headline"**
```
同样的涨幅，一个 {price_a}，一个 {price_b}。差别在哪？
```
Example: *"同样的涨幅，一个 $730K，一个 $583K。差别在哪？"*

**Formula 4 — The "FOMO + Specific" Headline**
```
墨尔本这 {number} 个区涨得最快，第 {rank} 名你一定没想到
```
Example: *"墨尔本这 3 个区涨得最快，第 1 名你一定没想到"*

### Short Paragraph Structure (WeChat Article)

- **Opening:** 2-3 lines, hook with a number. No dust-settling introduction.
- **Body paragraph 1:** One clear data point. Why it matters. 2-3 lines.
- **Body paragraph 2:** A second data point. Different angle (counterpoint). 2-3 lines.
- **Body paragraph 3:** The "But" paragraph — nuance, risk, what to watch out for.
- **Closing:** Actionable takeaway. "你可以用我们的工具查一下你家附近的数据。"

**Max article length:** 800 characters (WeChat optimal). Each paragraph max 80 characters (Chinese).

### Data Card Format (for WeChat)

Use compact inline format, not tables:

```
📍 【区名】
💰 中位价：{price}
📈 涨幅：{growth_1y}（1年） / {growth_3y}（3年）
🏫 学区：{school_score}/100
🏠 空置率：{vacancy}
💡 一句话：{one_line_takeaway}
```

No more than 3-4 data cards in a single article. Space them with 1 blank line between cards.

### CTA for WeChat Ecosystem

| Channel | CTA Pattern |
|---------|-------------|
| **Moments (朋友圈)** | "想查你关注的区？点我头像，看主页有链接" |
| **Article (公众号)** | "关注我们，每周更新维州房产数据" |
| **Article inline** | "在「AusHomeValue」输入任何地址，免费出评估报告" |
| **Mini-program bridge** | "长按识别二维码，直达估价页面" (if QR available) |

---

### Demo — WeChat Moments Post: Top Value (Dandenong)

> 45 万能在墨尔本买一个独立屋？不是在郊外，是在 Dandenong。
>
> 我们看了维州 100 个区的数据，Dandenong 是性价比最高的之一。
>
> 📍 Dandenong
> 💰 中位价 $446,000
> 📈 3 年涨幅 25%
> 🏫 学区评分 33/100
>
> 价格低不代表没有增长。过去一年 Dandenong 涨了 30%，3 年涨了 25%。
>
> 当然，学区评分不高（33）。如果你在意学校，这个区可能不适合。
>
> 但如果你看的是价格洼地 + 增长潜力，Dandenong 是目前数据上最值得关注的区。
>
> 想查你关注的区？点我头像，看主页有链接。免费出评估报告。

---

## Implementation Notes

### How to integrate into V1 generator

The V1 generator at `scripts/generate-content.mjs` currently uses static render functions. To integrate V2:

1. Create `renderXiaohongshuV2()` — uses the hook-first, no-label body template
2. Create `renderVideoV2()` — uses the 6-segment timed script format
3. Create `renderWechatV2()` — uses the short paragraph data-card format
4. Add `--v2` CLI flag to switch rendering logic

### Data flow

```
API data (suburb list) 
  → fill_data_slots() replaces {price}, {growth}, {suburb} etc.
  → renderV2_xxx() applies template
  → output/{topic}/v2-xxx.md
```

### What stays from V1

- Metadata generation (timestamp, topic, suburb count)
- API data fetching logic
- Screenshot planning
- File structure (one file per format)

### What is replaced

- Title formats (hook-first instead of topic-first)
- Body copy (narrative flow instead of labeled sections)
- Video scripts (conversational hooks instead of read-aloud titles)
- Hashtag strategy (suburb-specific + niche instead of generic)
- CTA (question-based engagement instead of passive statement)

---

*V2 Template System — Ready for implementation in scripts/generate-content.mjs*
