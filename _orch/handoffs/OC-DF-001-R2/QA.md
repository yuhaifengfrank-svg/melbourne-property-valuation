# OC-DF-001-R2 — Quality Assurance

## Live Verification Queries (Production Neon, 2026-06-30 17:50)

| Query | Expected | Actual | Status |
|-------|----------|--------|--------|
| `SELECT state, COUNT(*) FROM suburb_metrics GROUP BY state` | VIC=247, NSW=1 | VIC=247, NSW=1 | ✅ |
| `SELECT suburb FROM suburb_metrics WHERE state='NSW'` | "sans souci" | "sans souci" | ✅ |
| `VIC: poi_total_count IS NOT NULL` | 247 | 247/247 | ✅ |
| `VIC: crime_total_count IS NOT NULL` | 247 | 247/247 | ✅ |
| `VIC: uv_score_v4 IS NOT NULL` | 245 (Docklands, Southbank missing) | 245/247 | ✅ |
| `SELECT COUNT(*) FROM council_registry` | 79 | 79 | ✅ |
| `SELECT COUNT(*) FROM council_metrics` | 237 | 237 | ✅ |
| `SELECT COUNT(*) FROM vhr_zones` | 2,680 | 2,680 | ✅ |
| `current_database()` | neondb | neondb | ✅ |
| `data_source_registry` exists | false | false | ✅ |
| `salm_sa2_data` exists | true by convention | true | ✅ |
| `suburb_snapshots` exists, 0 rows | true, 0 | true, 0 | ✅ |
| `api/opportunity.js` file exists | true | true | ✅ |
| Suburb HTML count | 238 | 238 | ✅ |
| R1 files git-tracked | false | false | ✅ |

## Licence Verification Audit

| Source | Claimed | Status | CX-DF-002 Pass |
|--------|---------|--------|----------------|
| Vicmap Address | verified | ✅ | ✅ |
| VGV Suburb Median | verified | ✅ | ✅ |
| DFFH Rental Report | licence: unknown, commercial: restricted | ✅ | ✅ |
| ABS ERP | unknown (no `verified_likely`) | ✅ | ✅ |
| ABS Census | unknown | ✅ | ✅ |
| ABS SEIFA | unknown | ✅ | ✅ |
| ACARA | verified (with exceptions) | ✅ | ✅ |
| DEWR SALM | unknown; MODELLED | ✅ | ✅ |
| CSA Crime | verified (CC BY 3.0 AU) | ✅ | ✅ |
| VicPlan | verified | ✅ | ✅ |
| VHR Heritage | verified | ✅ | ✅ |
| OSM POI | verified (ODbL) | ✅ | ✅ |
| VBA Building Permits | verified (CC BY 4.0); automated: blocked | ✅ | ✅ |
| Know Your Council (content) | verified | ✅ | ✅ |
| Know Your Council (data/exports) | unknown | ✅ | ✅ |
| PTV GTFS | verified | ✅ | ✅ |
| Victoria in Future | unknown; MODELLED | ✅ | ✅ |
| Vicmap Features of Interest | unknown | ✅ | ✅ |

## 6 CX-DF-002 Corrections Verification

| Correction | Check | Status |
|------------|-------|--------|
| 1. HANDOVER updated | Timestamp 17:55, VIC 247/247, correct next action | ✅ |
| 2. PROJECT_STATUS errors fixed | Table names, page count 238, api/opportunity exists, Preview/Stage UNKNOWN | ✅ |
| 3. No verified_likely | grep -c produces 0 | ✅ |
| 4. Source metadata corrected | DFFH URL, PTV URL, VIF MODELLED, KYC split, ACARA terms | ✅ |
| 5. Handoff truthfulness | STATE.json pushed:false, tests object, checksum unavailable, FILES.md R2-only | ✅ |
| 6. Append-only activity log | Row appended at end | ✅ |
