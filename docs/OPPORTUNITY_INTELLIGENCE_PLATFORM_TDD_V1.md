# Opportunity Intelligence Platform TDD V1

**Product:** AusHomeValue  
**Document type:** Technical Design Document  
**Status:** Draft for review  
**Date:** 9 June 2026  
**Scope:** Suburb Opportunity Intelligence Platform  
**Implementation status:** Design only; no production changes authorised by this document

### Revision history

| Version | Date | Change |
|---|---|---|
| V1 draft | 9 June 2026 | Initial suburb-level platform design |
| V1 architecture update | 9 June 2026 | Infrastructure and Supply retained as active factors; factor-level and overall confidence added |

---

## 1. Executive Summary

AusHomeValue has a functioning valuation product and an early suburb opportunity platform. The current opportunity implementation provides a useful foundation: a `suburb_metrics` table, public and government datasets, a scheduled refresh process, a ranking API, and generated suburb pages. It should not be discarded.

The principal architectural problem is that the current engine still mixes two different concepts:

1. **Property-level opportunity ranking**, based partly on an individual sale record.
2. **Suburb-level market intelligence**, based on suburb and SA2 indicators.

The strategic product is the second. The production scoring entity must therefore be a stable suburb-market entity, not a property or sale record.

This TDD recommends:

- preserving the valuation engine as an independent bounded context;
- making a canonical `suburb` entity the scoring anchor;
- treating comparable sales as observations used to calculate suburb metrics, not as opportunity results;
- separating raw metrics, normalized factor scores, strategy scores and confidence;
- retaining Infrastructure and Supply Constraint as active V1 factors while confidence-adjusting their contribution;
- replacing heuristic defaults with explicit `null`, provenance and confidence penalties;
- retaining all existing public URLs and API contracts through compatibility adapters;
- publishing only evidence-supported scores and clearly labelling low-confidence results;
- generating crawlable, source-attributed suburb intelligence pages with stable structured data.

The recommended production model is:

```text
Source datasets
    |
    v
Ingestion and validation
    |
    v
Canonical geography + source observations
    |
    v
suburb_metrics (raw and derived metrics)
    |
    v
suburb_factor_scores (normalized factors + confidence)
    |
    v
suburb_strategy_scores (balanced, growth, yield, school, value)
    |
    +--------------------+
    |                    |
    v                    v
Opportunity APIs     Static suburb/ranking pages
```

### Decision

The **core scoring entity is `Suburb`**. A property may consume suburb intelligence, but it must never define the suburb score. A comparable sale is market evidence, not an opportunity entity.

Infrastructure and Supply Constraint are confirmed as active V1 factors. Their lower current data maturity is represented through factor-level confidence, source class, fallback level and confidence-adjusted contribution, not by removing them from the model.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Produce explainable suburb rankings from traceable public and licensed data.
- Support balanced, growth, yield, school-zone and value strategies.
- Support state expansion without redesigning the schema.
- Make score confidence visible and machine-readable.
- Create durable SEO, GEO and AI-citation assets.
- Preserve current valuation functionality and existing URLs.
- Allow every published metric and claim to be traced to source and period.

### 2.2 Non-Goals

- Predict the future sale price of an individual property.
- Declare a property or suburb a guaranteed investment.
- Rank individual listings or sold properties.
- Replace formal valuation, financial, legal or tax advice.
- Manufacture missing metrics using arbitrary default scores.
- Expand nationally before geography mappings and source coverage are reliable.

---

## 3. Current Architecture Review

### 3.1 Observed implementation

The repository currently contains:

- `db/migration-003-suburb-metrics.sql`
- `lib/refresh-suburb-metrics.js`
- `lib/opportunity-scoring-v2.js`
- `lib/opportunity-service.js` (older property-level implementation)
- `api/opportunity.js`
- `scripts/weekly-refresh-collection.mjs`
- `scripts/generate-suburb-pages.js`
- `scripts/generate-ai-pages.js`
- VGV and SEIFA loaders
- Census, school and comparable-sale services
- generated `/opportunities/*` and `/suburb/*` pages

The repository currently contains 238 generated suburb HTML files. Project reporting mentions 248 pages. This inventory mismatch must be reconciled before migration acceptance; neither number should be published automatically until build output and database coverage agree.

### 3.2 What should be kept

| Component | Decision | Reason |
|---|---|---|
| Existing valuation engine and `/api/valuation` | Keep unchanged | Operational V1 product and separate bounded context |
| `comparable_sales` | Keep | Valuable source observations for medians, volumes and freshness |
| `suburb_metrics` concept | Keep and evolve | Correct aggregation boundary |
| Neon PostgreSQL | Keep | Suitable for current scale and serverless API access |
| VGV loader | Keep and formalise | Authoritative Victorian price/trend source |
| ABS Census and SEIFA loaders | Keep and formalise | Authoritative demographic and socio-economic sources |
| School data pipeline | Keep, improve mapping | Useful school-access indicator |
| Weekly refresh orchestration | Keep, split into stages | Correct operational pattern |
| Static suburb page generation | Keep, add quality gates | Strong SEO/GEO foundation |
| Existing `/api/opportunity` | Keep as compatibility endpoint | Avoid breaking the current frontend |
| Existing suburb URLs | Keep permanently | Preserve indexed assets and links |

### 3.3 What should be refactored

| Current behaviour | Required refactor |
|---|---|
| `scanOpportunitiesV2` loads individual sales and scores each property | New engine ranks canonical suburbs only |
| A single `opportunity_score` serves all strategies | Store balanced score and separate strategy scores |
| Strategy query is accepted but current API orders by the same score | Strategy must select the corresponding precomputed score |
| Missing or immature factors receive arbitrary defaults | Preserve raw `null`; use factor confidence and neutral-prior shrinkage without changing approved weights |
| Global-average vacancy is written into missing suburb records | Retain as an explicit imputation field only; do not present it as observed vacancy |
| Lower median price is treated as undervaluation | Value must measure relative affordability and fundamentals, not price alone |
| Confidence contributes positively to opportunity score | Confidence must be separate and must not create opportunity |
| Suburb-to-SA2 mapping is inferred through `school_locations` | Introduce a canonical geography mapping table |
| Schema changes are performed inside loaders | All production schema changes must use versioned migrations |
| Generated pages publish scores even with limited evidence | Add publication eligibility and confidence gates |
| AI-generated explanatory copy can imply investment suitability | Generate constrained, source-based summaries with risk language |

### 3.4 What should be deprecated

Deprecation means retained temporarily for compatibility, then removed after telemetry confirms no active dependency.

1. Property-level `scanOpportunitiesV2` output containing address, bedrooms and sale price.
2. Older `lib/opportunity-service.js` scoring path.
3. “Undervalued property” badges derived from one sale versus a suburb median.
4. Arbitrary score floors that promote data-poor records.
5. Price-tier proxies for yield or growth.
6. Default values such as unknown vacancy = 50 or unknown school = 40.
7. `opportunity_type` as the only strategy classification.
8. Static page claims that convert a low-confidence numerical score into investment advice.

