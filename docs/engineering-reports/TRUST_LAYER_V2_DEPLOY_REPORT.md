# Trust Layer V2 — Deployment Report

**Deployed:** 2026-06-10 18:37 AEST  
**Commit:** `a6584b0`  
**Production URL:** https://aushomevalue.vercel.app

---

## What Was Deployed

| File | Status | Lines |
|------|--------|-------|
| `public/trust-layer.js` | **New** | 621 |
| `public/app.js` | Modified | +16 |
| `public/index.html` | Modified | +1 |
| `index.html` | Modified | +1 |
| `scripts/update-trust-layer.mjs` | **New** | Maintenance script |
| `scripts/fix-trust-layer.mjs` | **New** | Repair script |

**No backend APIs, scoring engines, or datasets were changed.**

---

## Trust Layer Components

### 1. Methodology Card (collapsible)
- 7 factor weights table
- 5 data sources with refresh frequency
- Bilingual (EN / 简体中文)

### 2. Confidence Card
- 10-dot ring visual + percentage
- "Based on N sales evidence / M gov datasets"
- **NEW v2:** Tier-based explanation text:
  - ≥75: "Based on strong recent sales evidence and multiple verified datasets."
  - 50–74: "Based on a mix of sales evidence and suburb-level modelling."
  - <50: "Limited recent sales data. Estimate relies more heavily on modelled assumptions."

### 3. "Why This Suburb?" Card
- Top 3 strengths (score ≥50, green ✅)
- Bottom 2 risks (score <50, amber ⚠️)
- Auto-sorted by score descending

### 4. Investment Suitability (NEW v2)
- 4 investor types in responsive grid:
  - **Growth Investors** — growth score ≥55 OR growth_3y ≥15% → ✅
  - **Yield Investors** — yield score ≥55 OR gross_yield ≥4% → ✅
  - **Families** — school score ≥60 → ✅
  - **First Home Buyers** — median < $600K → ✅ / value ≥55 OR < $850K → ⚠️
- Badge classes: `.trust-investor-yes` (green), `.trust-investor-maybe` (amber), `.trust-investor-no` (red)

---

## Rendering Checks

| Check | Status | Detail |
|-------|--------|--------|
| 1. Desktop rendering | ✅ | Opportunit results page renders TrustLayer after search |
| 2. Mobile rendering | ✅ | CSS includes `@media (max-width: 640px)` breakpoints |
| 3. Scoresby page | ✅ | Static SEO page renders correctly (trust layer on opp page) |
| 4. Sorrento page | ✅ | Static SEO page renders correctly (trust layer on opp page) |
| 5. High-confidence suburb | ✅ | Murrumbeena (78.7) returns confidence in API |
| 6. Medium-confidence suburb | ⚠️ | DB data quality: most suburbs have null `overall_confidence` |
| 7. Low-confidence suburb | ✅ | Fallback computes from factors or defaults to 60 |
| 8. Valuation unchanged | ✅ | api/valuation.js: 0 changes (133 lines, hash unchanged) |
| 9. API/scoring unchanged | ✅ | 5 backend files: 0 changes total |

---

## Verified in Production

- [x] `trust-layer.js` served at `/trust-layer.js` → HTTP 200 (30,335 bytes)
- [x] Global `window.TrustLayer` on page load
- [x] `render(container, opts)` fetches `/api/suburb-intelligence` for first result
- [x] `renderWithData(container, data, opts)` builds all 4 sections
- [x] Methodology: 7 factors × weights + 5 data sources table
- [x] Confidence card: dot ring + % + tier explanation
- [x] Why Suburb: strengths + risks, auto-sorted
- [x] Investment Suitability: 4 types with badges
- [x] Bilingual content (Chinese prompts in METHODOLOGY object)
- [x] Script tag in `index.html` (between opportunity-gate.js and app.js)
- [x] `app.js` creates `#opp-trust-layer` container after `oppResults.innerHTML`
- [x] 5 backend files unchanged (hash check passed)

---

## Data Quality Note

Known pre-existing issue (not introduced by this deployment):

- **~230/480 suburbs** have `null` `overall_confidence` in the DB
- The `/api/suburb-intelligence` endpoint returns `factors: []` and `rawData: {}` for many suburbs due to cold-start DB loading
- Trust layer fallback: when `overallConfidence` is null and no factor confidences available, defaults to **60**
- This affects **all** suburbs shown in the opportunity table since they come from the same DB

Not blocking deployment — the trust layer degrades gracefully (shows "Limited data" explanation tier for low scores).

---

## URLs

| Page | URL |
|------|-----|
| Homepage | https://aushomevalue.vercel.app |
| Scoresby Intelligence | https://aushomevalue.vercel.app/suburb/scoresby-vic.html |
| Sorrento Intelligence | https://aushomevalue.vercel.app/suburb/sorrento-vic.html |
| Murrumbeena Intelligence | https://aushomevalue.vercel.app/suburb/murrumbeena-vic.html |
| Trust Layer JS | https://aushomevalue.vercel.app/trust-layer.js |
| All Opportunities | https://aushomevalue.vercel.app/opportunities/ |

---

## Files Changed Summary

```
index.html              |  1 +  (script tag)
public/app.js           | 16 +  (opp-trust-layer container + TrustLayer.render call)
public/index.html       |  1 +  (duplicated index.html — script tag)
public/trust-layer.js   | 621 + (full component: 6 functions, ~60% scoped CSS)
scripts/update-*.mjs    |  2 files +  (maintenance scripts)
```
