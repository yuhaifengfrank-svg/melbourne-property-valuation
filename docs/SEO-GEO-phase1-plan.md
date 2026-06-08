# AusHomeValue · SEO / GEO 第一阶段实施方案

> 目标定位：**AusHomeValue – Australia's Property Opportunity Intelligence Platform**

---

## 现状清单

### ✅ 已上线
- 全功能前端（估值、comparable sales、micro-location、LVR、上传、PDF 下载、注册）
- API `api/valuation.js`（Neon DB，249 区，3,641 条 comparable sales）
- 地址核验（Nominatim 软核验 + postal + unit 逻辑）
- 注册 + 邮件通知（sendgrid）
- PDF 生成（pdf-lib）
- WeChat QR / 多语言切换
- Vercel Production（`aushomevalue.vercel.app`）

### 🔧 已上线但需要增强
- `<head>` 无 meta description、Open Graph、canonical、JSON-LD
- robots.txt / sitemap.xml **不存在**
- 缺乏 AI crawler（GPTBot、ClaudeBot、CCBot）友好策略
- 首页标题/描述偏功能（"Melbourne Property Estimate"），不够品牌定位级
- About 文案偏个人背景，未突出平台使命
- 无结构化数据（Organization / WebSite schema）

### ❌ 未上线 / Coming soon
- 商业地产估值模块（已有占位 UI）
- Investor Hub 详细内容（注册后锁定）
- 内容 hub / 博客（图文教程、区域分析）
- 多州覆盖（NSW/QLD 等 dropdown 已有但仅有占位）
- Domain cross-source 数据（被 CloudFront 拦截中）
- OpenAI GPT action / 自定义 GPT

---

## 一、首页 Headline / Subheadline / CTA

### 现状
```html
<title>AusHomeValue | Melbourne Property Estimate</title>
<nav>Valuation · Comparables · Location · Loan · Uploads · Investor Hub · About · Contact</nav>
<section>
  <h2>Enter a Melbourne address. Get a quick estimate. Leave details for the full report.</h2>
  <button>Get free estimate</button>
</section>
```

### 建议修改

**1. title tag（最紧急）**
```html
<title>AusHomeValue – Australia's Property Opportunity Intelligence Platform | Melbourne Property Valuations & Market Research</title>
```

**2. homepage headline（search-copy section）**
> **English:**  
> `"Property Opportunity Intelligence — estimate, evidence, and insight, all in one place."`  
> Sub: `"Select state, suburb and address. Get a quick estimate. Leave details for the full report."`

> **中文（`lang="zh-CN"`默认）：**  
> `"澳洲房产机会情报 — 估值、证据、洞见，一站集成。"`  
> 副标题：`"选州、区、地址，立刻获得初步估值。留下资料解锁完整报告。"`

**3. CTA 不动** — "Get free estimate" / "获取免费估值" 已够清晰。

### 更改范围
只改 `index.html` 中对应标签的 textContent 和 `<title>`，不动样式、不破坏任何 JS 的 DOM 选择器。

---

## 二、About 与 Footer 文案

### About 现状
重点在创始人个人背景（会计硕士、银行经验、AUM 50亿 AUD）。对平台定位描述偏弱。

### 建议

**About headline 不动**（已符合：`"Property research, finance thinking and practical investor support."`）

**About 前两段调整（如下替换现有 paragraph (2) 和 (3)）：**

> **Paragraph (2) — 平台使命（新增）**  
> "AusHomeValue is a property opportunity intelligence platform purpose-built for evidence-based property research. We combine public sales records, geospatial clues and structured valuation logic to help buyers, sellers and investors understand what a property is worth — and why."

> **Paragraph (3) — 双市场视角（原有精简）**  
> "Our bilingual platform connects Australia and China, helping clients navigate Australian property opportunities through local market evidence combined with cross-border wealth management experience."

> **Paragraph (4)（原有，保持：团队背景）**

### Footer（全新，加在 `</main>` 后，`<script>` 前）

