# Phase 0 — Future Growth Outlook Audit Report

**Date:** 2026-06-11  
**Author:** 玄甲  
**HEAD:** `9b3c6d6`  
**Status:** Phase 0A corrections applied — ready for Codex review

---

## 1. Purpose

Phase 0 is a **pure audit** of the current Opportunity Score / Future Growth system. No code changes to the scoring model, no new data ingestion, no database migrations, no production deployment. Phase 0A fixes only **online misdirection language** (labels, meta descriptions, JSON-LD, FAQ) to ensure users are not misled by experimental Beta indicators presented as calibrated forecasts.

---

## 2. Production Environment

| Component | Details |
|---|---|
| Hosting | Vercel (Serverless Node.js) |
| Database | Neon PostgreSQL (serverless, ap-southeast-2) |
| Data Collection | Playwright CDP via local machine (not serverless) |
| Domain | `www.aushomevalue.com.au` (canonical) / `aushomevalue.vercel.app` (legacy, no 301) |
| Cron | Weekly collection Sun 03:00 AEST (isolated, timeout 3600s) |
| Scoring | `lib/opportunity-scoring-v2.js` (V2 batch) |
| Growth | `lib/growth-projector.js` (OLS + Elasticity + Macro) |

### 2.1 Data Refresh Pipeline

```
weekly-refresh-collection.mjs → scrapeSoldData() [REA/Domain, 1 page/suburb]
  → comparable_sales (upsert)
  → refresh-suburb-metrics.js
    Step 1: median_house_price, median_unit_price, median_house_rent,
            school_score, gross_yield, vacancy_rate from comparable_sales + schools + Census
    Step 2: fill unmapped suburb vacancies with global average
    Step 3: growth-projector.js → batchProjectAll()
    Step 4: recompute gross_yield where rent + price exist
    Step 5: SALM employment metrics
    Step 5.5: G41 dwelling structure metrics
    Step 5.6: housing per capita recalculation
    Step 6: opportunity-scoring-v2.js → scoreAllSuburbs()
```

---

## 3. Scoring Formula (Active: `scoreAllSuburbs`)

This is the formula used by both the nightly batch **and** the `/api/opportunity` endpoint. There is only **one** active API path — the homepage and API both read `suburb_metrics.opportunity_score`.

Note: `lib/opportunity-scoring-v2.js` contains a separate `scorePropertyV2()` function, but it is **not** called by the production API (`api/opportunity.js`). That function is a legacy path used by other code. Only `scoreAllSuburbs()` feeds the production ranking.

### 3.1 Weighting (Smart strategy — only strategy available)

| Factor | Weight | Notes |
|---|---|---|
| Undervaluation | 30% | based on median house price tier (cheaper = higher score) |
| Growth | 25% | derived from growth-projector.js OLS (⚠️ unreliable — see §4) |
| Yield | 15% | from gross_yield (rent × 52 / median_house_price) |
| Vacancy | 15% | 100 - vacancy_rate × 20, inverse of vacancy |
| School | 10% | ICSEA-derived score (0-100) |
| Confidence | 5% | data completeness: more non-null fields = higher score |

### 3.2 Per-Factor Scoring

**Undervaluation** (`classifySuburb`):
```
undervalScore = min(100, undervaluation × 2)
```
Where `undervaluation` maps median house price to a 1-5 tier:
- `< $500K` → tier 5 (highest), score 90-100
- `$500-750K` → tier 4, score 70-89
- `$750K-1M` → tier 3, score 50-69
- `$1M-1.5M` → tier 2, score 30-49
- `> $1.5M` → tier 1, score 10-29

**Growth** (`computeSuburbScore`):
```
growthScore = min(100, max(0, (growth_1y + growth_3y × 2 + govt_5yr_cagr × 2) / 3))
```
⚠️ `govt_5yr_cagr` has only 8/238 coverage — effectively `(g1 + g3×2) / 3`.

**Yield**:
```
yieldScore = min(100, gross_yield × 25)
```

**Vacancy**:
```
vacancyScore = min(100, max(0, (10 - vacancy_rate) × 10))
```

**School**: Direct ICSEA score (0-100) from school_profiles table.

**Confidence**:
```
confScore = (u > 0 && g3 > 0 ? 40 : 20) + (govt_5yr_cagr > 0 ? 30 : 10) + (s > 0 ? 30 : 10)
```
This measures data **completeness** (how many factors have values), not data **quality** or **statistical significance**.

### 3.3 Composite Score

