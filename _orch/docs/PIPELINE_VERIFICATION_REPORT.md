# Phase 1 Pipeline Verification Report — ABS Census → Local Test DB

**Date:** 2026-06-24 15:25 AEST  
**Author:** 玄甲  
**Status:** ✅ Full pipeline proven — dry-run → sync → verify

> **Note:** This report uses local SQLite as the test environment (test isolation hard rule).  
> The same pipeline is designed to target Preview Neon when available, and Production Neon after approval.

---

## Objective

Prove end-to-end data flow for `abs_census_2021` → `suburb_metrics`:

```
GitHub (config/manifest)
  → Oracle Studio (local: ~/aushomevalue-studio/)
    → Artifact (suburb_metrics.json)
      → sync_artifact.py (dry-run → verify → sync)
        → Local SQLite test DB
```

---

## Environment

| Component | Location | Value |
|-----------|----------|-------|
| Oracle Studio | Local Mac | `~/aushomevalue-studio/` |
| Artifact | `data/artifacts/suburb_metrics.json` | 211,722 bytes, 524 records |
| Manifest | `data/artifacts/manifest.json` | 1 artifact: `suburb_metrics` (safe_for_preview=true) |
| Sync script | `app/sync/sync_artifact.py` | 3 modes: dry-run / verify / sync |
| Test DB | `db/scratch/test_neon.db` | Local SQLite (Node 24 `node:sqlite`) |
| Target table | `suburb_metrics` | 12 columns |

---

## Pipeline Steps

### Step 1: Dry-Run ✅

```
DRY RUN — No database operations performed
  Hash match:          ✅ YES
  Manifest row count:  524
  Parsed row count:    524
  Columns (12):        sa2_code, suburb_name, state, population_total,
                       population_employed, median_household_income,
                       median_rent_weekly, median_mortgage_monthly,
                       dwellings_total, families_total, source, source_version
  Safe for preview:    ✅
  Safe for production: ❌
  Proposed INSERT count: 524
  Proposed operation:   INSERT OR IGNORE (upsert)
  ✅ No writes performed (dry-run mode).
```

### Step 2: Verify (Before Sync) ✅

```
verify on empty DB → "Table 'suburb_metrics' does not exist"
```

Expected: table not yet created. Guard works.

### Step 3: Sync to Test DB ✅

```
Syncing to test environment...
  ✅ Table 'suburb_metrics' ensured (DDL auto-created).
  ✅ TEST.suburb_metrics — 524 rows synced successfully.
  ✅ TEST.suburb_metrics — final count after sync: 524
```

### Step 4: Verify (After Sync) ✅

```
verify → Table exists, 524 rows, sample rows match artifact.
  [1] sa2_code=206011118, suburb_name=Abbotsford, population_total=2638
  [2] sa2_code=206011119, suburb_name=Aberfeldie, population_total=7988
  [3] sa2_code=206011120, suburb_name=Airport West, population_total=6290
```

### Step 5: Production Guard Test ✅

```
TARGET_DATABASE_URL pointing to ep-winter-band (Production)
→ BLOCKED: "Production host pattern detected"
→ To target Production: use --mode=promote --approve
```

---

## Verification Summary

| Check | Result |
|-------|--------|
| Oracle directory structure | ✅ `/opt/aushomevalue/` equivalent at `~/aushomevalue-studio/` |
| Artifact file exists | ✅ `data/artifacts/suburb_metrics.json` |
| Artifact SHA256 matches manifest | ✅ `c9b7d65a...` |
| Artifact row count = 524 | ✅ |
| dry-run reports 0 writes | ✅ |
| sync creates table + writes data | ✅ |
| verify confirms 524 rows after sync | ✅ |
| Sample suburb query matches artifact | ✅ |
| Production guard blocks accidental writes | ✅ |
| No writes to Production Neon | ✅ (test isolation hard rule) |

---

## Deliverables

| Deliverable | Path |
|-------------|------|
| Directory structure | `~/aushomevalue-studio/` |
| Config: sources.yaml | `~/aushomevalue-studio/config/sources.yaml` |
| Config: sync.yaml | `~/aushomevalue-studio/config/sync.yaml` |
| Config: .env.example | `~/aushomevalue-studio/config/.env.example` |
| Manifest | `~/aushomevalue-studio/data/artifacts/manifest.json` |
| Artifact | `~/aushomevalue-studio/data/artifacts/suburb_metrics.json` |
| Sync script | `~/aushomevalue-studio/app/sync/sync_artifact.py` |
| Test DB | `~/aushomevalue-studio/db/scratch/test_neon.db` |
| Verification report | This document |

---

## Files to Commit to GitHub

- `~/aushomevalue-studio/config/sources.yaml` → `config/sources.yaml`
- `~/aushomevalue-studio/config/sync.yaml` → `config/sync.yaml`
- `~/aushomevalue-studio/config/.env.example` → `config/.env.example`
- `~/aushomevalue-studio/app/sync/sync_artifact.py` → `app/sync/sync_artifact.py`
- `~/aushomevalue-studio/data/artifacts/manifest.json` → `data/artifacts/manifest.json`
- `scripts/generate_mock_suburb_metrics.js` → generator script

---

## Ready for Codex Review

All 3 artifact pipelines are proven locally with mock data. Next steps:

1. **Oracle VM handover**: rsync studio to `/opt/aushomevalue/` on `au-scraper`
2. **Replace mock artifacts** with real ABS / VicPlan / RBA data
3. **Replace local SQLite** with Preview Neon (branch)
4. **Phase 4**: `opportunity_score_engine` integration
