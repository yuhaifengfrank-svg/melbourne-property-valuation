# CX-DF-002 - Review of OC-DF-001-R1

**Decision:** Changes requested, bounded final revision  
**Reviewed:** 2026-06-30 17:55 Australia/Melbourne  
**Database actions:** None  
**Deployment actions:** None

## Accepted from R1

- Production coverage was corrected to 247 VIC plus one out-of-scope NSW row.
- VGV was reduced to free suburb-median statistics.
- DFFH was no longer labelled CC BY.
- Raw VBA permits and derived LGA/month aggregates were separated conceptually.
- SALM was identified as modelled.
- Six handoff filenames are present.
- No database write, migration or deployment occurred.

## Required Final Corrections

### 1. HANDOVER was not actually updated

`FILES.md` says R1 reconciled `HANDOVER.md`, but the file still has timestamp 16:58, reports
247/248, and says OC-DF-001 is next. Update it to the R2 state and report 247/247 VIC.

### 2. Correct factual errors in PROJECT_STATUS

- `data_source_registry` is missing, not “0 rows”.
- The table is `salm_sa2_data`, not `salm_data`.
- There are 248 generated suburb HTML pages, not 142.
- `/api/opportunity` exists and is not merely planned.
- Preview/Stage status has not been re-verified in this task; mark it `UNKNOWN`, not “not created”.
- Do not put the Production endpoint identifier in continuity files; call it Production Neon only.

### 3. Use only the agreed licence-status enum

Replace every `verified_likely` with `unknown`. The allowed values are `verified`, `restricted` and
`unknown`. A general government convention or footer inference is not verification.

### 4. Correct source-specific metadata

- DFFH exact landing URL is `https://www.dffh.vic.gov.au/publications/rental-report`. Access is
  public; commercial reuse is restricted/unknown. Do not set source access itself to restricted.
- PTV GTFS has an exact official dataset page and CC BY 4.0:
  `https://opendata.transport.vic.gov.au/dataset/gtfs-schedule`.
- Victoria in Future is an external modelled projection. Set data class to `MODELLED`, not `FACT`.
- Know Your Council page content may inherit vic.gov.au CC BY, but the downloadable/dashboard data
  reuse and automated extraction status remain `unknown` until the actual data/export terms are
  checked.
- ACARA CC BY 4.0 is acceptable only for standard ACARA-hosted downloadable products without a
  source-specific exclusion. Keep the exclusion and attribution conditions in `terms_notes`.

### 5. Correct handoff truthfulness

- R1 artifacts are untracked, so `pushed` must be `false`; the base HEAD being pushed is separate.
- `FILES.md` must list only files changed during R1. Scripts created in earlier sessions cannot be
  claimed as R1 changes.
- Add the required `tests` object to `STATE.json`.
- Record the actual SHA-256 checksum for the VBA raw file, or mark checksum unavailable. A filename
  is not a checksum.

### 6. Preserve append-only chronology

Do not insert activity rows ahead of existing rows. Append the R2 row at the end, even if earlier
timestamps are out of order from past edits.

## R2 Acceptance Gates

- All continuity facts match repository/live evidence.
- No `verified_likely`, presumed licence, stale endpoint or nonexistent table remains.
- All source URLs point to exact current landing/dataset pages where available.
- Handoff statements match Git tracking/push reality.
- R2 bundle is complete and internally consistent.
- No database write, migration, deployment, API, model or frontend change.

