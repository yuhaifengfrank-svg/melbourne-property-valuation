# HANDOVER.md — Project Context Recovery

**Last updated:** 2026-06-26 22:50 AEST
**Author:** 玄甲
**Purpose:** Rapid context recovery for any new session/agent in ≤1 minute.

> ⚠️ **目录注意：** 项目完整代码在 **`澳洲房地产评估系统`**（1,194 文件、git 仓库）。还有一个空壳目录 `澳洲房地产评估System` 已被删除。两个是独立真实目录不是 symlink。部署跑错目录会覆盖生产。

---

## Project Identity

- **Project:** AusHomeValue (澳洲房地产评估系统)
- **Repo:** `git@github.com:yuhaifengfrank-svg/melbourne-property-valuation.git`
- **Local:** `/Users/FrankAI/Documents/澳洲房地产评估系统`（唯一项目目录）
- **SSH alias:** `vm-aushomevalue`（Key: `~/.ssh/vm-aushomevalue.key` → `ubuntu@161.33.90.191`）
- **Branch:** `main` (未 push commits)
- **Production URL:** https://aushomevalue.vercel.app
- **VM:** Ubuntu 24.04, 38GB free, Python 3.12 installed
- **Stage Neon:** `ep-patient-glade-a7lht4ta-pooler.ap-southeast-2.aws.neon.tech`
- **Production Neon:** `ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech`

---

## Current Phase: 管线完善 + Growth Corridor 设计 + 内容准备

三个并行方向：

| 方向 | 状态 | 负责人 |
|------|------|--------|
| 🔧 数据管线完善（refresh-suburb-metrics.js） | ✅ Step 1→5.9 全部完成 | 玄甲 |
| 📐 Growth Corridor Score 设计 | ✅ 框架定稿，0 行代码 | 玄甲/小鱼 |
| 📝 小红书内容准备 | ✅ Doncaster 数据包已交付，等用户启动 | 小鱼 |

---

## 数据管线总览 — refresh-suburb-metrics.js

**位置**: `lib/refresh-suburb-metrics.js`
**入口**: `refreshSuburbMetrics()`
**范围**: 仅 `state = 'VIC'`
**模式**: `INSERT ... ON CONFLICT (suburb, state) DO UPDATE` — 只覆盖有新鲜数据的列，遗留数据保留

### 执行顺序（10 步）

| 步骤 | 名称 | 写入字段 | 数据源 | 状态 |
|------|------|----------|--------|------|
| 1 | Base upsert | median_house_price, median_unit_price, median_combined_price, median_rent, school_score, gross_yield, vacancy_rate, vacancy_rate_adjusted | comparable_sales, school_locations, school_profiles, census_sa2_data (G02/G36/G41) | ✅ |
| 2 | Vacancy fill (unmapped) | vacancy_rate (global avg) | — | ✅ |
| 3 | Growth projection | growth_1y, growth_3y, growth_5y, vgv_cagr_* | growth-projector.js + comparable_sales | ✅ |
| 3b | growth_score | growth_score (0-100) | vgv_cagr_10y + growth_5y + vgv_combined_cagr | ✅ |
| 4 | gross_yield fill | gross_yield | median_rent × 52 / median_house_price | ✅ |
| 5 | SALM employment | supply_unemployment_rate, supply_employment_growth, conf_income | salm_sa2_data | ✅ |
| 5.5 | G41 dwelling | dwelling_total, dwelling_separate_house, dwelling_flat, dwelling_semi_detached, dwelling_3br_plus, dwelling_1br_2br, dwelling_occupancy_rate | census_sa2_data (G01/G37/G41) | ✅ **2026-06-26 新增** |
| 5.6 | Housing per capita | supply_housing_per_capita, supply_housing_stock | G41 total_dwellings + G01 population | ✅ **2026-06-26 新增** |
| 5.7/5.8 | vacancy_rate_adjusted fix | vacancy_rate_adjusted (zone multipliers + median fallback) | — | ✅ **2026-06-26 新增** |
| 5.9 | **Undervaluation V2** | undervaluation (0-100), undervaluation_label | 5 因子 OLS (blended price) | ✅ **2026-06-26 新增** |
| 6 | Opportunity scoring | opportunity_score, opportunity_type | opportunity-scoring-v2.js | ✅ |