### 3.5 Current risks

| Risk | Severity | Observation | Required control |
|---|---:|---|---|
| False precision | High | Missing metrics receive synthetic defaults | Null-aware scoring and confidence |
| Entity leakage | High | Property sales are still ranked as opportunities | Suburb-only scoring service |
| Geography mismatch | High | Suburb-to-SA2 mapping relies on school records | Canonical mapping with reliability metadata |
| Score instability | High | Fixed thresholds and mixed periods can change rankings sharply | Cohort normalization, versioning and snapshots |
| SEO misinformation | High | Low-data pages can publish exact scores and affirmative FAQ answers | Publication gates and source dates |
| Strategy API mismatch | High | Strategy parameter does not alter database ordering | Separate strategy score columns/view |
| Provenance loss | High | A single row does not fully identify metric source/period | Metric-level provenance table |
| Stale data | Medium | One `updated_at` cannot describe mixed refresh cadences | Per-metric as-of dates and source status |
| Schema drift | Medium | Loaders add columns at runtime | Versioned, idempotent migrations |
| State expansion collision | Medium | Suburb name is insufficient as a national key | Stable suburb ID plus state and geography codes |
| Build/data inconsistency | Medium | Reported 248 pages versus 238 repository pages | Build manifest and coverage audit |
| Availability | Medium | API reads directly from mutable current rows | Published snapshots and cache controls |

---

## 4. Target Architecture

### 4.1 Bounded contexts

```text
+-----------------------+       +------------------------------+
| Valuation Context     |       | Opportunity Intelligence     |
|-----------------------|       |------------------------------|
| Property              |       | Canonical Suburb             |
| Comparable selection  |       | Source metrics               |
| Property adjustments  |       | Factor normalization         |
| Valuation confidence  |       | Strategy rankings            |
| PDF report            |       | Suburb intelligence pages    |
+-----------+-----------+       +--------------+---------------+
            |                                  |
            +---------------+------------------+
                            |
                      Shared geography
                (suburb/postcode/SA2/state)
```

The contexts may share geography and verified market observations, but they must not share final scores or business rules.

### 4.2 Data pipeline

```text
VGV / ABS / SEIFA / ACARA / planning / rental sources / comparable sales
                               |
                               v
                    Source-specific loaders
                               |
                               v
               Validation + canonical geography mapping
                               |
                               v
                    Metric observation history
                               |
                               v
                    Current suburb_metrics row
                               |
                               v
              Cohort normalization by state/market/type
                               |
                               v
        Factor scores + confidence + strategy score snapshots
                               |
                   +-----------+-----------+
                   |                       |
                   v                       v
             Cached APIs             Static pages
```

### 4.3 Publication state

Every suburb has one of four publication states:

- `draft`: data exists but is not eligible for public ranking;
- `limited`: public facts may be shown, but no definitive rank claim;
- `published`: score and rank may be shown with confidence;
- `suppressed`: mapping/source anomaly requires review.

---

## 5. Entity Model

### 5.1 Relationships

```text
State 1 ----- * SA2
State 1 ----- * Postcode
State 1 ----- * Suburb

SA2 * ------- * Suburb        through suburb_sa2_map
Postcode * -- * Suburb        through suburb_postcode_map

Suburb 1 ---- * Property
Property 1 -- * ComparableSaleObservation (when the property was sold)

Suburb 1 ---- * ComparableSaleObservation
Suburb 1 ---- * SuburbMetricObservation
Suburb 1 ---- 1 CurrentSuburbMetrics
Suburb 1 ---- * SuburbScoreSnapshot
```

### 5.2 Entity definitions

**Property**

A physical or strata-titled asset identified by a normalized address and, where available, title/property identifiers. It belongs to one canonical suburb. It is used by the valuation context, not as the Opportunity Intelligence ranking entity.

**Comparable sale**

An observed market transaction with source, date, price, property characteristics and verification status. It contributes to price, volume and freshness metrics. It is never itself a “Top Opportunity”.

**Suburb**

The primary opportunity entity. It requires a stable internal `suburb_id`, official name, state and publication slug. Names alone are not globally unique.

**Postcode**

A postal delivery geography. It may contain several suburbs, and one suburb may span postcodes. It is a search/filter attribute, not the scoring grain.

**SA2**

The principal ABS statistical geography used for population, income, SEIFA and dwelling metrics. A suburb may overlap multiple SA2s. SA2 values must be allocated to suburbs using an explicit mapping and reliability score.

**State**

Top-level jurisdiction used for source selection, normalization cohorts and planning/infrastructure policy.

### 5.3 Canonical identifiers

Recommended keys:

- `state_code`: controlled enum (`VIC`, `NSW`, etc.).
- `suburb_id`: generated UUID or numeric identity.
- `suburb_slug`: unique within state.
- `sa2_code`: official ABS code with edition.
- `postcode`: four-character text.
- `property_id`: internal identity, separate from address text.
- `sale_observation_id`: source observation identity.

---

## 6. Production Data Model

### 6.1 Design principle

`suburb_metrics` should be the fast current-state read model. It should not be the only historical or provenance store. Metric observations and score snapshots must be retained separately.

### 6.2 Final `suburb_metrics` schema

The following is a logical schema proposal. Exact migration SQL is an implementation deliverable after approval.

#### Identity and geography

| Field | Type | Required | Notes |
|---|---|---:|---|
| `suburb_id` | UUID/BIGINT | Yes | Primary key |
| `suburb` | TEXT | Yes | Official display name |
| `suburb_slug` | TEXT | Yes | Stable URL slug |
| `state` | CHAR(3) | Yes | Controlled state code |
| `primary_postcode` | CHAR(4) | No | Display/search convenience |
| `primary_sa2_code` | TEXT | No | Primary ABS mapping |
| `sa2_asgs_edition` | SMALLINT | No | Example: 2021 |
| `mapping_method` | TEXT | Yes | `official`, `spatial_weighted`, `postcode_proxy`, `manual` |
| `mapping_reliability` | NUMERIC(5,2) | Yes | 0–1 |

#### Market metrics

