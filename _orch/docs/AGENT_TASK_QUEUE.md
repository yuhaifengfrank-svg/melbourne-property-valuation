# AusHomeValue Agent Task Queue

**Purpose:** Allow OpenClaw to continue approved low-risk work while Codex is unavailable.  
**Rule:** Only tasks marked `auto_continue: yes` may start without a new Codex review.

## Status Values

`queued | in_progress | completed | blocked | awaiting_codex_review | accepted | changes_requested`

## Queue

### OC-DF-000 - Reconcile continuity state

```yaml
owner: OpenClaw
status: changes_requested
completed_at: 2026-06-30T16:58:00+10:00
handoff: _orch/handoffs/OC-DF-000/
auto_continue: yes
requires_codex_review: yes
```

### OC-DF-001 - Prepare source-registry evidence

```yaml
owner: OpenClaw
status: changes_requested
completed_at: 2026-06-30T17:00:00+10:00
handoff: _orch/handoffs/OC-DF-001/
auto_continue: yes
requires_codex_review: yes
```

---

### CX-DF-001 - Registry/schema review

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T17:30:00+10:00
risk: review
result: changes_requested
review: _orch/handoffs/CX-DF-001/REVIEW.md
database_write: none
deployment: none
requires_codex_review: true
```

Codex should:
1. Read OC-DF-000 + OC-DF-001 handoff bundles
2. Validate proposed source keys, terms, and licence claims
3. Design or approve `data_source_registry` table schema
4. Review migration order for D0 (naming freeze)
5. Authorize next OpenClaw implementation task

---

### OC-DF-001-R1 - Correct source registry and continuity bundle

```yaml
owner: OpenClaw
status: changes_requested
completed_at: 2026-06-30T17:40:00+10:00
handoff: _orch/handoffs/OC-DF-001-R1/
auto_continue: yes
requires_codex_review: yes
risk: low
database_write: none
deployment: forbidden
review_instructions: _orch/handoffs/CX-DF-001/REVIEW.md
```

Objective:

- Apply every required change in the Codex review.
- Complete the durable handoff bundle under `_orch/handoffs/OC-DF-001-R1/`.
- Correct the source/licence evidence, registry schema split, state coverage and continuity files.
- Stop for Codex review.

**No implementation, database write or deployment task is authorised after OC-DF-001-R1.**

---

### CX-DF-002 - Review corrected registry bundle

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T17:55:00+10:00
result: changes_requested
database_write: none
deployment: none
review: _orch/handoffs/CX-DF-002/REVIEW.md
```

### OC-DF-001-R2 - Final metadata and continuity correction

```yaml
owner: OpenClaw
status: accepted
completed_at: 2026-06-30T17:55:00+10:00
handoff: _orch/handoffs/OC-DF-001-R2/
auto_continue: yes
requires_codex_review: yes
risk: low
database_write: none
deployment: forbidden
review_instructions: _orch/handoffs/CX-DF-002/REVIEW.md
```

Objective:

- Apply only the bounded corrections in CX-DF-002.
- Create `_orch/handoffs/OC-DF-001-R2/` with a complete six-file bundle.
- Stop for final Codex source-registry review.

**No implementation, migration, database write or deployment task is authorised after R2.**