```html
<footer>
  <p>AusHomeValue – Property Opportunity Intelligence Platform.</p>
  <p>© 2026 AusHomeValue. Authorised Representatives: info@aushomevalue.com.au</p>
  <p>
    <a href="#about">About</a> · <a href="#contact">Contact</a> ·
    <a href="#valuation">Valuation</a> · <a href="#uploads">Upload evidence</a>
  </p>
  <p class="small">
    This website provides general property information and research for educational purposes.
    Not financial advice, not a credit assessment, not a formal valuation.
    Always consult licensed professionals for legal, tax and lending decisions.
  </p>
</footer>
```

---

## 三、Metadata · Canonical · Open Graph

### 替换 `<head>` 中的内容（在 `charset` 和 `viewport` 之后）

```html
<title>AusHomeValue – Australia's Property Opportunity Intelligence Platform | Melbourne Property Valuations</title>
<meta name="description" content="AusHomeValue delivers property opportunity intelligence for Australian properties. Get a free estimate, review comparable sales, and understand location, planning and investment potential — all in one bilingual platform." />
<meta name="keywords" content="property valuation, Melbourne property estimate, Australian property research, home value estimate, 澳洲房产估值, 墨尔本房产, comparable sales, property opportunity intelligence" />
<link rel="canonical" href="https://aushomevalue.vercel.app/" />
<meta property="og:title" content="AusHomeValue – Property Opportunity Intelligence Platform" />
<meta property="og:description" content="Free property estimates, comparable sales and market intelligence for Australian properties. Bilingual EN/中文." />
<meta property="og:url" content="https://aushomevalue.vercel.app/" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

---

## 四、JSON-LD（Structured Data）

### Organization

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "AusHomeValue",
  "url": "https://aushomevalue.vercel.app",
  "description": "Australia's Property Opportunity Intelligence Platform — free property estimates, comparable sales data and market research.",
  "foundingDate": "2026",
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "info@aushomevalue.com.au",
    "contactType": "customer service",
    "availableLanguage": ["English", "中文"]
  },
  "sameAs": []
}
</script>
```

### WebSite

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "AusHomeValue",
  "url": "https://aushomevalue.vercel.app",
  "description": "Property opportunity intelligence platform for Australian property research, valuation estimates and comparable sales.",
  "inLanguage": ["en-AU", "zh-CN"],
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://aushomevalue.vercel.app/?address={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
</script>
```

---

## 五、robots.txt / sitemap.xml

### `robots.txt`
```txt
User-agent: *
Allow: /
Sitemap: https://aushomevalue.vercel.app/sitemap.xml

# AI crawlers — explicitly welcome
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Google-Extended
Allow: /
```

### `sitemap.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://aushomevalue.vercel.app/</loc>
    <lastmod>2026-06-08</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

两个文件放项目根目录，Vercel 会自动 serve（现有 `vercel.json` 是 `{"outputDirectory":"."}`）。

---

## 六、AI Crawler 可访问策略

### 问题
ChatGPT 的 Browse 功能、Claude、Perplexity、Gemini、Copilot 的 web crawling 需要一个清晰的入口点。当前单页应用只有一个 `<main>` section 很多内容被 JS 重写，但初始 HTML 包含了所有 section 的 markup（非 SPA 前端路由），AI crawler 可以读取到初始静态内容。

### 增强
1. **robots.txt 明确 Allow AI crawlers**（如上一节）
2. **首页 description meta 包含关键业务关键词**（property valuation，comparable sales，Australian property 等）— 已在三、Metadata 中
3. **Open Graph 提供 AI crawl 友好的摘要**
4. **JSON-LD 让 Google Knowledge Panel 和 AI 问答可抓取结构化信息**
5. **`/api/valuation` 端点接受 `?address=...` GET 参数**（当前只 POST）— 可选但不紧急，让 AI agent 调用时需要先搞清楚如何 POST JSON body；目前不做变更

### 无需做
- SSR / 预渲染 — 当前单页足够被 crawler 读取静态内容，API 结果依赖 JS 执行。如有预算可考虑 Vercel Edge SSR，但初期不做
- 多 page 路由 — 当前单页足够

---

## 七、中英文关键词

### 英文
```
property valuation, home value estimate, Melbourne property prices,
Australian property market, comparable sales, property research,
real estate intelligence, suburb price trends, property opportunity platform,
free online property valuation, house price estimate Australia,
property investment research, property evidence platform
```

