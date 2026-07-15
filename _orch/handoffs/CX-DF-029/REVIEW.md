# CX-DF-029 — OC-DF-006 Review

**Result:** accepted with source correction  
**Reviewed handoff:** `_orch/handoffs/OC-DF-006/` at `f8fa3be9`  
**Database write:** none  
**Deployment:** none

## Decision

OC-DF-006 is accepted as a useful inventory, but its proposed Phase 1 source is not approved.

`median_house_price` and `median_unit_price` are registered as direct VGV FACT metrics with required primary dependency `vgv_suburb_median`. They must not be generated from `comparable_sales`; a rolling median calculated from scraped transactions would be a different derived metric with different lineage.

Phase 1 must use these tracked canonical inputs:

- `data/vgv-houses-2014-2024.xlsx`
- `data/vgv-units-2014-2024.xlsx`

The land workbook is out of scope.

## Required Phase 1 Policy

1. Use finalized calendar year 2024 only.
2. Exclude the preliminary 2025 column from publishable observations.
3. Create one ingestion-run draft per workbook, both using source key `vgv_suburb_median`.
4. Preserve each workbook SHA-256, sheet name, Excel row and cell/range locator.
5. Emit direct suburb FACT observations with `period_start=2024-01-01`, `period_end=2024-12-31`, `as_of_date=2024-12-31`.
6. Use deterministic geography, observation and evidence keys. Key construction must be documented and tested.
7. Missing, suppressed, footnoted or malformed cells must be classified explicitly; never coerce them silently to zero.
8. Phase 1 is artifact-only. No database write, migration execution, deployment, push, API change, scoring change or frontend change is authorized.

## Corrective Finding

The existing `_vgv_download.cjs` parser is not an approved implementation baseline. The current house workbook has merged multi-row headers and year columns at non-contiguous positions; the unit workbook has a different layout. The Phase 1 parser must discover and validate the 2024 column from workbook structure and fail closed on unexpected schema drift.

## Next Gate

OC-DF-007 implements the deterministic VGV Phase 1 dry-run bundle and stops for CX-DF-030 review.
