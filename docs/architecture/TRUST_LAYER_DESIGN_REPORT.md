# Trust Layer Design Report

## Objective

Increase user trust and conversion by adding transparent data explanations to the AusHomeValue front-end.

## Design Principles

1. **No backend changes** — every component reads from existing API responses (`/api/opportunity`, `/api/suburb-intelligence`)
2. **No hard-coded suburb names** — all components are reusable, driven by API data
3. **Mobile-first** — collapsible/expandable sections to preserve screen space
4. **Bilingual** — English and 简体中文

---

## Component 1: Methodology Section

**Location**: New tab in the nav bar, or as an expandable section on the homepage

**Content**:

### Opportunity Score Methodology

```
Opportunity Score = weighted combination of 7 factors:

  undervaluation (27%) — how affordable vs Melbourne median
  school_quality   (23%) — ACARA NAPLAN / ICSEA scores  
  growth_potential (20%) — 1yr/3yr/5yr weighted CAGR
  cashflow_yield   (12%) — gross rental yield
  vacancy_demand   (10%) — rental vacancy rate (inverted)
  confidence       (5%)  — data source reliability  
  supply_constraint (3%) — limited land release
```

Each factor normalized to 0-100, then weighted and summed.  
Scores are recalculated after each weekly data refresh.

### Data Sources Table

| Source | What We Use | Refresh Frequency |
|--------|-------------|-------------------|
| REA / Domain (public sold data) | Comparable sales — price, bedrooms, land size | Weekly |
| Australian Bureau of Statistics 2021 | Census demographics, income, dwellings | 5-yearly |
| ACARA (MySchool) | School ICSEA, NAPLAN scores | Annual |
| Vic Government Valuer General | SA2-level median prices, 5yr/10yr CAGR | Annual |
| REIV / SQM Research | Vacancy rates by suburb | Monthly |

### Data Quality Notes

- Government data sets are our **Tier A** (highest confidence)
- Market data (portal sales) is **Tier B** — checked against VGV for consistency
- Estimated/projected data is **Tier C** — clearly labelled when used

---

## Component 2: Confidence Section

**Location**: Suburb-level detail card, shown when a user selects a suburb from opportunity results

**Wireframe**:

```
┌──────────────────────────────────┐
│  📊 Data Confidence              │
│                                  │
│        ● ● ● ● ● ● ○ ○          │
│       81%  Overall               │
│                                  │
│  Based on:                       │
│  ✓ 23 recent sales  (Tier A)     │
│  ✓ 4 government datasets (A-C)   │
│  ✓ 3 market datasets  (Tier B)   │
│                                  │
│  Per-factor breakdown:           │
│  Value    ██████████ 95%  Tier A │
│  Growth   █████████  85%  Tier A │
│  School   ██████████ 95%  Tier A │
│  Yield    ██████████ 95%  Tier A │
│  Vacancy  ███████   70%  Tier A  │
└──────────────────────────────────┘
```

**Data source**: `suburb_metrics.overall_confidence` + `source_confidence_*` and `fallback_tier_*` fields.

### Implementation

```javascript
// API query returns:
{
  overallConfidence: 81,
  perFactor: [
    { name: "Value",    confidence: 95, tier: "A" },
    { name: "Growth",   confidence: 85, tier: "A" },
    { name: "School",   confidence: 95, tier: "A" },
    { name: "Yield",    confidence: 95, tier: "A" },
    { name: "Vacancy",  confidence: 70, tier: "A" },
  ],
  dataSets: [
    { name: "govt",             label: "Government datasets",    count: 4 },
    { name: "market",           label: "Market datasets",        count: 3 },
    { name: "source_confidence_price", label: "Recent sales",    count: 23 },
  ]
}
```

---

## Component 3: "Why This Suburb?" Section

**Location**: Beside or below the confidence card, shown after selecting a suburb

**Wireframe**:

```
┌──────────────────────────────────┐
│  💡 Why Scoresby?                │
│                                  │
│  Strengths:                      │
│  🟢 School   86/100  A           │
│     Top-performing primary &     │
│     secondary school zone        │
│  🟢 Growth   75/100  A-          │
│     12.4% 3yr CAGR, above avg    │
│  🟢 Value    70/100  B+          │
│     Median $850K vs Melb $1.05M  │
│                                  │
│  Risks:                          │
│  🟡 Vacancy  35/100  C           │
│     8.9% — above Melb avg        │
│  🟡 Yield    30/100  C           │
│     2.4% gross rental yield      │
└──────────────────────────────────┘
```

**Data source**: `/api/suburb-intelligence?suburb=Scoresby` → factor scores + explanations.

**Sorting**: Top 3 strengths by score, bottom 2-3 risks by score.

---

## Component 4: Reusable `<trust-layer>` Element

**Implementation**: Pure CSS + vanilla JS component that reads from `window.trustData` or explicit options. No framework dependency.

### API

```javascript
// Trigger trust layer on any suburb result
showTrustLayer({
  suburb: "Scoresby",
  opportunityScore: 86,
  overallConfidence: 81,
  perFactor: [ /* from suburb-intelligence API */ ],
  dataSets: { recentSales: 23, govDatasets: 4, marketDatasets: 3 }
});
```

### CSS Class Structure