| Field | Type | Required | Notes |
|---|---|---:|---|
| `median_house_price` | NUMERIC(14,2) | No | Current reference median |
| `median_unit_price` | NUMERIC(14,2) | No | Current reference median |
| `median_house_rent_weekly` | NUMERIC(10,2) | No | Weekly |
| `median_unit_rent_weekly` | NUMERIC(10,2) | No | Weekly |
| `gross_house_yield` | NUMERIC(6,3) | No | Derived |
| `gross_unit_yield` | NUMERIC(6,3) | No | Derived |
| `price_growth_1y` | NUMERIC(7,3) | No | Percentage |
| `price_growth_3y_cagr` | NUMERIC(7,3) | No | Annualized |
| `price_growth_5y_cagr` | NUMERIC(7,3) | No | Annualized |
| `sales_sample_12m` | INTEGER | No | Verified eligible sales |
| `sales_sample_36m` | INTEGER | No | Verified eligible sales |
| `days_on_market_median` | NUMERIC(8,2) | No | Only with reliable source |
| `inventory_listings` | INTEGER | No | Current period |
| `inventory_months` | NUMERIC(7,2) | No | Preferred supply measure |
| `vacancy_rate` | NUMERIC(6,3) | No | Rental vacancy, not Census unoccupied dwellings |

#### Demographic and amenity metrics

| Field | Type | Required | Notes |
|---|---|---:|---|
| `population` | INTEGER | No | ABS/ERP |
| `population_growth_1y` | NUMERIC(7,3) | No | Preferred ERP |
| `population_growth_5y_cagr` | NUMERIC(7,3) | No | Annualized |
| `median_household_income_weekly` | NUMERIC(12,2) | No | ABS |
| `seifa_irsad_score` | NUMERIC(8,2) | No | Raw |
| `seifa_irsad_decile` | SMALLINT | No | 1–10 |
| `school_access_score` | NUMERIC(5,2) | No | Derived, not raw ICSEA |
| `infrastructure_score` | NUMERIC(5,2) | No | Derived from documented projects/access |
| `supply_constraint_score` | NUMERIC(5,2) | No | Higher means more constrained |

#### Normalized factor scores

| Field | Type | Required | Notes |
|---|---|---:|---|
| `value_score` | NUMERIC(5,2) | No | 0–100 |
| `growth_score` | NUMERIC(5,2) | No | 0–100 |
| `yield_score` | NUMERIC(5,2) | No | 0–100 |
| `vacancy_score` | NUMERIC(5,2) | No | 0–100 |
| `school_score` | NUMERIC(5,2) | No | 0–100 |
| `income_score` | NUMERIC(5,2) | No | 0–100 |
| `population_score` | NUMERIC(5,2) | No | 0–100 |
| `infrastructure_factor_score` | NUMERIC(5,2) | No | 0–100 |
| `supply_constraint_factor_score` | NUMERIC(5,2) | No | 0–100 |

#### Strategy scores

| Field | Type | Required | Notes |
|---|---|---:|---|
| `balanced_score` | NUMERIC(5,2) | No | Primary opportunity score |
| `value_strategy_score` | NUMERIC(5,2) | No | Value ranking |
| `growth_strategy_score` | NUMERIC(5,2) | No | Growth ranking |
| `yield_strategy_score` | NUMERIC(5,2) | No | Yield ranking |
| `school_strategy_score` | NUMERIC(5,2) | No | School-zone ranking |

#### Confidence and publication

| Field | Type | Required | Notes |
|---|---|---:|---|
| `confidence_score` | NUMERIC(5,2) | Yes | 0–100; visible overall opportunity confidence |
| `confidence_label` | TEXT | Yes | `High`, `Medium`, `Low` |
| `value_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `growth_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `yield_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `vacancy_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `school_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `income_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `population_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `infrastructure_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `supply_constraint_confidence` | NUMERIC(5,2) | Yes | 0–100 factor-level confidence |
| `completeness_score` | NUMERIC(5,2) | Yes | 0–100 |
| `freshness_score` | NUMERIC(5,2) | Yes | 0–100 |
| `source_quality_score` | NUMERIC(5,2) | Yes | 0–100 |
| `sample_size_score` | NUMERIC(5,2) | Yes | 0–100 |
| `mapping_confidence_score` | NUMERIC(5,2) | Yes | 0–100 |
| `missing_factor_count` | SMALLINT | Yes | Explicit |
| `publication_status` | TEXT | Yes | `draft`, `limited`, `published`, `suppressed` |
| `score_version` | TEXT | Yes | Example: `opp-2.0.0` |
| `normalization_cohort` | TEXT | Yes | Example: `VIC_METRO_HOUSE_2026Q2` |

#### Provenance and timestamps

| Field | Type | Required | Notes |
|---|---|---:|---|
| `metric_period_end` | DATE | No | Common reporting boundary |
| `price_as_of` | DATE | No | Per-domain freshness |
| `rent_as_of` | DATE | No | Per-domain freshness |
| `demographic_as_of` | DATE | No | Per-domain freshness |
| `schools_as_of` | DATE | No | Per-domain freshness |
| `planning_as_of` | DATE | No | Per-domain freshness |
| `source_summary` | JSONB | Yes | Compact public-safe provenance summary |
| `calculated_at` | TIMESTAMPTZ | Yes | Score calculation time |
| `published_at` | TIMESTAMPTZ | No | Current public version |
| `created_at` | TIMESTAMPTZ | Yes | Row creation |
| `updated_at` | TIMESTAMPTZ | Yes | Any update |

### 6.3 Constraints

- Primary key on `suburb_id`.
- Unique `(state, suburb_slug)`.
- Check state against supported codes.
- Check all factor, strategy and confidence scores between 0 and 100.
- Check rates and yields within defensible bounds; outliers are quarantined, not silently clamped.
- Check `mapping_reliability` between 0 and 1.
- Check `confidence_label` and `publication_status` against controlled values.
- `published` requires `balanced_score`, `confidence_score`, `score_version`, `metric_period_end` and at least one price metric.
- No trigger should manufacture missing source data.

### 6.4 Indexes

- Unique: `(state, suburb_slug)`.
- Lookup: `(state, suburb)`.
- Geography: `(primary_sa2_code)`, `(primary_postcode)`.
- Ranking: `(state, balanced_score DESC)` where published.
- Ranking: `(state, growth_strategy_score DESC)` where published.
- Ranking: `(state, yield_strategy_score DESC)` where published.
- Ranking: `(state, school_strategy_score DESC)` where published.
- Filtering: `(state, median_house_price)`.
- Operations: `(publication_status, updated_at)`.
- Optional GIN on `source_summary` for audits, not primary API queries.

### 6.5 Supporting tables

**`suburbs`**

Canonical identity, aliases, centroid and URL slug.

**`suburb_sa2_map`**

Many-to-many mapping with population/area weights, method, edition and reliability.

**`suburb_postcode_map`**

Many-to-many mapping with primary flag.

**`suburb_metric_observations`**

Long-form history:

```text
observation_id
suburb_id
metric_code
metric_value
unit
property_type
period_start
period_end
source_id
source_record_url
source_quality
source_class
fallback_level
mapping_method
mapping_reliability
observed_at
ingested_at
raw_evidence JSONB
```

**`suburb_score_snapshots`**

Immutable score history by `suburb_id`, `score_version`, `strategy`, `calculated_at`.

