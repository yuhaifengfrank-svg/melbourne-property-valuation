# Codex Review Summary — Complete

**Branch:** `codex-review`（未合并 `main`）  
**HEAD:** `d508eb5`  
**Ahead of main:** 20 commits  
**Tests:** 28/28 pass  
**Vercel Preview:** 已部署并验证端到端估值  
**Database:** `aushomevalue-leads` (Neon, AWS Sydney) — `comparable_sales` 表，5 条 Oakleigh House 记录

---

## 已完成的全部修改

### Phase 1 — Live Valuation API Pipeline（b728779 → f53c4aa → 507a085）

- 新增 `api/valuation.js` Vercel Serverless handler（POST only）
- 新增 `lib/valuation-service.js` — 共享编排层，同时供 Vercel 和本地 dev-server 使用
- 新增 `lib/valuation-engine.js` — heuristics + comparable-based 估值引擎
- 新增 `lib/comparable-research-collector.js` — 采集 comparable、ABS SEIFA、VicPlan、Nominatim
- 新增 `lib/browser-collector.js` — CDP WebSocket scraper（仅本地 dev）
- 新增 `lib/comparable-source.js` / `lib/local-cdp-source.js` — 来源接口抽象
- 新增 `lib/abs-client.js` / `lib/vicplan-client.js` / `lib/rba-client.js` — 外部数据客户端
- 新增 `lib/db-schema.js` — 数据库表结构定义
- 新增 `dev-server.mjs` — Express 开发服务器
- 新增 `integration-test.mjs`（原17个测试 → 现28个）
- 新增 `regression-test.mjs` — 6 种物业类型回归测试（VM sandbox）

### Codex Rounds 1-3 — P0/P1 修复

- Leaflet DOM crash 修复（map container 加载时序）
- 删除 fake field defaults（不伪造数据）
- 证据标签 `evidence-badge` UI
- `live_verified` 条件严格化（≥3 cross-verified comps）
- 删除 marketing-video-demo 文件
- `isFallback` 加入 success path
- 证据标签移至 midpoint 旁边
- 跨来源验证逻辑（`sourceCount >= 1` → 匹配 Domain + REA 日期后 `crossChecked`）

### Rounds 4-7 — DatabaseComparableSource + 索引迁移

- 新增 `lib/db-comparable-source.js` — 从 Neon PostgreSQL 读取记录
- 新增 `scripts/sync-oakleigh.mjs` — Oakleigh 定时同步脚本
- DB 迁移：transaction/cs_dedup 索引（one-time，`migrate-cs-dedup-index.mjs`）
- SA2 code + postcode 真实传递（非伪造）
- 证据标签绑定 `acceptedComparables`（非全部 comparables）

### Rounds 8-9b — Codex 最终修复

- 删除 14 条硬编码静态估值
- SA2 code 真实入库
- CDP/DB 分支测试（mock DB / no DB / CDP live 三种路径覆盖）
- 冗余 fallback 链清理
- NaN 修复（price median 空值保护）
- 测试恢复至 28/28 全绿
- **Codex Round 9b 批准**

### Oakleigh Pilot — 端到端数据闭环

- Neon DB `aushomevalue-leads` 配置并连接成功
- 同步脚本 `sync-oakleigh.mjs` 采集 5 条 Oakleigh House 记录
- 原始证据 `original_evidence` JSONB 列：保存来源 URL、原始字段、页面摘要、采集时间
- Vercel Preview 部署，端到端验证：搜索 33 Tamar Grove → 返回估值 $1,291,930
- Domain.com.au 恢复（Akamai 限制已解除），当前数据：3 `cross_source_verified` + 2 `single_source_observed`

### 产品决策 — REA 单来源验证（最后 3 commits）

#### 验证状态三值化
| 状态 | 条件 | 示例 |
|------|------|------|
| `cross_source_verified` | 同一成交在 ≥2 个来源出现，日期一致 | REA + Domain 匹配 |
| `single_source_observed` | 仅 1 个来源，但 address + price + date + 列表页面 URL 齐全 | Domain only（REA 未收录） |
| `unverified` | 字段不全 | 不进入估值 |

#### 证据模式
| Mode | 触发条件 |
|------|----------|
| `database_verified` | ≥1 `cross_source_verified` |
| `database_single_source` | ≥5 `single_source_observed` |
| `research_only` | 不足以上条件 |

