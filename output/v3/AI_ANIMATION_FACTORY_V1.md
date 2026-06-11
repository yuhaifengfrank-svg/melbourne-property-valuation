# AI Animation Factory V1 — 动画信息图视频工厂

**Date:** 2026-06-11  
**Version:** V1  
**From:** 网站截图视频 → 动画信息图

---

## 为什么做这个

Video Factory V1 的问题是：**网站截图 → 看起来像产品演示，不是内容**

用户刷 Xiaohongshu / Douyin / 微信视频号，3 秒滑走的机会成本太高。截图 = "这是别人的网站"，动画信息图 = "这是专业的分析内容"。

**参考风格：**
- The Economist — 数据可视化克制、干净
- Visual Capitalist — 信息密度高、信息图叙事
- Kurzgesagt — 动画 + 复杂概念简单化

## 核心升级

| V1 (截图) | V1 + Animation (动画) |
|-----------|----------------------|
| 网站首页截图 | 墨尔本地图高亮区 |
| 数据表格 | 增长折线动画 |
| 优势列表 | 图标 + 数字飞入 |
| 风险卡片 | 警示图标 + 排行榜 |
| 信心徽章 | 打分动画卡片 |

**不用的：**
- ❌ 网站截图
- ❌ 原始表格
- ❌ API 输出
- ❌ 浏览器 chrome

**用的：**
- ✅ 墨尔本地图（抽象/简化版）
- ✅ 房子图标 + 价格标签
- ✅ 增长折线图
- ✅ 动画图标（学校 / 火车 / 医院 / 人口）
- ✅ 钱币符号
- ✅ 徽章打分卡

---

## 统一视觉规范

### 色调

```
Primary:   #1A365D  (深蓝 — 信任/数据)
Secondary: #2B6CB0  (中蓝 — 信息)
Accent:    #38A169  (绿 — 增长/正面)
Warning:   #DD6B20  (橙 — 风险/注意)
Danger:    #E53E3E  (红 — 下跌)
Bg Light:  #F7FAFC  (浅灰 — 卡片背景)
Text:      #1A202C  (深灰 — 正文)
```

### 字体

- 标题：无衬线粗体（类似 Inter / SF Pro / 思源黑体）
- 数字：tabular figures（等宽数字，方便对齐）
- 中文字体：思源黑体 / PingFang SC

### 动画元素

```
元素出现：从底部飞入 + 淡入 (0.3s)
数字：顺序弹出（0.15s 间隔，从 0 涨到目标值）
地图：从中心放大 + 区高亮（0.5s）
图标：弹簧弹出 + 轻微弹跳（0.4s）
切景：左/右滑入（0.2s cross dissolve）
```

### 画布尺寸

| 平台 | 分辨率 | 比例 |
|------|--------|------|
| 抖音 / 视频号 | 1080×1920 | 9:16 |
| Xiaohongshu 视频 | 1080×1440 | 3:4 |
| Xiaohongshu 图文 | 1080×1440 (每张) | 3:4 |

---

## 6 场景通用结构

每个视频固定 6 个场景，30 秒。下面是通用结构 + 场景描述 Prompt。

### Scene 1 — Hook (3s)

**音频：** "很多华人不会看这个区，但它 3 年涨了 25%。"

**动画：**
- 背景：墨尔本抽象地图，灰色
- 开场：特定区从灰色变亮，标记点闪烁
- 文字飞入：区名 + "？" 大号 white text

**动画 Prompt：**
```
A minimalist abstract map of Melbourne, Victoria, Australia.
One suburb highlighted in blue with a pulsing dot.
Clean vector style, dark grey background.
No labels other than the suburb name.
Modern infographic aesthetic, similar to The Economist.
```

### Scene 2 — Price (5s)

**音频：** "中位价 $692,000。在西区这个价位能买到独立屋。"

**动画：**
- 左中：房子图标（线稿风格）从底部飞入
- 右上：价格标签从右滑入 `$692,000`
- 文字：房子下方 "独立屋中位价"

**动画 Prompt：**
```
A clean line-art illustration of a freestanding Australian suburban house.
Single-story, red brick, tiled roof, front yard.
Minimalist vector style, blue outline on light grey background.
Next to it a large price tag showing "AUD 692,000" in bold modern font.
Infographic style similar to Visual Capitalist.
```

### Scene 3 — Growth (7s)

**音频：** "过去一年涨了 30%，墨尔本同期约 15%。跑赢一倍。"

**动画：**
- 左下到右上：增长折线，从 0% 升到 30%，轨迹留下蓝线
- 标注点：一年前 → 现在
- 16:9 比例，干净白色格子背景

**动画 Prompt：**
```
An animated line chart showing property price growth over 12 months.
X-axis: months (Jun '25 → Jun '26).
Y-axis: percentage (0% to 35%).
A blue trend line rises from bottom-left to top-right, ending at "+30%".
A dashed grey reference line shows "+15%" (Melbourne average).
Clean minimal chart style, white background, no grid lines.
Modern financial infographic aesthetic.
```