**`data_sources`**

Source ownership, authority level, licence, expected cadence and allowed public attribution.

---

## 7. Data Source Strategy

### 7.1 Source tiers

1. **Tier A – authoritative public:** ABS, state Valuer-General, ACARA, state planning/transport agencies.
2. **Tier B – primary operational/public market:** verified public market observations, official rental/market releases.
3. **Tier C – commercial/public portals:** supporting and cross-check sources subject to terms and availability.
4. **Tier D – model-derived or estimated:** transparent calculations from Tier A–C inputs, with the derivation method and fallback level recorded.

Tier D is never described as observed fact.

### 7.2 Source confidence

Each metric observation receives a source-confidence component. These are initial V1 calibration values and must be versioned:

| Source class | Source confidence | Examples |
|---|---:|---|
| Authoritative government/official | 100 | ABS, VGV, ACARA, funded state infrastructure register |
| Verified commercial/market source | 80 | Current licensed or independently verifiable market series |
| Derived from high-quality inputs | 70 | Yield calculated from current rent and price observations |
| Estimated/modelled | 45 | Transparent estimate based on incomplete direct observations |
| Unknown or untraceable | 0 | Not eligible for scoring |

“Derived” does not automatically mean unreliable. Its confidence is capped by the weakest material input and the quality of the calculation method.

### 7.3 Fallback confidence

Every observation also records how directly it represents the suburb:

| Fallback level | Directness confidence | Rule |
|---|---:|---|
| Direct suburb data | 100 | Metric directly measured for the canonical suburb |
| Spatially weighted SA2 proxy | 80 | SA2 value allocated using documented overlap weights |
| Regional average | 50 | Used only when no direct or SA2 value exists |
| State average | 30 | Contextual fallback, not suitable as strong ranking evidence |
| Estimated value | 20 | Model estimate with explicit methodology |
| Missing | 0 | No factor score contribution |

Regional and state averages must not be stored or displayed as if observed for the suburb. Their fallback level remains visible in metadata. For critical strategy factors, regional/state fallbacks may support a limited score but cannot qualify a suburb for a High-confidence ranking.

### 7.4 Metric source matrix

| Factor | Preferred source | Current availability | Gap | Refresh | Fallback | Confidence impact |
|---|---|---|---|---|---|---|
| Median price | State Valuer-General; verified sales aggregation | VGV + comparable sales | National equivalents; property-type consistency | Quarterly official; weekly sales | Verified 36-month median with sample disclosure | Lower for small sample/stale period |
| 1Y growth | Same-source median series | Partial/projected | Need consistent historical series | Quarterly | Null; do not infer from price tier | Missing reduces growth completeness |
| 3Y growth | Same-source CAGR | Existing projector/VGV partial | Mixed methods | Quarterly | Official 5Y CAGR may inform, not replace | Method mismatch lowers quality |
| 5Y growth | VGV historical series | Available for some VIC suburbs | National rollout | Quarterly/annual | Null | Missing reduces growth confidence |
| Yield | Median weekly rent / median price | Partial ABS rent and derived yield | ABS rent is Census-period, not current market rent | Monthly/quarterly preferred | Publish stale period explicitly or null | Stale rent materially lowers freshness |
| Vacancy | Rental vacancy source | Current implementation uses Census unoccupied dwelling proxy | True rental vacancy source required | Monthly/quarterly | Null; Census unoccupied rate may be separate `unoccupied_dwelling_rate` | Proxy must not receive full source quality |
| School | ACARA school locations/profiles | Available | Need distance, level and catchment methodology | Annual | SA2 aggregate with lower mapping confidence | Mapping and school coverage affect confidence |
| SEIFA/income | ABS SEIFA + Census | Available at SA2 | Suburb allocation | Census/SEIFA release | Weighted SA2 mapping | Lower if postcode/manual proxy |
| Population growth | ABS ERP | Service exists, current storage incomplete | Historical ERP series and suburb allocation | Annual | Census-to-Census CAGR, labelled | Lower freshness between releases |
| Supply constraint | Planning zones, dwelling approvals, inventory, land constraints | Schema placeholder only | Production methodology and feeds | Quarterly/annual | SA2 or regional proxy, explicitly labelled | Active V1 factor; lower-confidence data is mathematically downweighted |
| Infrastructure | Official funded/project datasets + accessibility | Placeholder/limited | Project registry, status and distance model | Quarterly | Regional accessibility or estimated value, explicitly labelled | Active V1 factor; announced/unfunded projects receive low confidence |
| Confidence | Derived from all metadata | Current heuristic only | Formal framework | Every scoring run | Required | Never imputed |

### 7.5 Important semantic correction

ABS Census “unoccupied private dwellings” is **not equivalent to rental vacancy rate**. The current pipeline should retain this Census value under a separate field such as `unoccupied_dwelling_rate`. It may support a housing-utilisation narrative but must not be presented or scored as current rental vacancy without a defensible source.

### 7.6 Freshness policy

Each metric has an expected cadence and a maximum acceptable age:

| Metric group | Full freshness | Stale after | Expired after |
|---|---:|---:|---:|
| Listings/inventory/vacancy | 45 days | 90 days | 180 days |
| Rent | 90 days | 180 days | 365 days |
| Sales median | 120 days | 240 days | 540 days |
| VGV growth | 180 days | 365 days | 730 days |
| Schools | 18 months | 30 months | 42 months |
| ERP population | 24 months | 36 months | 60 months |
| Census/SEIFA | Current official release | New release + 12 months | Never silently replaced; show reference year |
| Infrastructure/planning | 180 days | 365 days | 730 days |

Expired metrics remain in history but are excluded from scoring unless the score version explicitly allows them.

---

## 8. Scoring Engine V2

### 8.1 Principles

- Calculate at suburb level.
- Normalize within a comparable cohort, primarily state + market region + property type.
- Winsorize valid observations at the 5th and 95th percentiles.
- Convert percentile rank to 0–100.
- Preserve direction: higher score always means more favourable for that factor.
- Keep missing raw factor scores as `null`; use the neutral prior only inside the confidence-adjustment calculation.
- Preserve approved strategy weights rather than redistributing missing-factor weight to the remaining factors.
- Keep confidence as a separate visible output while using it to moderate each factor's contribution.
- Infrastructure and Supply Constraint remain active factors in every V1 strategy configuration.
- Version every formula and cohort.

### 8.2 Factor definitions

**Value Score**

Value is not “cheap”. Recommended inputs:

- price-to-income ratio: 45%;
- price-to-rent ratio: 30%;
- relative price versus matched state/metro cohort: 15%;
- recent price momentum sanity check: 10%.

Lower price-to-income and price-to-rent ratios score higher. The score should not reward a low price if growth, vacancy or confidence signals indicate severe weakness; those risks remain visible separately rather than being hidden in Value Score.

**Growth Score**

