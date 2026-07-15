# CX-DF-035 Review: OC-DF-007-R4

Status: CHANGES REQUESTED

Reviewed worktree: `.worktrees/oc-df-007`

Reviewed branch: `openclaw/data-oc-df-007`

Reviewed HEAD: `0efb628f`

## Passed

- Approved validation genuinely returns zero errors for all 1,133 observations.
- Review-pending validation has the exact error distribution `OBSERVATION_NOT_APPROVED: 1133`.
- Closure observation Map adaptation works.
- House/unit SHA mapping, deterministic parsing, linkage and rejected counts pass.
- Worktree is clean and `git diff --check` passes.

## Findings

### High 1: Several mutation fixtures do not test rejection of the mutation

The duplicate evidence key, duplicate observation key, unsorted rows and volatile timestamp tests mutate local arrays, but never pass those arrays to a production checker that rejects them. They then assert that the untouched canonical artifacts remain valid. This does not prove the parser/materializer rejects malformed artifacts.

Required result:

- Add a pure artifact-integrity validator used by the parser/materializer before artifact output or simulation materialization.
- It must return deterministic codes for duplicate evidence key, duplicate observation key, unsorted observation/evidence rows, volatile canonical timestamps, empty source key and invalid period.
- Every mutation test must pass the mutated artifact to this real validator and assert the exact code.
- Avoid test-only validation logic that production code never calls.

### High 2: Class fail-closed handling is incomplete

`adaptDefinition(null)` and `adaptObservation(null)` return null instead of throwing. `resolveClassForObservation` also accepts a direct observation class before checking its definition, so an observation class can conflict with the definition even though definitions are documented as the source of truth.

Required result:

- Null/non-object definitions and observations must throw.
- Observation class must be absent or agree with its matched definition.
- Add exact tests for null, non-object and observation-vs-definition conflict.

### Medium 1: Handoff metadata remains false

The actual Node test runner result is 47 tests, 10 suites, 47 pass, 0 fail. Handoff files claim 57 tests. `STATE.json` also describes the truthful-metadata fix using stale values.

Required result:

- Regenerate `STATE.json`, `SUMMARY.md`, `QA.md` and `NEXT.md` from the actual final test output.
- Record the actual final HEAD or clearly distinguish implementation parent from handoff commit.

## Required Next Task

Execute `OC-DF-007-R5` in the existing worktree and branch. Fix only these findings. Do not connect to a database, execute migrations, deploy, push, or start ingestion. Finish with production-called artifact-integrity validation, exact mutation rejection codes, complete fail-closed class handling, truthful metadata, all tests passing, `git diff --check` clean, and a clean worktree. Then stop for `CX-DF-036` review.