### CX-DF-003 - Final source-registry review

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T20:10:00+10:00
result: accepted_with_codex_correction
review: _orch/handoffs/CX-DF-003/REVIEW.md
approved_schema: docs/data/DATA_REGISTRY_SCHEMA_V1.md
database_write: none
deployment: none
```

### OC-DF-002 - Draft registry migration and seed artifact

```yaml
owner: OpenClaw
status: changes_requested
completed_at: 2026-06-30T20:30:00+10:00
worktree: .worktrees/oc-df-002
branch: openclaw/data-oc-df-002
handoff: _orch/handoffs/OC-DF-002/
migration: db/migration-017-data-registry.sql
tests: tests/data-registry-static-tests.mjs (19/19 pass)
seed: _orch/handoffs/OC-DF-002/seed/data_source_registry_seed.json (17 records)
auto_continue: yes
requires_codex_review: yes
risk: low
database_write: forbidden
deployment: forbidden
runtime_code_changes: forbidden
schema: docs/data/DATA_REGISTRY_SCHEMA_V1.md
context_protocol: _orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md
checkpoint_threshold: 65_percent
hard_stop_threshold: 70_percent
```

Objective:

- Create an isolated worktree and branch for this task.
- Draft, but do not execute, the approved four-table registry migration.
- Create a deterministic JSON seed from the corrected OC-DF-001-R2 source records.
- Add static validation tests for constraints, enum values, unique source keys and deterministic seed output.
- Produce the complete handoff bundle and stop for Codex review.

Context-safe execution:

1. Before implementation, create `_orch/handoffs/OC-DF-002/STATE.json` with `status: in_progress` and `_orch/handoffs/OC-DF-002/PROGRESS.md`.
2. Work in four bounded stages: A bootstrap/worktree, B migration draft, C seed artifact, D tests/final handoff.
3. After every stage, update `STATE.json` and append to `PROGRESS.md` with completed files, commands, tests, current HEAD and the exact next command.
4. Make a local checkpoint commit after each completed stage. Do not push without separate authorisation.
5. At 55% context, stop loading unrelated files and use only task-owned artifacts plus the approved schema.
6. At 65% context, finish the current atomic edit, write a full checkpoint and do not begin another stage in the same session.
7. At 70% context, stop immediately after preserving a valid checkpoint. A new session must recover from `STATE.json` and `PROGRESS.md`, not from chat history.
8. Do not wait until the final handoff to record progress. If interrupted, the latest completed stage must remain independently reviewable.

### CX-DF-004 - Review registry migration draft

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T21:05:00+10:00
result: changes_requested
review: _orch/handoffs/CX-DF-004/REVIEW.md
database_write: none
deployment: none
```

### OC-DF-002-R1 - Correct registry migration, seed and audit chain

```yaml
owner: OpenClaw
status: changes_requested
completed_at: 2026-06-30T20:56:00+10:00
final_head: 6a96d4e
checkpoints: 6 (stages A-E)
tests: 29/29 pass
auto_continue: yes
requires_codex_review: yes
risk: low
worktree: .worktrees/oc-df-002
branch: openclaw/data-oc-df-002
review_instructions: _orch/handoffs/CX-DF-004/REVIEW.md
handoff: _orch/handoffs/OC-DF-002-R1/
database_write: forbidden
deployment: forbidden
push: forbidden
runtime_code_changes: forbidden
checkpoint_threshold: 65_percent
hard_stop_threshold: 70_percent
```

Objective:

- Apply only the bounded corrections in CX-DF-004.
- Preserve immutable input snapshots and checksums.
- Create truthful recovery checkpoints and local commits.
- Stop for CX-DF-005 review without executing the migration.

### CX-DF-005 - Final review of registry R1

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T21:35:00+10:00
result: changes_requested
review: _orch/handoffs/CX-DF-005/REVIEW.md
database_write: none
deployment: none
```

### OC-DF-002-R2 - Correct executable SQL and validation truth

```yaml
owner: OpenClaw
status: accepted
auto_continue: yes
requires_codex_review: yes
risk: low
worktree: .worktrees/oc-df-002
branch: openclaw/data-oc-df-002
review_instructions: _orch/handoffs/CX-DF-005/REVIEW.md
handoff: _orch/handoffs/OC-DF-002-R2/
database_write: forbidden
migration_execution: forbidden
deployment: forbidden
push: forbidden
runtime_code_changes: forbidden
checkpoint_threshold: 65_percent
hard_stop_threshold: 70_percent
```

Objective:

- Apply only the five bounded corrections in CX-DF-005.
- Add new commits without rewriting existing history.
- Produce truthful executable-SQL and canonical-seed evidence.
- Stop for CX-DF-006 review.

### CX-DF-006 - Final acceptance of registry R2

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T22:20:00+10:00
result: accepted_with_non_blocking_notes
accepted_head: 0a35619
review: _orch/handoffs/CX-DF-006/REVIEW.md
database_write: none
deployment: none
```

### CX-DF-007 - Clean integration and Preview dry-run plan

```yaml
owner: Codex
status: completed
completed_at: 2026-06-30T22:30:00+10:00
auto_continue: no
requires_user_approval_for_database: yes
risk: medium
source_branch: openclaw/data-oc-df-002
source_head: 0a35619
integration_branch: codex/data-registry-integration
integration_commit: 901ddd8
worktree: /private/tmp/ahv-data-registry-integration
handoff: _orch/handoffs/CX-DF-007/
tests: 33/33_pass
database_write: forbidden_until_approved
deployment: forbidden
```

