# Data Layer Phase 1 — Preview Derived Backfill Dry Run Report

Date: 2026-06-23 14:50 AEST  
Target: Stripe-preview (`ep-damp-lab-a7oknmrc`)  
Mode: **DRY RUN** — no writes performed  
Script: `scripts/backfill-planning-derived-preview.mjs`

---

## 1. Safety Guard

| Check | Result |
|-------|--------|
| Target host: `ep-damp-lab-a7oknmrc-pooler.ap-southeast-2.aws.neon.tech` | ✅ |
| Not `ep-winter-band` | ✅ |
| `--apply` flag absent | ✅ (no writes) |

## 2. Source Table Row Counts

| Table | Rows |
|-------|------|
| `vicplan_zones` | 51,366 |
| `vicplan_overlays` | 174,682 |
| School → LGA distinct pairs (`school_locations`) | 1,009 |
| Comparable centroids → LGA via spatial join | 225 |
| **Mapped VIC suburb/LGA pairs (total)** | **1,038** |
| Unique LGAs in VicPlan zones | 87 |

## 3. Derived Table Row Counts (Pre-Run)

| Table | Rows |
|-------|------|
| `suburb_planning_summary` | 0 |
| `data_source_registry` | 0 |
| `property_planning_cache` | 0 |

## 4. Dry Run Output

```
--- Input / target scope ---
vicplan_zones rows:          51366
vicplan_overlays rows:       174682
Mapped VIC suburb/LGA pairs: 1038
  from schools:              1009
  from comparable points:    225
VicPlan LGAs with zones:     87

--- Existing derived rows ---
suburb_planning_summary:     0
data_source_registry:        0

DRY_RUN_OK — no writes performed.
Run with --apply to populate Preview derived tables.
```

## 5. Estimated Backfill Scope

| Derived Table | Estimated Rows | Notes |
|--------------|----------------|-------|
| `suburb_planning_summary` | **~1,038** | Each mapped suburb-LGA pair gets one summary row with dominany zone, overlay aggregations, constraint score |
| `data_source_registry` | **3 entries** | `vicplan_zones`, `vicplan_overlays`, `suburb_planning_summary` (hardcoded in `applyBackfill()`) |
| `property_planning_cache` | **0** (on-demand) | Not populated by backfill; filled at valuation time per property |

**Coverage breakdown:**

| Source | Pairs | Method |
|--------|-------|--------|
| School locations (exact LGA mapping) | 1,009 | `school_locations.suburb → lga_name` (direct join) |
| Comparable centroids (spatial join) | 225 | `comparable_sales` average lat/lon → `ST_Contains(vicplan_zones.geom)` |
| Deduplicated union | **1,038** | 1,009 + 225 - 196 overlap = **1,038** |

**Unmapped estimate:** There are 239 tracked suburbs in production data. ~1,038 pairs may include duplicate entries across different LGAs for same-named suburbs — actual unique suburb count after dedup will be lower but still covers all major VIC suburbs.

## 6. Limitations Noted

1. **LGA-level approximation** — Not point-in-polygon for individual properties; heritage overlay data limited without HO-specific source import
2. **Heritage status** — Currently `"partial"` if any overlay matches HO pattern; `"unknown"` otherwise; actual heritage overlays may be undercounted
3. **Spatial join scope** — Only suburbs with comparable centroid data get spatial LGA mapping; school-based mapping covers the rest
4. **Overlay categorization** — Rule-based prefix matching (DDO→design, SBO/LSIO/FO/FWO→flood, etc.) may miss edge cases

## 7. Verification (Post dry-run — no changes)

| Check | Pre | Post | Changed? |
|-------|-----|------|----------|
| `suburb_planning_summary` rows | 0 | 0 | ❌ No |
| `data_source_registry` rows | 0 | 0 | ❌ No |
| `vicplan_zones` rows | 51,366 | 51,366 | ❌ No |
| `vicplan_overlays` rows | 174,682 | 174,682 | ❌ No |
| `comparable_sales` rows | 5,570 | 5,570 | ❌ No |
| `school_locations` rows | 2,859 | 2,859 | ❌ No |

All source tables and derived tables unchanged. **Zero writes confirmed.**

---

## Summary

```
Dry-run: ✅ PASS
Backfill scope: ~1,038 suburb_planning_summary rows + 3 data_source_registry entries
No writes: ✅ confirmed
Next step (if approved): Run with --apply to populate Preview derived tables
```

*Report written for Codex review.*
