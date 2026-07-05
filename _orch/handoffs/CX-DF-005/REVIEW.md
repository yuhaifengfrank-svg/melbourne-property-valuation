# CX-DF-005 — Final Review of OC-DF-002-R1

**Reviewer:** Codex  
**Reviewed:** 2026-06-30 21:35 Australia/Melbourne  
**Result:** Changes requested  
**Database writes:** None  
**Deployment:** None

## Findings

### Critical — migration contains invalid PostgreSQL syntax

`ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS` is not valid PostgreSQL syntax. PostgreSQL supports `IF NOT EXISTS` for adding columns and `IF EXISTS` for dropping constraints, but not `ADD CONSTRAINT IF NOT EXISTS`. Static tests did not parse the SQL, so they passed an unexecutable migration.

Required correction:

- Define the named period constraint inside `CREATE TABLE data_ingestion_runs`, or use a valid guarded `DO` block.
- Prefer an inline named constraint because the registry tables are verified absent and this is a creation migration.
- Update tests so the constraint must exist inside the `data_ingestion_runs` table body.

### High — deterministic seed test does not validate the actual seed file

The test builds a new canonical object and compares it with a round trip of itself. It never compares `seedRaw` with canonical bytes. The actual seed still contains a volatile `generated_at` field and records are not sorted by `source_key`; an independent audit confirms the actual file is not canonical.

Required correction:

- Remove volatile `generated_at` from the seed package.
- Sort the actual seed records by `source_key`.
- Make the test compare `seedRaw` byte-for-byte with `canonicalPackage(records, actualStableMeta)`.
- Add a negative fixture with unsorted records or a volatile timestamp and prove the same validator rejects it.

### High — enum test still permits extra values

The test verifies that every expected enum value appears, but does not reject additional values. A CHECK containing all expected values plus an unsafe extra value would pass despite the report claiming exact validation.

Required correction:

- Parse the quoted values from each table-scoped CHECK and compare sorted sets for equality.
- Add a negative fixture containing one extra enum value and prove rejection.

### Medium — VicPlan archive policy contradicts the stored raw snapshot

The seed sets `vicplan.raw_archive_required=false`, while its own notes say the raw polygon snapshot exists on the Oracle VM. `raw_archive_required` describes the project policy, not whether raw data is stored in Neon or fetched through WFS.

Required correction:

- Set VicPlan to `raw_archive_required=true`.
- Expected policy becomes 16 true / 1 false; only `vicmap_address` may remain false with its API-only justification.

### Medium — final handoff state is stale

Actual branch state is clean at `6a96d4e` with six commits above `e0cc8e6`. `STATE.json`, `SUMMARY.md`, `FILES.md`, `QA.md` and `PROGRESS.md` still report `d8b6084` and five commits. `INPUT_MANIFEST.md` also implies the snapshots were part of commit `e0cc8e6`, although they came from uncommitted main-worktree artifacts while main HEAD happened to be `e0cc8e6`.

Required correction:

- Update the completed handoff after the final R2 commit using the actual final HEAD and commit count.
- State that input sources were copied from the main worktree and were not contained in `e0cc8e6`.
- Correct the snapshot filename discrepancy (`REVIEW.md`, not `CX-DF-004_REVIEW.md`).
- Do not amend or rewrite the existing six commits; add bounded R2 commits.

## Verified Improvements

- Six real local commits and a clean worktree now provide durable recovery.
- All five input snapshot hashes match both the manifest and current source artifacts.
- Licence fields no longer make inferred licence claims in registry records.
- `run_started_at`, `target_environment`, JSONB default and date-range intent are correctly represented apart from the invalid ADD CONSTRAINT syntax.
- No database write, migration execution, deployment or push occurred.

## Decision

Do not execute the migration. OC-DF-002-R2 is authorised only for the five bounded corrections above and must stop for CX-DF-006 review.
