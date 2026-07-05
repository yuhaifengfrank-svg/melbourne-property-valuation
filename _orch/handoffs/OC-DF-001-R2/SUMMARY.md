# OC-DF-001-R2 — Final Source Registry Corrections

**Agent:** OpenClaw  
**Completed:** 2026-06-30 17:55 (Australia/Melbourne)  
**Branch:** `deploy/oracle-artifacts` (base HEAD `e0cc8e6`; R2 artifacts are untracked, not pushed)  
**Preceding review:** CX-DF-002 (changes requested, bounded final revision)  
**Reference contract:** `docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md`  
**Database actions:** None  
**Deployment actions:** None

## Changes Applied per CX-DF-002

| # | CX-DF-002 Item | R2 Action | Status |
|---|---|---|---|
| 1 | HANDOVER not actually updated | Rewritten with timestamp 17:55, VIC 247/247, correct next action | ✅ |
| 2 | PROJECT_STATUS factual errors | Corrected: table names, suburb page count (238), api/opportunity (exists), Preview/Stage UNKNOWN, Production Neon (no identifier), data_source_registry (does not exist) | ✅ |
| 3 | verified_likely → unknown | All 6+ instances replaced with `unknown` — no presumed/inferred licence status | ✅ |
| 4 | Source metadata corrections | DFFH URL fixed, PTV GTFS URL fixed, Victoria in Future → MODELLED, KYC data terms → unknown, ACARA terms note preserved | ✅ |
| 5 | Handoff truthfulness | STATE.json `pushed: false` (untracked artifacts), FILES.md lists only R2 files, checksum marked unavailable, `tests` object added | ✅ |
| 6 | Append-only chronology | Activity log row appended at end, not inserted | ✅ |

## Evidence Verified Live

| Check | Result | Method |
|-------|--------|--------|
| VIC rows | 247 | `SELECT COUNT(*) FROM suburb_metrics WHERE state='VIC'` |
| NSW rows | 1 (sans souci) | `SELECT suburb, state FROM suburb_metrics WHERE state='NSW'` |
| VIC POI coverage | 247/247 | `SELECT COUNT(*) WHERE poi_total_count IS NOT NULL` |
| VIC Crime coverage | 247/247 | `SELECT COUNT(*) WHERE crime_total_count IS NOT NULL` |
| VIC UV V4 coverage | 245/247 | Docklands, Southbank missing |
| Council Registry | 79/79 | `SELECT COUNT(*) FROM council_registry` |
| Council Metrics | 237 rows | `SELECT COUNT(*) FROM council_metrics` |
| VHR Heritage | 2,680 zones | `SELECT COUNT(*) FROM vhr_zones` |
| DB Name | `neondb` | `SELECT current_database()` — Production Neon |
| `data_source_registry` exists | false | `SELECT EXISTS(... FROM information_schema.tables...)` |
| `salm_` table | `salm_sa2_data` | `information_schema.tables` |
| `suburb_snapshots` exists | true (0 rows) | `information_schema.tables` |
| `api/opportunity.js` | exists | `test -f api/opportunity.js` |
| Suburb HTML pages | ~238 | `ls dist/suburb/*.html | wc -l` |
| R1 artifact tracking | untracked | `git ls-files --error-unmatch` failed |

## Licence Status Summary (Codified Enum)

| Source | licence_status | commercial_reuse | automated_access |
|--------|---------------|-----------------|-----------------|
| Vicmap Address | verified | verified | unknown |
| VGV Suburb Median Stats | verified | verified | unknown |
| DFFH Rental Report | unknown | restricted | unknown |
| ABS ERP | unknown | unknown | known |
| ABS Census 2021 | unknown | unknown | known |
| ABS SEIFA | unknown | unknown | unknown |
| ACARA School Profiles | verified | verified | unknown |
| DEWR SALM | unknown | unknown | unknown |
| CSA Crime Statistics | verified | verified | unknown |
| VicPlan | verified | verified | known |
| VHR Heritage | verified | verified | unknown |
| OSM POI | verified | verified | verified |
| VBA Building Permits | verified | verified | blocked |
| Know Your Council (content) | verified | verified | unknown |
| Know Your Council (data/exports) | unknown | unknown | unknown |
| PTV GTFS | verified | verified | known |
| Victoria in Future | unknown | unknown | unknown |
| Vicmap Features of Interest | unknown | unknown | unknown |

## Three-Table Schema Design (Proposed)

```sql
-- 1. Static registry of every data source we depend on
CREATE TABLE data_source_registry (
  source_key      TEXT PRIMARY KEY,          -- short machine key (e.g. 'vgv_median')
  display_name    TEXT NOT NULL,             -- human name
  publisher       TEXT NOT NULL,             -- organisation
  exact_url       TEXT,                      -- current landing / dataset page
  licence         TEXT,                      -- full licence name (e.g. 'CC BY 4.0')
  licence_status  TEXT NOT NULL DEFAULT 'unknown',  -- verified | restricted | unknown
  commercial_reuse TEXT NOT NULL DEFAULT 'unknown',  -- verified | restricted | unknown | blocked
  automated_access TEXT NOT NULL DEFAULT 'unknown',  -- verified | restricted | unknown | blocked
  evidence_url    TEXT,                      -- URL where licence/terms were verified
  evidence_checked DATE,                     -- date of last verification
  cadence         TEXT,                      -- (Quarterly, Annual, ...)
  grain           TEXT,                      -- (Suburb, LGA, SA2, School, ...)
  data_class      TEXT NOT NULL DEFAULT 'FACT',  -- FACT | MODELLED | DERIVED | UNKNOWN
  raw_archive     TEXT,                      -- path or 'none' or 'not_applicable'
  terms_notes     TEXT,                      -- free-text: exclusions, attribution, caveats
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Log of every ingestion run (which sources, what rows, any errors)
CREATE TABLE data_ingestion_runs (
  run_id          BIGSERIAL PRIMARY KEY,
  source_key      TEXT NOT NULL REFERENCES data_source_registry(source_key),
  target_table    TEXT NOT NULL,              -- which DB table was filled
  target_rows     INTEGER,                    -- rows inserted/upserted
  run_started_at  TIMESTAMPTZ NOT NULL,
  run_completed_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | success | error
  error_message   TEXT,
  notes           TEXT
);

-- 3. Registry of every derived metric so we can trace lineage
CREATE TABLE metric_definition_registry (
  metric_key      TEXT PRIMARY KEY,           -- short key (e.g. 'house_gross_yield')
  display_name    TEXT NOT NULL,
  data_class      TEXT NOT NULL DEFAULT 'DERIVED',  -- DERIVED | MODELLED
  source_keys     TEXT[] NOT NULL,            -- references source_key(s)
  formula_or_method TEXT,                     -- plain-text description
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

## Handoff Bundle Files

| File | Purpose |
|------|---------|
| `SUMMARY.md` | This file |
| `STATE.json` | Structured task state |
| `FILES.md` | File inventory |
| `QA.md` | Verification queries and checks |
| `DATA_LINEAGE.md` | Full corrected lineage for all 17 sources |
| `NEXT.md` | Next action for Codex |

## Outstanding

- Codex final review (CX-DF-003) to approve registry schema and source records
- After approval: create migration, populate registry
- Phase 3 Know Your Council awaits
