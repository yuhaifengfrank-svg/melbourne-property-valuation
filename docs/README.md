# Docs — 文档目录

> 本文档树是所有架构设计、数据模型、工程报告、产品需求、运营流程、SEO 策略的中心索引。
> **如果你是 AI agent（Codex、玄甲或其他 LLM）：先看根目录 `CURRENT_STATUS.md` 了解项目状态，再回来看本文档树找具体文档。**
> 项目本身的代码（`lib/` `api/` `scripts/` `db/` `data/`）不在此目录。

---

## 目录结构

```
docs/
├── README.md                    ← 本文档
├── architecture/                ← 架构设计文档
├── data/                        ← 数据模型 & 数据源清单
├── engineering-reports/         ← 实施报告 / QA / 复盘
├── decisions/                   ← 架构决策记录 (ADR)
├── product/                     ← PRD / 需求 / 产品设计
├── operations/                  ← 采集 / cron / 运营
├── seo/                         ← SEO / canonical / 搜索可见性
└── archive/                     ← 已归档的旧文档
```

---

## 一级文档说明

### `architecture/` — 架构设计

| 文件 | 内容 |
|------|------|
| `VALUATION_V2_DESIGN.md` | 估值引擎 V2 架构设计，6因子评分模型 |
| `VALUATION_TYPE_AUDIT.md` | 估值类型审计，house vs unit vs apartment 区分 |
| `TRUST_LAYER_DESIGN_REPORT.md` | 信任层设计（confidence flags, data quality badges） |
| `SUBURB_INTELLIGENCE_V2_DESIGN.md` | Suburb Intelligence Platform V2 设计 |

### `data/` — 数据模型

| 文件 | 内容 |
|------|------|
| `DATA_MODEL.md` | 核心数据模型（suburb_metrics, comparable_sales, census_sa2_data, school_locations） |
| `VALUATION_SOURCE_POLICY.md` | 估值数据来源策略（CDP / DB / REA fallback 三级） |
| `MASTER_DATA_SOURCE_INVENTORY_V1.xls` | 全部数据源清单（xls 表） |

### `engineering-reports/` — 工程报告

| 文件 | 内容 |
|------|------|
| `VALUATION_V2_IMPLEMENTATION_REPORT.md` | V2 实现报告 |
| `VALUATION_V2_FIX_REPORT.md` | V2 修复记录 |
| `TRUST_LAYER_V2_DEPLOY_REPORT.md` | 信任层 V2 部署报告 |
| `PHASE_3E_LAUNCH_QA_REPORT.md` | Phase 3E 上线 QA |
| `PHASE_4A_TIER1_DATA_INTEGRATION_PLAN.md` | 4A T1 数据集成计划 |
| `OVERALL_CONFIDENCE_DATA_QUALITY_REPORT.md` | 整体置信度 & 数据质量 |
| `MODEL_AUDIT_CHECKLIST.md` | 模型审计清单 |
| `OPPORTUNITY_PAGE_REDESIGN_REPORT.md` | Opportunity 页面重设计 |
| `RESEARCH_CENTRE_V1_REPORT.md` | Research Centre V1 |
| `SALM_IMPLEMENTATION_REPORT.md` | SALM（学校层级数据）实现 |

### `decisions/` — 架构决策记录

| 文件 | 内容 |
|------|------|
| `OPENAI_CODEX_OSS_APPLICATION.md` | OpenAI Codex OSS Application（外部） |

### `product/` — 产品 & 需求

| 文件 | 内容 |
|------|------|
| `PRD.md` | 产品需求文档 |
| `requirements.md` | 技术要求 |
| `CLIENT_WEB_UI.md` | 前端 UI 设计文档 |

### `operations/` — 运维

| 文件 | 内容 |
|------|------|
| `COMPARABLE_RESEARCH_COLLECTOR.md` | 可比数据采集器设计 |
| `NATIONWIDE_LISTING_QA.md` | 全国 listing QA |
| `SOCIAL_CONTENT_ENGINE_DESIGN.md` | 社交媒体内容引擎设计 |

### `seo/` — SEO

| 文件 | 内容 |
|------|------|
| `DOMAIN_CANONICALISATION_PLAN.md` | 域名 canonical 策略 |
| `DOMAIN_AUDIT_REPORT.md` | 域名审计 |
| `SEARCH_VISIBILITY_REPORT.md` | 搜索可见性报告 |
| `CONTENT_DUPLICATION_AUDIT.md` | 内容重复审计 |

---

## 项目外部文档

以下内容在项目根目录 `data/` 下，与数据文件共存：

- `data/vicmap/LAND_SIZE_AUTO_RESOLVE.md` — 土地面积自动解析架构
- `data/vicmap/VICMAP_LAND_SIZE_INTEGRATION.md` — Vicmap 土地数据集成
- `data/vicmap/README.md` — Vicmap 数据说明

## 外部参考资料

- 学习和错误记录：`.learnings/`
- 样本评估证据：`sample-evidence/`
- 项目状态总览：`CURRENT_STATUS.md`（根目录）

---

## 给 AI Agent 的指引

1. **刚进项目** → 先看根目录 `CURRENT_STATUS.md`（项目当前状态、分支、测试、已知问题）
2. **想深入理解** → 回来看 `docs/product/PRD.md` + `docs/architecture/`
3. **想知道估值引擎怎么工作** → `docs/architecture/VALUATION_V2_DESIGN.md`
4. **想知道数据模型** → `docs/data/DATA_MODEL.md`
5. **想改代码但不确定影响范围** → 先看 `docs/engineering-reports/` 下最近报告
6. **想改文档** → 保持按分类放入对应子目录，更新本文档的表格
