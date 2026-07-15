# CX-DF-030 — OC-DF-007 Stage B/C Interim Review

**Result:** changes requested  
**Reviewed worktree:** `.worktrees/oc-df-007`  
**Reviewed branch:** `openclaw/data-oc-df-007`  
**Reviewed HEAD:** `c553ee18`  
**Database write:** none  
**Deployment:** none

## Verified Workbook Layout

The Unit workbook uncertainty is resolved:

| Workbook | Header row (Excel) | First data row | Finalized 2024 column |
|---|---:|---:|---|
| `vgv-houses-2014-2024.xlsx` | 2 | 5 | `AL` (zero-based index 37) |
| `vgv-units-2014-2024.xlsx` | 2 | 3 | `Q` (zero-based index 16) |

The parser's general discovery approach can locate both 2024 columns. It must still validate the distinct layouts explicitly and fail closed on drift.

## Blocking Findings

### Critical 1 — Parser does not run

`node scripts/vgv-fact-parser.mjs` fails with:

```text
ReferenceError: ingestKey is not defined
```

`ingestKey` is scoped inside the row loop but referenced when constructing the ingestion run after the loop. No artifact was generated.

### Critical 2 — Reported Stage C is not present

There are no JSON files under either:

- `.worktrees/oc-df-007/artifacts/`
- `.worktrees/oc-df-007/_orch/handoffs/OC-DF-007/artifacts/`

`STATE.json` and `PROGRESS.md` remain at Stage A. The handoff must report actual filesystem and commit state only.

### High 1 — Observation artifact does not match the approved schema

Current output uses fields such as `metric` and `value`. The approved observation contract requires schema-shaped fields including:

- `metric_key`
- `numeric_value`
- `text_value`
- `status`
- `revision`
- `is_current`
- `limitation_summary`
- `formula_version`
- `calculation_run_key`
- `metadata`

The observation key must be exactly the canonical serializer implemented by `buildObservationKey()`:

```text
metric_key|geography_type|geography_key|property_type|period_start|period_end|as_of_date
```

The current `obs:vgv_suburb_median:...:2024` format is invalid.

### High 2 — Evidence artifact does not match the approved schema

Current output uses `role`, `observation_key`, `workbook_sha256`, `sheet` and related convenience fields at the top level. The approved evidence contract requires schema-shaped fields such as:

- `evidence_role`
- `source_key`
- `ingestion_run_id` or an explicitly documented dry-run reference resolved by the test adapter
- `source_record_ref`
- `source_url`
- `source_period_start`
- `source_period_end`
- `geography_type`
- `geography_key`
- `directness`
- `mapping_confidence`
- `numeric_value`
- `text_value`
- `citation_label`
- `metadata`

Workbook checksum, sheet, Excel row, source cell and raw value belong in `metadata` and/or `source_record_ref`.

### High 3 — Validator closure cannot yet be constructed

The artifacts contain no schema-valid observation/evidence identity relationship and no documented dry-run mapping from ingestion-run references to future BIGSERIAL IDs. Stage D cannot truthfully claim `validateMetricObservation()` coverage until a deterministic in-memory adapter builds IDs and passes the complete closure to the runtime validator.

### Medium 1 — Footnote parsing is incomplete

The parser recognizes a leading `^` but not a trailing marker such as `1292500 ^` or `185000^` consistently. Numeric extraction must accept only an approved numeric-plus-footnote shape, preserve the raw string and reject unrelated trailing text instead of relying on permissive `parseFloat`.

### Medium 2 — Geography display name is damaged

`geography_name` is currently lowercased. Preserve the source locality as the reader-facing name while using a separately normalized deterministic `geography_key`.

### Medium 3 — Source locator mismatch

`evidenceKey(..., ri)` uses a zero-based row while `excel_row` stores `ri + 1`. One-based Excel row identity must be consistent in evidence key, source reference and metadata.

### Medium 4 — Drift checks are too weak

Finding any `2024` cell in the first 20 rows is not enough. Tests must verify:

- expected first sheet and locality header
- exactly one finalized 2024 column
- preliminary 2025 excluded
- known distinct house/unit fixture layouts
- data rows begin after the discovered header
- no preliminary value leaks into observation values

## Required Correction

Continue in the same worktree and branch. Do not create a new worktree or branch. Correct Stage B/C, add Stage D tests, update truthful recovery files and checkpoint each completed stage. Do not connect to a database, execute migrations, deploy or push.

Stop after the complete corrected OC-DF-007 handoff and wait for CX-DF-031 review.
