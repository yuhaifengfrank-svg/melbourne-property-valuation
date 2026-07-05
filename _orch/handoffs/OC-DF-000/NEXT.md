# OC-DF-000 — Next Action

## Verified State

All documented states (HANDOVER, PROJECT_STATUS, NEXT_ACTION) are stale. Live verified state:

| Module | Coverage | Status |
|--------|----------|--------|
| Council Registry | 79/79 | Complete |
| area_km² | 79/79 | Complete |
| Council Metrics (VBA Permits) | 237 rec, 79 LGA × 3 mo | Complete |
| POI | 247/248 | Complete (1 suburb missing) |
| Crime | 247/248 | Complete (1 suburb missing) |
| UV V4 Score | 245/248 | Complete |
| Heritage VHR | 2680 zones | Complete |

## Next Safe Action

Execute **OC-DF-001** (Prepare source-registry evidence):

1. Read `AGENT_TASK_QUEUE.md` for OC-DF-001 spec
2. Read `docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md`
3. Prepare proposed data_source_registry records as reviewable artifacts
4. Do not write Production or Preview tables
5. Stop for Codex review

## DO NOT

- Write database data
- Deploy
- Modify scoring, API, or frontend
- Proceed past OC-DF-001 without Codex or user approval
- Restart Phase 3 (Know Your Council) — not in auto_continue chain
