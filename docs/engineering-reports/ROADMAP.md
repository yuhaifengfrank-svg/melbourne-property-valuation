# 总体规划路线图 — AusHomeValue 数据工厂

## Phase 0 ✅ 已完成
| 步骤 | 状态 |
|------|------|
| 目录结构创建 `/opt/aushomevalue/` | ✅ |
| 环境基线（Python/Node/GDAL/psql/swap） | ✅ |
| 安全基线（config/ 700 · .gitignore · 不存 secret） | ✅ |
| Phase 0 审计报告 | ✅ |

---

## Phase 1 — 离线 ETL 试点（现在开始）

> 走文件路线，Oracle 上完成，不碰生产 Neon。

| 步骤 | 说明 |
|------|------|
| 1.1 ABS Census | 现有 2021 GCP zip → raw/ → processed/ → suburb_planning_summary JSON |
| 1.2 RBA Macro | RBA 公开 CSV 抓取 → raw/ → processed/ → macro_summary JSON |
| 1.3 VicPlan 小样本 | Monash LGA GeoJSON → ogr2ogr 扁平化 → processed/ → planning_summary JSON |
| 1.4 人工 review | 检查 artifact JSON 质量 |
| 1.5 受控同步 Preview | artifact → Preview Neon（psql `\copy` 或 Node sync） |
| 1.6 报告 | DATA_LAYER_PHASE1_EXECUTION.md |

---

## Phase 2 — REA 爬虫迁移

> 从直写 Neon 迁移到文件管线，逐步推进。

| 步骤 | 说明 |
|------|------|
| 2.1 双写 | 爬虫继续直写 + 同时保存原始 JSON 到 `data/raw/rea/` |
| 2.2 文件优先 | 爬虫只写文件，新增 sync 脚本写 DB |
| 2.3 完整加工管线 | raw → processed → artifacts → review → sync |
| 2.4 统一 sync 策略 | 所有数据源共用 sync.yaml |

详细见 `docs/engineering-reports/REA_SCRAPER_MIGRATION_PLAN.md`

---

## Phase 3 — VicPlan/Parcel 数据深化

> Oracle 上处理大空间数据，文件路线为主。

| 步骤 | 说明 |
|------|------|
| 3.1 VicPlan 全量 | 全部 LGA 的 zone/overlay → processed → planning_summary |
| 3.2 Vicmap Property 许可确认 | 数据源可用性 + 许可边界 |
| 3.3 Parcel 数据接入 | cadastral parcel / property boundary 处理 |
| 3.4 空间因子整合 | 将 parcel 数据注入 valuation 引擎 |

---

## Phase 4 — 数据同步自动化

> 受控 sync → 半自动 sync → 全自动 sync（Production 逐步开放）。

| 步骤 | 说明 |
|------|------|
| 4.1 sync.yaml 配置 | 定义所有数据源的目标 DB/表/模式 |
| 4.2 Preview 自动同步 | 定时 sync 到 Preview Neon（非生产） |
| 4.3 Production 门控 | 需人工 approve 后才能推 Production |
| 4.4 全自动 | 数据校验通过后自动推 Production（可选） |

---

## 架构原则（固化）

1. **Oracle = 离线数据工厂** — 所有原始数据先在 Oracle 落地
2. **Neon = 线上精品店** — 只放轻量派生表，不堆 raw 数据
3. **Vercel = 橱窗** — 不做重型 ETL
4. **文件路线优先** — GeoJSON/CSV/Parquet → processed → summary JSON，不强制 PostGIS
5. **受控同步** — 第一阶段人工 review，不作自动写 Production
6. **所有管道可回滚** — 每步设计时考虑回退路径
7. **安全单向** — Vercel/Neon 不反向访问 Oracle
