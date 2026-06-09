# suburb_metrics V1 Final Specification

> Phase 1A Deliverable — Frozen 2026-06-09

## 1. Purpose

`suburb_metrics` is the single source of truth for suburb-level property intelligence.
It powers the Opportunity Engine (scoring + classification), all SEO-ranked `/opportunities/`
pages, the homepage Top 3 snippet, and the API endpoint `/api/opportunity`.

**Design principle:** Every field has a clear "what" + "how" + "confidence that it's right."

---

## 2. Full Column Reference

### 2.1 Identity

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `suburb` | `TEXT` | NOT NULL | — | Suburb name (case-preserved). PK col 1. |
| `state` | `TEXT` | NOT NULL | `'VIC'` | State code (e.g. VIC, NSW). PK col 2. |

*PK: `PRIMARY KEY (suburb, state)`*

### 2.2 Price Metrics

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `median_house_price` | `NUMERIC(12,0)` | Yes | Median sale price for Houses (3-yr window) |
| `median_unit_price` | `NUMERIC(12,0)` | Yes | Median sale price for Units/Apartments/Townhouses |
| `median_house_rent` | `NUMERIC(10,0)` | Yes | Median weekly house rent (ABS SA2 G02) |
| `median_unit_rent` | `NUMERIC(10,0)` | Yes | Median weekly unit rent |

### 2.3 Yield & Vacancy

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `gross_yield` | `NUMERIC(5,2)` | Yes | Gross rental yield % (rent×52/median_house_price) |
| `vacancy_rate` | `NUMERIC(5,2)` | Yes | Vacancy rate % (ABS SA2 G36) |

### 2.4 Growth

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `growth_1y` | `NUMERIC(6,2)` | Yes | Projected 1-year price growth % |
| `growth_3y` | `NUMERIC(6,2)` | Yes | Projected 3-year CAGR % |
| `growth_5y` | `NUMERIC(6,2)` | Yes | Projected 5-year CAGR % |
| `govt_5yr_cagr` | `NUMERIC(5,2)` | Yes | VGV ABS SA2 5-yr historical CAGR (fallback reference) |
| `population_growth` | `NUMERIC(6,2)` | Yes | Population growth rate % |

### 2.5 Factor Scores

| Column | Type | Nullable | Range | Description |
|--------|------|----------|-------|-------------|
| `undervaluation` | `NUMERIC(5,1)` | Yes | 0-100 | Undervaluation factor: cheaper suburbs score higher |
| `school_score` | `NUMERIC(5,1)` | Yes | 0-100 | School quality score (normalised from ICSEA 800-1250) |
| `infrastructure_score` | `NUMERIC(5,1)` | Yes | 0-100 | Infrastructure investment intensity score |
| `supply_risk_score` | `NUMERIC(5,1)` | Yes | 0-100 | Supply risk (legacy name, retained) |
| `supply_constraint_score` | `NUMERIC(5,1)` | Yes | 0-100 | Supply constraint (V1 forward name; high = limited supply) |

### 2.6 Composite

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `opportunity_score` | `NUMERIC(5,1)` | Yes | Weighted composite (undervaluation 30%, growth 25%, yield 15%, vacancy 15%, school 10%, confidence 5%) |
| `opportunity_type` | `TEXT` | Yes | Classification label: 'Growth Opportunity', 'School Zone Opportunity', 'Cashflow Opportunity', 'Balanced Opportunity', 'Infrastructure Opportunity', 'Value Opportunity' |

### 2.7 Factor Confidence (NEW in V1)

Each primary factor gets its own confidence score (0-100):

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `conf_undervaluation` | `NUMERIC(5,1)` | Yes | Confidence in undervaluation factor |
| `conf_growth` | `NUMERIC(5,1)` | Yes | Confidence in growth factor |
| `conf_yield` | `NUMERIC(5,1)` | Yes | Confidence in rental yield factor |
| `conf_vacancy` | `NUMERIC(5,1)` | Yes | Confidence in vacancy factor |
| `conf_school` | `NUMERIC(5,1)` | Yes | Confidence in school quality factor |

### 2.8 Source Confidence (NEW in V1)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `conf_sales_source` | `NUMERIC(5,1)` | Yes | Reliability of sales data source |
| `conf_rent_source` | `NUMERIC(5,1)` | Yes | Reliability of rental data source |
| `conf_school_source` | `NUMERIC(5,1)` | Yes | Reliability of school data source |
| `conf_growth_source` | `NUMERIC(5,1)` | Yes | Reliability of growth projection source |
| `conf_vacancy_source` | `NUMERIC(5,1)` | Yes | Reliability of vacancy data source |

### 2.9 Fallback Tiers (NEW in V1)

Each dimension tracked by which fallback tier was used (A=direct, B=pooled, C=regional, D=static/default):

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `fallback_tier_sales` | `TEXT` | Yes | 'A' / 'B' / 'C' / 'D' |
| `fallback_tier_growth` | `TEXT` | Yes | Same |
| `fallback_tier_yield` | `TEXT` | Yes | Same |
| `fallback_tier_vacancy` | `TEXT` | Yes | Same |
| `fallback_tier_school` | `TEXT` | Yes | Same |

