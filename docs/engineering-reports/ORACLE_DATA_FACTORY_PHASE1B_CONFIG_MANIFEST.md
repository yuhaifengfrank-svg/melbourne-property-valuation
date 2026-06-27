# Oracle Data Factory Phase 1B — Config Templates & Artifact Manifest

**Date**: 2026-06-23 16:41 AEST  
**Author**: 玄甲  
**Scope**: Oracle VM (`au-scraper`, `161.33.90.191`) — offline data factory only

---

## Summary

Phase 1A pilot completed 3 data pipelines (ABS Census, RBA Full Macro, VicPlan Monash).  
Phase 1B adds the configuration layer and artifact manifest that define the input boundary for future Neon sync.

## Files Created / Updated

| File | Location | Description |
|------|----------|-------------|
| `.env.example` | `/opt/aushomevalue/config/.env.example` | Environment variable template, all placeholders, no real secrets |
| `sources.yaml` | `/opt/aushomevalue/config/sources.yaml` | 8 data source definitions (ABS, 5× RBA, VicPlan, Parcels placeholder) |
| `sync.yaml` | `/opt/aushomevalue/config/sync.yaml` | Sync target config (preview=disabled, production=disabled) |
| `manifest.json` | `/opt/aushomevalue/data/artifacts/manifest.json` | 3 artifact entries with hashes, row counts, sync policy |

## Manifest Entries

| artifact_key | file_size_bytes | row_count | sha256 (prefix) | safe_for_preview | safe_for_production |
|---|---|---|---|---|---|
| `abs_census_2021` | 289,100 | 524 | `5e038be1262d3e3b...` | ✅ true | ❌ false |
| `rba_macro_full` | 74,647 | 5,175 | `a4a1ee2f8f29322d...` | ✅ true | ❌ false |
| `vicplan_monash` | 6,933 | 953 | `34c4c292ea42ef01...` | ✅ true | ❌ false |
| **Total** | **370,680** | **6,652** | — | — | — |

### Artifact Row Counts (Verified)

| Artifact | Record Count | What counts as "one row" |
|---|---|---|
| `abs_census_2021` | 524 | One SA2 code |
| `rba_macro_full` | 5,175 | Sum of cash rate (3,913) + CPI (416) + GDP (267) + labour (579) time-series records |
| `vicplan_monash` | 953 | One parcel-zone assignment in MONASH LGA |

## Sync Policy

| Target | Default | Can Enable? | How to Enable |
|---|---|---|---|
| Preview Neon | `enabled: false` | Yes, operator sets `enabled: true` + injects `PREVIEW_DATABASE_URL` | CLI env override |
| Production Neon | `enabled: false` | No — requires Codex review + manual approval + CTO go/no-go | Never stored on disk |

Production sync requires:
1. Codex schema/data quality review
2. Human operator approval
3. CTO (ChatGPT) go/no-go decision

## Hashes (Full SHA-256)

```
abs_census_2021:
  5e038be1262d3e3babe176b42076644fea514511d3ddbde06173862b16dc5a12

rba_macro_full:
  a4a1ee2f8f29322d1c747c21cee7e2e80778ceea8b3015b739fe83ae830d84eb

vicplan_monash:
  34c4c292ea42ef01780c2b9e076d75eadbb268082a71568038d82333b01c107e
```

## What Was NOT Done

- ❌ Not connected to Neon (Preview or Production)
- ❌ Not connected to Vercel
- ❌ Not connected to Stripe
- ❌ No real secrets written to disk
- ❌ No sync executed (all targets disabled)
- ❌ No artifact data uploaded anywhere
- ❌ No git commits, no pushes, no deploys
- ❌ Not modified any web application code
- ❌ Not modified REA scraper config
- ❌ Not modified any production config

## Recommended Next Step

**Phase 1C — Preview Neon Dry-Run Sync:**

Pick one artifact (recommended: `vicplan_monash` — smallest, already from Preview DB) and:

1. Generate `CREATE TABLE` statement for the target table
2. Create a Python Node script that reads `manifest.json`, validates schema, connects to Preview Neon
3. Run a `dry_run` first (count rows, check data types, no writes)
4. If verified: run `upsert` with explicit operator confirmation
5. Document the sync process as `scripts/sync_artifact_to_neon.py`

This will validate:
- The manifest → table mapping
- The `sync.yaml` config
- The permission boundary (Preview only, Production blocked)
- The human-in-the-loop workflow
