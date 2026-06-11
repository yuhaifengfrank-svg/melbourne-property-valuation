# Video Scene Library — 动画场景 Prompt 库

**For:** AI Image Generation (DALL·E / Midjourney / SDXL)  
**Style:** 现代信息图，The Economist + Visual Capitalist  
**Resolution:** 1080×1920 (9:16 视频) / 1080×1440 (小红书图文)

---

## Scene Type A: Melbourne Map Highlight

**用途：** Hook 场景，显示哪个区。

```
A minimalist abstract map of Melbourne, Victoria, Australia.
The city outline in thin grey lines on a dark (#1A365D) background.
One suburb "[SUBURB_NAME]" highlighted in bright blue (#2B6CB0) 
with a soft glowing pulse animation effect.
No street labels, no other suburb names visible.
Clean vector flat style, modern infographic aesthetic.
Text at top: "[SUBURB_NAME]" in bold white sans-serif.
```

**变体 — 多区对比：**
```
Split-screen map of Melbourne showing 3 suburbs highlighted in 
different colors: blue, teal, green. Each with a small label.
Rest of the map in grey. 
Minimalist, dark background, infographic style.
```

---

## Scene Type B: House + Price Tag

**用途：** 价格展示。

**标准：**
```
A clean line-art vector illustration of a freestanding Australian 
suburban house. Single-story, red brick veneer, tiled roof, 
front yard with grass. Minimalist blue outline style.
Next to it: a large modern price tag or badge showing 
"$[PRICE]" in bold black font.
Background: light grey (#F7FAFC). 
No perspective, flat 2D style.
Financial infographic aesthetic.
```

**变体 — 公寓：**
```
A minimalist line-art illustration of a modern low-rise apartment 
building (3-4 stories). Flat roof, balcony, clean architecture.
Blue outline style on light grey background.
Price tag: "$[PRICE]".
Modern infographic style.
```

**变体 — 三个价格并排：**
```
Three house icons in a horizontal row, each with a price tag below.
House 1: "$[PRICE1]"
House 2: "$[PRICE2]"
House 3: "$[PRICE3]"
Minimalist blue line-art style, light grey background.
Financial infographic aesthetic.
```

---

## Scene Type C: Growth Chart

**用途：** 增长数据可视化。

**标准（一条线）：**
```
An animated line chart showing property price growth over the 
past 12 months. X-axis: months (Jun '25 to Jun '26). 
Y-axis: percentage (0% to 35%). 
The main trend line rises from bottom-left to "+[GROWTH]%" 
at top-right, colored blue (#2B6CB0).
A dashed grey reference line at "+15%" labeled "Melbourne".
Chart area: clean white, no grid lines, no 3D effect.
Minimal financial infographic style.
```

**变体 — 三年增长：**
```
A line chart with 3 annual data points over 3 years.
Year 1: [Y1]% → Year 2: [Y2]% → Year 3: [Y3]%.
Blue line trending upward.
X-axis: "3年增长" labels.
Clean white background, modern infographic.
```

**变体 — 多区比较（柱状图）：**
```
A horizontal bar chart comparing 3 suburbs' growth rates.
Bar 1: "[SUBURB1] [GROWTH1]%" in blue
Bar 2: "[SUBURB2] [GROWTH2]%" in teal  
Bar 3: "[SUBURB3] [GROWTH3]%" in green
Dashed reference line labeled "Melbourne average [BENCHMARK]%".
Clean, minimal, no grid, no 3D.
```

---

## Scene Type D: Driver Icons

**用途：** 为什么涨（驱动因素）。

**标准 — 三列图标：**
```
Three clean minimalist flat vector icons in a horizontal row, 
each inside a circular white badge on a dark blue (#1A365D) 
background:
[ICON1] — label "[LABEL1]"
[ICON2] — label "[LABEL2]"
[ICON3] — label "[LABEL3]"
Icons are outlined in blue (#2B6CB0).
Labels are in white Chinese text, sans-serif.
Modern infographic layout, Visual Capitalist style.
```

**可用图标替换：**

| 驱动 | Icon | 中文标签 | 描述 |
|------|------|---------|------|
| 人口增长 | 👥 / Flow arrows 图标 | 人口外溢 | People / population arrows |
| 基建 | 🚇 / 火车图标 | 通勤 | Train / transport |
| 基建 | 🏗️ / 吊车图标 | 基建跟进 | Construction crane |
| 价格洼地 | 💰 / Price tag | 价格洼地 | Price gap / discount tag |
| 供应限制 | 📉 / Supply arrow | 供应有限 | Supply constraint |
| 学区 | 🏫 / School badge | 学区驱动 | School / education |
| 就业 | 💼 / Briefcase | 就业中心 | Employment hub |
| 交通 | 🚌 / Bus icon | 交通枢纽 | Transport hub |
| CBD 通勤 | 🏙️ / City skyline | CBD通勤 | Commute to CBD |
| 空置率 | 🏠 / House vacancy | 出租需求 | Vacancy / rental demand |

---

## Scene Type E: Risk / Warning Card

**用途：** 风险披露。

**标准：**
```
A dark card infographic with a warning/alert theme.
Left side: a minimalist triangular warning/exclamation icon 
in orange (#DD6B20).
Right side: [RISK_TEXT] 
Example: "School Score: 49/100"
Displayed as a progress bar filled only to 49%.
Below in smaller text: "⚠️ [CAVEAT_TEXT]"
Dark background card, white text for data.
Modern risk disclosure infographic style.
```

**变体 — 多风险叠加：**
```
Three small risk indicators stacked vertically.
Each with a small orange warning icon and one-line text:
⚠️ [RISK1]
⚠️ [RISK2]  
⚠️ [RISK3]
Clean card layout, dark background, white text.
```

---

## Scene Type F: Score / Rating Card

**用途：** 总结打分。

**标准：**
```
A clean scorecard infographic with 3 metrics displayed vertically.
Each metric has a label, a value, and a small color indicator 
(green if positive, orange if neutral, red if negative).

[LABEL1] [VALUE1] ● green
[LABEL2] [VALUE2] ● orange
[LABEL3] [VALUE3] ● green / red

Bottom: website URL "aushomevalue.com.au" in grey.
Dark blue gradient background.
Financial infographic style, The Economist aesthetic.
```

---

## Scene Type G: Xiaohongshu Carousel

**用途：** 小红书图文卡片（1080×1440）。

**标准：**
```
A vertical infographic card (1080×1440, 3:4 aspect ratio).
[CONTENT]
Bottom: small watermark "aushomevalue.com.au"
Background: clean white or light gradient.
Style: modern Chinese social media infographic.
```

**Cover Card:**
```
Title in large bold Chinese font:
"[HOOK_TEXT]"
Subtitle in smaller grey:
"[SUBHEAD]"
Bottom left: "aushomevalue.com.au" watermark in grey.
Clean white background with one small blue accent line at top.
Modern knowledge-sharing aesthetic.
```

**Data Card:**
```
Split into 3 or 4 horizontal bands, each containing:
- Icon (small flat vector)
- Label in Chinese
- Large number with unit
Example bands: 
💰 中位价 $692,000
📈 1年增长 +30%
🏫 学区评分 49/100
🏠 空置率 2.44%
Clean white background, minimal grid.
```