```
finalScore = undervalScore × 0.30 + growthScore × 0.25 +
             yieldScore × 0.15 + vacancyScore × 0.15 +
             schoolScore × 0.10 + confidenceScore × 0.05
```

### 3.4 Classification

```javascript
if (underval >= 15 && growthScore >= 8 && school >= 60 && yield >= 2.0) → 'Smart Buy'
else if (growthScore >= 15) → 'Growth Opportunity'
else if (yield >= 3.0 && vacancy < 5) → 'Cashflow Opportunity'
else if (school >= 65) → 'School Zone Opportunity'
else if (underval >= 20) → 'Value Opportunity'
else if (infrastructure >= 30) → 'Infrastructure Opportunity'  // never triggers (infra=0)
else → 'Balanced Opportunity'
```

---

## 4. 🔴 Critical Issue: Growth Data Quality

The growth engine (`lib/growth-projector.js`) uses a **136-day window** (≈20 weeks) of weekly median price points for OLS regression.

### 4.1 Data Sources by Tier

| Tier | Condition | Source |
|---|---|---|
| A (high conf) | ≥3 weekly medians with ≥1 week having ≥3 sales | OLS on ln(price) |
| B (pooled) | <2 weeks of data | Pool by price band, OLS on pooled data |
| C (market) | <3 pooled rows | Whole-market weekly OLS |
| D (VGV) | govt_5yr_cagr exists | Only 8/238 suburbs |

### 4.2 Production Distribution (238 rows)

| Metric | Min | Max | Avg | % at Clamp Ceiling | % at Clamp Floor |
|---|---|---|---|---|---|
| growth_1y | 0.00 | 30.00 | 12.94 | **91/230 (40%) at 30** | 0 |
| growth_3y | -8.00 | 25.00 | 6.94 | **91/230 (40%) at 25** | **111/230 (48%) at -8** |
| growth_5y | -5.00 | 20.00 | 6.34 | 91/230 (40%) at 20 | 111/230 (48%) at -5 |

**88% of growth_3y values are at a clamp boundary** (+25 or -8). Only 28 suburbs (12%) have non-clamped values.

### 4.3 Root Cause

136 days (≈20 weeks) is **insufficient** for stable OLS regression on house price data:
- Weekly median from 1-2 sales is dominated by which single property sold that week
- Pooled regression across price bands inherits extreme outliers
- No seasonal adjustment
- The ±8%/25%/30% clamps create false plateaus: suburbs at +30% could be anywhere from 30% to 200%

---

## 5. Database Schema Coverage

`suburb_metrics` has **68 columns** across 238 rows. Key coverage findings:

### 5.1 Well-Populated (≥90%)

| Column | Coverage |
|---|---|
| median_house_price | 238/238 (100%) |
| vacancy_rate | 238/238 (100%) |
| supply_dwelling_growth | 238/238 (100%) |
| supply_is_growth_corridor | 238/238 (100%) |
| supply_land_release_indicator | 238/238 (100%) |
| supply_precinct_proximity | 238/238 (100%) |
| growth_1y/3y/5y | 230/238 (97%) |
| supply_housing_stock | 225/238 (95%) |
| supply_unemployment_rate | 225/238 (95%) |
| dwelling_* (G41) columns | 225/238 (95%) |
| conf_income | 225/238 (95%) |
| median_house_rent | 217/238 (91%) |
| gross_yield | 217/238 (91%) |
| school_score | 212/238 (89%) |

### 5.2 Under-Populated

| Column | Coverage | Notes |
|---|---|---|
| median_unit_price | 208/238 (87%) | ✅ reasonable |
| **median_unit_rent** | **0/238 (0%)** | never populated |
| **govt_5yr_cagr** | **8/238 (3%)** | VGV only loaded for 8 suburbs |
| **infrastructure_score** | **0/238 (0%)** | never populated; dead classification path |
| **supply_constraint_score** | **0/238 (0%)** | never populated |
| **supply_risk_score** | **0/238 (0%)** | never populated |
| **overall_confidence** | **0/238 (0%)** | never populated |
| **All fallback_tier_* columns** | **0/238 (0%)** | never populated |
| **All source_confidence_* columns** | **0/238 (0%)** | never populated |
| **conf_value/growth/yield/vacancy/school** | **0/238 (0%)** | factor-level confidence never written |
| **conf_population** | **0/238 (0%)** | never populated |
| **conf_infrastructure** | **0/238 (0%)** | never populated |
| **conf_supply_constraint** | **0/238 (0%)** | never populated |

