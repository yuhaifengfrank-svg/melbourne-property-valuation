# Data Pipeline Architecture — AusHomeValue

## Overview

Three-tier data factory architecture: **Oracle** (offline processing) → **Neon** (online query) → **Vercel** (API + frontend).

---

## Pipeline Map

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            ORACLE CLOUD VM (au-scraper)                              │
│                             161.33.90.191 · Ubuntu 24.04                              │
│                                                                                       │
│  ┌──────────────────────────────────────────┐   ┌────────────────────────────────────┐│
│  │  /home/ubuntu/scraper/                   │   │  /opt/aushomevalue/                ││
│  │  ── REA 数据采集管道 (Node)               │   │  ── 离线 ETL 管道 (Python)         ││
│  │                                          │   │                                    ││
│  │  scripts/weekly-refresh-collection.mjs   │   │  app/ingest/    ← 下载原始数据      ││
│  │  scripts/daily-batch-collection.mjs      │   │  app/transform/ ← 加工转换          ││
│  │  (Playwright · CDP · KPSDK bypass)       │   │  app/export/    ← 生成 artifact     ││
│  │                                          │   │  app/sync/      ← 推送 Neon         ││
│  │  采集：comparable_sales · 实时写库        │   │                                    ││
│  │                                          │   │  data/raw/      ← 原始文件存储      ││
│  │  Cron: 每日 3AM batch                    │   │  data/processed/ ← 加工后文件       ││
│  │  Cron: 每周日 3AM full                   │   │  data/artifacts/ ← 对外输出 JSON    ││
│  └──────────────┬───────────────────────────┘   └────────────┬───────────────────────┘│
│                 │                                             │                         │
└─────────────────┼─────────────────────────────────────────────┼─────────────────────────┘
                  │                                             │
                  │  DATABASE_URL (直写)                        │  受控同步（人工 review）
                  ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          NEON (PostgreSQL — 线上查询库)                               │
│                                                                                       │
│  Production DB (ep-winter-band-a7qym6bq)       Preview DB (ep-damp-lab-a7oknmrc)     │
│  ┌──────────────────────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Layer 1 — Raw Data                   │  │ Layer 3 — Derived Data                 │ │
│  │  · comparable_sales           5,570  │  │  · suburb_planning_summary         ~1k  │ │
│  │  · leads / lead_contacts             │  │  · property_planning_cache     按需缓存 │ │
│  │  · suburb_snapshots                  │  │  · data_source_registry             3   │ │
│  │  · suburb_metrics                    │  │  · future_outlook_inputs      [未来]   │ │
│  │                                       │  │                                         │ │
│  │ Layer 2 — Feature Data               │  │ Layer 1 (copy)                          │ │
│  │  · vicplan_zones              51,366  │  │  · comparable_sales            5,570   │ │
│  │  · vicplan_overlays          174,682  │  │  · vicplan_zones              51,366   │ │
│  │  · census_sa2_data                 524  │  │  · vicplan_overlays          174,682   │ │
│  │  · school_locations              2,859  │  │  · school_locations            2,859   │ │
│  │  · macro_indicators                 70  │  │  · census_sa2_data               524   │ │
│  │                                       │  │                                         │ │
│  │  ❌ 不再继续堆 raw 大空间数据           │  │  (branch stripe-preview, 含生产快照)   │ │
│  └──────────────────────────────────────┘  └────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                VERCEL (API + 前端 — 橱窗)                             │
│                                                                      │
│  api/valuation.js        ← 房屋估值 API（查询 Neon）                 │
│  api/opportunity.js       ← 投资机会 API                             │
│  api/suburb.js            ← 郊区数据 API                             │
│  api/planning.js          ← 规划信号 API（来自 derived 表）          │
│                                                                      │
│  ❌ 不做重型 ETL · ❌ 不反向访问 Oracle                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow by Type

### A. REA Comparable Sales (Real-time Collection → Production)

| Step | Location | What | Tech |
|------|----------|------|------|
| 1 | Oracle | Playwright 爬取 REA 销售记录 | Node + Puppeteer |
| 2 | Oracle | 数据格式化 + 去重 | Node |
| 3 | → | 通过 DATABASE_URL 直写 | `@neondatabase/serverless` |
| 4 | Production Neon | `comparable_sales` 表写入 | PostgreSQL |

**Schedule:** 每日 3AM batch (6 batches, 轮转 239 suburbs)  
**周日:** 每周全量采集  
**Cron jobs:** 6 daily-batch + 1 weekly

### B. ABS Census / SEIFA (Offline Batch → Preview)

| Step | Location | What | Tech |
|------|----------|------|------|
| 1 | Oracle | 从 ABS 下载 ZIP/CSV | curl / Python requests |
| 2 | Oracle | 解析 CSV → pandas DataFrame | Python + pandas |
| 3 | Oracle | 按 suburb/LGA 聚合统计 | Python + pandas |
| 4 | Oracle | 输出 summary JSON → `data/artifacts/` | Python json |
| 5 | → | 人工 review artifact | — |
| 6 | → | 受控导入 Preview Neon | psql `\copy` / Node sync |

**Schedule:** 按需触发（试点阶段手动，未来 cron）  
**目标表:** Preview Neon → Artifacts 同步后最终进入 Production

