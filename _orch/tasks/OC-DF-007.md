# OC-DF-007 — VGV FACT Phase 1 Dry Run

## Objective

Build a database-free, deterministic extraction pipeline for:

- `median_house_price`
- `median_unit_price`

using finalized 2024 VGV workbook values and producing validator-ready ingestion, observation and evidence artifacts.

## Start State

- Base branch: `openclaw/data-oc-df-006`
- Base HEAD: `f8fa3be9`
- New branch: `openclaw/data-oc-df-007`
- New worktree: `.worktrees/oc-df-007`
- Review authority: `_orch/handoffs/CX-DF-029/REVIEW.md`
- Context protocol: `_orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md`

## Required Inputs

Copy immutable snapshots plus SHA-256 into `_orch/handoffs/OC-DF-007/input/`:

1. `data/vgv-houses-2014-2024.xlsx`
2. `data/vgv-units-2014-2024.xlsx`
3. `db/migration-017-data-registry.sql`
4. `db/migration-018-metric-observations.sql`
5. `lib/metric-observation-validator.js`
6. canonical metric-definition seed
7. canonical metric-dependency seed
8. `_orch/handoffs/CX-DF-029/REVIEW.md`

Create `INPUT_MANIFEST.md` with original path, snapshot path, SHA-256, byte size and snapshot time.

## Implementation Stages

### Stage A — Recovery bootstrap

- Create `STATE.json` and `PROGRESS.md` before implementation.
- Record base HEAD and clean/dirty status truthfully.
- Commit the bootstrap checkpoint.

### Stage B — Schema-aware VGV parser

- Parse the house and unit workbooks independently.
- Discover the finalized `2024` column from workbook headers; do not use a single hard-coded column index for both layouts.
- Treat preliminary 2025 values as out of scope.
- Normalize numeric cells containing VGV footnote markers without losing the original raw value.
- Reject zero, negative, blank, `-`, `NA`, malformed and duplicate locality rows with explicit reason codes.
- Fail closed if sheet name/header/year layout differs from the approved fixtures.

### Stage C — Deterministic artifacts

Generate canonical, sorted JSON artifacts:

- `artifacts/data_ingestion_runs.json`
- `artifacts/metric_observations.json`
- `artifacts/metric_evidence.json`
- `artifacts/rejections.json`
- `artifacts/coverage_summary.json`

Rules:

- source key: `vgv_suburb_median`
- geography type: `suburb`
- state: `VIC`
- property types: `house` and `unit`
- period: `2024-01-01` to `2024-12-31`
- as-of date: `2024-12-31`
- directness: `direct`
- evidence role: `primary`
- publication status: `review_pending`
- no volatile timestamps in canonical artifacts
- preserve workbook checksum, sheet, Excel row, source cell/range and raw value in lineage metadata

Document exact construction for:

- geography key
- observation key
- ingestion artifact key
- evidence key

### Stage D — Validation and tests

- Validate every observation/evidence closure with `validateMetricObservation()`.
- Add positive tests for both workbook layouts and footnoted numeric cells.
- Add negative fixtures for schema drift, missing 2024, duplicate locality, malformed value, zero value, preliminary-column leakage, unstable ordering, volatile timestamp and key collision.
- Assert byte-for-byte deterministic output across two runs.
- Assert no `comparable_sales` dependency exists anywhere in the Phase 1 artifacts.

### Stage E — Handoff

Create a complete `_orch/handoffs/OC-DF-007/` bundle:

- `SUMMARY.md`
- `STATE.json`
- `PROGRESS.md`
- `FILES.md`
- `QA.md`
- `DATA_LINEAGE.md`
- `NEXT.md`
- `INPUT_MANIFEST.md`
- `artifacts/`
- `input/`

Report accepted/rejected counts separately for house and unit, locality overlap, missing 2024 values, checksum values and exact test totals.

## Forbidden

- No Neon or other database connection
- No migration execution
- No database writes
- No changes to collection scripts, cron or `comparable_sales`
- No API, scoring, AI summary or frontend changes
- No deployment
- No push
- No preliminary 2025 publication
- No Phase 2 metrics

## Context Safety

- Checkpoint commit after every completed stage.
- Update `STATE.json` and `PROGRESS.md` after every stage.
- At 55% context, stop reading unrelated files.
- At 65%, finish the current atomic step, checkpoint and stop.
- At 70%, stop immediately after preserving recovery state.

## Completion Gate

Stop after the clean local handoff and wait for CX-DF-030 review.