```
.trust-confidence       { /* confidence badge + bar */ }
.trust-confidence-bar   { /* animated bar fill */ }
.trust-confidence-label { /* text description */ }
.trust-factor-grid      { /* factor breakdown grid */ }
.trust-strengths        { /* green cards for top factors */ }
.trust-risks            { /* amber cards for weak factors */ }
.trust-data-sources     { /* source table */ }
.trust-methodology-link { /* links to full methodology page */ }
```

### Mobile Behavior

| Width | Layout |
|-------|--------|
| >768px | Side-by-side confidence + why-this-suburb |
| <768px | Stacked vertically, collapsible sections |
| <480px | Single column, all expanded by default |

### i18n Keys Added

```javascript
".trust-confidence":       "Data Confidence",
".trust-overall-score":    "Overall Confidence: {score}%",
".trust-based-on":         "Based on:",
".trust-recent-sales":     "{n} recent sales",
".trust-govt-data":        "{n} government datasets",
".trust-market-data":      "{n} market datasets",
".trust-why-suburb":       "Why {suburb}?",
".trust-strengths":        "Strengths",
".trust-risks":            "Risks",
".trust-methodology":      "View full methodology →",
```

---

## Data Flow

```
                   ┌──────────────────┐
                   │  opportunity.js  │  ← returns score + type
                   └────────┬─────────┘
                            │ selected suburb
                            ▼
                   ┌──────────────────┐
                   │ suburb-intelligence.js │  ← returns per-factor scores
                   └────────┬─────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌────────────────────┐     ┌──────────────────────┐
    │  Confidence Card   │     │  Why This Suburb?    │
    │  overall_confidence│     │  factor scores + exp.│
    │  source_confidence │     │  strengths / risks   │
    │  fallback_tiers    │     │                      │
    └────────────────────┘     └──────────────────────┘
```

---

## Screenshots

### Methodology Section
```
┌─ AusHomeValue ── Home ── Valuation ── Research ── Top Opps ── [How It Works]──┐
│                                                                              │
│  📋 How the Score Works                                                      │
│                                                                              │
│  Opportunity Score is calculated from 7 factors, each scored 0-100:          │
│                                                                              │
│  undervaluation (27%)    School Quality (23%)   Growth Potential (20%)       │
│  ████████████████████    █████████████████      ██████████████               │
│                                                                              │
│  Yield (12%)  Vacancy (10%)  Data Confidence (5%)  Supply Constraint (3%)   │
│  ████████     ██████          ███                   ██                       │
│                                                                              │
│  ┌─ Data Sources ─────────────────────────────────────────────────┐         │
│  │ Source              │ Used For              │ Refresh           │         │
│  │─────────────────────│───────────────────────│──────────────────│         │
│  │ REA / Domain sold   │ Comparable sales      │ Weekly            │         │
│  │ ABS 2021 Census     │ Demographics, Income  │ 5-yearly          │         │
│  │ ACARA MySchool      │ School scores         │ Annual            │         │
│  │ VGV                  │ Price trends          │ Annual            │         │
│  │ SQM Research         │ Vacancy rates        │ Monthly           │         │
│  └────────────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Confidence + Why Suburb (Desktop)
```
┌───────────────────────┬──────────────────────────────────────────┐
│  📊 Data Confidence   │  💡 Why Werribee?                       │
│                       │                                          │
│  ● ● ● ● ● ● ● ○ ○   │  Strengths:                             │
│              81%      │  🟢 Yield  70/100 B+  Gross 2.9% yield │
│                       │  🟢 Value  65/100 B   Median$730K below │
│  Based on:            │  🟢 Growth 60/100 B+  30% 1yr growth   │
│  ✓ 23 recent sales    │                                          │
│  ✓ 4 gov datasets     │  Risks:                                 │
│  ✓ 3 market datasets  │  🟡 School 40/100 C  Below avg NAPLAN   │
│                       │  🟡 Vacancy 50/100 B  2.4% above avg   │
│  Per factor:          │                                          │
│  Value    █████  95%  │  [View full methodology →]              │
│  Growth   █████  85%  │                                          │
└───────────────────────┴──────────────────────────────────────────┘
```

### Confidence + Why Suburb (Mobile)
```
┌──────────────────┐
│  📊 Confidence   │  ← tap to expand
├──────────────────┤
│  ● ● ● ● ● ● ○  │
│       81%        │
│  Based on:       │
│   23 recent sales│
│   4 gov datasets │
└──────────────────┘

┌──────────────────┐
│  💡 Why Werribee?│  ← tap to expand
├──────────────────┤
│  Strengths:      │
│  🟢 Yield  70    │
│   2.9% gross     │
│  🟢 Value  65    │
│   $730K median   │
│                  │
│  Risks:          │
│  🟡 School 40    │
│   Below avg      │
└──────────────────┘
```

---

## Implementation Plan

| Step | What | Dependencies |
|------|------|-------------|
| 1 | Methodology section HTML + CSS | None (static content) |
| 2 | Confidence card component | `/api/suburb-intelligence` |
| 3 | Why-this-suburb component | `/api/suburb-intelligence` |
| 4 | Reusable trust-layer JS class | Steps 2-3 |
| 5 | Integrate into opportunity results | Step 4 |
| 6 | Add i18n keys | Steps 1-4 |
| 7 | Mobile responsive CSS | Steps 1-4 |

---

## Do Not Verify

- [ ] Modify scoring engine
- [ ] Modify valuation engine
- [ ] Add new datasets
- [ ] Hard-code suburb names

All verified — the trust layer is 100% front-end UI work using existing APIs.
