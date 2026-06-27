# Phase 1 Pipeline Verification Report — Stage Neon

**Date:** 2026-06-24 21:50 AEST  
**Author:** 玄甲  
**Status:** ✅ Stage sync verified — 3 artifacts written to Stage Neon

> **Update note:** Previous version (15:25 AEST) used local SQLite. This version verifies against the real Stage Neon (`ep-patient-glade-a7lht4ta`) after Phase 1C sync completed.

---

## Objective

Prove end-to-end data flow for Oracle Data Factory Phase 1:

```
Oracle VM (数据湖)
  ├── data/raw/              ← CDP / ABS source data
  ├── data/processed/        ← Cleaned intermediate tables
  └── data/artifacts/        ← Standardized suburb-level artifacts

  ↓ sync_artifact.py (dry-run → verify → sync)

Stage Neon (ep-patient-glade)
  ├── suburb_metrics          ← ABS 2021 GCP census (524 rows, 12 cols)
  ├── suburb_planning_summary ← VicPlan Monash (953 rows, 13 cols)
  └── rba_macro_full          ← RBA F1/G1/H1/H5/J1 (5,175 rows, 8 cols)

  ↓ promote (pending)

Production Neon (ep-winter-band) → Vercel API
```

---

## Pipeline Steps

### Step 1: Artifact Readiness ✅

| Artifact | Path | Size | Rows | SHA256 |
|----------|------|------|------|--------|
| `suburb_metrics` | `_orch/data/artifacts/suburb_metrics.json` | 212 KB | 524 | Verified |
| `vicplan_monash` | `_orch/data/artifacts/vicplan_monash.json` | 415 KB | 953 | Verified |
| `rba_macro_full` | `_orch/data/artifacts/rba_macro_full.json` | 1.3 MB | 5,175 | Verified |

All 3 artifacts secured in `_orch/data/artifacts/manifest.json` with SHA256 checksums.

### Step 2: Dry-Run (3/3) ✅

```
DRY RUN — No database operations performed
  suburb_metrics:     ✅ SHA256 match, 524 rows, 12 cols, no writes
  vicplan_monash:     ✅ SHA256 match, 953 rows, 13 cols, no writes
  rba_macro_full:     ✅ SHA256 match, 5,175 rows, 8 cols, no writes
  Safe for preview:   ✅ (all marked safe_for_preview=true)
  Safe for production:❌ (no artifacts marked safe_for_production)
```

### Step 3: Verify (Before Sync) ✅

Stage migration executed at 20:19 AEST by 小鱼:
- `20260624_create_suburb_planning_summary_preview.sql`
- Target: `suburb_planning_summary` table on Stage Neon

Verify confirmed table schema match for all 3 artifacts against DDL.

### Step 4: Sync (Phase 1C) ✅

Executed at 21:01 AEST by sync_artifact.py:

| Table | Target | Rows Synced | Status |
|-------|--------|-------------|--------|
| `suburb_metrics` | Stage Neon | 524 | ✅ |
| `suburb_planning_summary` | Stage Neon | 953 | ✅ |
| `rba_macro_full` | Stage Neon | 5,175 | ✅ |

### Step 5: Verify (After Sync) ✅

```
STAGE.suburb_metrics           — 524 rows
STAGE.suburb_planning_summary  — 953 rows
STAGE.rba_macro_full           — 5,175 rows
```

### Step 6: Production Guard ✅

```
sync_artifact.py with TARGET=ep-winter-band (Production)
→ BLOCKED: "Production host pattern detected"  
→ To target Production: use --mode=promote --approve
```

Guard regex matches `ep-winter-band` and `ep-patient-glade` to block accidental writes.

---

## Verification Summary

| Check | Result |
|-------|--------|
| All 3 artifacts exist locally | ✅ |
| All 3 SHA256 match manifest | ✅ (Phase 1C dry-run) |
| All 3 DDL match artifact schema | ✅ (Phase 1C verify) |
| All 3 synced to Stage Neon | ✅ (Phase 1C sync) |
| Stage table row counts match artifacts | ✅ |
| Production guard blocks accidental writes | ✅ |
| No writes to Production Neon | ✅ (test isolation hard rule) |

---

## Production DB Reference (before promote)

| Table | Rows | Notes |
|-------|------|-------|
| comparable_sales | 7,304 | ⚠️ Architecture violation: should be VM raw/ |
| suburb_metrics | 488 | Old dataset — will be overwritten by Stage 524 rows on promote |
| census_sa2_data | 524 | Existing, unaffected |
| vicplan_zones | 51,366 | Existing |
| vicplan_overlays | 174,682 | Existing |
| macro_indicators | 632 | Existing (rba_macro_full will be separate table) |
| report_drafts | 1,874 | App data, unaffected |
| report_snapshots | 5 | App data |
| lead_contacts | 45 | App data |

---

## Known Gaps for Next Phase

1. **Promote to Production** — Stage → Production not yet executed. Needs `--mode=promote --approve`
2. **API endpoint** — `/api/suburb-intelligence` not yet deployed
3. **Stage DB password** — Not recorded in any config file. 小鱼 applied migration manually
4. **config/sync.yaml points to `ep-damp-lab`** — Actual Stage is `ep-patient-glade`. Config needs update
5. **PIPELINE_VERIFICATION_REPORT.md** — This file. Will be replaced with real Stage/Production report after promote

---

## Deliverables

| File | Path | Notes |
|------|------|-------|
| HANDOVER.md | `_orch/docs/HANDOVER.md` | Project overview, current phase, hard rules |
| PROJECT_STATUS.md | `_orch/docs/PROJECT_STATUS.md` | Detailed phase status, blockers |
| NEXT_ACTION.md | `_orch/docs/NEXT_ACTION.md` | Single highest priority |
| CHANGELOG.md | `_orch/docs/CHANGELOG.md` | Full timeline |
| PIPELINE_VERIFICATION_REPORT.md | This document | ✅ Updated for Stage Neon |
