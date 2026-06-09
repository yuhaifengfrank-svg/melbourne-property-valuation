# Phase 2: Opportunity Score Breakdown Layer

## Architecture

```
                      ┌─────────────────────────────────────┐
                      │       suburb_metrics (49 cols)      │
                      │  (pre-computed, refreshed nightly)  │
                      └──────────┬──────────────────────────┘
                                 │
                      ┌──────────▼──────────┐
                      │  factor-breakdown.js │
                      │  (9 factor scorers  │
                      │   + explanation fn) │
                      └──┬───┬───┬───┬───┬──┘
                         │   │   │   │   │
         ┌───────────────┘   │   │   │   └──────────────┐
         ▼                   ▼   ▼   ▼                  ▼
  /api/suburb-     /api/top-   /api/top-   /api/top-   /api/top-
  intelligence     growth      value       yield       school
```

## API Endpoints

| Endpoint | Method | Description | Query Params |
|----------|--------|-------------|-------------|
| `/api/suburb-intelligence` | GET | Full 9-factor + explanation | `suburb`, `format=text` |
| `/api/top-growth` | GET | Top growth suburbs | `limit` (default 20, max 50) |
| `/api/top-value` | GET | Best value suburbs | `limit` |
| `/api/top-yield` | GET | Highest yield suburbs | `limit` |
| `/api/top-school` | GET | Best school zones | `limit` |

## 9 Factors

| Factor | Domain | Input | Score Range |
|--------|--------|-------|-------------|
| Value | Undervaluation | median_house_price | 20-95 |
| Growth | Price Appreciation | growth_{1y,3y,5y} weighted | 25-95 |
| Yield | Rental Return | gross_yield (or price proxy) | 20-95 |
| Vacancy | Rental Demand | vacancy_rate | 15-90 |
| School | Education Quality | school_score | 30-95 |
| Income | Demographics | median_house_price + unemp | 40-90 |
| Population | Demographic Momentum | population_growth | 35-90 |
| Supply | Supply Constraint | conf_supply_ + corridor/land/precinct | 35-90 |
| Infrastructure | Gov Investment | conf_infrastructure | 30-85 |

## Tier System

- A+: 90-100
- A: 80-89
- A-: 75-79
- B+: 65-74
- B: 55-64
- C+: 50-54
- C: 40-49
- D: <40

## Explanation Engine

Each factor generates 1-4 context-aware sentences:

- **Value**: price-specific, includes unit entry point if applicable
- **Growth**: 1y/3y/5y momentum, avg vs market
- **Yield**: numerical threshold, yield/price tradeoff notes
- **Vacancy**: tight → moderate → elevated → high with rental demand implications
- **School**: quality tiers with family-demand premium notes
- **Income**: demographic profile + unemployment overlay
- **Population**: growth trajectory assessment
- **Supply**: constraint level + corridor ID + employment + land release
- **Infrastructure**: project impact assessment

## Sample Suburbs (Production)

### Scoresby
- Overall Confidence: 80.5/100
- **Growth: 85 (A)** — 25% 3y growth, 30% 1y momentum
- **Infrastructure: 70 (B+)** — nearby projects
- **Supply: 59 (B)** — moderate constraint, 8.5k employment
- **Valuation: 40 (C+)** — $1.0M premium

### Werribee
- Overall Confidence: 81.1/100
- **Growth: 85 (A)** — 25% 3y growth corridor
- **Infrastructure: 85 (A)** — major projects in vicinity
- **Supply: 63 (B)** — growth corridor + active development
- **Value: 70 (B+)** — $692K mid-market with cap appreciation

### Oakleigh
- Overall Confidence: 79.7/100
- **School: 65 (B)** — above average
- **Income: 70 (B+)** — affluent demographic
- **Growth: 15 (D)** — -8% 3y, negative momentum

### Clayton
- Overall Confidence: 79.2/100
- **Infrastructure: 85 (A)** — Monash + hospital precinct
- **School: 65 (B)** — above average
- **Vacancy: 15 (D)** — 21.6% high

### Sorrento
- Overall Confidence: 57.9/100
- **Income: 90 (A)** — $2.1M blue-chip demographic
- **Valuation: 20 (D)** — ultra-premium pricing
- **Yield: 30 (D)** — no rental data, typical resort

## Implementation Notes

- `factor-breakdown.js` is pure transformation — no new DB queries beyond one `SELECT *` per suburb
- Top-N endpoints reuse the same factor scorers → single computation path
- Explanation engine is rule-based (no LLM call) → fast, deterministic, cacheable
- `format=text` provides plain-text for SEO/article embedding
- All endpoints set `Cache-Control: public, max-age=3600`
- **No new datasets, crawlers, or UI added**