### C. RBA Macro Data (Offline Batch → Preview)

| Step | Location | What | Tech |
|------|----------|------|------|
| 1 | Oracle | 从 RBA CSV 下载 | Python requests |
| 2 | Oracle | 解析 + 结构化 | Python + pandas |
| 3 | Oracle | 输出 JSON → `data/artifacts/macro_summary/` | Python json |
| 4 | → | 人工 review → Preview Neon | 同上 |

### D. VicPlan Zones / Overlays (Offline File Processing → Preview)

| Step | Location | What | Tech |
|------|----------|------|------|
| 1 | Oracle | 从 mapshare.vic.gov.au 或 data.vic.gov.au 下载 GeoJSON | curl / ogr2ogr |
| 2 | Oracle | ogr2ogr 将 GeoJSON 转为扁平 CSV | GDAL |
| 3 | Oracle | pandas groupby(LGA/zone_code) 聚合 | Python + pandas |
| 4 | Oracle | 输出 suburb_planning_summary JSON | Python json |
| 5 | → | 人工 review → Preview Neon | 同上 |

### E. Parcel Data (Future — Reserved)

| Step | Location | What | Tech |
|------|----------|------|------|
| 1 | Oracle | 确认许可边界后下载 Vicmap Property | TBD |
| 2 | Oracle | 文件路线预处理 | GDAL / FlatGeobuf |
| 3 | Oracle | 空间属性聚合 | TBD |
| 4 | → | 受控同步 | 同上 |

---

## Directory Structures

### Oracle — REA Scraper (`/home/ubuntu/scraper/`)
```
/org/home/ubuntu/scraper/
├── scripts/
│   ├── weekly-refresh-collection.mjs      # 每周全量
│   ├── daily-batch-collection.mjs         # 每日分批
│   └── insert-manual.mjs                  # 手动插入
├── loaders/
│   ├── _g45_loader.mjs                    # ABS G45 loader
│   ├── _seifa_loader.mjs                  # SEIFA loader
│   └── _salm_loader.mjs                   # SALM loader
├── package.json
├── .env                                   # DATABASE_URL → Production Neon
└── (Puppeteer / Playwright browser cache)
```

### Oracle — ETL Factory (`/opt/aushomevalue/`)
```
/opt/aushomevalue/
├── app/
│   ├── ingest/         # 数据采集脚本
│   ├── transform/      # 加工转换
│   ├── export/         # artifact 生成
│   └── sync/           # Neon 同步
├── data/
│   ├── raw/{abs,rba,vicplan,parcel}/
│   ├── processed/{abs,rba,vicplan,parcel}/
│   └── artifacts/{suburb_summary,planning_summary,macro_summary,api_exports}/
├── logs/{ingest,transform,sync}/
├── config/
│   ├── .env            # [受保护] Neon 凭证
│   ├── .env.example    # 模板
│   ├── sources.yaml    # 数据源定义
│   └── sync.yaml       # 同步策略
├── db/{schema,migrations,scratch}/
└── backups/
```

---

## Security Boundary

```
                    Oracle (数据工厂)
                    ┌─────────────────────┐
                    │  SSH key auth only   │
                    │  Port 22 (public)    │
                    │  config/ → 700       │
                    │  .env → gitignored   │
                    └──────┬──────────────┘
                           │
                    Only push derived,
                    lightweight data
                           │
                           ▼
                    Neon (线上查询库)
                    ┌─────────────────────┐
                    │  SSL required        │
                    │  Auth: neondb_owner   │
                    │  Channel: @neondb/    │
                    │    serverless         │
                    └──────┬──────────────┘
                           │
                    Only serve API
                    queries (read-mostly)
                           │
                           ▼
                    Vercel (API + 前端)
                    ┌─────────────────────┐
                    │  No ETL              │
                    │  No reverse-Oracle   │
                    │  No raw data serving │
                    └─────────────────────┘
```

**Cannot:** Vercel → Oracle (no reverse access)  
**Cannot:** Scraper → Preview DB (scraper targets Production only)  
**Should not:** ETL → Production Neon directly (manual review first)

---

## Current Data Volume Estimates

| Data Source | Rows / Volume | Storage | Update Frequency | Target |
|-------------|--------------|---------|-----------------|--------|
| comparable_sales | 5,570 | ~50 MB | Daily | Production Neon |
| vicplan_zones | 51,366 | ~20 MB (file) | Quarterly | Oracle + Neon |
| vicplan_overlays | 174,682 | ~40 MB (file) | Quarterly | Oracle + Neon |
| census_sa2_data | 524 | ~10 MB | Every 5 years | Oracle + Neon |
| school_locations | 2,859 | ~1 MB | Annually | Oracle + Neon |
| suburb_planning_summary | ~1,038 (est.) | ~5 MB | Weekly | Preview→Production |
| property_planning_cache | On-demand | Negligible | By-need | Preview→Production |
| data_source_registry | 3 | &lt;1 KB | Per-sync | Preview→Production |

Oracle disk used: **6.5 GB** / 46 GB (14%)  
Neon DB size: **292 MB** / 500 MB (58%) — comfortable

---

*Generated 2026-06-23. For Codex / CTO review.*
