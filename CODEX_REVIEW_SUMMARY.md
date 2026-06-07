# Codex Review: Phase 1 Integration

**Branch:** `codex-review`  
**HEAD commit:** `d984410` (on top of `5d52d3d`)  
**Repo:** `github.com/yuhaifengfrank-sfrank/melbourne-property-valuation`

---

## What This Is

This branch integrates the locally-developed live valuation API architecture into the HEAD version that runs `aushomevalue.com.au`. The HEAD version works entirely from 14 hardcoded valuations; this branch adds a real backend pipeline while preserving full backward compatibility.

---

## Architecture Overview

```
Browser Form ──POST──> /api/valuation ──> collectComparableResearch()
                              │                    │
                              │              Nominatim geocode
                              │                    │
                              │              Browser collector (CDP)
                              │                    │
                              │              realestate.com.au + Domain
                              │                    │
                              │              ComparableResearchCollector
                              │                    │
                              └──> valueProperty(heuristics + comparables)
                                        │
                                    JSON response with coordinates,
                                    comparables, estimates, confidence
```

---

## Changes from HEAD (`5d52d3d`)

### New Files (Core Pipeline)

| File | Role |
|------|------|
| `lib/comparable-research-collector.js` | Orchestrates address resolution, comparable collection, public data gathering |
| `lib/browser-collector.js` | CDP WebSocket scraper (no Puppeteer — uses OpenClaw Chrome on port 18800) |
| `lib/valuation-engine.js` | Heuristic + comparable-based valuation with adjustment bands |
| `lib/abs-client.js` | ABS SEIFA profile fetcher |
| `lib/vicplan-client.js` | VicPlan zoning overlay fetcher |
| `lib/rba-client.js` | RBA cash rate fetcher (currently returns empty — data source issue) |
| `lib/db-schema.js` | Database schema for future lead storage |
| `dev-server.mjs` | Express dev server (localhost:3000) — serves static + POST /api/valuation |
| `api/valuation.js` | Vercel serverless handler (imports lib modules) |
| `collect-comparables.mjs` | CLI comparable collector script |
| `cron-daily.mjs` / `cron-weekly.mjs` | Scheduled data refresh scripts |
| Various test files | `valuation-api-test.mjs`, `valuation-engine-test.mjs`, `test-browser-pipeline.mjs`, etc. |

### Modified Files (Frontend Integration)

**`app.js`** (~200 lines changed of 3133 total)

1. **`renderMap` rewritten** — Replaced CSS grid pseudo-map with real Leaflet map (OpenStreetMap tiles)
   - Property marker + comparable circle markers
   - Falls back to Nominatim suburb lookup if lat/lon not provided by API
   - Destroys/recreates map instance on each valuation
2. **`runAddressValuation` → async** — Now calls `POST /api/valuation` first
   - On success: parses API JSON into the same structure `renderValuation` expects
   - On failure: falls through to original hardcoded valuation chain (`findValuation` → `createInferredSameComplex` → etc.)
3. **`start-valuation` click → async** — Button shows "Checking public evidence..." while API in flight

**`index.html`** — Added Leaflet CSS/JS CDN, replaced map-grid with real map-container div

**`styles.css`** — Replaced .map-grid/.road/.pin styles with .map-container

**`dev-server.mjs`** — Response now includes `subject.coordinates` and `subject.verification` for Leaflet map rendering

---

## End-to-End Validation

Tested with `349 Moray Street, South Melbourne VIC`:

```
Nominatim:      verified → South Melbourne VIC 3205
Coordinates:    -37.8370718, 144.9655525
Comparables:    2 Core (191 Nelson Rd $1,381,000, 163 Nelson Rd $1,530,000)
Estimate:       $1,403,356 midpoint ($1,292,902 – $1,513,810)
Confidence:     Low-Medium
Map:            Leaflet with property pin + comparable circles
```

---

## What Needs Codex Review

1. **Architecture** — The `comparable-research-collector.js` → `valuation-engine.js` pipeline. Does the data flow make sense for production?
2. **Error handling** — API failure fallback to hardcoded valuations: reasonable or leaky abstraction?
3. **Frontend-backend coupling** — Is the JSON format from `/api/valuation` suitable for Vercel deployment?
4. **Browser collector** — CDP WebSocket approach vs future Puppeteer serverless: acceptable for MVP or blocker?
5. **Missing pieces** — RBA rates returning empty, ABS data quality, VicPlan response parsing

---

## To Review

- `git diff 5d52d3d..HEAD -- app.js` (frontend changes)
- `dev-server.mjs` (API endpoint)
- `lib/comparable-research-collector.js` (orchestration)
- `lib/valuation-engine.js` (core math)
- `lib/browser-collector.js` (data collection)

Or view the full diff:
```
git fetch origin codex-review
git diff 5d52d3d..origin/codex-review
```