### 中文
```
澳洲房产估值, 墨尔本房价, 澳洲房产投资, 房产估价网站,
可比成交数据, 澳洲房产研究, 房产市场情报, 区域房价走势,
免费房产估值, 澳洲房产机会, 房产分析平台, 中英文房产估值
```

目前不植入关键词 stuffing，只在 meta description、JSON-LD、about 文案中自然包含。

---

## 八、未来内容 Hub 路线图

### Phase 1（当前）⚠️ 标记 Coming soon
- **Suburb showcase pages** — 为数据量足够的区（≥3 条）生成静态介绍页
- **How-to 内容** — "How to estimate your home value for free" / "如何免费估算你的澳洲房产价值"
- **Market glossary** — 房产术语中英文对照（property type definition / valuation methodology）

### Phase 2（数据稳定后）
- **Monthly market trend post** — 墨尔本各区域成交趋势简报
- **Suburb comparison tool** — 选择两个区域对比 median price、sales volume
- **Loan / LVR explainer** — 贷款比率如何影响购房预算的中文科普

### Phase 3（稳态后）
- **Investor Hub 内容解锁** — 教育内容、profile 问题、gated opportunity workflow
- **Guest posts / partner content** — 贷款经纪、过户律师合作内容
- **Weekly digest** — 每周更新成交记录简讯

内容 hub 形式：不在当前单页内增加复杂度。未来可开 `/blog/` 或 `/knowledge/` 子路径，用 Vercel 静态生成。

---

## 九、上线 / Coming soon 声明规则

| 功能 | 当前状态 | 标签 |
|---|---|---|
| Residential valuation (House/Townhouse/Villa/Unit/Apartment) | ✅ 已上线 | — |
| Vacant land valuation | ✅ 已上线 | 数据少（249 区全部为 House+Unit 数据） |
| Commercial valuation | 🔧 占位 UI | 按钮+占位文案显示 "Coming soon" |
| Nominatim address verification | ✅ 已上线 | — |
| PDF report download | ✅ 已上线 | — |
| Register + email notification | ✅ 已上线 | — |
| Investor Hub | 🔧 基础 UI | 注册后锁定 + "Coming soon" |
| Domain data | ❌ 被拦截 | 不展示 |
| NSW/QLD/WA 等州覆盖 | 🔧 Dropdown 可用 | 数据仅 VIC 充足，选其他州提示 "Coming soon" |
| Content Hub / Blog | ❌ 未上线 | 不提及 |

**核心原则：** 不对未上线功能做页面包装。Coming soon 的功能（Commercial、Investor Hub）已有透明文案说明状态。

---

## 十、Codex 审核要点

实施前需要 Codex 重点检查：

1. **结构变动不影响 JS** — 所有 CSS class 和 DOM id 必须保持 existing JS 的 querySelector 引用不被破坏
2. **About 文案长度** — 新增段落要在 `uiText` 对象中注册对应的 `textContent` 更新，否则多语言切换会覆盖硬编码 HTML
3. **json-ld 注入位置** — 建议放在 `</head>` 关闭前，避开 `chat-reply-panel` 等 JS 渲染区域
4. **robots.txt / sitemap.xml** — 纯静态文件，无风险
5. **Language toggle 覆盖** — 新增的 Footer 和 JSON-LD 不需要语言切换；footer 文案直接用 HTML 硬编码（不加入 `uiText` 对象）
6. **AI crawler 读取验证** — 用 `curl <url>` 测试初始 HTML 是否包含 description、canonical、json-ld

---

## 实施顺序

| # | 项目 | 依赖 | 工时估计 |
|---|---|---|---|
| 1 | `<head>` metadata + title + canonical + OG | 无 | ~15 min |
| 2 | robots.txt + sitemap.xml | 无 | ~5 min |
| 3 | JSON-LD Organization + WebSite | `1`（同 `<head>`） | ~10 min |
| 4 | homepage headline 调整 | `1` | ~10 min |
| 5 | About 文案修改 | `1` | ~15 min |
| 6 | Footer 添加 | 无 | ~10 min |
| 7 | Codex review + curl 验证 | `1-6` 全部 | ~15 min |
| 8 | Commit + deploy production | `7` | ~5 min |

**总计：约 1.5 小时（含审核）**

---

*方案先读，确认后分段实施。*