- 1Y growth percentile: 20%;
- 3Y CAGR percentile: 40%;
- 5Y CAGR percentile: 30%;
- population growth percentile: 10%.

If 1Y is missing, 3Y and 5Y may be reweighted. At least one multi-year growth measure is required. One-year growth alone is insufficient.

**Yield Score**

- gross house yield percentile: 70%;
- rent growth percentile, when available: 30%.

Until reliable rent growth exists, gross yield receives 100% of the valid factor weight and the factor confidence is reduced.

**Vacancy Score**

Inverse percentile of verified rental vacancy. Lower vacancy generally scores higher, but values below a configurable floor should be flagged for possible seasonal or measurement distortion. Census unoccupied dwellings cannot substitute at full weight.

**School Score**

- school quality percentile: 60%;
- school access/coverage percentile: 40%.

The production methodology must specify school levels, radius, catchments and treatment of selective/private schools. Raw ICSEA must not be presented as a direct suburb investment rating.

**Income Score**

- ABS median household income percentile: 50%;
- SEIFA IRSAD percentile/decile: 50%.

Where suburb overlaps multiple SA2s, use weighted allocation and lower mapping confidence.

**Population Score**

- 5Y ERP CAGR percentile: 70%;
- 1Y ERP growth percentile: 30%.

Rapid growth should be interpreted alongside supply; it is not automatically positive if dwelling supply expands faster.

**Supply Constraint Score**

Recommended inputs:

- inventory months inverse percentile: 30%;
- dwelling approvals per existing dwelling inverse percentile: 25%;
- developable land/planning constraint: 25%;
- listings-to-dwelling-stock inverse percentile: 20%.

This remains an active V1 factor. Direct suburb inputs are preferred. If fewer than two direct inputs exist, a documented SA2, regional or estimated fallback may produce a provisional score with lower factor confidence. If no defensible direct or fallback input exists, the score is `null` and confidence is zero.

**Infrastructure Score**

Recommended inputs:

- accessibility to existing transport/employment/health/education: 60%;
- funded and under-construction projects: 30%;
- committed planning improvements: 10%.

This remains an active V1 factor. Existing accessibility, funded projects and under-construction projects may be combined with explicitly labelled lower-confidence regional or estimated inputs. Unfunded announcements receive no positive score contribution.

### 8.3 Balanced score weights

| Factor | Weight |
|---|---:|
| Value | 20% |
| Growth | 20% |
| Yield | 12% |
| Vacancy | 8% |
| School | 10% |
| Income/SEIFA | 8% |
| Population | 8% |
| Supply Constraint | 8% |
| Infrastructure | 6% |
| **Total** | **100%** |

This weighting is intentionally diversified. It prevents one noisy factor from dominating. Confidence is not an investment characteristic, but it moderates how strongly each factor may move the final score away from neutral.

### 8.4 Strategy weights

| Factor | Balanced | Value | Growth | Yield | School |
|---|---:|---:|---:|---:|---:|
| Value | 20 | 40 | 10 | 15 | 10 |
| Growth | 20 | 15 | 35 | 10 | 15 |
| Yield | 12 | 15 | 8 | 35 | 8 |
| Vacancy | 8 | 5 | 5 | 20 | 5 |
| School | 10 | 5 | 8 | 5 | 40 |
| Income | 8 | 8 | 8 | 5 | 10 |
| Population | 8 | 5 | 12 | 5 | 5 |
| Supply constraint | 8 | 5 | 8 | 3 | 4 |
| Infrastructure | 6 | 2 | 11 | 2 | 3 |
| **Total** | **100** | **100** | **100** | **100** | **100** |

Weights must live in versioned configuration, not be scattered across services.

### 8.5 Factor-level confidence-adjusted calculation

Each factor has:

```text
factor_score[i]       = normalized opportunity signal, 0–100
factor_confidence[i]  = evidence confidence, 0–100
strategy_weight[s][i] = approved strategy weight
```

#### Recommended implementation: neutral shrinkage

A simple multiplication such as `weight × score × confidence` incorrectly pushes an unknown positive factor toward zero, which means “bad”, rather than toward “unknown”. V1 should use confidence-weighted shrinkage toward the neutral score of 50:

```text
c[i] = factor_confidence[i] / 100

confidence_adjusted_factor[i] =
    50 + c[i] * (factor_score[i] - 50)

final_score[s] =
    sum(strategy_weight[s][i] * confidence_adjusted_factor[i])
    ----------------------------------------------------------
                 sum(strategy_weight[s][i])
```

This is algebraically equivalent to:

```text
factor contribution =
    weight * confidence * factor_score
  + weight * (1 - confidence) * neutral_prior_50
```

Consequences:

- score 90 with confidence 100 remains 90;
- score 90 with confidence 50 contributes as 70;
- score 90 with confidence 20 contributes as 58;
- score 20 with confidence 20 contributes as 44;
- missing data with confidence 0 contributes neutral 50 but is disclosed as missing and lowers overall confidence.

This approach keeps Infrastructure and Supply Constraint active without allowing immature data to dominate. It also prevents missing data from being interpreted as either a strong positive or a strong negative.

An optional stricter mode for strategy-specific rankings may additionally use an effective weight:

```text
effective_weight[i] = strategy_weight[s][i] * max(c[i], 0.25)
```

However, V1 should use neutral shrinkage as the primary method because it produces stable, comparable scores and preserves the approved total factor weights.

#### Factor confidence calculation

For each factor:

```text
factor_confidence =
  source_confidence        * 30%
  directness_confidence    * 25%
  freshness_confidence     * 20%
  sample_or_coverage       * 15%
  mapping_reliability      * 10%
```

For a multi-input factor, calculate each input confidence first, then aggregate using the same input weights used by the factor formula. A material input with confidence below 30 must be disclosed as a limitation.

Publication rules:

- At least 60% of the strategy’s intended weight must have factor confidence above zero.
- At least one price/value factor and one demand/growth factor must be present for Balanced.
- School ranking requires a valid School Score.
- Yield ranking requires current yield and vacancy, or yield with an explicit lower-confidence label.
- Infrastructure and Supply Constraint always retain configured weights; fallback data is confidence-adjusted.
- If minimum requirements fail, a page may show `limited` intelligence, but no Top ranking is published.

### 8.6 Edge cases

- **Small sales sample:** use official median if available; otherwise suppress price-derived ranking.
- **Luxury or very small suburb:** use peer cohort and show sample warning.
- **Negative growth:** retain; normalization handles it.
- **Outlier yield:** quarantine above configurable bounds until source review.
- **Conflicting sources:** select source by authority and period; retain disagreement metadata.
- **SA2 overlap:** weighted allocation; mapping confidence affects overall confidence.
- **No current rent:** Yield Score is null.
- **No infrastructure data:** factor confidence is zero and its score is neutralized to 50; the missing factor is disclosed.
- **No supply data:** factor confidence is zero and its score is neutralized to 50; the missing factor is disclosed.
- **New suburb:** may publish facts as `limited` before it is eligible for ranking.
- **Ties:** order by confidence, then freshness, then suburb name for deterministic output.