---

## 🔧 管线完善详情

### 自住率修复（2026-06-26）

`dwelling_occupancy_rate` 之前错误地计算了 persons/dwelling（每户人数），已修复为真正的自住率:
- 公式: `(O_OR_Total + O_MTG_Total) / Total_Total` from Census G37
- 覆盖 233/248 VIC suburbs

### G41 全面写入

从 census_sa2_data G41 (dwelling_structure) + G37 (tenure) 写入 7 个字段:

| 字段 | 含义 | 来源 |
|------|------|------|
| dwelling_total | 总住房数 | G41 total_dwellings |
| dwelling_separate_house | 独立屋 % | G41 sep_house_pct |
| dwelling_flat | 公寓 % | G41 flat_pct |
| dwelling_semi_detached | 半独立 % | G41 semi_pct |
| dwelling_3br_plus | 三房以上 % | G41 pct_3br_plus |
| dwelling_1br_2br | 一至二房 % | G41 pct_1br_2br |
| dwelling_occupancy_rate | 自住率 | G37 (O_OR + O_MTG) / Total |

### Undervaluation V2（Step 5.9 — 已上线）

写入 `suburb_metrics.undervaluation` (0-100, 越高越被低估) + `undervaluation_label`。

**模型**: OLS 回归，blended price = house × sep_house% + unit × (1 - sep_house%)
- 被解释变量: `log(blended_price)`
- 解释变量: `school_score/100 + log(hhdAnnualIncome) + occupancy/100 + log(distCBD_km+1) + supply_constraint/100`
- 系数（**预计算自 233 VIC suburb，R²=0.638**，若模型漂移需在 `scripts/` 下重跑回归并更新硬编码系数）:

| 项 | 系数 | 说明 |
|---|------|------|
| Intercept | 12.6737 | — |
| School (×1.2715) | 1.2715 | 学校越好价越高 |
| log(Income) (× -0.0622) | -0.0622 | 收入系数微负（可能 multicollinearity） |
| Occupancy (×1.9550) | 1.9550 | 自住率越高价越高 |
| log(distCBD) (× -0.1258) | -0.1258 | 越远越便宜 |
| SupplyConstraint (×0.0755) | 0.0755 | 供应约束越高越贵 |

**评分公式**:
- `UV = 60% × 偏差分 + 40% × 可负担分`
- 偏差分: `(1.3 - ratio) / 0.6 × 100` (ratio=实际/理论, 0.7→100, 1.3→0)
- 可负担分: `(15 - PIR) / 10 × 100` (PIR ≤5→100, ≥15→0)
- Label: ratio <0.85→Attractive, >1.15→Overpriced, else→Fairly Valued

**目标 suburb 结果**: Doncaster UV=24, Point Cook UV=85, Sunshine UV=52, Docklands UV=100

**当前约束**: SeparateHouse 系数为负（高密度公寓区干扰），用户说「先这样有改进再搞」

---

## 📐 Growth Corridor Score 设计

### 五层加权架构（用户定稿）

| 层 | 权重 | 逻辑定位 | 数据状态 |
|---|------|---------|---------|
| Planning（规划） | **30%** | 最领先信号 | ❌ 无数据(VPA FUS GeoJSON 在 VM) |
| Supply（未来供应） | **25%** | 供需核心 | ❌ 无数据管线 |
| Population & Demographics | **20%** | 真实需求 | ✅ 有 Census 骨架 |
| Infrastructure（基础设施） | **15%** | 放大需求 | ❌ 全部为 0 (infrastructure_score) |
| Market Validation（市场验证） | **10%** | 验证模型 | ✅ 数据最全 |

### Infrastructure 层数据源（用户确认）

| 类别 | 数据来源 | 更新频率 |
|------|---------|---------|
| Rail | DTP GTFS + Big Build | 持续 |
| SRL | SRL 公开 GIS | 项目更新 |
| Road | Big Build | 项目更新 |
| School | Department of Education | 年度 |
| Hospital | Victoria Health | 年度 |
| Employment | ABS Journey to Work + Activity Centres | Census + 规划 |
| Park | OpenStreetMap + Vicmap | 持续 |
| Government Projects | Victorian Budget + Big Build + Council Capital Works | 每年 |

