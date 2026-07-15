# CX-DF-034 Review: OC-DF-007-R3

Status: CHANGES REQUESTED

Reviewed worktree: `.worktrees/oc-df-007`

Reviewed branch: `openclaw/data-oc-df-007`

Reviewed HEAD: `b72f0acd`

## Findings

### Critical 1: Approved validation still fails for every observation

The actual test output is:

```text
review_pending: OBSERVATION_NOT_APPROVED 1133, UPSTREAM_EVIDENCE_MISSING 1133
approved: UPSTREAM_EVIDENCE_MISSING 1133
```

The approved test only asserts that `OBSERVATION_NOT_APPROVED` disappeared. It does not assert zero total errors. This directly contradicts the R3 completion claim.

Required result:

- Review-pending exact distribution must be only `OBSERVATION_NOT_APPROVED: 1133`.
- Approved exact distribution must be empty, with zero total errors.

### Critical 2: Validator adapter does not adapt closure maps and is fail-open

`buildContext()` adapts the root observation but passes the raw `observations` Map through unchanged. Closure traversal therefore sees observations without `metric_class` and routes FACT observations through upstream-evidence logic.

The adapter also defaults missing classes to `FACT`. Missing or unknown class data must fail closed rather than silently becoming FACT.

Required result:

- Adapt every observation in the closure Map.
- Preserve Map keys and identity references needed by evidence traversal.
- Adapt definitions consistently.
- Reject missing/unknown `data_class` and conflicting `data_class`/`metric_class`.
- Add direct adapter tests for all of these cases.

### High 1: Most claimed mutation fixtures do not mutate input

Only wrong SHA and bad `observation_key_ref` currently modify input. Collision, ordering, period, empty source, timestamp, and numeric tests inspect the unchanged canonical artifact and then pass.

Required result:

- Each negative test must clone and mutate an input.
- Run the real validator, parser checker, or materializer against that mutation.
- Assert the exact rejection code or thrown error.
- Include actual duplicate evidence key, duplicate observation key, unsorted rows, wrong period, volatile timestamp, empty source key, and invalid/null FACT value fixtures.

### High 2: Review-pending assertion is not an exact error-set assertion

The test asserts only one error count and explicitly allows additional errors. Replace it with exact key-set and exact count assertions.

### Medium 1: Test and handoff metadata are false

- Runtime reports 44 tests, not 54.
- `STATE.json` reports HEAD `e78158c0`; actual reviewed HEAD is `b72f0acd`.
- `SUMMARY.md` and `QA.md` still contain older 29-test claims and stale validator descriptions.

All handoff documents must be regenerated from actual runtime results after implementation is complete.

## Accepted Work

- Worktree is clean.
- Simulation naming is corrected.
- House/unit SHA-to-run mapping is correct.
- Rejected counts are preserved as house 28 and unit 66.
- Deterministic double-run comparison passes.
- Plan-to-simulation observation/evidence linkage resolves.

## Required Next Task

Execute `OC-DF-007-R4` in the existing worktree and branch. Fix only the findings above. Do not connect to a database, execute migrations, deploy, push, or start ingestion. Finish with exact zero-error approved validation, genuine mutation fixtures, truthful handoff metadata, all tests passing, `git diff --check` clean, and a genuinely clean worktree. Then stop for `CX-DF-035` review.
