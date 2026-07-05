# OC-DF-001-R1 — Next Action

## Verified State

All CX-DF-001 required changes have been applied.

| Check | Result |
|-------|--------|
| Licence claims verified or explicitly marked | ✅ |
| VGV free scope corrected | ✅ |
| Registry/ingestion/metric schema separated | ✅ (proposed as three tables) |
| Continuity files restored | ✅ |
| Coverage: 247 VIC + 1 NSW | ✅ |
| Oracle raw paths corrected/marked missing | ✅ |
| CSA, SALM, DFFH, projections corrected | ✅ |

## Next Safe Action

Codex review of this bundle (CX-DF-002), then:

1. **Approve or revise** the three-table schema (`data_source_registry`, `data_ingestion_runs`, `metric_definition_registry`)
2. **Create migration(s)** for the schema
3. **Populate** the registry from the corrected proposal in this bundle
4. **Authorize** next implementation tasks

## DO NOT (for OpenClaw)

- Write database data
- Deploy Production or Preview
- Modify scoring, API, or frontend
- Proceed past this point without Codex approval
- Restart Phase 3 (Know Your Council) — not in auto_continue chain
