# CHANGELOG.md — AusHomeValue Oracle Data Factory

**Format:** `YYYY-MM-DD HH:mm TZ | Description | Author`

---

## 2026-06-24

| Time | Entry | Author |
|------|-------|--------|
| 05:20 UTC | **Phase 1B complete**: 3 artifacts generated on Oracle VM (abs_census_2021, vicplan_monash, rba_macro_full) | Oracle pipeline auto |
| 15:25 AEST | **Local pipeline verification**: `_orch/` sync_artifact.py proven with local SQLite. 3 modes (dry-run/verify/sync). Production guard enforced. | 玄甲 |
| 15:29 AEST | **commit `c7b7748`**: Oracle Data Factory — Phase 1 pipeline. `_orch/` directory with sync_artifact.py + 3 artifacts. | Haifeng Yu |
| 17:07 AEST | **Artifact download** from VM → local review | 小鱼 |
| 17:20 AEST | **DB audit report**: 3-layer design documented | 玄甲 |
| 17:23 AEST | **Phase 1B verified**: 3 artifacts exist | 玄甲 |
| 19:30 AEST | **Audit re-verification**: `_orch/` vs `reviewer/` format diff identified | 玄甲 |
| 19:35 AEST | **Compatibility alignment plan** written | 玄甲 |
| 19:53 AEST | **Alignment plan complete**: old manifest blocked under new code, no changes needed | 玄甲 |
| 19:57 AEST | **Project docs created**: HANDOVER, PROJECT_STATUS, NEXT_ACTION, CHANGELOG | 玄甲 |
| 20:01 AEST | **Migration SQL corrected**: 3 artifact fields vs DDL — 100% match | 玄甲 |
| 20:19 AEST | **Stage migration applied**: `suburb_planning_summary` created on Stage Neon | 小鱼 |
| 20:25 AEST | **Deploy branch pushed**: `deploy/oracle-artifacts` to origin | 玄甲 |
| 20:29 AEST | **VM files deployed**: 3 artifacts + manifest via GitHub raw | 小鱼 |
| 20:32 AEST | **dry-run 3/3 passed**: All SHA256 matches | 玄甲 |
| 20:40 AEST | **verify 3/3 passed**: All tables exist on Stage | 玄甲 |
| 21:01 AEST | **Phase 1C complete**: All 3 artifacts synced to Stage Neon | 玄甲 |
| 21:45 AEST | **Architecture decision: VM 做数据湖**. raw/processed/artifacts 三级。Neon 只存最终 artifact。CDP 采集需改目标至 VM raw/。所有 cron 因密码过期停摆。 | 玄甲 |
| 21:50 AEST | **密码修复**: 旧密码 `npg_HYR8v9VSTOJe` → 新密码 `npg_yxd0rKOc3uvR`。本地 `.env` 更新，DB 连接正常。Vercel Production 尚未同步。 | 玄甲 |
| 21:50 AEST | **MEMORY.md 更新**: 追加 Oracle Data Factory Phase 1 完整记录。 | 玄甲 |
| 21:50 AEST | **交接文档刷新**: HANDOVER/PROJECT_STATUS/NEXT_ACTION 密码状态更新。 | 玄甲 |

## 2026-06-26

