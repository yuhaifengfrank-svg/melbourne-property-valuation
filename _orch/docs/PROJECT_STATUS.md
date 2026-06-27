# PROJECT_STATUS.md — AusHomeValue Oracle Data Factory

**Last updated:** 2026-06-26 17:30 AEST
**Author:** 玄甲

---

## Core Architecture

```
Oracle VM (数据湖 + 计算)
  ├── raw/          ← CDP 原始采集 + VicPlan GeoJSON 备份
  ├── processed/    ← 清洗中间数据
  ├── artifacts/    ← 标准化输出（仅这些进 Neon）
  │
  └── sync_artifact.py → Stage Neon → Production Neon → Vercel
```

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| 1A — VM provisioning | ✅ | Ubuntu 24.04, Python 3.12, psycopg2 |
| 1B — Artifact generation | ✅ | 3 artifacts generated on VM |
| 1C — Stage sync | ✅ | dry-run → verify → sync all passed |
| 1D — Promote to Production | ❌ | Blocked: 需先确认 promote 策略 + VM raw/ 架构落地 |
| API verification | ❌ | `/api/suburb-intelligence` untested |
| Git push main | ❌ | 2 commits un-pushed |

## Pipeline 更新（2026-06-26）

| 步骤 | 状态 | 说明 |
|------|------|------|
| Step 1 — Base metrics (price/rent/vacancy) | ✅ | 已有 |
| Step 2 — Vacancy fill | ✅ | 已有 |
| Step 3 — Growth projection | ✅ | 已有 |
| Step 3b — growth_score | ✅ | 已有 |
| Step 4 — gross_yield | ✅ | 已有 |
| Step 5 — SALM employment | ✅ | 已有 |
| Step 5.5 — G41 dwelling structure | ✅ **2026-06-26 新增** | dwelling_total, dwelling_separate_house, dwelling_flat, dwelling_3br_plus, dwelling_occupancy_rate |
| Step 5.6 — Housing per capita | ✅ **2026-06-26 新增** | supply_housing_per_capita, supply_housing_stock from G41 |
| Step 5.7 — vacancy_rate_adjusted fill | ✅ **2026-06-26 新增** | null 填补逻辑 |
| Step 5.8 — median fallback | ✅ **2026-06-26 新增** | 全局中位数填补 |
| Step 5.9 — **Undervaluation V2** | ✅ **2026-06-26 新增** | blended price + 5 因子 OLS → 0-100 UV score + label |
| Step 6 — Opportunity scoring | ✅ | 已有 |

### Undervaluation V2 详情

- **模型**: log(blended_price) ~ school_score + log(hhdIncome) + occupancy + log(distCBD) + supply_constraint
- **评分**: 60% 价格偏差 + 40% PIR 可负担性
- **R²**: 0.638 (233 VIC suburbs)
- **系数**: Intercept 12.6737, School 1.2715, log(Income) -0.0622, Occupancy 1.9550, log(distCBD) -0.1258, SupplyConstraint 0.0755
- **标签**: Attractive (<0.85), Fairly Valued (0.85-1.15), Overpriced (>1.15)

### VicPlan 迁移（2026-06-25 更新：52% cache hit，Phase C 暂缓）

| Phase | Status | Details |
|-------|--------|---------|
| A — VicPlan GeoJSON 备份到 VM | ✅ | zones(168MB) + overlays(149MB) → VM `raw/vicplan/` |
| B.1 — planning_cache 表创建 | ✅ | 3640 rows, 1.9 MB |
| B.2 — ETL 预计算 | ✅ | `scripts/build-planning-cache.mjs` 遍历 all 4dp 坐标点 |
| B.3 — API 改为 cache-first | ✅ | Production 已上线 ✅ |
| B.4 — 测试验证 | ✅ | Production 实测 25 例：13/25 cache hit(52%)，全部正确，0 错误 |
| **C — 删 Production 大表** | ⏳ | 52% 覆盖率不够安全。需优化 ETL Voronoi 采样密度至 95%+ |

**生产测试结果**：13/25 cache hit (52%)，全部 zone 正确；9/25 fallback (ST_Contains) zone 正确；3/25 null；0 错误。Cache miss 根因：本地 Nominatim vs Vercel 坐标差 100-200m，Voronoi grid 采样不够密。

**目标**: 释放 Production Neon 248 MB 空间（vicplan_zones 119MB + vicplan_overlays 129MB），被 1.9 MB planning_cache 替代。

---

## Artifact Summary