---

## 9. Confidence Framework

### 9.1 Two-level confidence model

Confidence operates at two levels:

1. **Factor-level confidence:** how reliable the Value, Growth, Yield, Vacancy, School, Income, Population, Infrastructure or Supply factor is.
2. **Overall opportunity confidence:** how reliable the final strategy score is for this suburb.

The opportunity score and confidence score remain separate public values. Confidence moderates factor contribution through neutral shrinkage, but a suburb can still have:

- High opportunity / High confidence;
- High opportunity / Low confidence;
- Low opportunity / High confidence;
- Low opportunity / Low confidence.

### 9.2 Factor-level confidence dimensions

Each factor confidence is calculated from:

| Dimension | Weight |
|---|---:|
| Source confidence | 30% |
| Fallback/directness confidence | 25% |
| Data freshness | 20% |
| Sample size or input coverage | 15% |
| Geography mapping reliability | 10% |

These weights apply consistently across factors, but the definition of sample/coverage is factor-specific.

Examples:

- Growth Confidence uses price-series length, transaction sample, period consistency and source quality.
- Yield Confidence uses price freshness, rent freshness, property-type consistency and source quality.
- Vacancy Confidence requires a true rental vacancy source; Census unoccupied dwellings receive low source confidence.
- Infrastructure Confidence uses project status, official funding status, distance/access methodology and update date.
- Supply Confidence uses inventory coverage, approvals data, planning/land evidence and geographic directness.

**Sample size or coverage**

For price-derived metrics:

- 30+ eligible sales in the analysis window: 100
- 20–29: 85
- 10–19: 70
- 5–9: 50
- 1–4: 25
- official aggregate without transaction sample: source-specific score, normally 70–90

For non-transaction factors, use input coverage:

- all required sub-inputs available: 100;
- one non-material sub-input missing: 80;
- minimum viable inputs only: 60;
- proxy or single estimated input: 30;
- no defensible input: 0.

**Freshness**

Weighted score from the freshness table. Expired metrics contribute zero to completeness.

**Mapping reliability**

- official suburb mapping or high-quality spatial allocation: 100;
- weighted overlap with good coverage: 80;
- postcode proxy: 55;
- school-location proxy/manual assumption: 35;
- unresolved: 0.

### 9.3 Overall opportunity confidence

Overall confidence is strategy-specific because each strategy uses different factor weights.

For strategy `s`:

```text
base_confidence[s] =
    sum(strategy_weight[s][i] * factor_confidence[i])
    ------------------------------------------------
              sum(strategy_weight[s][i])
```

Apply two transparent penalties:

```text
critical_factor_penalty:
  0 points  = all strategy-critical factors have confidence >= 50
  5 points  = one critical factor below 50
  10 points = one critical factor is missing
  15 points = two or more critical factors are missing

source_concentration_penalty:
  0 points = no source supplies more than 60% of effective evidence
  5 points = one source supplies 60–80%
  10 points = one source supplies more than 80%

overall_confidence[s] =
  clamp(base_confidence[s]
        - critical_factor_penalty
        - source_concentration_penalty, 0, 100)
```

Critical factors:

- Balanced: Value plus at least one of Growth, Yield or Vacancy.
- Value: Value.
- Growth: Growth.
- Yield: Yield and Vacancy.
- School: School.

Infrastructure and Supply Constraint remain active in all strategies. Low confidence reduces their score impact and overall confidence; it does not remove their configured weight or silently replace them with zero.

### 9.4 Labels and UI

- `High`: 80–100
- `Medium`: 60–79
- `Low`: below 60

UI requirements:

- Always display the overall confidence label beside a published score.
- Provide a short reason, for example: “Medium confidence: strong price and school coverage; infrastructure uses an SA2 proxy and rental vacancy is older.”
- In the expanded score breakdown, show confidence for every factor using `High`, `Medium` or `Low`, with source type and fallback level.
- Infrastructure and Supply should remain visible even when confidence is Low. The UI should say why, for example: “Infrastructure: 72/100, Low confidence — regional project data.”
- Do not show false precision to general users. Display whole-number factor scores and labels; retain decimals internally.
- Do not imply that a high opportunity score has high confidence.
- Low-confidence suburbs may appear on their own page but should not appear in “Top” lists unless the user explicitly includes limited data.
- APIs return confidence score, label, primary limitations and metric as-of date.

Recommended compact component:

```text
Opportunity Score 78/100
Overall Confidence: Medium

Growth          82  High confidence
Yield           71  Medium confidence
Infrastructure  74  Low confidence
Supply          68  Low confidence
```

---

## 10. API Architecture

### 10.1 API conventions

- Version new contracts under `/api/v1/`.
- Preserve `/api/opportunity` as a compatibility adapter.
- GET endpoints only for public ranking and detail.
- Validate all query parameters.
- Use parameterized SQL only.
- Return camelCase public fields.
- Never expose raw collection errors, private source credentials or internal evidence blobs.
- Include `scoreVersion`, `dataAsOf`, `generatedAt` and confidence.

### 10.2 Endpoints

**Top Opportunities**

```text
GET /api/v1/opportunities
```

Parameters:

- `strategy=balanced|growth|yield|school|value`
- `state=VIC`
- `budgetMin`
- `budgetMax`
- `propertyType=house|unit` (only where source metrics support it)
- `confidence=high|medium|all`
- `limit` default 20, maximum 100
- `cursor` for stable pagination

**Top Growth Suburbs**

```text
GET /api/v1/opportunities/growth
```

Same common filters; requires a valid multi-year growth factor.

**Top Yield Suburbs**

```text
GET /api/v1/opportunities/yield
```

Optional `maxVacancy`; requires current yield.

**Top School Zone Suburbs**

```text
GET /api/v1/opportunities/school-zone
```

Optional `schoolLevel`; only if methodology supports it.

**Top Value Suburbs**

```text
GET /api/v1/opportunities/value
```

Optional `maxMedianPrice`; score must not be equivalent to cheapest median.

**Individual Suburb Intelligence**

```text
GET /api/v1/suburbs/{state}/{suburbSlug}
```

Optional:

- `include=history,sources,nearby`

### 10.3 List response