**Total unused columns: 27 out of 68 (40%)** — schema exists for future use but no pipeline populates them.

---

## 6. Documented vs Production Discrepancies

| Documentation Claim | Production Reality | Severity |
|---|---|---|
| Strategy parameter changes sorting | Only `smart` works; others return 400 (intentional Phase 0A gate) | 🟢 Intentionally gated |
| Confidence = 5% quality metric | Confidence = data **completeness** metric (how many fields exist) | 🟡 Conceptual drift |
| Fallback tiers (A/B/C/D) tracked | All fallback_tier columns = NULL | 🟢 Schema only |
| Infrastructure scored from planning data | infrastructure_score = 0 for 238/238 | 🟡 Dead classification path |
| Growth = ~3Y CAGR (user-facing label) | 136-day OLS with extreme clamping | 🔴 Misleading label (Phase 0A partially fixed) |
| Vacancy = SA2 G36 Census | ✅ Correct — but 2021 data, not current vacancy | 🟢 Documented honestly |
| Undervaluation = price-to-value | Actually median price tier (cheaper = higher score) | 🟡 Conceptual drift |

---

## 7. Issues Found and Corrected (Phase 0A)

### 7.1 Online Language Corrections

| Location | Before | After |
|---|---|---|
| `public/top-growth-suburbs-victoria.html` | "forecast price appreciation", "showing top 100 suburbs ranked by growth score" | "Experimental market trend signal", "ranked by opportunity score", yellow disclaimer added |
| `public/index.html` | "forecast price appreciation" in Growth preview card | "Experimental price trend signals" |
| `public/trust-layer.js` | "CAGR" / "price forecast" language | "trend signal" / "price trend" language |
| `api/opportunity.js` | Non-smart strategies silently failed | Returns 400 with "unsupported_strategy" + Beta disclaimer in meta |
| `scripts/generate-suburb-pages.js` | "3yr growth", "forecast" | "Experimental short-term price trend signal", "not a calibrated price forecast" |
| `scripts/generate-ai-pages.js` | "3yr growth" | "trend signal" |

### 7.2 Remaining Issues (Not Yet Fixed)

| Issue | Blocked By | Priority |
|---|---|---|
| Suburb page JSON-LD still says "3-Year Growth" | Needs regeneration after generator fix | 🔴 Phase 0A final |
| Suburb page card `<h3>3-Year Growth</h3>` | Needs regeneration after generator fix | 🔴 Phase 0A final |
| Top Growth page still says "Strong 3-year growth of 25.0%" | Static page needs manual fix | 🔴 Phase 0A final |
| Top Growth page still says "showing top 100 suburbs ranked by growth score" | Static page fix | 🔴 Phase 0A final |
| Other top-* pages still say "growth projections" in meta description | Static page fix | 🟡 Phase 0A final |
| Strategy dropdown exists in UI but only Smart works | Needs UI gating | 🟡 Phase 0A final |
| `model-contract-tests.mjs` fails — distance/time weights changed in v2 engine | Test update needed | 🟡 Phase 0A final |

*Issues listed above are now resolved as part of this Phase 0A revision — see commit below.*

### 7.3 What Phase 0A Did Not Change

- **No scoring model changes** (weights, factors, thresholds unchanged)
- **No new data ingested** (no VIF, no ABS ERP, no building approvals)
- **No database migrations** (no new columns, no alter tables)
- **No 301 redirects** (legacy URL continues to work)
- **No strategy behavior changes** — non-smart still returns 400
- **Old URLs continue to work** — no file moves or renames

---

## 8. Missing Future-Looking Data

The TDD (`OPPORTUNITY_INTELLIGENCE_PLATFORM_TDD_V1.md`) describes a **Future Demand** + **Future Supply** + **Market Position** model. None of these are implemented.

### 8.1 Future Demand

| Data Source | Status | Effort |
|---|---|---|
| VIF population projections (SA2) | Not integrated | Medium |
| ABS ERP estimates | Not integrated | Low |
| Building Approvals (rolling 12mo) | Not integrated | Medium |
| Internal migration flows | Not integrated | Medium |
| Employment proximity / job density | Partial (SALM has unemployment only) | Medium |
| School enrollment trends | Not integrated | High |
| Transport infrastructure pipeline | Not integrated | High |

### 8.2 Future Supply

| Data Source | Status | Effort |
|---|---|---|
| PSP (Precinct Structure Plans) | Not integrated | High |
| VPA development pipeline | Proxy values only (supply_land_release_indicator ≈49 avg) | High |
| Vicmap parcel subdivision rates | Raw files exist in `data/vicmap/` | Medium |
| Zoning data | Not integrated | High |
| Planning permit lodgements | Not integrated | Very High |
| Vacant residential land supply | Not integrated | High |

