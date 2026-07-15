# CX-DF-036 Review - OC-DF-007-R5

**Date:** 2026-07-08 AEST  
**Result:** CHANGES REQUESTED  
**Reviewed branch:** `openclaw/data-oc-df-007`  
**Reviewed HEAD:** `0efb628f` (R5 changes are uncommitted)

## Verified

- Runtime validator tests: 225/225 pass.
- Contract tests: 44/44 pass.
- Evidence static tests: 72/72 pass (the R5 handoff incorrectly reports 45).
- Evidence design tests: 22/22 pass (the R5 handoff incorrectly reports 8).
- VGV parser/adapter tests: 47/47 pass.
- `git diff --check`: clean.
- Production validator and handoff snapshot are byte-identical.
- No database connection, migration, deployment or push was performed.

## Findings

### Critical 1 - Artifact integrity is not wired into the VGV pipeline

`validateArtifactIntegrity` is imported only by `lib/metric-observation-validator.js`. Neither `scripts/vgv-fact-parser.mjs` nor `scripts/vgv-fact-materializer.mjs` imports or calls it.

The aggregate validator checks an optional `artifactIntegrity` argument, but the real parser/materializer contexts never provide that argument. Therefore malformed full artifacts can still be emitted even though isolated unit tests pass.

**Required:** invoke the production artifact validator at deterministic parser and materializer boundaries. A failed artifact must stop output/materialization with exact error codes. Tests must mutate real parser output and call the real production entry point.

### High 1 - Optional parameter permits malformed input to bypass validation

`validateMetricObservation` runs integrity validation only when `artifactIntegrity && typeof artifactIntegrity === "object"`. If the caller supplies a string, number or other malformed value, validation is silently skipped.

**Required:** distinguish “argument absent” from “argument present but invalid”. If present, always call `validateArtifactIntegrity`; malformed values must return `INVALID_ARTIFACT_STRUCTURE`.

### High 2 - Aggregate class guards accept arrays

The new definition/observation guards reject null and primitive values but arrays pass because arrays are objects. `definition=[]` or `observation=[]` can proceed into the validator.

**Required:** reject arrays with `TypeError`, and add exact tests for both definition and observation arrays.

### High 3 - R5 is not recoverable and handoff metadata is not truthful

- Worktree has 10 dirty/untracked files.
- HEAD remains the R4 commit `0efb628f`.
- No `_orch/handoffs/OC-DF-007-R5/` bundle exists.
- R5 overwrote the original `OC-DF-007` handoff instead of creating a revision-specific bundle.
- `STATE.json` calls `0efb628f` the R5 head even though all R5 implementation is uncommitted.

**Required:** preserve the current dirty state as the R5 review baseline, then create staged local checkpoint commits for R6. Create a truthful `_orch/handoffs/OC-DF-007-R6/` bundle. Do not claim the parent R4 commit contains R5.

### Medium 1 - Test-count metadata is stale

Actual combined suites are 225 runtime, 44 contract, 72 evidence static, 22 evidence design and 47 adapter. R5 handoff reports 45 static and 8 design.

**Required:** record exact command-level counts and distinguish Node top-level file tests from internal scenario counts.

### Medium 2 - Error-code inventory is inconsistent

The implementation returns `INVALID_ARTIFACT_STRUCTURE`, so the public inventory contains eight codes, not seven.

**Required:** document the exact eight-code set or explicitly classify structure errors separately.

## Decision

Do not push, deploy, write the database or start ingestion. Execute only `OC-DF-007-R6`, then stop for CX-DF-037.
