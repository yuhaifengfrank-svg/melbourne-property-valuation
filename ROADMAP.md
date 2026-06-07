# AusHomeValue — 整合 Roadmap

## 现状总览

### 两个版本的分歧

| 维度 | HEAD（网站上跑着的） | 本地工作区（未 push） |
|------|---------------------|---------------------|
| 数据来源 | 硬编码 `valuations[]` 数组（12 条记录） | 实时 API + Puppeteer 抓取 |
| 估值计算 | 读预存数据，静态展示 | `valuation-engine.js` 动态计算 |
| 地址匹配 | alias 关键词匹配 | Nominatim (OSM) 免费反向地理编码 |
| 后端 | 纯静态，Vercel 托管 | Express 开发服务器 + Vercel serverless |
| 数据库 | 无 | Neon (PostgreSQL) |
| 地图 | 文字占位符"？"，无真正地图 | 同上，未改 |
| 可比数据 | 手工录入的 Oakleigh 附近数据 | 浏览器爬取 realestate.com.au / Domain |

### 网站直接暴露的问题
1. **Suburb 没有自动解析** — 用户输入完整地址，系统没有自动识别出 suburb
2. **地图是纯文本** — Google Map 未嵌入
3. **Comparables 错位** — 349 Moray St 显示的是 Oakleigh 的可比数据
4. **置信度 Low** — 因为没有 South Melbourne 的预存数据

---

## Phase 1：整合并上线（1-2 天）

### 1.1 文件合并

| 任务 | 描述 |
|------|------|
| 确认 `app.js` 前端代码 | 本地版已改为调 `/api/valuation` API，确认 Vercel 上这个路径能工作 |
| 部署 `api/valuation.js` | Vercel serverless endpoint，依赖 `lib/` 下面的模块 |
| 检查 Neon DB 连接 | DB schema 在 `lib/db-schema.js`，确认数据库已创建 |
| 测试 dev-server | `dev-server.mjs` 是 Express 本地开发环境 |
| 合并 `package.json` | 本地版新增了 puppeteer 等依赖，确认 Vercel 支持 |

### 1.2 关键 Bug 修复

| 任务 | 描述 |
|------|------|
| 地址自动解析 | 用户输入完整地址（如"349 Moray Street, South Melbourne VIC"），自动填充 State 和 Suburb 下拉框 |
| Google Geocoding 校验 | 用 Nominatim（免费）/ Google Geocoding API 把地址解析成标准格式 + 坐标 |
| 地图组件 | 嵌入 Google Maps 或 Leaflet，显示标注点 |
| Comparables 显示 | API 返回的可比成交渲染到表格里 |

### 1.3 提交上线

```bash
git add .
git commit -m "Phase 1: Integrate live valuation API + address parsing + map"
git push
# → Vercel 自动部署
```

---

## Phase 2：估值引擎完善（3-5 天）

### 2.1 数据管道

| 任务 | 描述 | 优先级 |
|------|------|--------|
| ABS 数据接入 | `lib/abs-client.js` — 免费获取 SEIFA 评分、收入、人口等 | 高 |
| VicPlan 数据 | `lib/vicplan-client.js` — 规划分区、土地用途 | 高 |
| RBA 利率 | `lib/rba-client.js` — 宏观经济因子 | 中 |
| 浏览器采集器 | `lib/browser-collector.js` — Puppeteer 抓取 realestate.com.au / Domain 可比成交 | 高 |

### 2.2 估值算法

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 可比成交基线 | `valuation-engine.js` — 加权平均 | 高 |
| 置信度评分 | 基于数据量、地址匹配度、时间衰减 | 高 |
| 调整因子 | 土地面积、房况、位置、规划风险 | 高 |
| 宏观经济调整 | SEIFA + 利率 + 人口趋势 | 中 |

### 2.3 回测框架

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 历史成交数据回测 | 用已售数据验证估值准确性 | 中 |
| 误差分析 | MAPE（平均绝对百分比误差） | 中 |