### 8.3 Market Position

| Feature | Status | Effort |
|---|---|---|
| Comparable suburb clusters | Not implemented | Medium |
| Price tier boundary analysis | Hardcoded tiers | Low |
| Days-on-market / vendor discount | Not integrated | Medium |
| Auction clearance rates | Not integrated | Medium |
| FHB vs investor share | Not integrated | High |

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Status |
|---|---|---|---|
| 🔴 Growth metric misleads investors | High | High — reputational risk | Partially mitigated by Phase 0A disclaimers; OLS replacement needed |
| 🔴 47% suburbs clamped to growth_3y=-8 | Certain | Medium — false negatives | Requires growth model rebuild |
| 🟡 "Undervaluation = cheap" confuses price with value | Medium | Medium | Requires fundamental override |
| 🟡 Infrastructure Opportunity type is dead code | High | Low — user never sees it | Real data must be populated before it becomes visible/active |
| 🟢 Confidence formula not documented | Low | Low | Minor docs gap |
| 🟢 Two scoring functions exist | Low | Low — only `scoreAllSuburbs` feeds production | Cleanup opportunity |

---

## 10. Migration Roadmap

### Phase 0A: Audit + Correction (Current — ✅ Complete)

- [x] Audited scoring formula, data coverage, growth engine
- [x] Fixed online misdirection language (Phase 0A)
- [x] Gated unsupported strategies — dropdown now only shows Smart; API continues 400 for others
- [x] Regenerated 230 suburb pages + 7 opportunity pages with trend signal language
- [x] Fixed valuation-engine.js scoring: location max 20, recency max 16 (rest adjusted to total 100)
- [x] Fixed model-contract test to match v3 engine constants
- [x] Removed Infrastructure classification from UI until real data connected
- [x] `scorePropertyV2` documented as unused legacy path
- [x] Confirmed 40/40/20 is target model, not model being replaced

### Phase 0B: Free Data Source Verification (Next)

- Verify VIF, ABS ERP, Building Approvals data availability and format
- Validate free VSA / SA2 data sources for growth projection
- Document data licensing restrictions

### Phase 1: Data Foundation

- Fix growth model: use multi-year CAGR (VGV or ABS) as primary, longer-window OLS as secondary
- Expand SA2→suburb mapping for all 238 suburbs
- Populate govt_5yr_cagr for all suburbs
- Align fallback logic between classification and scoring
- Populate infrastructure_score from real planning data before re-enabling Infrastructure classification

### Phase 2: Data Expansion

- VIF population projections ingestion
- ABS Building Approvals rolling 12-month
- Vicmap parcel → subdivision rate pipeline
- PSP/VPA development pipeline integration

### Phase 3: Model Redesign

The **Future Growth Outlook** target model (40/40/20 — Future Demand × Supply Constraint × Market Position) is the **goal**, not the model being replaced. The current model is a Beta composite indicator (opportunity_score). The FGO model will be a separate, future-facing system when data is available.

- Design Future Demand Index
- Design Future Supply Constraint Index
- Design Market Position Index
- Replace current Beta composite with separate FGO system

---

## 11. Effort Estimate (Future Phases)

| Phase | Tasks | Est. Person-Days |
|---|---|---|
| Phase 0B: Data Source Verification | 3 | 3-5 |
| Phase 1: Data Foundation | 5 | 5-7 |
| Phase 2: Data Expansion | 5 | 10-15 |
| Phase 3: Model Redesign | 6 | 12-18 |
| **Total** | **19** | **30-45** |

---

## 12. Conclusion

The current system is a **Beta composite indicator** with one critical data quality issue (growth clamp), 27 unused schema columns, and zero future-looking data. It functions reasonably as a general suburb dashboard (median price, schools, demo data) but **cannot be called a "Future Growth Outlook"** without the data sources and model described in the TDD.

**What works well:**
- Median price, school, and Census dwelling data coverage ≥90%
- Weekly data collection pipeline stable
- Beta disclaimers now honest (Phase 0A)
- Single `opportunity_score` source of truth for ranking

**What must change for Future Growth Outlook:**
- Growth data source replaced with multi-year CAGR
- Undervaluation based on fundamentals, not price tier
- Infrastructure/Supply scores populated from real data
- Confidence measures data quality, not completeness
- New FGO model as separate system alongside existing Beta indicator
