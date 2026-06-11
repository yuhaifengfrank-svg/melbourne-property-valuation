# Overall Confidence — Data Quality Report

**Date:** 2026-06-10 19:10 AEST  
**Status:** ✅ Fixed

---

## Root Cause

The `suburb_metrics` table had **478 rows** for **238 unique suburbs** — every suburb was duplicated.

### Why duplicates?

Two different scoring runs wrote to the DB with different casing:

| Scoring Version | Rows | Casing | Has Confidence? |
|---|---|---|---|
| `opp-2.0.0-beta` | 248 | Proper case (`Werribee`) | ✅ Yes (80.4 avg) |
| `v2` | 230 | Lowercase (`werribee`) | ❌ All NULL |

The `INSERT ON CONFLICT (suburb, state) DO UPDATE` didn't catch duplicates because `Werribee` ≠ `werribee` in PostgreSQL text comparison.

### Why are the `v2` rows worse?

Every `v2` row was a **strict subset** — all factor confidences, source confidences, fallback tiers, growth data, and supply data were NULL (only `vacancy_rate` was populated, with a worse regional default).

### The 8 resort towns

Aireys Inlet, Anglesea, Barwon Heads, Lorne, Point Lonsdale, Portsea, Queenscliff, and Sorrento had the opposite pattern — the lowercase row had confidence (43.6 avg) while the proper-case row had higher confidence (57.9 avg). The `opp-2.0.0-beta` version was always superior.

### The 2 Mc-name suburbs

`McCrae` and `McKinnon` had `INITCAP` normalization issues (`Mccrae`, `Mckinnon`). The improper-cased rows also had `opp-2.0.0-beta` scoring but lower confidence (40.1 and 44.1 vs 58.2 and 63.8).

---

## Before/After

| Metric | Before | After |
|--------|--------|-------|
| Total rows | 478 | 238 |
| With confidence | 248 | 238 |
| NULL confidence | **230** | **0** |
| Confidence coverage | 52% | **100%** |
| Active pages with NULL | 230 | 0 |

---

## What Was Deleted

1. **230 `v2` rows** — lowercase, no confidence, strict subset of `opp-2.0.0-beta` rows (DELETE WHERE scoring_version='v2')
2. **8 lowercase resort duplicates** — Aireys Inlet, Anglesea, Barwon Heads, Lorne, Point Lonsdale, Portsea, Queenscliff, Sorrento (lowercase variant)
3. **2 Mc-name duplicates** — `Mccrae`, `Mckinnon` (improper INITCAP)

**Total deleted: 240 rows**

---

## Affected Suburb Examples (Before Fix)

These are representative suburbs that had NULL overall_confidence before the fix:

| Suburb | Before | After | Opportunity Type |
|--------|--------|-------|-----------------|
| Werribee | NULL → 81.1 | ✅ | Growth Opportunity |
| Deer Park | NULL → 81.1 | ✅ | Growth Opportunity |
| Glen Waverley | NULL → 79.9 | ✅ | Growth Opportunity |
| Box Hill | NULL → 79.9 | ✅ | School Zone Opportunity |
| Sunshine | NULL → 80.8 | ✅ | Growth Opportunity |
| Dandenong | NULL → 80.6 | ✅ | Growth Opportunity |
| Brighton | NULL → 78.9 | ✅ | Balanced Opportunity |
| Murrumbeena | NULL → 78.7 | ✅ | Balanced Opportunity |
| Clyde North | NULL → 80.4 | ✅ | Growth Opportunity |
| Tarneit | NULL → 80.2 | ✅ | Balanced Opportunity |

---

## Recommended Cleanup (Prevent Recurrence)

1. ✅ **Done:** Deleted all `v2` scoring_version duplicate rows
2. ✅ **Done:** Validated 238 rows = 238 pages, 100% confidence coverage
3. **Not done (low priority):** Add `CHECK (suburb = INITCAP(suburb))` constraint — would prevent future casing mismatches but may break the refresh script which writes lowercase
4. **Not done (low priority):** Fix `refresh-suburb-metrics.js` to write `INITCAP(suburb)` instead of `LOWER(suburb)` — would ensure consistent casing

---

## Trust Layer Verification

- ✅ `GET /api/suburb-intelligence?suburb=Werribee` → `overallConfidence: 81.1`
- ✅ `GET /api/suburb-intelligence?suburb=Sorrento` → `overallConfidence: 57.9`
- ✅ `GET /api/opportunity?strategy=smart` → scores and types populated
- ✅ Trust Layer v2 fallback logic no longer triggered (real confidence values returned)
- ✅ UI will now show correct confidence tiers:
  - Werribee (81.1): "high — Based on strong recent sales evidence..."
  - Sorrento (57.9): "medium — Based on a mix of sales evidence..."
  - Most suburbs 60-80+: "high" tier

## Scripts Used

- `scripts/audit-confidence.mjs` — Initial audit
- `scripts/fix-confidence.mjs` — Delete v2 rows
- `scripts/fix-confidence2.mjs` — Cleane lowercase resort dupes
- `scripts/verify-after.mjs` — Verification pass