### 当前状态

- ✅ 框架定稿、权重确认
- ✅ 数据源清单确认
- ✅ 设计文档: `docs/GROWTH_CORRIDOR_SCORE.md`
- ❌ 0 行实现代码 — L1-L5 目前全空
- ⏳ 阻塞: 需要先建数据管线再写 `compute-growth-corridor-score.mjs`

---

## VicPlan 迁移现状

**策略**: Phase-by-phase 逐步右移，不影响线上功能。

| Phase | Status | Details |
|-------|--------|---------|
| A — VicPlan 原始 GeoJSON 备份到 VM | ✅ | zones(168MB) + overlays(149MB) → VM `raw/vicplan/` |
| B.1 — `planning_cache` 表创建 | ✅ | SQL 外键独立，Key: lat_lon_key(TEXT PK) |
| B.2 — ETL 预计算 (3640 坐标点) | ✅ | 遍历 comparable_sales 所有 unique 4dp 坐标，ST_Contains |
| B.3 — API 改为 cache-first | ✅ | PRODUCTION 已上线！先查 cache，miss 回调 ST_Contains |
| B.4 — 测试验证 | ✅ | Production 上 52% cache hit，全部 zone 正确，0 错误 |
| ★ C — 删除 Production 大表 | ✅ **2026-06-26 方案 A 已跑，等明日验证** | planning_cache 从 47,480 → 66,473 行 (+18,993). 明日在 Production 验证 cache hit rate，确认 >95% 后删 vicplan_zones (119MB) + vicplan_overlays (129MB) |

**Phase B 关键坑：**
- Vercel Preview 无 DATABASE_URL → planningSignals: null（已修复：加 env）
- 本地 Nominatim vs Vercel 坐标差 100-200m → cache key 不匹配 → 做了 330m 近似匹配
- 52% cache hit 原因：ETL Voronoi grid 采样密度不足，部分地址最近 cache 点超 330m

---

## Oracle Data Factory — Phase 1C 阻塞

| Step | Status | Notes |
|------|--------|-------|
| 1A VM provisioning | ✅ | Done |
| 1B Artifact generation | ✅ | 3 artifacts ready |
| 1C Stage sync | ✅ | Verified |
| **→ Production promote** | ❌ | 阻塞，待 VicPlan Phase C + 数据源扩展后再做 |
| **→ API verification** | ❌ | `/api/suburb-intelligence` 未测试 |

---

## 数据源扩展状态

| # | 数据源 | 路径 | 状态 | 下一步 |
|---|-------|------|------|--------|
| 0 | **DFFH Rental Report** ✨ | A | ✅ **2026-06-25 已上线生产** — DFFH 2025 Sep 租金替代 Census 2021（459/488 suburb, 94% 覆盖） | 定期 XLSX 替换，重跑 ETL |
| 1 | **VPA FUS Land Use** ⭐ | B→A | ✅ 17MB GeoJSON 已下到 VM raw/（8521 features, 87 PSP） | ETL 入 Stage Neon → 新表 `vpa_fus_landuse` |
| 2 | **Infrastructure VIC** ⭐ | A | ⚠️ 20 条项目，v1 name match 仅 9 suburb 有分；v2 Haversine 400 suburb 有分但 top 20 全归一化 100 | 手动插 30+ 项目 + 收紧半径 (10km/2km) + 重跑 |
| 3 | **Vicmap Property (Metro)** | B | ⚠️ 估算 1.4GB metro 范围，VM 分批下载 | 下载后只存属性 + centroid |
| 4 | **Crime Stats** | A | ❌ 未接入 | 直接 CSV 拉 |
| 5 | **ABS Building Approvals** | A | ❌ 未接入 | ABS API |
| 6 | **VIF2023 人口预测** | A | ⚠️ 已发现，DataVic 有 XLSX | 下载转 CSV |
| 7 | **School Zone Polygons** | B | ❌ 未探索 | DataVic 下载 |
| 8 | **EPA / BOM** | A | ❌ 未接入 | API 小数据 |

