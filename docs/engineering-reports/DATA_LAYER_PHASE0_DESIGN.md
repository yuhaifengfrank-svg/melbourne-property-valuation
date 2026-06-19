# 数据层 Phase 0 — 设计报告

## 当前数据库空间现状

| 类别 | 大小 | 比例 | 说明 |
|------|------|------|------|
| vicplan_overlays | 129 MB | 46% | PostGIS，ST_Simplify 后 175K 行 |
| vicplan_zones | 119 MB | 42% | PostGIS，51K 行 |
| 其他业务数据 | 34 MB | 12% | census / school / comparable_sales / 用户表 / macro_indicators |
| **总计** | **~282 MB** | 100% | Neon 512 MB Free Tier，**剩余 ~230 MB** |

两张 VicPlan 空间表占 88% 的数据库空间。按此趋势，再导入一个大型 GIS 数据源就会触及 512MB 上限。

## 为什么不能继续全量存大型 GIS

1. **空间上限** — VPA Precinct / Parcel / Property 边界每个都是百万级多边形，任意一个都会超出 230 MB 余量
2. **查询性能** — PostGIS ST_Contains 在未分区大表上随数据量衰减，过大的 geom 拖慢全库
3. **版本管理** — 原始 GeoJSON 在数据库内无法 diff/compare，更新需要 DELETE + 全量重插入，无离线存档
4. **成本** — Neon 升 tier 从 $0 起跳，不必要的空间膨胀直接导致开销

## 三层数据架构

```
┌─────────────────────────────────────────────────┐
│  1. 原始数据归档 (Raw Archive)                    │
│     外部存储：GitHub LFS / Vercel Blob            │
│     存放：原始 GeoJSON, CSV, XLSX                │
│     用途：版本追溯、全量重跑、第三方审核            │
└─────────────────────────────────────────────────┘
                        │ 提取/简化/转换
                        ▼
┌─────────────────────────────────────────────────┐
│  2. 派生轻量表 (Derived Tables)                   │
│     Neon Postgres (无几何)                       │
│     • suburb_planning_summary                    │
│     • property_planning_cache                    │
│     • data_source_registry                       │
│     用途：planning signal、Future Outlook 查询    │
└─────────────────────────────────────────────────┘
                        │ 业务接入
                        ▼
┌─────────────────────────────────────────────────┐
│  3. 动态业务/用户/报告数据 (Dynamic Data)          │
│     Neon Postgres                                │
│     • leads / lead_contacts / consent_records     │
│     • report_snapshots / report_payments          │
│     • suburb_metrics / macro_indicators           │
│     用途：估值、报告、用户订阅、权限、付款          │
└─────────────────────────────────────────────────┘
```

## 本阶段新增表

### data_source_registry
- 每条记录追踪一个数据源的元数据：来源 URL、版本、下载时间、哈希、覆盖区域
- 不存储 credentials
- source_key 为唯一标识（小写 kebab/snake）

### suburb_planning_summary
- 按 suburb + state 聚合的规划信号摘要
- 不含 geometry，只含分类字段和标志位
- 用于 Future Outlook suburb 级分析

### property_planning_cache
- 单房产的 planning signal 缓存（按 property_key 唯一）
- TTL 过期机制预留 `expires_at`
- 不含 geometry

## 本阶段不做

| 项 | 说明 |
|----|------|
| ☐ 前端展示 | Phase 0 不接入 UI |
| ☐ 机会评分修改 | 不改变 opportunity/valuation 公式 |
| ☐ Stripe / 付款 | 不接近 payment pipeline |
| ☐ 新数据下载 | 不拉取 VPA/Parcel/Property 边界 |
| ☐ 大范围空间 JOIN | dry-run 只做 COUNT 不做 spatial join |
| ☐ 删除/迁移 vicplan_zones/overlays | 保持原有表不动 |
| ☐ 生产部署 | --apply 拒绝，dry-run only |

## 后续 Phase 1 建议

### Heritage Overlay
- 从 `open-data-platform:ho_overlay` WFS 拉取
- 写入 `suburb_planning_summary.heritage_status` 和 `property_planning_cache.heritage_status`
- 当前状态：`unknown`（未导入），`partial`（输入明确含 HO）

### Parcel / Land Signal
- 下载 `v_parcel_mp` 或精简版 parcel 数据
- Parcel 元数据（面积、分区、easement）写入派生表，geometry 不写入

### Future Opportunity Scoring Integration
- `suburb_planning_summary` 的 constraint/flexibility 可作为子信号接入机会评分
- 不修改现有公式，通过外部查询 advisory

### Investor Watch Event Model
- 建立 `investor_watch_events` 表（订阅/取消/信号变更）
- 依赖 property_planning_cache 的 TTL 过期机制

---
*Design document for Data Layer Phase 0 — 2026-06-19*