```json
{
  "ok": true,
  "strategy": "balanced",
  "filters": {
    "state": "VIC",
    "budgetMin": 600000,
    "budgetMax": 1200000
  },
  "dataAsOf": "2026-06-01",
  "scoreVersion": "opp-2.0.0",
  "results": [
    {
      "rank": 1,
      "suburb": "Scoresby",
      "slug": "scoresby-vic",
      "state": "VIC",
      "medianHousePrice": 980000,
      "opportunityScore": 86.2,
      "confidence": {
        "score": 74,
        "label": "Medium",
        "limitations": [
          "Infrastructure uses a regional fallback",
          "Rental vacancy source is older than 90 days"
        ]
      },
      "factors": {
        "value": {
          "score": 82,
          "confidence": 91,
          "confidenceLabel": "High"
        },
        "growth": {
          "score": 88,
          "confidence": 84,
          "confidenceLabel": "High"
        },
        "yield": {
          "score": 74,
          "confidence": 68,
          "confidenceLabel": "Medium"
        },
        "infrastructure": {
          "score": 72,
          "confidence": 48,
          "confidenceLabel": "Low",
          "sourceClass": "government",
          "fallbackLevel": "regional_average"
        },
        "supplyConstraint": {
          "score": 66,
          "confidence": 45,
          "confidenceLabel": "Low",
          "sourceClass": "derived",
          "fallbackLevel": "sa2_proxy"
        }
      },
      "metricPeriodEnd": "2026-03-31",
      "url": "/suburb/scoresby-vic.html"
    }
  ],
  "page": {
    "limit": 20,
    "nextCursor": null
  }
}
```

### 10.4 Suburb detail response

Return:

- identity and geography;
- current market metrics;
- all factor scores and factor-level confidence;
- strategy scores;
- confidence breakdown;
- public-safe source class and fallback level for each factor;
- trend history;
- source summary with publisher and period;
- key evidence-based drivers;
- limitations;
- related/nearby suburbs;
- canonical page URL.

### 10.5 Caching

- Ranking APIs: CDN `s-maxage=3600`, `stale-while-revalidate=86400`.
- Suburb detail: `s-maxage=21600`, `stale-while-revalidate=604800`.
- Use ETag based on `score_version + published_at`.
- Invalidate after a successful publish stage, not during partial ingestion.
- Serve the last successful snapshot if refresh fails.

### 10.6 Error handling

- `400`: invalid filter with field-level error.
- `404`: unknown suburb.
- `409`: known suburb but not publishable; return availability metadata.
- `429`: rate limit.
- `500`: opaque public error ID; full details only in server logs.
- `503`: no published snapshot available.

Empty valid ranking results return `200` with `results: []`.

---

## 11. Page Architecture

### 11.1 `/opportunities`

- Platform explanation and methodology summary.
- Strategy selector and filters.
- Ranked suburb list with confidence.
- “Data as of” and score version.
- Links to strategy pages and suburb pages.
- General information disclaimer.

### 11.2 `/opportunities/growth`

- Definition of growth methodology.
- 1Y/3Y/5Y distinction.
- Ranked growth suburbs.
- Confidence and risk section.
- Internal links to growth guides and suburb pages.

### 11.3 `/opportunities/yield`

- Yield and vacancy methodology.
- Ranked yield suburbs.
- Explicit gross versus net yield explanation.
- Rental data date and confidence.

### 11.4 `/opportunities/school-zone`

- School methodology and limitations.
- Ranked school-access suburbs.
- Clear statement that catchments change and require verification.
- Avoid implying guaranteed school admission.

### 11.5 `/opportunities/value`

- Definition of value versus “cheap”.
- Price-to-income, price-to-rent and cohort comparison.
- Ranked value suburbs.
- Risks and confidence.

### 11.6 `/suburb/{suburb}-{state}.html`

Recommended order:

1. Canonical suburb heading and summary.
2. Opportunity score plus confidence.
3. Market snapshot and date.
4. Factor score and factor-confidence explanation, including Infrastructure and Supply.
5. Price and rent trends.
6. Population, income and SEIFA context.
7. Schools and accessibility.
8. Supply and infrastructure.
9. Key drivers and key risks.
10. Source and methodology summary.
11. FAQs grounded in displayed data.
12. Related suburbs and opportunity category links.
13. Valuation CTA.
14. Disclaimer.

If score confidence is Low, the page title and introduction must lead with “limited data” rather than an exact investment claim.

---

## 12. SEO, GEO and AI Citation Architecture

### 12.1 Crawlable content

- Generate complete HTML at build/publish time.
- Do not require client JavaScript to reveal the main facts.
- Use canonical URLs consistently, including `.html` policy or redirects.
- Maintain one canonical page per suburb/state.
- Keep current indexed pages and 301 redirect only when canonicalization is necessary.
- Include visible source dates and publishers.
- Generate XML sitemaps by content type and `lastmod`.
- Remove low-quality pages from sitemap until publication gates pass; do not delete their URLs.

### 12.2 JSON-LD

**All pages**

- `Organization`
- `WebSite`
- `BreadcrumbList`

**Opportunity category pages**

- `CollectionPage`
- `ItemList` containing ranked `Place` items
- `Dataset` describing the ranking snapshot

**Suburb pages**

- `Place`
- `Dataset` for suburb metrics
- `BreadcrumbList`
- `FAQPage` only when the visible FAQ is substantive and data-supported

Do not mark model-generated investment opinions as factual `Dataset` observations. Distinguish observed metrics from derived scores using `variableMeasured` and a methodology URL.

### 12.3 Dataset metadata

Each published dataset/ranking should expose:

- name;
- description;
- spatial coverage;
- temporal coverage;
- date modified;
- creator/publisher;
- licence or source-use statement;
- methodology URL;
- variables measured;
- version;
- download/API URL where appropriate.

### 12.4 AI citation readiness

AI systems are more likely to cite pages that provide:

- stable factual statements;
- visible source attribution;
- exact reporting periods;
- concise definitions;
- tables with semantic headings;
- explicit methodology and limitations;
- consistent canonical URLs;
- server-rendered content;
- strong internal linking;
- change history or update date.

Crawler access alone does not guarantee citation. GPTBot, ClaudeBot, PerplexityBot, Googlebot and other agents should be permitted only according to the business’s chosen policy; `robots.txt` is not a substitute for content quality or licensing review.

### 12.5 Internal linking

```text
Home
  -> Opportunities hub
      -> Strategy ranking page
          -> Suburb page
              -> Related suburbs
              -> Relevant guide/report
              -> Valuation tool
```

Each suburb page should link back to its state and strategy cohorts. Category pages should link to methodology and data-source documentation.

### 12.6 GEO content rules

- Use the full brand consistently: “AusHomeValue Property Opportunity Intelligence Platform”.
- Define every score in plain English.
- Attribute official datasets.
- State whether a value is observed, allocated or model-derived.
- Avoid absolute phrases such as “best investment” without qualification.
- Avoid templated FAQ claims unsupported by available metrics.
- Preserve an accessible public methodology page.

---

## 13. Migration Plan

### Phase 0 – Baseline and freeze

1. Record current database schema, API responses, generated URL inventory and production tests.
2. Reconcile 238 repository suburb pages versus the reported 248.
3. Freeze the current score version.
4. Add observability for current API use.
5. Confirm no Opportunity work changes valuation modules.

