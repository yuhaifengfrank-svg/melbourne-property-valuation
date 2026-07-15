# OC-DF-007-R7 - Prove Real Boundary Rejection and Fix Test Truth

## Objective

Correct only CX-DF-037. Do not add new validator rules or expand the data scope.

## Startup

Read:

1. `_orch/docs/OPENCLAW_CONTEXT_CONTINUITY_PROTOCOL.md`
2. `_orch/handoffs/CX-DF-037/REVIEW.md`
3. `_orch/tasks/OC-DF-007-R7.md`
4. `_orch/handoffs/OC-DF-007-R6/STATE.json`

Continue in the existing `.worktrees/oc-df-007` worktree and `openclaw/data-oc-df-007` branch. Initial HEAD must be `4f2503ac` and worktree clean.

## Stage 1 - Parser Output Boundary

1. Refactor the final parser write step into a production function used by `parseToDir()`.
2. The function must accept the complete generated plan bundle, call the production artifact validator, and only then write files.
3. Export that production boundary for testing; do not duplicate its logic in tests.
4. On integrity failure, throw an error containing the exact validator code and write zero plan/simulation artifact files.

## Stage 2 - Materializer Boundary

1. Keep `materializeAll()` as the production materializer boundary.
2. Tests must call `materializeAll()` with mutated actual parser observations/evidence.
3. Integrity failure must throw before IDs or materialized output are accepted.
4. Verify the parser's simulation path either uses the protected materializer boundary or performs the same production boundary check through a shared function. Do not leave an unprotected second materialization path.

## Stage 3 - Replace Direct-Validator Mutation Tests

For duplicate observation key, duplicate evidence key, unsorted rows, volatile timestamp, blank source key and invalid periods:

- build from actual VGV parser output or a deterministic fixture produced by production parser helpers;
- invoke the real parser output boundary and/or `materializeAll()`;
- assert exact thrown code;
- assert no output files were written after parser-boundary rejection.

Direct unit tests of `validateArtifactIntegrity` may remain, but they do not count as boundary proof.

Fix the failing valid aggregate test by providing a genuinely complete valid closure context, or narrow its assertion to the artifact-integrity responsibility without hiding unrelated validator errors. It must not accept `UPSTREAM_NOT_FOUND` as success.

## Stage 4 - Verification and Truthful Handoff

Run all six suites together and record exact registered/pass/fail counts:

```bash
node --test tests/vgv-fact-integrity-mutation-tests.mjs \
  tests/metric-observation-validator-runtime-tests.mjs \
  tests/metric-observation-validator-contract-tests.mjs \
  tests/metric-observation-evidence-static-tests.mjs \
  tests/metric-observation-evidence-design-tests.mjs
node scripts/vgv-fact-test.mjs
git diff --check
git status --short
```

Create `_orch/handoffs/OC-DF-007-R7/` with exactly listed files and truthful commit/test metadata. Use local atomic commits and finish clean.

## Forbidden

- No database connection/write
- No migration
- No Preview/Production deployment
- No push
- No ingestion
- No source XLSX modification
- No API/frontend/scoring/daily-collection changes

## Context Limits

Checkpoint at 65%; mandatory stop at 70%.

## Completion Gate

Stop after clean local commits and R7 handoff. Wait for CX-DF-038.