| Artifact | Source | Rows | Size | Target Table | Stage Sync | Production |
|----------|--------|------|------|-------------|------------|------------|
| `suburb_metrics` | ABS 2021 GCP | 524 | 212 KB | `suburb_metrics` | ✅ 524 rows | ❌ Not promoted |
| `vicplan_monash` | VicPlan Monash | 953 | 415 KB | `suburb_planning_summary` | ✅ 953 rows | ❌ Table missing |
| `rba_macro_full` | RBA F1/G1/H1/H5/J1 | 5,175 | 1.3 MB | `rba_macro_full` | ✅ 5,175 rows | ❌ Table missing |

---

## Production DB Tables

| Table | Rows | Size | Source | Notes |
|-------|------|------|--------|-------|
| comparable_sales | 7,304 | — | CDP cron | ❌ 架构违规，待迁移到 VM raw/ |
| suburb_metrics | 488 | — | Old pipeline | 待被 Stage 524 行覆盖 |
| census_sa2_data | 524 | — | ABS via cron | 保留 |
| **vicplan_zones** | **51,366** | **~119 MB** | VicPlan cron | ⏳ 待 Phase C 删除 |
| **vicplan_overlays** | **174,682** | **~129 MB** | VicPlan cron | ⏳ 待 Phase C 删除 |
| macro_indicators | 632 | — | RBA via cron | 保留 |
| **planning_cache** | **3,640** | **~1.9 MB** | **ETL (新)** | ✅ **VicPlan 替代表** |
| suburb_planning_summary | ❌ Production | — | Stage 就绪 | 等待 promote |
| rba_macro_full | ❌ Production | — | Stage 就绪 | 等待 promote |
| report_drafts | 1,866 | — | App | 保留 |
| report_snapshots | 5 | — | Paid reports | 保留 |
| lead_contacts | 45 | — | User collection | 保留 |

---

## Data Collection

| Task | Script | Scheduled | Status |
|------|--------|-----------|--------|
| Local daily (TOP 10) | `cron-daily.mjs` | crontab 07:00 Mon-Fri | ⏸️ 待迁移至 VM raw/ |
| Local weekly (core 50) | `cron-weekly.mjs` | crontab 07:00 (W-D) / 08:00 (SS) | ⏸️ 待迁移至 VM raw/ |
| OpenClaw batch (239 suburb) | `daily-batch-collection.mjs` | cron 03:00 6 jobs | ⏸️ 待迁移至 VM raw/ |
| OpenClaw weekly full | `weekly-refresh-collection.mjs` | cron 03:00 Sun | ✅ Last ran 4d ago |
| Macro data | `cron-macro.sh` | crontab Mon 06:00 | ⏸️ 待迁移至 VM raw/ |

---

## Key Architecture Decisions

1. **VM 做数据湖** — raw/processed/artifacts 三级目录，Neon 只存最终 artifact
2. **CDP 采集 → VM raw/ JSON** — 不再直接写 Neon comparable_sales
3. **`comparable_sales` 表待迁移** — 现有 7,304 行作为历史数据，新数据走 VM 路径
4. **Stage-first promote** — 所有数据先到 Stage 验证，再 promote 到 Production
5. **VicPlan 迁移策略** — Phase A→B→C 逐步右移，B.3 改 API cache-first 不影响线上功能

### VicPlan 约束

- VM **不开 PostGIS FDW** 给 Production API
- `postgres_fdw` **不作为短期方案**
- API 和 report **完全确认不再依赖实时 ST_Contains** 后，才删 Production 大表

## Known Blockers

### 🟢 长期阻塞
1. **Neon 密码已修复** — 本地 ✅，Vercel Production ✅
2. **SSH key mismatch** — 本地 Mac 无法 SSH 到 VM（2026-06-24 记录）
3. **`comparable_sales` 架构违规** — 原始数据不应在 Neon，待迁移至 VM raw/
4. **Chrome CDP 放置位置未定** — VM 还是本地 Mac
5. **raw JSON 存储格式未定** — 纯文件 vs SQLite

### 🟡 当前活跃阻塞
6. **Stage Neon 密码未知** — `neondb_owner@ep-patient-glade-a7lht4ta`，Production 密码不通用。无法在 Stage 做 stage-first ETL 测试
7. **VPA FUS ETL 崩溃** — Python 脚本 `fus_etl.py` 在第 12 行崩溃 `KeyError: 'coordinates'`。数据含 5 种几何类型（Polygon/MultiPolygon/GeometryCollection/LineString/null），代码只处理了 Polygon
8. **Infrastructure 评分无区分度** — 20 个项目 + 20km 半径 → top 20 suburb 全归一化 100。需扩项目 + 收紧半径
9. **外部数据源全挡** — Big Build (403 Cloudflare)、data.gov.au (HTML-only, 无 CKAN API)、Wikipedia (partial content)、DuckDuckGo (有限结果)
10. **Phase C 阻塞 → ✅ 今晚解决** — 方案 A suburb 网格已跑完（planning_cache 47,480→66,473 行）。明天验证 cache hit rate，确认 >95% 后删大表