**VM raw/ 已有数据：**
- `vicplan_zones.geojson` (168MB) — ✅ Phase A 备份
- `vicplan_overlays.geojson` (149MB) — ✅ Phase A 备份
- `fus_landuse.geojson` (17MB) — ✅ VPA 新区数据
- `vicprop_metro_sample.geojson` (87KB) — ✅ Vicmap 样本

### infrastructure_score 现状

`suburb_metrics.infrastructure_score` **全部为 0**。已有两版脚本但都不可用：

| 版本 | 算法 | 结果 | 问题 |
|------|------|------|------|
| v1 `compute-infrastructure-scores.mjs` | suburb name exact match | 仅 9/488 suburb 有分 | 只有 suburb 名命中的才有值 |
| v2 `compute-infrastructure-scores-v2.mjs` | Haversine 20km/3km 平方衰减 | 459 suburb 有坐标，400 有分 | 项目太少 + 半径太宽 → top 20 全归一化 100，无微分 |

**v2 算法参数**：
- MAX_RADIUS_KM=20, IDEAL_RADIUS_KM=3
- budgetScore = log10(budgetM+1)×9, cap 40
- typeMultiplier: transport=1.5, health=1.3, education=1.0, mixed_use=1.2
- timelineDiscount: completed=1.0, constructing=0.9, planned=0.7, planning=0.3
- 超出 IDEAL 衰减: (1 - ((d-ideal)/(max-ideal)))^2
- 归一化 0-100

**阻塞原因**：外部数据源全挡（Big Build 403, data.gov.au HTML-only）；只有 20 条项目，SRL North ($55B) 等巨无霸项目让所有近郊爆 cap。

**下一步**：手动 INSERT 30+ 已知 Melbourne 基建项目 → 收紧 10km/2km → 加项目数量次级因子 → 重跑

### VPA FUS 接入方案

```
VM raw/fus_landuse.geojson (EPSG:28355)
    ↓ VM Python: 重投影 → EPSG:4326 → 提取 centroid + 属性表
    ↓ artifact: vpa_fus_landuse.csv
    ↓
Neon stage: vpa_fus_landuse 新表
    ↓ verify → promote
    ↓
Neon production
    ↓
新脚本: compute-supply-signals.mjs → 更新 suburb_metrics.supply_growth_corridor_score
    ↓
新服务: vpa-signal-service.js → 逐个物业坐标查 PSP
```

### DFFH Rental Report — 2026-06-25 上线

