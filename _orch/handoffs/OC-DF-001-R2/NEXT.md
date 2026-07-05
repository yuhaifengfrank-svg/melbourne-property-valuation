# OC-DF-001-R2 — Next Action

## Verified State (after all corrections)

All CX-DF-002 corrections have been applied. Four handoff bundles are complete:

- `_orch/handoffs/OC-DF-000/` — reconciliation evidence
- `_orch/handoffs/OC-DF-001/` — first-pass source registry (superseded)
- `_orch/handoffs/OC-DF-001-R1/` — corrected registry (superseded)
- `_orch/handoffs/OC-DF-001-R2/` — **final corrected registry (current)**

## Next: CX-DF-003 (Final Codex Review)

Codex should:

1. **Read this bundle** (`_orch/handoffs/OC-DF-001-R2/`)
2. **Verify** all CX-DF-002 corrections are applied:
   - HANDOVER updated
   - PROJECT_STATUS factual errors fixed
   - No `verified_likely` or presumed licence status
   - Source metadata correct (DFFH URL, PTV URL, VIF MODELLED, KYC split)
   - State/QA/lineage files internally consistent
3. **Approve or revise** the 17 source registry records
4. **Approve or revise** the three-table schema design
5. **Authorise** OpenClaw to:
   - Create migration `db/migration-017-data-source-registry.sql`
   - Populate registry from DATA_LINEAGE.md proposal
   - Proceed to Phase 3: Know Your Council

## DO NOT (for OpenClaw — until CX-DF-003 approval)

- Write database data
- Create or run migrations
- Deploy Production or Preview
- Modify scoring, API, models, or frontend
- Start Phase 3 or any implementation task
