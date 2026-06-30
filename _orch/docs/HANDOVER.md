# HANDOVER.md

**Timestamp**: 2026-06-30 13:48 (Australia/Melbourne)

## Current Objective
Council Data Plan Phase 1 (council_registry) ✅ complete — Phase 2 (VBA permits) infrastructure ready, waiting on XLSX data download

## Completed Work (This Session)

### ✅ Phase 1: Council Registry (79 VIC LGAs)
- **council_registry** 表创建（Migration 015）
  - lga_code, lga_name, population_2021 (ABS Census 2021 via SA2→LGA aggregation from school_locations)
  - suburb_count, council_type (Metropolitan/Interface/Regional/Rural), region (6 regions)
  - 79 条记录，总人口 ~6.5M
- **suburb_metrics.council_lga_code** 映射：247/247 suburbs
  - 233 from school_locations, 14 manual overrides (suburbs without school records)
- ETL: `scripts/populate-council-registry.mjs`
- 验证：人口、类型、区域分布正确

### ✅ Phase 2: VBA Building Permits — Infrastructure Complete
- **council_metrics** 表 + **council_metrics_12m** MV（Migration 016）
- `scripts/fetch-vba-permit-data.mjs` — tries to download from VBA/BPC Data.Vic, outputs manual URLs when Cloudflare blocks
- `scripts/populate-council-metrics.mjs` — parses XLSX → DB write (placeholder parser, needs actual file format)
- **⚠️ Blocked**: VBA site behind Cloudflare, needs manual XLSX download

### ✅ POI Status (updated)
- 175/247 (up from 101→155→175)
- 72 remaining — mostly metro former-sandbelt suburbs + newer estates

### ✅ Crime Status
- 246/247 (Ballarat missing — suburb split issue, one has data)

## Git State
- Branch: `deploy/oracle-artifacts` (ahead 3 of origin)
- HEAD: `45d0a8d` feat: heritage integration
- Dirty files this session:
  - M `_orch/docs/COUNCIL_DATA_PLAN.md`
  - M `_orch/docs/HANDOVER.md`
  - M `memory/2026-06-30.md`
  - ?? `db/migration-015-council-registry.sql`
  - ?? `db/migration-016-council-metrics.sql`
  - ?? `scripts/populate-council-registry.mjs`
  - ?? `scripts/fetch-vba-permit-data.mjs`
  - ?? `scripts/populate-council-metrics.mjs`
  - ?? `scripts/populate-suburb-council.mjs`

## User Decisions
- COUNCIL_DATA_PLAN.md 按 Phase 顺序执行
- Phase 2 VBA 优先于 Know Your Council

## Known Blockers
1. **VBA Cloudflare**: www.vba.vic.gov.au 有 Cloudflare 保护，curl/fetch 失败
   - Workaround: 浏览器手动打开 Data.Vic → 下载 XLSX → 放 /tmp/vba-data/ → 跑 ETL
   - 128 个月（2015-01 至 2026-03），Data.Vic CKAN 有全部 URL
2. **POI backfill**: Overpass API rate limit ~2.5s/query, ~3 min per suburb. 跑不完的话需重跑剩余批
3. **Area field**: No area_km² in council_registry yet — needs Vicmap Admin polygon area calc

## Next Action
1. 手动下载 VBA XLSX → `/tmp/vba-data/` → 运行 `scripts/populate-council-metrics.mjs`
2. 剩余 72 POI 补跑（用 batch 脚本续跑）
3. Ballarat crime 补录
4. Phase 3: Know Your Council financial data

## DO NOT
- 重新跑 council_registry ETL（IDEMPOTENT — 但不需要）
- 修改 production DB schema 以外已完成的 migration
- 部署 Vercel Production 不经确认
