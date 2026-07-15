# CX-DF-033 Review: OC-DF-007-R2

Status: CHANGES REQUESTED

Reviewed task worktree: `.worktrees/oc-df-007`

Reviewed branch: `openclaw/data-oc-df-007`

Reviewed HEAD: `55471991`

## Findings

### Critical 1: Validator tests report success while validation still fails

The test run prints 3,399 errors after changing observations to `publication_status=approved`, but the corresponding test passes because it ends with `assert.ok(true)`. The review-pending test also does not enforce the stated exact error set.

The runtime validator expects `metric_class`, while the registry seed and test definitions use `data_class`. This causes `INVALID_VALUE_SHAPE` and affects evidence-closure classification. Add an explicit registry-to-validator definition adapter and test it. Do not change the registry schema in this task.

Required result:

- Review-pending validation must assert the exact expected error codes and counts.
- Approved validation must assert zero errors.
- No unconditional passing assertions are allowed.
- The ingestion-source mismatch must be investigated and removed through correct test context, not ignored.

### Critical 2: Claimed negative fixtures are no-op tests

The missing-column test has no effective assertion. The missing-header and duplicate-header tests use `assert.ok(true)`. The preliminary-year test only inspects existing output and does not mutate an input fixture.

Replace these with executable mutation fixtures that fail for the intended reason. At minimum cover missing 2024 column, missing header, duplicate header, preliminary 2025 leakage, unresolved observation reference, wrong workbook SHA/run mapping, key collision, and volatile-field determinism.

### High 1: Materialized artifacts are simulations, not database-ready rows

`data_ingestion_runs.json` uses `status: planned`, omits required runtime timestamps, and simulated observation/evidence IDs use `dr:` strings while database IDs are BIGSERIAL. Migration 017 permits only `running`, `succeeded`, `partial`, `failed`, or `skipped`.

Rename and document these outputs as simulation artifacts. Remove all claims that they are ready for database insertion. Keep the future persistent importer boundary explicit: it must create real ingestion runs, obtain database IDs, and only then resolve observation/evidence foreign keys.

### High 2: Rejection counts are lost during simulation materialization

The parser records 28 rejected house rows and 66 rejected unit rows, but both materializers overwrite `rows_rejected` with zero. Preserve the source plan counts and assert 28/66 in materializer tests.

### Medium 1: Worktree is not clean

`git status --short` reports:

```text
?? _orch/handoffs/OC-DF-007/artifacts/materialized/
```

Either include the required deterministic review artifacts or ignore the correct path. Final status must be genuinely clean.

### Medium 2: Handoff state is stale and internally inconsistent

`STATE.json` still reports an earlier HEAD and CX-DF-032 state. Test counters and SUMMARY claims do not consistently describe the R2 output. Update all handoff files with the actual final HEAD, test totals, limitations, artifact classification, and next review ID.

## Accepted Work

- 749 house and 384 unit observations are present.
- ALLANSFORD is restored at 540000.
- Independent parser runs produce byte-identical canonical artifacts.
- `observation_key_ref` resolves one-to-one in the in-memory simulation.
- House and unit workbook SHA mappings are separated correctly.

## Required Next Task

Execute `OC-DF-007-R3` in the existing worktree and branch. Fix only the findings above. Do not connect to a database, execute migrations, deploy, push, or start persistent ingestion. Finish with truthful handoff documents, real assertions, all tests passing, `git diff --check` clean, and a genuinely clean worktree. Then stop for `CX-DF-034` review.
