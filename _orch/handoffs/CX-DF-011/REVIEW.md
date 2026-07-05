# CX-DF-011 — Review of OC-DF-003

**Reviewer:** Codex
**Result:** Changes requested
**Reviewed branch:** `openclaw/data-oc-df-003`
**Reviewed HEAD:** `2db79c82294412509d0e932f3396201f3c6c0175`
**Database connections/writes:** None

## Findings

### High — Definition seed is not insertable into the approved schema

Every definition record contains `readiness`, but `metric_definition_registry` has no such column. The task explicitly required using only registry columns. An importer that inserts seed fields directly would fail.

Required correction:

- Remove `readiness` from the database seed.
- Keep readiness only in the design input/handoff metadata.
- Add an exact allowed-key-set test and a negative fixture for an extra field.

### High — Freshness values were invented and blocked metrics were activated

The approved design does not specify numeric `fresh_after_days` or `stale_after_days`, yet all 41 rows received values. Some are unsafe, such as annual ERP receiving quarterly-style freshness. The design defines `blocked` as inactive and non-publishable, but seven blocked metrics are `active: true`.

Required correction:

- Set `fresh_after_days` and `stale_after_days` to `null` for all 41 records until a separate freshness policy is approved.
- Set `active: false` for the seven blocked metrics.
- Set `active: true` only for `ready_definition` and `conditional` design rows.
- Add tests and negative fixtures for both rules.

### Medium — Tests do not prove the claims in the handoff

The tests check sorting and absence of volatile timestamps, but do not compare file bytes with canonical serialization. They do not enforce exact definition columns. Section 6A is only spot-checked for four groups rather than expanded and compared in full.

Required correction:

- Assert each seed file equals `JSON.stringify(parsed, null, 2) + "\n"` byte-for-byte.
- Parse Section 6A and compare all 82 dependency rows exactly.
- Validate exact definition fields and dependency fields.
- Add negative fixtures for extra/missing dependency rows and schema-extra definition fields.

### Medium — Worktree and handoff truth are inconsistent

The worktree is not clean: two generator scripts are untracked, while `FILES.md` lists them as generated files. `STATE.json` omits the final handoff commit from its commit list. `PROGRESS.md` reports 16 SCORE metrics instead of 13, reports eight publishable definitions while listing nine, and calls a worktree with untracked files clean.

Required correction:

- Commit both generator scripts because they are part of the deterministic audit trail, or remove them and their FILES references.
- Correct counts to FACT 10, DERIVED 14, MODELLED 3, SCORE 13, AI_TEXT 1; publishable 9.
- Record all commits truthfully, including the prior final handoff commit and R1 commits.
- Finish with an actually clean worktree.

## Accepted Evidence

- 41 metric keys are present and unique.
- Dependency seed has 82 rows.
- Independent Codex expansion confirms all 82 dependency rows exactly match Section 6A.
- Dependency source keys and fallback level are correct.
- MODELLED, SCORE, AI_TEXT and DFFH rent metrics are non-publishable.
- Forbidden legacy metric keys are absent.
- No database, deployment, push or runtime action occurred.

## Decision

Do not load either seed into Preview. Run OC-DF-003-R1 with only the bounded corrections above, then stop for CX-DF-012 review.