**Exit:** reproducible baseline and rollback reference.

### Phase 1 – Canonical geography

1. Create `suburbs`, `suburb_sa2_map` and `suburb_postcode_map`.
2. Import official mappings.
3. Map existing `suburb_metrics` and comparable sales.
4. Produce an exception list for ambiguous suburbs.

**Exit:** every publishable suburb has a stable ID and mapping reliability.

### Phase 2 – Schema expansion and provenance

1. Add new nullable fields to `suburb_metrics`.
2. Create observation, source and score snapshot tables.
3. Backfill provenance and as-of dates where known.
4. Stop loaders from altering schemas dynamically.

**Exit:** additive migration complete; old readers remain functional.

### Phase 3 – Data semantics correction

1. Separate Census unoccupied dwellings from rental vacancy.
2. Standardize growth periods and CAGR.
3. Standardize rent/yield property type.
4. Add sample-size and freshness metadata.
5. Add source-quality classifications.

**Exit:** no published metric has ambiguous definition.

### Phase 4 – New scoring engine in shadow mode

1. Implement versioned factor normalization.
2. Calculate confidence separately.
3. Produce balanced and strategy scores.
4. Run old and new engines side by side.
5. Review ranking changes and outliers.

**Exit:** approved score distribution, stability and explainability.

### Phase 5 – Versioned APIs

1. Add `/api/v1/opportunities` and suburb detail endpoint.
2. Keep `/api/opportunity` and map its legacy response from new data.
3. Add caching and ETag.
4. Add contract and load tests.

**Exit:** new APIs stable; current frontend unchanged.

### Phase 6 – Page generator upgrade

1. Keep every existing suburb URL.
2. Add confidence, provenance, dates and methodology links.
3. Apply publication gates.
4. Add category pages and structured data.
5. Generate build manifest and sitemap.

**Exit:** no broken URLs; low-confidence claims suppressed.

### Phase 7 – Frontend cutover

1. Update Top Opportunities to suburb results.
2. Add strategy pages and filters.
3. Mark Beta until monitoring passes.
4. Validate mobile, bilingual content and accessibility.

**Exit:** product review approval.

### Phase 8 – Production rollout

1. Deploy behind feature flag.
2. Canary traffic.
3. Monitor errors, latency, empty results and ranking changes.
4. Publish new score version.
5. Retain rollback to last successful snapshot.

**Exit:** stable production and signed release record.

### Backward compatibility

- `/api/opportunity` remains available during migration.
- Existing `/suburb/*.html` URLs remain available.
- Current valuation APIs, reports and lead flows are untouched.
- Existing columns remain until all consumers migrate.
- New fields start nullable.
- No destructive migration occurs in the first release.

---

## 14. Testing and Acceptance

### 14.1 Data tests

- canonical suburb uniqueness;
- valid state/postcode/SA2 mappings;
- source and period attached to every scored metric;
- rate, price and date bounds;
- duplicate observation detection;
- no current rental vacancy derived from Census unoccupied dwellings;
- deterministic refresh from the same input snapshot.

### 14.2 Scoring tests

- scores remain 0–100;
- missing raw data remains `null`;
- strategy weights total 100;
- neutral-prior confidence adjustment is correct;
- low confidence shrinks factor impact toward 50 and never amplifies its distance from 50;
- Infrastructure and Supply Constraint retain their configured V1 weights at every confidence level;
- source-confidence and fallback-confidence mappings are versioned and deterministic;
- overall confidence changes with strategy weights;
- low sample size lowers confidence;
- stale data lowers confidence;
- each strategy produces expected ordering on controlled fixtures;
- deterministic tie breaking;
- version change creates a new snapshot.

### 14.3 API tests

- valid and invalid filters;
- budget and state filtering;
- pagination stability;
- cache headers and ETag;
- empty result;
- unknown and limited suburb;
- legacy contract compatibility;
- no private provenance or internal errors exposed.

### 14.4 Page tests

- canonical and sitemap consistency;
- structured-data validation;
- visible source dates match JSON-LD;
- no broken internal links;
- mobile and desktop rendering;
- bilingual layout;
- low-confidence content treatment;
- no claim without supporting data.

### 14.5 Release acceptance criteria

- No regression in valuation tests.
- 100% of ranked suburbs have canonical geography.
- 100% of ranked factors have provenance and as-of dates.
- No synthetic default factor values.
- Published rankings meet minimum factor coverage.
- API p95 target under 500 ms from cached Neon reads.
- Existing public URLs return 200 or intentional 301.
- Product owner approves methodology wording.

---

## 15. Risks and Recommendations

### Highest-priority recommendations

1. **Correct vacancy semantics before promoting yield rankings.**
2. **Implement factor-level confidence before expanding public rankings.**
3. **Retain Infrastructure and Supply as active V1 factors, using neutral shrinkage rather than removal.**
4. **Stop ranking individual sales as opportunities.**
5. **Introduce canonical suburb geography before national expansion.**
6. **Gate public pages by evidence quality rather than page-count targets.**
7. **Keep a last-known-good published snapshot for operational resilience.**

### Strategic risks

- Government datasets have different geography and release periods.
- Portal collection may be interrupted or restricted.
- National state sources are not uniform.
- School and infrastructure scores can be misunderstood as guarantees.
- Frequent score-version changes can damage trust and citation stability.
- Templated pages can become thin content if factual depth is insufficient.

### Recommended governance

- Product Owner approves business weighting and public claims.
- ChatGPT/Product Management owns PRD and product acceptance.
- Codex owns TDD, architecture and technical review.
- OpenClaw implements only after TDD approval.
- Every score release receives a version, change note and rollback point.

---

## 16. Implementation Phases Summary

| Phase | Outcome | Production change |
|---|---|---|
| 0 | Baseline and inventory | No |
| 1 | Canonical geography | Additive |
| 2 | Schema and provenance | Additive |
| 3 | Correct metric semantics | Shadow |
| 4 | New scoring engine | Shadow |
| 5 | Versioned APIs | Additive |
| 6 | Page generator upgrade | Backward compatible |
| 7 | Frontend cutover | Feature flagged |
| 8 | Production rollout | Controlled |

---

## 17. Approval Required Before Implementation

The following decisions require explicit approval:

1. Balanced and strategy weights.
2. Factor-confidence dimension weights and neutral prior.
3. Source-confidence and fallback-confidence calibration values.
4. Minimum publication coverage and confidence thresholds.
5. Canonical suburb/SA2 mapping method.
6. Accepted rental vacancy source.
7. Public use and attribution rules for each dataset.
8. Whether Low-confidence suburbs may appear in ranked lists.
9. Final API versioning and deprecation period.

No code, database migration or production deployment should begin until these decisions and this TDD are approved.
