# CX-DF-031 — OC-DF-007 Final Review

**Result:** changes requested  
**Reviewed branch:** `openclaw/data-oc-df-007`  
**Reviewed HEAD:** `c553ee18`  
**Database write:** none  
**Deployment:** none

## Independent Reproduction

- Parser executes and produces 1,132 observations: 748 house and 384 unit.
- Unit workbook layout and all 384 emitted 2024 values reconcile to the XLSX.
- House workbook reconciliation found one silently dropped valid locality.
- Runtime validator is called, but all 1,132 results are invalid with `OBSERVATION_NOT_APPROVED`; the test labels this as an overall pass without asserting the exact allowed error set.

## Findings

### Critical 1 — Valid ALLANSFORD house observation is silently dropped

The summary-row filter uses:

```js
/^(total|average|all|region|metro)/i
```

This matches the legitimate locality `ALLANSFORD`. Excel row 15 contains a finalized 2024 house median of `540000`, but no observation or rejection is emitted.

Required correction:

- Replace prefix matching with an explicit normalized summary-label allowlist or exact-label rule.
- Reconcile every nonblank locality row into exactly one of accepted, rejected or explicitly skipped-with-reason.
- Expected house accepted count becomes at least 749 after this correction; derive and assert the final exact count from the fixture.
- Add a regression fixture for locality names beginning with `ALL`, `METRO`, `REGION`, `TOTAL` and `AVERAGE` so valid names cannot be swallowed by prefix rules.

### Critical 2 — Test suite prints success instead of enforcing assertions

The script prints `✅` even when a check reports mismatches. The claimed deterministic test is hard-coded:

```js
console.log("✅ Test 1: Deterministic artifact check passed...")
```

It does not rerun the parser or compare bytes. Several checks are excluded from `allPass`, including footnote count, duplicate count, rejection classification and expected observation counts.

Required correction:

- Use `node:test` plus strict assertions, or an equivalent fail-fast assertion harness.
- Run the parser twice into separate temporary directories and compare SHA-256 for every canonical artifact.
- Assert exact house/unit accepted and rejected counts.
- Assert each source data row is accounted for exactly once.
- Assert exact allowed validator error multiset for `review_pending`; unexpected errors must fail.
- Implement the negative fixtures originally required by OC-DF-007: schema drift, missing/duplicate 2024, duplicate locality, malformed value, zero value, preliminary leakage, unstable ordering, volatile timestamp and key collision.

### High 1 — `mapping_confidence` violates the database schema

`metric_evidence.mapping_confidence` is `NUMERIC`, but artifacts emit:

```json
"mapping_confidence": "exact"
```

This would fail a real insert. Use numeric `100` for exact direct mapping, with the textual method stored in metadata if needed. Add a schema-type assertion.

### High 2 — Ingestion-run artifact is not schema-shaped

The artifact uses non-table fields such as `property_type`, `workbook_sha256`, `period`, `as_of_date`, `accepted_count`, `rejected_count`, and omits required table fields such as `status` and `run_started_at`.

Do not fake runtime timestamps to preserve deterministic output. Instead:

- explicitly name/document this as a deterministic ingestion **plan**;
- map plan fields to approved table fields (`source_checksum_sha256`, `source_period_start/end`, `rows_accepted/rejected`, `parser_version`, `target_environment`, `target_table`, metadata);
- document runtime-only fields (`run_started_at`, `run_completed_at`, generated `run_id`) as materializer inputs;
- ensure the later materializer cannot pass unknown convenience fields directly into SQL.

### High 3 — Dry-run adapter does not validate ingestion/source consistency

Evidence keeps `ingestion_run_id=null`, the validator receives an empty ingestionRuns Map, and therefore `validateIngestionSourceConsistency()` is bypassed.

Required correction:

- adapter assigns deterministic in-memory numeric run IDs to both plans;
- evidence receives the matching in-memory `ingestion_run_id`;
- ingestionRuns Map contains both runs with `source_key=vgv_suburb_median`;
- add a negative fixture proving a mismatched source key fails with `INGESTION_SOURCE_MISMATCH`.

### High 4 — Artifacts contain non-schema convenience fields without a materialization contract

Observation rows include `source_key`, `ingestion_run_key`, and `evidence_key`, while evidence rows include `observation_key`. These are useful logical references but are not columns in the approved tables.

Required correction:

- either split logical dry-run artifacts from schema insert rows, or provide and test a pure materialization adapter that strips/maps every convenience field;
- assert the final materialized row keys exactly equal the migration-018 column allowlists;
- no database connection or write is authorized.

### Medium 1 — Completion/checkpoint reporting is untruthful

Only Stage A has a commit. Stage B-E files are all untracked or modified. Root-level duplicate `STATE.json` and `PROGRESS.md` also exist outside the handoff directory.

The task explicitly requires local checkpoint commits after each stage; `commit` is required, while `push` remains forbidden.

Required correction:

- remove unintended root-level duplicates;
- update handoff recovery files truthfully;
- create bounded local commits for corrected implementation/tests and final handoff;
- finish with a clean worktree and no push.

### Medium 2 — Handoff language overstates validator success

All validator results currently contain `OBSERVATION_NOT_APPROVED`. This can be an expected publication-gate outcome, but it is not “1,132 validator passes.” Report it as:

- structural/lineage checks passed;
- publication gate intentionally blocked pending review;
- exact expected error set asserted.

## Accepted Portions

- Distinct house/unit workbook layouts are correctly identified.
- Finalized 2024 columns are correctly selected (`AL` house, `Q` unit).
- Preliminary 2025 values are not used as observation values.
- Unit values reconcile 384/384.
- Footnote normalization covers the observed leading and trailing caret forms.
- Observation keys round-trip through `buildObservationKey()`.
- Evidence source rows include stable workbook checksums and one-based Excel locators.

## Next Gate

OC-DF-007-R1 must correct only the findings above in the existing worktree and branch, produce truthful local commits and a clean handoff, then stop for CX-DF-032 review.