| Time | Entry | Author |
|------|-------|--------|
| 10:00 AEST | **自住率 `dwelling_occupancy_rate` 修复**: 从错误的 persons/dwelling 改为真正的自住率——G37 `(O_OR + O_MTG) / Total` (owned outright + owned with mortgage / total households)。覆盖 233/248 VIC suburbs。 | 玄甲 |
| 10:30 AEST | **Step 5.5 G41 全面写入**: `dwelling_total`, `dwelling_separate_house`, `dwelling_flat`, `dwelling_semi_detached`, `dwelling_3br_plus`, `dwelling_1br_2br`, `dwelling_occupancy_rate` 全部从 census_sa2_data G01/G37/G41 写入 `suburb_metrics`。 | 玄甲 |
| 11:00 AEST | **Step 5.6 住房人均/库存**: `supply_housing_per_capita` + `supply_housing_stock` 从 G41 total_dwellings 写入。 | 玄甲 |
| 11:30 AEST | **Step 5.7/5.8 vacancy 修正**: 修复 null `vacancy_rate_adjusted`——新 suburb 沿用区类乘数因子 + 全局中位数 fallback。 | 玄甲 |
| 12:00 AEST | **20 suburb 数据完整性验证**: 19/20 达到 95-100% 填充率。已知缺口：Tarneit/Balwyn 缺 median_unit_price（正常）；supply_is_growth_corridor 全 false（pipeline 未建）。 | 玄甲 |
| 13:00 AEST | **Doncaster 小红书数据包交付**: 全量 247 字段提取 + 6 个 API 端点可用性确认 + 5 个关键字段可靠性排查。 | 玄甲 |
| 14:00 AEST | **Undervaluation V1 模型开发**: OLS 回归 (school + income + occupancy + separate_house) → log(price)，R²=0.72。60% 价格偏差 + 40% PIR 可负担性。SeparateHouse 系数为负（逻辑问题——高密度公寓区干扰）。 | 玄甲 |
| 15:00 AEST | **Doncaster HHD 收入验证**: $1,595/周确认来自 ABS Census 2021 G02 (SA2 207021157)。比 Family $1,957/周低——因较多非家庭结构住户（独居老人/合租）。PIR=19.3x。 | 玄甲 |
| 15:30 AEST | **Undervaluation V2 模型**: 改用综合价格 (house × sep_house% + unit × unit%) + distCBD 变量，移除 SeparateHouse。单个不分模型，R²=0.638。Doncaster UV=24（从 0 改善）。已写入 `refresh-suburb-metrics.js` Step 5.9。 | 玄甲 |
| 16:30 AEST | **交接文档刷新**: HANDOVER/CHANGELOG/PROJECT_STATUS/NEXT_ACTION 全部更新至 6/26。 | 玄甲 |
| 17:00 AEST | **Doncaster 数据包 v2**: 租金更正为 DFFH $670/week，空置率用 adjusted 3.25%，字段置信度标注，输出 `doncaster-data-pack-v2.md`。 | 玄甲 |
| 18:30 AEST | **Neon DB 密码更新**: 新密码 `npg_xYD8Nv7LRpCU`，本地连接串修复（确认 `sslmode=require`，去掉 `channel_binding`）。 | 玄甲 |
| 22:50 AEST | **VicPlan Phase C 方案 A 跑完**: `build-planning-cache-suburb-grid.mjs` 为每个 suburb 中心 ±0.02° 范围生成 0.005° 网格→新增 18,993 点，planning_cache 从 47,480→66,473 行。**明天验证 cache hit rate 后删除大表**。 | 玄甲 |

## 2026-06-25

| Time | Entry | Author |
|------|-------|--------|
| 10:30 AEST | **VicPlan 迁移 Phase A+B 完成**: A) VicPlan 原始 GeoJSON 备份到 VM (zones 168MB + overlays 149MB); B.1) `planning_cache` 表创建; B.2) ETL `build-planning-cache.mjs` 预计算 3640 坐标点; B.3) `planning-signal-service.js` 改为 cache-first (miss 回调 ST_Contains); B.4) 测试验证 cache 100% 匹配 no regression。**Phase C (删 Production 大表) 待观察 1-2 天后执行**。 | 玄甲 |

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Neon password expired | ✅ 已修复 | 旧密码 `npg_HYR8v9VSTOJe` → 新密码 `npg_yxd0rKOc3uvR` |
| VM SSH key mismatch | 🟡 | 本地 Mac key 被拒绝 |
| comparable_sales 在 Neon | 🟡 | 架构违规，需迁移至 VM raw/ |
| Chrome CDP placement | 🟡 | VM 还是本地 Mac 未定 |
| VicPlan 大表 (248 MB) | ⏳ 待删 | 已 100% 被 planning_cache (1.9 MB) 替代，Phase C 观察 1-2 天后删除 |