Objective:

- Integrate only the accepted migration, canonical seed, tests and final review artifacts into a clean branch.
- Prepare a Preview transaction/rollback runbook and schema assertions.
- Do not connect to or modify a database until the user explicitly approves the Preview dry-run.

Next gate:

- Preview rollback-first dry-run passed on 2026-07-01 with 8/8 assertions.
- Evidence commit: `codex/data-registry-integration@315fa14`.
- User must separately approve the persistent Preview-only migration.
- Persistent migration, seed, deployment, push and merge remain separate approvals.

### CX-DF-008 - Persistent Preview registry migration

```yaml
owner: Codex
status: completed
completed_at: 2026-07-01T11:00:44+10:00
result: passed
integration_branch: codex/data-registry-integration
evidence_commit: 6c50555
preview_endpoint: ep-weathered-sea-a7b30th5
registry_tables_present: 4
registry_total_rows: 0
assertions: 7/7_pass
seed_performed: false
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-008/
```

Next gate:

- User must separately approve loading only the canonical 17-source seed into Preview.
- Metric definitions, Production migration, deployment, push and merge remain unauthorised.

### CX-DF-009 - Canonical 17-source Preview seed

```yaml
owner: Codex
status: completed
completed_at: 2026-07-01T11:17:01+10:00
result: passed
integration_branch: codex/data-registry-integration
evidence_commit: f15494f
preview_endpoint: ep-weathered-sea-a7b30th5
source_records: 17
canonical_exact_match: true
assertions: 8/8_pass
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-009/
```

Next gate:

- Codex reviews and designs deterministic metric-definition and source-dependency artifacts.
- No metric/dependency database write, Production migration, deployment, push or merge is authorised.

### CX-DF-010 - V2 metric registry architecture

```yaml
owner: Codex
status: completed
completed_at: 2026-07-01T11:34:00+10:00
result: approved_design_for_artifact_drafting
integration_branch: codex/data-registry-integration
design_commit: 4cb8c270
metric_definitions: 41
design_tests: 11/11_pass
registry_tests: 33/33_pass
database_connection: none
database_write: none
runtime_change: none
deployment: none
handoff: _orch/handoffs/CX-DF-010/
openclaw_instruction: _orch/handoffs/CX-DF-010/OPENCLAW_TASK.md
```

### OC-DF-003 - Deterministic metric and dependency seed artifacts

```yaml
owner: OpenClaw
status: queued
auto_continue: no
requires_codex_review: yes
risk: low
base_commit: 4cb8c270
worktree: .worktrees/oc-df-003
branch: openclaw/data-oc-df-003
instruction: _orch/handoffs/CX-DF-010/OPENCLAW_TASK.md
database_write: forbidden
deployment: forbidden
push: forbidden
runtime_code_changes: forbidden
checkpoint_threshold: 65_percent
hard_stop_threshold: 70_percent
```

OpenClaw must create deterministic review artifacts and stop for Codex review. No database action is authorised.