---

## Phase 3：用户体验提升（3-5 天）

### 3.1 地址输入

| 任务 | 描述 |
|------|------|
| Google Places 自动补全 | 输入时自动弹出地址提示 |
| 模糊匹配 | 拼写错误容忍（"melnourne" → "Melbourne"） |
| 多地址支持 | Unit / Apartment 号码解析 |

### 3.2 地图

| 任务 | 描述 |
|------|------|
| Google Maps / Leaflet 嵌入 | 显示房产位置、可比成交标注 |
| 街道排名可视化 | 热力图或颜色标记 |
| 附近设施标注 | 车站、学校、商圈、医院 |

### 3.3 报告

| 任务 | 描述 |
|------|------|
| PDF 报告完善 | 现有 `createPdfDocument()` 已可用 |
| 证据上传 | 照片、Section 32、title 上传 |
| 多语言完善 | 现有中英文切换，补充更多翻译 |

---

## Phase 4：业务功能（5-7 天）

### 4.1 用户系统

| 任务 | 描述 |
|------|------|
| 线索捕获 | 已有 `api/leads.js` + Neon DB |
| 客户管理后台 | `admin.html` + `admin.js` 已存在 |
| 邮件通知 | 已有 lead notification 逻辑 |
| PDF 下载校验 | 电话 + 联系人授权 |

### 4.2 Investor Hub

| 任务 | 描述 |
|------|------|
| 投资主题模块 | Private credit / Development / Income property |
| 客户画像 | 基于搜索历史推荐 |

### 4.3 LVR 贷款计算器

| 任务 | 描述 |
|------|------|
| Loan / LVR 场景 | 现有 `renderLoanScenario()` |
| 贷款额度估算 | 基于估值 + LVR 比例 |

---

## Phase 5：增长 & 运维（持续）

### 5.1 数据覆盖

| 任务 | 描述 |
|------|------|
| Metropolitan Melbourne 全覆盖 | House → Townhouse → Villa → Unit → Apartment |
| 扩展到全澳 | Sydney → Brisbane → Adelaide → Perth |

### 5.2 监控

| 任务 | 描述 |
|------|------|
| Vercel 部署监控 | 自动部署状态检查 |
| API 错误日志 | 前端错误上报 |
| 用户行为分析 | 搜索频率、完成率 |

### 5.3 SEO & 获客

| 任务 | 描述 |
|------|------|
| Google Search Console | 每个地址生成独立页面 |
| 多语言 SEO | 中英文内容 |
| 微信获客 | 已有 WeChat QR code |

---

## 当前优先行动项

```
✅ Oakleigh 试点已闭环 (codex-review 分支)
  └─ database_verified 证据模式端到端验证通过
  └─ 5 条 dual-source verified Oakleigh House comparables
  └─ Vercel Preview: https://aushomevalue-ivwmgrpyb-frankyhf.vercel.app
  └─ Bypass secret: ITjjX17XAJEdcGclzNGJSTrfUS66cHxc

→ Codex 最终审查 → 决定是否合并 main
```

---

## 技术债务清单

- [x] `app.js` 从硬编码改为调 API（本地版已完成）
- [x] Oakleigh pilot `database_verified` mode end-to-end
- [x] `parseReaSold` 日期提取修复（

## v0.3 — 2026-06-07 — Single-source Pilot Launch

### Product Decision
- 允许 REA 单一来源，尽快上线
- Domain 恢复后升级为 cross-source

### Status System
- cross_source_verified — 双源匹配
- single_source_observed — 单源但字段完整
- unverified — 字段不足

### Evidence Mode
- database_single_source — ≥5 single_source_observed
- database_verified — ≥1 cross_source_verified

### Constraints
- 单来源置信度上限 Low-Medium
- 报告含披露声明
- 至少 5 条同类型记录才触发估值