### Scene 4 — Future Driver (5s)

**音频：** "涨的逻辑：人口往西走，M1 通勤 30 分钟，基建在落地。"

**动画：**
- 三列图标从左到右依次飞入：
  - 👥 人口图标 → 文字 "人口外溢"
  - 🚇 火车图标 → 文字 "M1 通勤"
  - 🏗️ 建筑图标 → 文字 "基建跟进"
- 每个图标出现时轻微弹跳

**动画 Prompt：**
```
Three clean minimalist icons in a horizontal row:
[People icon / Population flow arrows]
[Train icon / Commuter rail]
[Construction crane icon / Infrastructure]
Each icon is flat vector style in blue on white circles.
Below each icon: one word label in Chinese "人口" "通勤" "基建".
Professional infographic style, Modern layout, Visual Capitalist aesthetic.
```

### Scene 5 — Risk (5s)

**音频：** "短板：学区评分 49。涨得快不代表什么都好。"

**动画：**
- 中间弹出警告三角形 ⚠️ 橙色
- 右侧列出：学区评分 49/100（进度条只到一半）
- 文字：涨得快 ≠ 什么都好

**动画 Prompt：**
```
A clean warning/risk infographic card.
Left side: a minimalist triangular warning icon in orange.
Right side: a progress bar showing 49/100 with label "School Score 学区评分".
Below: text in Chinese "⚠️ 涨得快 ≠ 什么都好".
Dark background card with white text.
Modern financial risk disclosure style.
```

### Scene 6 — Conclusion (5s)

**音频：** "去官网输地址，看完整数据自己判断。"

**动画：**
- 品牌结束卡
- 中间：aushomevalue.com.au
- 下方：三个标签 "数据驱动" "实时估值" "免费查询"
- 背景：深蓝渐变

**动画 Prompt：**
```
A brand end card for a property data website.
Dark blue gradient background (#1A365D → #2B6CB0).
Center: domain name "aushomevalue.com.au" in bold white modern sans-serif font.
Below: three small tags "数据驱动 · 实时估值 · 免费查询".
Clean, minimal, professional financial brand aesthetic.
No logos, no website screenshots.
```

---

## Image Generation Pipeline

### 可用引擎

| 引擎 | 目前状态 | 备注 |
|------|---------|------|
| OpenAI DALL·E / GPT-Image-2 | 🔴 需要 API key | 最推荐，风格可控 |
| Midjourney | 🔴 外部 | Prompt 已写可直接用 |
| ComfyUI | 🔴 需配置 | 本地跑需要 GPU |
| Stable Diffusion | 🔴 需配置 | 本地 SDXL |

### 本仓库策略

所有 Prompt 库写好了。配置好 API key 后：

```bash
# 设置 key
export OPENAI_API_KEY=sk-xxx

# 然后用 image_generate 工具调用
# 或通过 node 脚本批量生成
```

### 标签规范

生成图片按以下结构存储：

```
assets/generated/{topic}/
├── scene01-hook.png
├── scene02-price.png
├── scene03-growth.png
├── scene04-driver.png
├── scene05-risk.png
├── scene06-conclusion.png
└── thumbnail.png
```

---

## 5 个主题的场景映射

| 主题 | Scene 1 Hook | Scene 2 Price | Scene 3 Growth | Scene 4 Driver | Scene 5 Risk | Scene 6 CTA |
|------|-------------|--------------|----------------|----------------|-------------|-------------|
| Werribee | 地图高亮 | 房子 $692K | +30% vs +15% | 人口+M1+基建 | 学区 49/100 | 品牌卡 |
| Growth+Opp | 三区比较 | 三个价格 | 三折线叠加 | 三区各自驱动 | 三区各自风险 | 品牌卡 |
| Top Value | 便宜 ≠ 洼地 | 最低价格 | 涨幅 vs 大盘 | 价格逻辑 | 基本面弱 | 品牌卡 |
| School | 好学区有代价 | Fairfield $542K | 学区 vs 涨幅 | 学区分布 | 涨幅低 | 品牌卡 |
| First Home | 便宜有代价 | 44-58万 | 三区涨幅 | 各自驱动 | 学校/位置/已涨 | 品牌卡 |

---

## Phase 2 — 动画合成

当图片生成就绪后：

1. **每场景一张 PNG**（1080×1920，背景透明或纯色）
2. **Edge-TTS 音频**（已有，`output/v3/packages/{topic}/audio.mp3`）
3. **ffmpeg 合成**：图片 → 交叉渐变 → 加上音频
4. **SRT 字幕覆盖**（已有）
5. **导出 MP4**

这样产出的视频就是：**动画信息图 + 专业旁白 + 自动字幕**，没有一张网站截图。
