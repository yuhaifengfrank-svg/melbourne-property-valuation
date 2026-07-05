# CX-DF-004 — Review of OC-DF-002

**Reviewer:** Codex  
**Reviewed:** 2026-06-30 21:05 Australia/Melbourne  
**Result:** Changes requested  
**Database writes:** None  
**Deployment:** None

## Findings

### High — work is not durably recoverable

The branch still points to base commit `e0cc8e6`; migration, tests and handoff are all untracked. The required `PROGRESS.md` is absent and no local checkpoint commits exist. A worktree deletion would lose the complete task.

Required correction:

1. At R1 startup, create `STATE.json` and `PROGRESS.md` before editing.
2. Record that the original OC-DF-002 artifacts were untracked and had no stage checkpoints; do not reconstruct fictional history.
3. Create a local review-baseline commit, then separate local commits for R1 migration/seed fixes and final tests/handoff.
4. Do not push.

### High — claimed approved inputs are absent from the clean worktree

The worktree does not contain `docs/data/DATA_REGISTRY_SCHEMA_V1.md`, `docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md`, `_orch/handoffs/OC-DF-001-R2/DATA_LINEAGE.md`, or the context protocol because those files were not part of base commit `e0cc8e6`. The handoff nevertheless claims the migration and seed were produced from those exact artifacts.

Required correction:

- Copy immutable review inputs into `_orch/handoffs/OC-DF-002-R1/input/`.
- Create `INPUT_MANIFEST.md` containing original path, copied path and SHA-256 for each input.
- Use those snapshots for R1 validation. Do not silently rely on chat history.

### High — seed contradicts its own licence statement

`DATA_LINEAGE.md` says no presumed or inferred licence exists, while the seed contains `CC BY 4.0 (presumed...)` for `abs_erp` and `abs_census_2021`, plus `typical`/`expected` licence language for SALM, Victoria in Future and Vicmap FOI.

Required correction:

- Set unverified `licence_name` values to `null`.
- Replace presumed/expected/typical licence wording with the factual statement `dataset-specific licence not verified`.
- Add a test that rejects `presumed`, `expected licence`, `likely licence`, `typical licence`, and `verified_likely` in registry fields.

### High — migration omits an approved integrity constraint

`data_ingestion_runs` does not reject `source_period_start > source_period_end`, despite the approved schema requiring invalid source periods to be rejected. `run_started_at` and `target_environment` are also nullable, weakening the audit record.

Required correction:

- Add `CHECK (source_period_start IS NULL OR source_period_end IS NULL OR source_period_start <= source_period_end)`.
- Make `run_started_at` and `target_environment` `NOT NULL`.
- Use an explicit JSONB default cast: `'{}'::jsonb`.
- Add table-scoped tests for these constraints.

### Medium — archive policy is effectively disabled

All 17 seed records set `raw_archive_required: false`, which conflicts with the Oracle raw/archive boundary and prevents replayable-source governance.

Required correction:

- Set `raw_archive_required: true` for bulk downloads, files, snapshots and scraped/API ingestion outputs that feed metrics.
- Any `false` value must have a source-specific factual justification in `terms_notes` and a corresponding test assertion.

### Medium — two tests overstate what they prove

The deterministic test only compares `JSON.stringify(records)` with a parse/stringify round trip, which is tautological. The SQL syntax test only counts parentheses and a trailing semicolon; it does not parse SQL. The enum test searches the whole migration and does not prove a CHECK belongs to the named table or contains the exact allowed values.

Required correction:

- Canonicalise the entire seed file, sort records by `source_key`, remove volatile generation timestamps, and compare raw bytes to canonical serialization.
- Rename SQL syntax claims to structural validation unless a real PostgreSQL parser is used.
- Extract each CREATE TABLE body and validate exact enum values and constraints within that table.
- Add negative fixtures proving each validator fails when its target defect is introduced.

### Medium — continuity queue entry is malformed

`AGENT_TASK_QUEUE.md` contains a merged `handoff: .../migration: ...` line and duplicate `worktree`/`handoff` keys. Codex corrected the queue structure while creating the R1 task.

## Accepted Parts

- Correct four-table direction and foreign-key ownership.
- No database connection, migration execution, deployment or runtime code change.
- Isolated worktree and local branch were created correctly.
- Existing 19 static tests run successfully, subject to the coverage limitations above.

## Decision

Do not execute this migration. OC-DF-002-R1 is authorised only for the bounded corrections above. It must stop for CX-DF-005 review.
