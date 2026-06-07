# Codex Review: Phase 1 Integration

**Branch:** `codex-review` → `main`  
**HEAD commit:** `97cb2c9`  
**Repo:** `github.com/yuhaifengfrank-svg/melbourne-property-valuation`

---

## Project Status

This branch adds a live valuation API pipeline while keeping full backward compatibility with the static fallback. The `main` branch (HEAD `5d52d3d`) powers `aushomevalue.com.au` with 14 hardcoded valuations.

## Codex Review History

| Round | Outcome | Key Fixes |
|-------|---------|-----------|
| 1 | Not merge — P0 crash, P1 data fabrication | Fixed Leaflet DOM crash, extracted shared service, removed fake field defaults |
| 2 | Not merge — P1 labels/visibility | Tightened `live_verified` criteria, added `evidence-badge` UI, removed marketing-video-demo |
| 3 (current) | Not merge — P1 contract + badge position | Cross-source verification, `isFallback` in success path, badge next to midpoint |

## Current Architecture

```
Browser Form ──POST──> /api/valuation ──> runValuation()
                              │                    │
                              │  ┌──────────────────┘
                              │  │ Vercel (fetch:false)   │ Local Dev (fetch:true)
                              │  │ No CDP                 │ CDP Chrome :18800
                              │  │ research_only badge    │ live_verified / research_only
                              │  │ Static fallback with   │ badge
                              │  │ curated_fixture badge  │
                              │  └────────────────────────┘
                              │
                              └──> Static fallback (original app.js)
                                   evidence: curated_fixture
                                   isFallback: true
```

## Key New Files

| File | Role |
|------|------|
| `lib/valuation-service.js` | Shared orchestration — used by both `dev-server.mjs` and `api/valuation.js` |
| `lib/comparable-research-collector.js` | Collects comparables, ABS, VicPlan, Nominatim |
| `lib/browser-collector.js` | CDP WebSocket scraper (local only) |
| `lib/valuation-engine.js` | Heuristic + comparable-based valuation |
| `lib/comparable-source.js` | Abstract source interface (not yet wired) |
| `lib/local-cdp-source.js` | CDP ComparableSource implementation (not yet wired) |
| `lib/abs-client.js` | ABS SEIFA fetcher |
| `lib/vicplan-client.js` | VicPlan zoning overlay fetcher |
| `lib/rba-client.js` | RBA cash rate (currently returns empty) |
| `lib/db-schema.js` | Database schema for periodic comparable storage |
| `dev-server.mjs` | Express dev server |
| `api/valuation.js` | Vercel serverless handler |
| `integration-test.mjs` | 17-test suite (P0-P1 coverage) |
| `regression-test.mjs` | Legacy VM-sandbox regression (6 property types) |

## Key Modified Files

- **`app.js`** — Leaflet map, async API with fallback chain, evidence badge, `evidenceMode`/`isFallback` passthrough
- **`index.html`** — Leaflet CDN, `evidence-badge-val` DOM element
- **`styles.css`** — evidence-badge colours, map-container
- **`package.json`** — `npm test` and `npm run check` configured

## Evidence Mode Labels

| Label | Meaning | When |
|-------|---------|------|
| `live_verified` | ≥3 cross-verified comps from ≥2 domains | Local dev with CDP |
| `research_only` | Some comps found but insufficient evidence | Local with low data, Vercel after DB |
| `unavailable` | No comparable data at all | Vercel without DB |
| `curated_fixture` | Static fallback, not live | Vercel (current default) |

## Unresolved (Next Phase)

- **Vercel production source** — No database-backed ComparableSource yet. All Vercel requests fall back to `curated_fixture`. Need `DatabaseComparableSource` + periodic CDP cron before Vercel can return real valuations.
- **app.js decomposition** — ~3100 lines, could split into modules. Low-priority.
- **RBA data** — `rba-client.js` returns empty; data source issue.
- **Feature flag** — `RUN_VALUATION_API` env var to skip live API on production until DB source ready.

## Testing

```
npm run check   # node --check app.js + npm test
npm test         # 17/17 tests pass (integration + regression)
```

Note: `regression-test.mjs` uses VM sandbox with partial DOM mock. Output includes `res.json is not a function` warnings — these are harmless (the mock `fetch` doesn't implement `.json()`).
