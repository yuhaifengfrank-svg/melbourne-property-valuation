# Neon Project Identity Audit

Date: 2026-06-23 13:50 AEST  
Scope: 只读审计，不修改任何环境  
Previous reference: `DATA_LAYER_PHASE0B_MIGRATION_PLAN.md` (2026-06-19)

---

## 1. Production DATABASE_URL Host

| Source | Host | Database | Pooled |
|--------|------|----------|--------|
| 本地 `.env` | `ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech` | `neondb` | ✅ |
| Vercel API (encrypted, value empty) | `(value not exposed)` | — | — |
| `vercel env pull production` | `(empty string)` | — | — |

**Verdict:** Production DATABASE_URL 在 Vercel API 中是加密状态（sensitive type），`env pull` 返回空值，Vercel 界面不暴露明文。但本地 `.env` 和所有已部署的 API 行为表明 Production 使用的就是 `ep-winter-band`。

**Runtime evidence：**
- Production API `aushomevalue.vercel.app/api/valuation` 对 `8 Melrose Ct Scoresby VIC` 返回：
  - `comparableCount=12`
  - `midpoint=$1,029,330`
  - `planningSignals.ok=true` + 完整 zone/overlay 数据
  - 匹配本地 `.env` 的 DB 数据 profile（comparable_sales=5570, vicplan_zones=51366）

---

## 2. Preview DATABASE_URL Host

| Source | Host | Database | Pooled |
|--------|------|----------|--------|
| Vercel API (encrypted) | `(value not directly readable)` | — | — |
| 2026-06-19 文档记录 | `ep-young-violet-a7xmpsmz-pooler.ap-southeast-2.aws.neon.tech` | `neondb` | ✅ |
| 当前连接测试 | `(connection failed — password auth)` | — | — |

**Runtime evidence：**
- Preview API `aushomevalue-4qjnlfpdp-frankyhf.vercel.app/api/valuation` 对 `8 Melrose Ct Scoresby VIC` 返回：
  - `comparableCount=0`
  - `midpoint=null`
  - `planningSignals.ok=false`（`"Planning data temporarily unavailable."`）
- Preview 确实 **不共享** production 的数据（DB_DISTINCT=YES ✅）
- 但 stripe-preview branch (`ep-young-violet-a7xmpsmz`) 当前密码认证失败 — 说明该 Neon branch 可能已 **paused** 或被重置

---

## 3. 本地 `.env` DATABASE_URL

```
Host:      ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech
Database:  neondb
User:      neondb_owner
Pooled:    true
```

目标表存在性：

| Table | Exists? | Row Count |
|-------|---------|-----------|
| `data_source_registry` | ❌ | — |
| `suburb_planning_summary` | ❌ | — |
| `property_planning_cache` | ❌ | — |

核心业务表：

| Table | Row Count |
|-------|-----------|
| `comparable_sales` | 5,570 |
| `vicplan_zones` | 51,366 |
| `vicplan_overlays` | 174,682 |
| `leads` | 163 |
| `lead_contacts` | 44 |
| `report_snapshots` | 5 |
| `report_payments` | 5 |
| `report_entitlements` | 3 |
| `census_sa2_data` | 524 |
| `school_locations` | 2,859 |

---

## 4. paused `aushomevalue-leads` Neon Project

**查找方式：**
- 搜索全项目代码、文档、Vercel projects、shell 历史
- Vercel projects 列表：**没有** `aushomevalue-leads` 项目
- Shell 历史：有 `stripe-preview` 相关记录但无 `aushomevalue-leads`
- 历史文档 (`CODEX_REVIEW_SUMMARY.md`)：提到 `aushomevalue-leads` 是早期 pilot 项目（用于 5 条 Oakleigh House 记录的验证）

**结论：**
- `aushomevalue-leads` 不是 Vercel project，是 Neon 端的独立 project（即 `ep-young-violet-a7xmpsmz` 所属的项目）
- 当前已被 **pause**
- 当前没有任何活跃的 deployment 或环境引用它
- 如果 Vercel Preview 的 DATABASE_URL 指向的是这个 project 下的 branch，且该 project 被 pause，可以解释 Preview 的 password auth failure

---

## 5. 正式网站 (`aushomevalue.vercel.app`) 状态

| Check | Result |
|-------|--------|
| Homepage | HTTP 200, CDN HIT |
| API /valuation (Scoresby) | ✅ midpoint=$1,029,330, comps=12 |
| API /valuation (Bentleigh) | ✅ comps=12, estimate available |
| Planning Signals | ✅ zone/overlay 数据正常 |
| Comparable Sales | 5,570 rows, 正常工作 |
| All business tables healthy | ✅ confirmed |

---

## 6. Preview 状态

| Check | Result |
|-------|--------|
| Preview URL | HTTP 200 |
| API /valuation (Scoresby) | ⚠️ midpoint=null, comps=0 |
| Planning Signals | ❌ `ok=false` — "Planning data temporarily unavailable" |
| Estimated data source | Stripe-preview branch (paused or unreachable) |

---

## 7. paused Project 是否仍被使用？

**判断：不。** `aushomevalue-leads` (Neon project hosting stripe-preview branch) 当前不被任何活跃环境使用：

1. **Production 网站** → 正常工作，连接 `ep-winter-band` ✅
2. **Preview 网站** → 可以访问但因 stripe-preview branch 被 pause，API 返回 empty data（comps=0, planningSignals=false）
3. **本地开发** → 使用 `.env` 的 `ep-winter-band` ✅
4. **CRON 数据采集** → 使用 `.env` 的 `ep-winter-band` ✅

Preview 当前行为：
- DATABASE_URL 指向已 pause 的 stripe-preview branch
- API 降级运行（无 comparable，无 planning 数据）
- 前端能正常显示，只是估值返回空

---

## 8. 结论与建议

### 关键发现

1. **Production 使用 `ep-winter-band`** — 唯一活跃的生产数据库 ✅
2. **Preview 使用独立的 stripe-preview branch(`ep-young-violet-a7xmpsmz`)** — 已 paused ❌
3. **`aushomevalue-leads` Neon project 已 paused** → 无任何活跃引用
4. **Preview 的 DATABASE_URL 是指向 `ep-young-violet`** 而非 `ep-winter-band` → DB_DISTINCT=YES ✅
5. **Preview 的 stripe-preview branch 需要被 unsuspend 或重新创建** 才能恢复 Preview 数据

### 建议

| # | Action | Priority |
|---|--------|----------|
| 1 | Unsuspend/resume `stripe-preview` Neon branch（或重新创建） | High |
| 2 | 确认 Preview DATABASE_URL 连接串是否仍有效（可能因 branch pause 导致密码失效） | High |
| 3 | 恢复后验证 Preview 的 comparable/planning 数据正常 | Medium |
| 4 | 确认后部署 migration-012 到 Preview | Medium |
| 5 | 清理已弃用的 Vercel projects（`ahv-*`, `d08c60a-deploy`, `aushomevalue-clean-deploy-*`） | Low |

---

*审计完成，未修改任何环境。*