#### 置信度 — 动态综合评分（重写 `confidenceResult`）
- 连续型评分 0-100：综合 comparable 数量、核心 comps 比例、成交新鲜度（6个月以内）、cross-check 比例、平均 quality score、特征字段完整度（bed/bath/land）、VicPlan landuse 修正
- 离群度乘数：≤7.5%=1.0, ≤10%=0.9, >15%=0.6
- 单来源乘数：0%=1.0, ≤50%=0.90, >50%=0.80
- 等级映射：High(≥78 + ≥3 cross-checked), Medium-High(≥65 + ≥2), Medium(≥50), Low-Medium(≥30), Low(<30)
- 客户只看到最终标签（如 `Medium`），不披露内部权重/来源等级

#### 客户端输出安全
- `api/valuation.js` 输出前 sanitize：`acceptedComparables` 只保留 `address`/`salePrice`/`saleDate`/`distanceMeters`/`bedrooms`/`bathrooms`/`carSpaces`/`landSize`
- 不暴露：`sourceUrl`/`sourceName`/`verificationStatus`/`_sourceMode`/`qualityBand`/`qualityScore`/`adjustments`/`weight`/`qualityBreakdown`
- API 返回统一免责声明（中英文）
- 前端 comparables 展示：地址、成交价、成交日期、距离（4 列）

#### 生产建议
- 当前 Vercel Preview 以 `database_verified` 模式提供服务
- 要上线需：配置 `DATABASE_URL` 环境变量 → 部署 production

---

## 当前技术状态

```
浏览器表单 ──POST──> /api/valuation ──> runValuation()
                              │
                              │ useDatabaseFallback: true
                              │ DatabaseComparableSource (Neon)
                              │ 5 Oakleigh House comps
                              │
                              └──> evidenceMode: database_verified
                                   confidence: Medium (dataScore: 55)
                                   3 cross_source_verified + 2 single_source_observed
                                   acceptedComparables sanitized for client
                                   统一免责声明已嵌入
```

## 新增文件清单

| 文件 | 作用 | 状态 |
|------|------|------|
| `lib/valuation-service.js` | 共享编排层 | ✅ |
| `lib/comparable-research-collector.js` | 数据采集编排 | ✅ |
| `lib/browser-collector.js` | CDP WebSocket scraper | ✅ |
| `lib/valuation-engine.js` | 估值引擎 + 置信度评分 | ✅ |
| `lib/comparable-source.js` | 来源接口抽象 | ✅ |
| `lib/local-cdp-source.js` | CDP 来源实现 | ✅ |
| `lib/db-comparable-source.js` | DB 来源实现 | ✅ |
| `lib/abs-client.js` | ABS SEIFA 客户端 | ✅ |
| `lib/vicplan-client.js` | VicPlan 分区客户端 | ✅ |
| `lib/rba-client.js` | RBA 利率客户端（当前返回空） | ✅ |
| `lib/db-schema.js` | 数据库表结构 | ✅ |
| `scripts/sync-oakleigh.mjs` | Oakleigh 定时同步 | ✅ |
| `api/valuation.js` | Vercel Serverless | ✅ |
| `dev-server.mjs` | 本地开发服务器 | ✅ |
| `integration-test.mjs` | 28 个集成测试 | ✅ |
| `regression-test.mjs` | 6 类型回归测试 | ✅ |
| `migrate-cs-dedup-index.mjs` | DB 索引迁移 | ✅ |

## 28 项测试覆盖

- P0: app.js 语法、service 契约一致、前端不伪造 comparables
- P1: Vercel 降级/本地 live/research_only/fallback 路径、缺失字段为 null、Mock DB database_single_source、CDP priority、证据标签绑定、DB 不可用时 unavailable
- 物业类型：House/Unit/Apartment/Townhouse/Villa/Vacant land 不崩溃
- 注册/索引迁移、cron 隔离

## 未解决的问题（已知但无需修改）

| 问题 | 说明 |
|------|------|
| RBA 利率客户端返回空 | 数据源问题，不影响当前估值 |
| `res.json is not a function` | regression-test.mjs VM mock 的兼容性警告，无害 |
| `app.js` ~3100 行 | 可拆分但低优先级 |
| Domain 单来源（2 Norfolk, 5 Saxon） | REA 不将其展示为 House 类型，不可修复；维持 `single_source_observed` |