### CX-DF-011 - Review OC-DF-003 artifacts

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_head: 2db79c82
review: _orch/handoffs/CX-DF-011/REVIEW.md
database_connection: none
database_write: none
deployment: none
```

### OC-DF-003-R1 - Correct metric seed schema and audit truth

```yaml
owner: OpenClaw
status: queued
auto_continue: no
requires_codex_review: yes
worktree: .worktrees/oc-df-003
branch: openclaw/data-oc-df-003
review_instructions: _orch/handoffs/CX-DF-011/REVIEW.md
database_write: forbidden
deployment: forbidden
push: forbidden
runtime_code_changes: forbidden
checkpoint_threshold: 65_percent
hard_stop_threshold: 70_percent
```

Apply only CX-DF-011 corrections and stop for CX-DF-012 review.

### CX-DF-012 - Final review OC-DF-003-R1

```yaml
owner: Codex
status: completed
result: accepted_with_handoff_metadata_correction
accepted_head: 912eeaa3
integration_branch: codex/data-registry-integration
integration_commit: f11b3aca
metric_definitions: 41
metric_dependencies: 82
tests: 34/34_seed, 11/11_design, 33/33_registry
database_connection: none
database_write: none
deployment: none
handoff: _orch/handoffs/CX-DF-012/
```

Next gate: explicit user approval for a Preview rollback-first dry-run of the accepted definition and dependency seeds.

### CX-DF-013 - Preview metric/dependency seed rollback dry-run

```yaml
owner: Codex
status: completed
result: passed_and_rolled_back
integration_branch: codex/data-registry-integration
evidence_commit: bf18e0bb
preview_endpoint: ep-weathered-sea-a7b30th5
definitions_tested: 41
dependencies_tested: 82
assertions: 10/10_pass
post_rollback_definitions: 0
post_rollback_dependencies: 0
source_records_unchanged: 17
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-013/
```

Next gate: separate user approval for persistent Preview import of only the 41 definitions and 82 dependencies.

### CX-DF-014 - Persistent Preview metric/dependency seed import

```yaml
owner: Codex
status: completed
result: passed_and_committed
integration_branch: codex/data-registry-integration
evidence_commit: 12ccd29f
preview_endpoint: ep-weathered-sea-a7b30th5
definitions_committed: 41
dependencies_committed: 82
source_records_unchanged: 17
assertions: 9/9_pass
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-014/
```

Next gate: Codex designs and reviews the observation/evidence storage layer. No metric values are authorised yet.

### CX-DF-015 - Metric observation/evidence storage architecture

```yaml
owner: Codex
status: completed
result: accepted_for_artifact_drafting
integration_branch: codex/data-registry-integration
design_commit: f56c6853
design: docs/data/METRIC_OBSERVATION_EVIDENCE_DESIGN_V1.md
design_tests: 22/22_pass
registry_design_tests: 11/11_pass
metric_seed_tests: 34/34_pass
database_connection: none
database_write: none
deployment: none
handoff: _orch/handoffs/CX-DF-015/
```

Next gate: OC-DF-004 drafts migration 018, static tests and validator contract in an isolated worktree based on `f56c6853`. Database execution, metric calculation, deployment and push remain forbidden.

### CX-DF-016 - Review OC-DF-004 observation/evidence artifacts

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_branch: openclaw/data-oc-df-004
reviewed_head: 1786ece3
review_commit: c3a2ce76
tests_rerun: 139/139_pass
database_connection: none
database_write: none
migration_executed: false
deployment: none
handoff: _orch/handoffs/CX-DF-016/
```

Next gate: OC-DF-004-R1 applies only CX-DF-016 corrections in the same worktree and branch, then stops for CX-DF-017.

### CX-DF-017 - Review OC-DF-004-R1 corrections

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_branch: openclaw/data-oc-df-004
reviewed_head: 736a7ec3
review_commit: aa79ed49
tests_rerun: 139/139_pass
database_connection: none
database_write: none
migration_executed: false
deployment: none
handoff: _orch/handoffs/CX-DF-017/
```

Next gate: OC-DF-004-R2 adds database-free semantic validator fixtures and corrects finalization metadata, then stops for CX-DF-018.

### CX-DF-018 - Review OC-DF-004-R2 semantic fixtures

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_branch: openclaw/data-oc-df-004
reviewed_head: 0a963fe3
review_commit: 12d85f79
tests_rerun: 146/146_pass_under_current_family_count
database_connection: none
database_write: none
migration_executed: false
deployment: none
handoff: _orch/handoffs/CX-DF-018/
```

Next gate: OC-DF-004-R3 repairs closure reachability, broken-chain rejection, revision transitions and stored-key validation, then stops for CX-DF-019.

### CX-DF-019 - Review OC-DF-004-R3 final semantic fixes

```yaml
owner: Codex
status: completed
result: small_final_correction_required
reviewed_branch: openclaw/data-oc-df-004
reviewed_head: 360ddc10
review_commit: 54e06af9
database_connection: none
database_write: none
migration_executed: false
deployment: none
handoff: _orch/handoffs/CX-DF-019/
```

Next gate: OC-DF-004-R4 independently executes semantic scenarios, filters terminal source roles and commits a clean truthful handoff, then stops for CX-DF-020.

### CX-DF-020 - Final review and integration of OC-DF-004-R4