### 2.10 Overall Confidence (NEW in V1)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `overall_confidence` | `NUMERIC(5,1)` | Yes | Rolled-up composite (factor × source × fallback) |

### 2.11 Metadata

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Last row update timestamp |
| `scoring_version` | `TEXT` | Yes | `'v2'` | Scoring engine version tag |

---

## 3. Confidence Model

### 3.1 Factor Confidence (conf_*)

Rules for each factor:

- **conf_undervaluation**: 100 if both median_house_price AND median_unit_price available; 70 if only one; 40 if only source proxy; 20 if pure static
- **conf_growth**: 100 if all 3 growth periods (1y/3y/5y) have data; 80 if 2 of 3; 60 if 1; 30 if VGV-only; 15 if static
- **conf_yield**: 100 if gross_yield directly computed from rent+price; 60 if price-proxy used; 30 if regional; 15 if default(4%)
- **conf_vacancy**: 100 if SA2 census G36 available; 60 if regional average; 30 if state average; 15 if default(5%)
- **conf_school**: 100 if suburb has direct ICSEA data (>=1 school); 70 if regional school avg; 40 if state avg; 20 if default(50)

### 3.2 Source Confidence (conf_*_source)

Quality of underlying data pipeline:

- **conf_sales_source**: Based on number of comparables used for median calc: ≥20 sales = 100; 10-19 = 80; 5-9 = 60; 1-4 = 40; 0 = 20
- **conf_rent_source**: Based on census data completeness and recency
- **conf_school_source**: Number of schools averaged: ≥5 = 100; 3-4 = 80; 1-2 = 60; 0 = 20
- **conf_growth_source**: Source tier: A (direct sales regression) = 100; B (pooled) = 80; C (regional) = 50; D (VGV) = 40
- **conf_vacancy_source**: Direct SA2 census = 100; regional = 60; state = 30; default = 15

### 3.3 Fallback Tiers

| Code | Meaning | Examples |
|------|---------|---------|
| A | Direct data available | Suburb has own median, own ICSEA score |
| B | Pooled / proxied | Used pooled median from similar suburbs; price-proxy yield |
| C | Regional average | Used SA3 or LGA average |
| D | Static / default | Used hardcoded default value |

### 3.4 overall_confidence

```
overall_confidence = (
  AVG(conf_undervaluation, conf_growth, conf_yield, conf_vacancy, conf_school) * 0.60 +
  AVG(conf_sales_source, conf_rent_source, conf_school_source, conf_growth_source, conf_vacancy_source) * 0.25 +
  fallback_penalty * 0.15
)
```

Where `fallback_penalty` = 100 − (number of 'D' tiers × 20 + number of 'C' tiers × 10).

---

## 4. Index Strategy

| Index | Type | Purpose |
|-------|------|---------|
| `sm_opportunity_score_desc_idx` | Partial B-tree, `opportunity_score DESC` WHERE `opportunity_type IS NOT NULL` | Top N home page and opportunity listing queries |
| `sm_opportunity_type_score_idx` | Composite `(opportunity_type, opportunity_score DESC)` | Per-category top listings (e.g. top 10 Growth) |
| `sm_overall_confidence_desc_idx` | Partial B-tree, `overall_confidence DESC` WHERE `overall_confidence IS NOT NULL` | Future: consumer confidence filtering |
| `sm_suburb_lower_idx` | `LOWER(suburb) text_pattern_ops, state` | Single-suburb lookup (matching) |
| `sm_vacancy_rate_idx` | Partial B-tree, `vacancy_rate ASC` WHERE `vacancy_rate IS NOT NULL` | Rental-focused queries |
| `sm_gross_yield_desc_idx` | Partial B-tree, `gross_yield DESC` WHERE `gross_yield IS NOT NULL` | Cashflow-focused queries |

Primary PK index (`PRIMARY KEY (suburb, state)`) already exists.

---

## 5. Referenced Tables & Sources

| External table | Relation | Refresh cadence |
|---------------|----------|----------------|
| `comparable_sales` | Derives median_house_price, median_unit_price | Daily / weekly |
| `school_locations` + `school_profiles` | Derives school_score | Static (annual ACARA update) |
| `census_sa2_data` (G02, G36) | Derives median_house_rent, vacancy_rate | Static (census year) |
| `macro_indicators` | Growth projection macro adjustment | Monthly |

---

## 6. Data Quality Metrics (as of baseline)

| Metric | Value |
|--------|-------|
| Total rows | ~248 |
| With median_house_price | ~230 |
| With median_unit_price | ~180 |
| With median_house_rent | ~224 |
| With growth_3y | ~224 |
| With school_score | ~230 |
| With gross_yield | ~224 |
| With vacancy_rate | ~230 |
| With opportunity_score | ~248 |
| With govt_5yr_cagr | ~224 |

---

## 7. Change Control

Starting from this specification (V1 frozen 2026-06-09):

1. All future schema changes MUST go through a numbered migration file (`db/migration-NNN-*.sql`)
2. New columns require the corresponding confidence field(s) to be defined at the same time
3. No column may be added without a corresponding `COMMENT ON COLUMN`
4. Index additions must be accompanied by the query pattern they serve
5. Column drops are NOT permitted without Phase 8 (post-commercial) approval
