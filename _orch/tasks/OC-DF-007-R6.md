# OC-DF-007-R6 - Wire Artifact Integrity Into Real VGV Pipeline

## Objective

Correct only the CX-DF-036 findings and produce a recoverable, truthful local handoff.

## Required Startup

Read, in order:

1. `_orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md`
2. `_orch/handoffs/CX-DF-036/REVIEW.md`
3. `_orch/tasks/OC-DF-007-R6.md`
4. `_orch/handoffs/OC-DF-007/STATE.json`

Continue in:

- Worktree: `/Users/FrankAI/Documents/澳洲房地产评估系统/.worktrees/oc-df-007`
- Branch: `openclaw/data-oc-df-007`

Do not create another branch or worktree.

## Stage 0 - Preserve Truth

1. Record that initial HEAD is `0efb628f` and R5 has 10 dirty/untracked paths.
2. Create `_orch/handoffs/OC-DF-007-R6/STATE.json` and `PROGRESS.md` before further implementation.
3. Create a local `R5 review-baseline` commit containing the reviewed R5 implementation exactly as found. Do not rewrite its history or claim R4 contained R5.

## Stage 1 - Pipeline Integration

1. Import the production `validateArtifactIntegrity` into the real VGV parser/materializer path.
2. Validate complete plan artifacts before files are written.
3. Validate the appropriate complete artifact at materialization boundary before simulation output is accepted.
4. On failure, stop deterministically and expose the exact integrity error codes.
5. Do not duplicate validator logic inside tests or parser scripts.

## Stage 2 - Fail-Closed Inputs

1. In `validateMetricObservation`, treat `artifactIntegrity` as optional only when the property is absent or explicitly `undefined`.
2. If present with null, primitive or array input, call the validator and return `INVALID_ARTIFACT_STRUCTURE`.
3. Reject array definitions and observations with `TypeError`.
4. Preserve existing valid behavior and error ordering.

## Stage 3 - Real Mutation Tests

Add tests that:

1. Generate or clone actual VGV parser artifacts.
2. Mutate duplicate observation key, duplicate evidence key, row ordering, volatile timestamp, blank source key and invalid period.
3. Pass each mutation through the real parser/materializer production boundary.
4. Assert the exact expected code from the production validator.
5. Verify malformed `artifactIntegrity` values and array definition/observation are rejected.
6. Verify an unmodified artifact still passes and both parser runs remain deterministic.

## Stage 4 - Truthful Handoff

Create `_orch/handoffs/OC-DF-007-R6/` with:

- `SUMMARY.md`
- `STATE.json`
- `PROGRESS.md`
- `FILES.md`
- `QA.md`
- `NEXT.md`

Record exact commits, dirty state, commands and actual counts. The integrity inventory is eight codes including `INVALID_ARTIFACT_STRUCTURE`.

Use local staged commits after each atomic stage. Finish with a clean worktree.

## Forbidden

- No database connection or write
- No migration execution
- No Preview or Production deployment
- No push
- No ingestion
- No unrelated API, frontend, scoring or daily-collection changes
- Do not modify source XLSX files

## Context Limits

- At 55%: compress output.
- At 65%: finish the atomic step, write checkpoint and stop.
- At 70%: mandatory stop.

## Completion Gate

Stop after local commits and the R6 handoff. Wait for `CX-DF-037`.