```yaml
owner: Codex
status: completed
result: accepted_and_integrated
reviewed_openclaw_head: d2b5ca1a
integration_branch: codex/data-registry-integration
integration_commit: ac93d984
tests: 183/183_pass
database_connection: none
database_write: none
migration_executed: false
deployment: none
handoff: _orch/handoffs/CX-DF-020/
```

Next gate: explicit user approval for CX-DF-021 Preview rollback-first execution of migration 018.

### CX-DF-021 - Preview rollback-first migration 018 validation

```yaml
owner: Codex
status: completed
result: passed_and_rolled_back
integration_branch: codex/data-registry-integration
evidence_commit: ef122ea9
preview_endpoint: ep-weathered-sea-a7b30th5
assertions: 7/7_pass
post_rollback_target_tables: 0
registry_counts: 17_sources_41_definitions_82_dependencies
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-021/
```

Next gate: explicit user approval for CX-DF-022 persistent execution of migration 018 in Preview only.

### CX-DF-022 - Persistent Preview migration 018

```yaml
owner: Codex
status: completed
result: passed_and_committed
integration_branch: codex/data-registry-integration
evidence_commit: 0dcc46a9
preview_endpoint: ep-weathered-sea-a7b30th5
assertions: 8/8_pass
metric_observations_rows: 0
metric_evidence_rows: 0
registry_counts: 17_sources_41_definitions_82_dependencies
production_connection: false
deployment: none
handoff: _orch/handoffs/CX-DF-022/
```

Next gate: OC-DF-005 database-free runtime validator implementation, followed by Codex review. No database or API wiring is authorized.

### CX-DF-023 - Review OC-DF-005 runtime validator

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_branch: openclaw/data-oc-df-005
reviewed_head: 79c3e475
review_commit: 8bb9b0f5
tests: 306/306_pass_across_6_suites
database_connection: none
database_write: none
deployment: none
handoff: _orch/handoffs/CX-DF-023/
```

Next gate: OC-DF-005-R1 corrects only the six review findings and stops for CX-DF-024.

### CX-DF-024 - Review OC-DF-005-R1

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_branch: openclaw/data-oc-df-005
reviewed_head: 400a08bf
review_commit: d76ad808
tests: 359/359_existing_tests_pass
database_connection: none
database_write: none
deployment: none
handoff: _orch/handoffs/CX-DF-024/
```

Next gate: OC-DF-005-R2 corrects only the five findings and stops for CX-DF-025.

### CX-DF-025 - Review OC-DF-005-R2

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_head: 379a68ce
review_commit: d291919a
effective_tests: 376_passed
daily_collection_files_changed: false
database_connection: none
deployment: none
handoff: _orch/handoffs/CX-DF-025/
```

Next gate: OC-DF-005-R3 corrects only the four findings and stops for CX-DF-026.

### CX-DF-026 - Review OC-DF-005-R3

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_head: 3c6d73dc
review_commit: c69ac2da
runtime_effective_tests: 195_passed_summary_inaccurate
npm_test: 97_pass_5_preexisting_fail
daily_collection_files_changed: false
database_connection: none
deployment: none
handoff: _orch/handoffs/CX-DF-026/
```

Next gate: OC-DF-005-R4 performs only the three bounded corrections and stops for CX-DF-027.

### CX-DF-027 - Review OC-DF-005-R4

```yaml
owner: Codex
status: completed
result: changes_requested
reviewed_head: 487adf4d
review_commit: 64dc6de1
runtime_tests: 202/202_pass
daily_collection_files_changed: false
database_connection: none
deployment: none
handoff: _orch/handoffs/CX-DF-027/
```

Next gate: OC-DF-005-R5 performs the single functional correction and two cleanup items, then stops for CX-DF-028.

### CX-DF-028 - Final acceptance and local integration

```yaml
owner: Codex
status: completed
result: accepted_and_integrated
reviewed_head: 41ee5112
integration_branch: codex/data-registry-integration
integration_commit: 6e0a1e87
validator_tests: 388_pass
daily_collection_files_changed_by_validator: false
database_write: none
deployment: none
handoff: _orch/handoffs/CX-DF-028/
```

Next gate: OC-DF-006 read-only daily-collection to FACT mapping inventory.