**数据源**: 维州家庭、公平与住房部(DFFH) Rental Report，[下载地址](https://www.dffh.vic.gov.au/publications/rental-report)
**文件**: Moving annual median rent by suburb and town - September quarter 2025 (XLSX, 1.1MB)

**数据特点**:
- 12 个 DFFH 市场区域（Inner Eastern Melbourne, Southern Melbourne 等）
- 163 suburb/town 条目 + 12 个 SA3 Group Total 聚合值
- 最新 2025 年 9 月，每季度更新（2000 年 3 月起）
- 来源：真实的 Bond lodgement 记录（vs Census 自报，更具时效性）

**ETL 过程**:
1. XLSX 解析 → `dffhExact` 字典（108 精确 suburb 匹配）
2. ABS SA3 → DFFH SA3 映射（硬编码 70+ ABS SA3 → 12 个 DFFH 市场区域）
3. SA3 聚合填补（351 suburb 按区域共享均值）
4. 写入 `suburb_metrics.median_rent_dffh` + `median_rent_source`

**覆盖**: 459/488 suburb (94%)，29 无数据（远郊/大小写重复）

**代码文件**:
- ETL: `/tmp/etl-dffh-rent-v2.cjs`（下次更新只需替换 XLSX 重跑）
- SQL: 新增列 `median_rent_dffh` (INTEGER) + `median_rent_source` (TEXT)

**API 接入**（2026-06-25 Prod 上线）:
- `api/valuation.js`: SQL 加 `median_rent_dffh`, `median_rent_source`
- `lib/future-opportunity-outlook.js`: `medianRent` fallback 链改为 DFFH 优先
- `api/opportunity.js`: SQL + `mapOpportunityRow` 改为 `median_rent_dffh` 优先
- `lib/opportunity-service.js`: `loadSuburbData` 新增 DFFH 批查询，`calcCashFlowScore` 优先 DFFH

**Fallback 链**: `median_rent_dffh` → `medianRent` / `median_rent` → `medianHouseRent` / `median_house_rent`

**租金对比（Census 2021 vs DFFH 2025 Sep）**:
| Suburb | Census 2021 | DFFH 2025 Sep | 涨幅 |
|--------|:----------:|:------------:|:---:|
| Box Hill | $391 | $610 | +56% |
| Brighton | $600 | $825 | +38% |
| Clayton | $380 | $600 | +58% |
| Oakleigh | $415 | $670 (SA3) | +61% |
| Werribee | $315 | $550 | +75% |

**更新流程**: 每季度下载新 XLSX → 替换 `/tmp/dfhh_rent_sep2025.xlsx` → 重跑 `node /tmp/etl-dffh-rent-v2.cjs`

---

## Production DB Tables

| Table | Rows | Size | Status |
|-------|------|------|--------|
| vicplan_zones | 49500 | 114 MB | ⏳ Phase C 等待明天验证后删 |
| vicplan_overlays | 174682 | 129 MB | ⏳ Phase C 等待明天验证后删 |
| planning_cache | 66473 | 3.2 MB | ✅ Phase C 方案 A 已跑完 — suburb 中心网格全覆盖 |
| comparable_sales | 9326 | 4.2 MB | 🟢 核心 |
| report_drafts | 1805 | 9.6 MB | 🟢 |
| census_sa2_data | 524 | 6.4 MB | 🟢 |
| school_locations | 2859 | 1 MB | 🟢 |
| school_profiles | 2310 | 880 KB | 🟢 |
| salm_sa2_data | 510 | 632 KB | 🟢 |
| suburb_metrics | 488 | 464 KB | 🟢（median_rent_dffh 已填，undervaluation/undervaluation_label 已写入，infrastructure_score=0 待修复） |
| macro_indicators | 632 | 272 KB | 🟢 |
| leads | 139 | 136 KB | 🟢 |
| infrastructure_projects | 20 | 16 KB | ⚠️ 待扩充 |
| spatial_ref_sys | 8500 | 6936 KB | 🟢 PostGIS 内置 |
| suburb_planning_summary | — | — | 📦 Stage 就绪，未 promote |
| rba_macro_full | — | — | 📦 Stage 就绪，未 promote |

---

## File Locations

### 项目关键文件

| File | Path | Description |
|------|------|-------------|
| HANDOVER | `_orch/docs/HANDOVER.md` | ← 你在这里 |
| DATA_SOURCES | `_orch/docs/DATA_SOURCES.md` | 完整数据源清单（24 项） |
| PROJECT_STATUS | `_orch/docs/PROJECT_STATUS.md` | 状态摘要 |
| NEXT_ACTION | `_orch/docs/NEXT_ACTION.md` | 当前优先级 |
| CHANGELOG | `_orch/docs/CHANGELOG.md` | 完整时间线 |
| Pipeline report | `_orch/docs/PIPELINE_VERIFICATION_REPORT.md` | Stage 验证 |
| Growth Corridor design | `docs/GROWTH_CORRIDOR_SCORE.md` | 增长走廊评分设计 |
| Sync script | `_orch/app/sync/sync_artifact.py` | 3 modes: dry-run/verify/sync |
| Data source doc | `_orch/docs/DATA_SOURCES.md` | 最新数据源清单 |

### VM 文件

| File | Path | Status |
|------|------|--------|
| sync_artifact.py | `/opt/aushomevalue/app/sync/sync_artifact.py` | ✅ |
| 3 artifact JSONs | `/opt/aushomevalue/data/artifacts/` | ✅ |
| fus_landuse.geojson | `~/raw/fus_landuse.geojson` | ✅ 17MB |
| vicplan_zones.geojson | `~/raw/vicplan_zones.geojson` | ✅ 168MB |
| vicplan_overlays.geojson | `~/raw/vicplan_overlays.geojson` | ✅ 149MB |
| vicprop sample | `~/raw/vicprop_metro_sample.geojson` | ✅ 87KB |

---

## ETL Scripts

| Script | Purpose | Path | Status |
|--------|---------|------|--------|
| refresh-suburb-metrics.js | 主数据管线 (10 steps) | `lib/` | ✅ 核心 |
| build-planning-cache.mjs | VicPlan precompute | `scripts/` | ✅ 已跑 |
| export-vicplan-to-vm.mjs | VicPlan GeoJSON → VM | `scripts/` | ✅ 已跑 |
| growth-projector.js | Growth projection engine | `lib/` | ✅ |
| opportunity-scoring-v2.js | Opportunity/risk/conviction scores | `lib/` | ✅ |
| sync_artifact.py | VM → Neon sync | `_orch/app/sync/` | ✅ 可用 |
| compute-infrastructure-scores.mjs | infrastructure_score v1 (name match) | `scripts/` | ❌ 不适用 |
| compute-infrastructure-scores-v2.mjs | infrastructure_score v2 (Haversine) | `scripts/` | ⚠️ 需调参+扩项目 |
| compute-ai-summary.mjs | risk_score / conviction_score | `scripts/` | ✅ |
| compute-growth-corridor-score.mjs | Growth Corridor 评分 | — | ❌ 待编写 |

---

## 当前阻塞汇总

| # | 阻塞项 | 原因 | 最难？ |
|---|--------|------|--------|
| 1 | VicPlan Phase C — 已跑方案 A，等明日验证 | 今晚完成方案 A（suburb 中心网格），cache 从 47,480→66,473 行。明日在 Production 验证 cache hit rate | ✅ **今晚已解决** |
| 2 | Infrastructure 评分无区分度 | 仅有 20 条项目 + 20km 太宽 → 全部归一化 100 | ⭐⭐ |
| 3 | VPA FUS ETL 崩溃 | Python 脚本 `KeyError: 'coordinates'` — 多几何类型未处理 | ⭐ |
| 4 | Growth Corridor Score | 设计完成，0 行代码，L1-L4 全空 | ⭐⭐⭐ 最大 |
| 5 | Stage → Production promote | 需等数据架构稳定 | ⭐ |
| 6 | Chrome CDP 放置位置 | VM vs 本地 Mac 未定 | ⭐ |
| 7 | 所有 crontab 停摆 | 旧密码过期后未恢复 | ⭐ |

---

## Hard Rules

- **NEVER** write to Production without explicit approval + `--mode=promote --approve`
- **NEVER** deploy `vercel --prod` without user confirmation
- **NEVER** push to `main` without review
- **ALL test data writes** must target Stage Neon, never Production
- **Production guard** in sync_artifact.py regex-matches `ep-winter-band` host
- **只有 artifacts 进 Neon** — comparable_sales 等原始数据不进（正在迁移）
- **Phase C 条件**：cache 覆盖率 > 95% + 观察 1-2 天 + 报告章节正常
- **不要用** `supply_is_growth_corridor` — 对所有 247 suburb 都是 false（pipeline 未建）
- **不要用**旧的 `undervaluation` Z-score 值（-0.23 等）— 已替换为新的 0-100 UV 评分

---

## 定期任务（Cron & Schedules）

**所有 crontab 停摆** — 旧密码过期后未恢复。待数据采集架构决策后再恢复。

---

## ❗ 快速上手

### 1. 先读这 6 个文件（都在 `_orch/docs/`）
按顺序：HANDOVER.md → DATA_SOURCES.md → PROJECT_STATUS.md → NEXT_ACTION.md → CHANGELOG.md → PIPELINE_VERIFICATION_REPORT.md

### 2. 快速验证
```bash
ssh vm-aushomevalue "echo ok"
cd /Users/FrankAI/Documents/澳洲房地产评估系统 && node -e "console.log('ok')"
```

### 3. 当前做啥

按优先级：

1. **小红书内容** — 用户已有 Doncaster 完整数据包，等用户启动第一篇
2. **Growth Corridor Score** — 拿到绿光后从 L5 Market 开始（数据最全），逐步建 L1-L4 管线
3. **VPA FUS ETL** — 修 Python 脚本几何类型处理 → 推 Stage Neon
4. **Infrastructure 评分** — 手动 INSERT 30+ 项目 → 收紧半径重跑
5. **VicPlan Phase C** — 🟢 方案 A 已跑完（66,473 行），**明天验证 cache hit rate** → 达标后删大表
