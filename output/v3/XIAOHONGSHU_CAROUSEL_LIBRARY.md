# Xiaohongshu Carousel Library — 小红书图文卡片 Prompt 库

**格式：** 每张 1080×1440 (3:4)  
**风格：** 现代信息图，数据驱动  
**每篇：** 6-8 张轮播

---

## Template XH1: Single Suburb Deep Dive

**适用：** Werribee / 单个区深度分析  
**张数：** 7 张  
**风格：** 白底 + 蓝绿点缀

### Card 1 — Cover

```
A vertical infographic card (1080×1440).
Large bold title: "[SUBURB] 涨了 30% —— 但涨得快不代表适合你"
Subtitle in smaller grey text: "数据告诉你这个区的真实表现"
Small blue accent horizontal line at top.
Bottom left: "aushomevalue.com.au" in grey.
Clean white background, modern knowledge-sharing aesthetic.
No photos, no screenshots.
```

### Card 2 — Hook + Map

```
A vertical card (1080×1440).
Top: "你一定没听过这个区" in bold dark blue.
Middle: Abstract Melbourne map with one suburb highlighted 
in blue. Minimalist vector style.
Bottom: Suburb name in large white font on dark blue band.
```

### Card 3 — Price

```
A vertical card (1080×1440).
Top-left: Small house icon (line-art, blue).
Center: "中位价" label in grey.
Large: "$[PRICE]" in bold dark blue.
Bottom: "[PROPERTY_TYPE] 中位价"
Clean white background.
```

### Card 4 — Growth with Benchmark

```
A vertical card (1080×1440).
Top: "📈 增长" in bold.
Center: A simple line chart showing growth line vs benchmark.
Left side legend:
"本区 +[GROWTH]%" in blue ●
"大盘 +[BENCHMARK]%" in grey ●
Bottom text: "跑赢 [DIFF]%"
Clean infographic style.
```

### Card 5 — Drivers

```
A vertical card (1080×1440).
Title: "为什么还在涨？"
Three icons stacked vertically:
👥 人口外溢 — "人口往这个方向流"
🚇 通勤 — "M1 30分钟到市区"
🏗️ 基建 — "医院/学校/交通持续落地"
Each row: icon + two-line explanation.
Clean white background.
```

### Card 6 — Risk

```
A vertical card (1080×1440).
Title: "⚠️ 短板也清楚"
One clear risk factor displayed as a progress bar:
"学区评分 49/100" — bar filled 49%
Below: small text "涨得快 ≠ 什么都好 | 学区不是它的强项"
Orange accent color.
```

### Card 7 — Conclusion + CTA

```
A vertical card (1080×1440).
Title: "数据给你了，你来判断"
Three summary points:
💰 $[PRICE] 中位价
📈 +[GROWTH]% 跑赢大盘
⚠️ [RISK] 需要注意
Bottom: website "aushomevalue.com.au" in blue.
Dark blue gradient background with white text.
```

---

## Template XH2: Ranking Roundup (3 suburbs)

**适用：** Growth+Opportunity / Top Value / School Zone  
**张数：** 6 张

### Card 1 — Cover

```
Title: "[CATEGORY] — 3 个区，每个都有代价"
Subtitle: 数据排名 + 逐个分析
```

### Card 2 — The Rankings

```
Horizontal bar chart comparing 3 suburbs.
Each bar: suburb name + key stat (growth/price/school).
Color-coded: rank 1/2/3 in blue/teal/green.
Clean white background.
```

### Card 3 — #3 & Risk

```
Top: "🥉 [SUBURB_3]" in bold.
Price: $[PRICE_3]
Key metric: [METRIC_3]
⚠️ [RISK_3]
Clean card layout.
```

### Card 4 — #2 & Risk

```
Top: "🥈 [SUBURB_2]" in bold.
Same structure as Card 3.
```

### Card 5 — #1 & Risk

```
Top: "🥇 [SUBURB_1]" in bold.
Same structure with driver + risk balance.
```

### Card 6 — Conclusion

```
Title: "过去涨了 ≠ 未来也涨"
Each suburb's deciding factor:
[SUBURB_1]: [KEY_WATCH_1]
[SUBURB_2]: [KEY_WATCH_2]
[SUBURB_3]: [KEY_WATCH_3]
CTA: "去官网输地址，查完整数据"
```

---

## Template XH3: School + Price 话题

**适用：** 好学区 < $1M  
**张数：** 6 张

### Card 1

```
Title: "好学区不一定要花 100 万"
Subtitle: "但便宜学区房一定有代价"
```

### Card 2

```
Benchmark comparison:
"墨尔本平均学区评分：50/100"
"这三个区评分：80+"
Dual progress bar comparison visual.
```

### Card 3-5 （每人一张卡片）

```
每个区一卡：
🏫 评分 [SCORE]/100
💰 中位价 [PRICE]
📈 增长 [GROWTH]
⚠️ 代价：[RISK]
```

### Card 6

```
Title: "学区 vs 增长：你怎么选？"
Text: "两个都好当然好，但很少同时出现。
想清楚更看重什么——上学方便还是房价增值。"
CTA
```

---

## Template XH4: First Home Buyer 话题

**适用：** 首次置业  
**张数：** 6 张

### Card 1

```
Title: "第一次买房的 3 个区"
Subtitle: "价格友好、也在涨——但每个都有代价"
```

### Card 2

```
Price comparison:
"三区中位价 44-58 万"
"远低于墨尔本均价"
Simple price bar chart.
```

### Card 3-5 （每人一张）

```
每区一卡：
🏡 [SUBURB] 中位价 $[PRICE]
📈 +[GROWTH]% 
⚠️ [RISK]
```

### Card 6

```
Title: "便宜 ≠ 好投资"
CTA: "去官网输你的预算查匹配数据"
```

---

## 图片生成格式

所有卡片使用以下统一参数：

| 参数 | 值 |
|------|-----|
| 尺寸 | 1080×1440 |
| 背景 | 白底 / 深蓝渐变 |
| 字体 | 思源黑体 / PingFang |
| 风格 | 信息图 / 极简 / 数据驱动 |
| 参考 | The Economist / Visual Capitalist |
| 禁止 | 照片 / 截图 / 浏览器 UI / 人物 |
