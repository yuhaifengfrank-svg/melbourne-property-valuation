# CX-DF-037 Review - OC-DF-007-R6

**Date:** 2026-07-08 AEST  
**Result:** CHANGES REQUESTED  
**Reviewed branch:** `openclaw/data-oc-df-007`  
**Reviewed HEAD:** `4f2503ac`

## Verified

- Worktree is clean.
- R5 review baseline exists at `08c208d5`.
- R6 implementation commit is `326d89f4`; handoff commit is `4f2503ac`.
- `validateArtifactIntegrity` is called before plan writes in `parseToDir()` and before standalone `materializeAll()` processing.
- Malformed `artifactIntegrity` values and array definition/observation guards are implemented.
- Existing VGV parser suite passes 47/47.
- Existing validator suites pass: runtime 225, contract 44, evidence static 72, evidence design 22.
- No DB, migration, deployment, push or ingestion occurred.

## Findings

### Critical 1 - New R6 test suite fails

Command:

```bash
node --test tests/vgv-fact-integrity-mutation-tests.mjs \
  tests/metric-observation-validator-runtime-tests.mjs \
  tests/metric-observation-validator-contract-tests.mjs \
  tests/metric-observation-evidence-static-tests.mjs \
  tests/metric-observation-evidence-design-tests.mjs
```

Result: `tests/vgv-fact-integrity-mutation-tests.mjs` fails. Internal result is **19/20**, with `unmodified artifact passes validateMetricObservation integration` returning `UPSTREAM_NOT_FOUND`.

The R6 handoff claims all tests passed and says 18 tests, but the file registers 20 tests.

### High 1 - Mutation tests still do not execute real parser/materializer boundaries

Lines 125-126 explicitly state the tests construct payloads and call `validateArtifactIntegrity` directly. They do not call `parseToDir()` or `materializeAll()` for the duplicate, sorting, timestamp, source-key and period mutations.

This does not satisfy CX-DF-036 Stage 3 requirements. The production calls exist, but the tests do not prove those boundaries reject mutations before writing/materializing.

### High 2 - Parser and materializer paths are not both proven fail-before-output

`parseToDir()` validates before plan writes, but its inputs are internally generated and sorted; current tests cannot inject a mutated artifact into that boundary. The parser then uses its internal `materialize()` function, not the newly protected standalone `materializeAll()`.

Required proof:

- a parser output-boundary function used by `parseToDir()` must be tested with mutated actual parser artifacts and must write zero artifact files on failure;
- `materializeAll()` must be called directly with mutated actual parser arrays and must throw the exact integrity code before materialization.

### Medium 1 - Handoff counts and file inventory are inaccurate

- New suite: 20 registered, 19 pass, 1 fail; not 18 pass.
- Total registered scenarios across the listed suites are 430, with 429 pass and 1 fail, not 410.
- Handoff says a 7-file bundle, but the R6 directory contains 6 files.

## Decision

Execute only OC-DF-007-R7. No DB, migration, deployment, push or ingestion. Stop for CX-DF-038.
