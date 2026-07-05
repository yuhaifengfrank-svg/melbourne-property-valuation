# Suburb Intelligence Data Contract V2

**Status:** Proposed foundation contract  
**Prepared:** 2026-06-30  
**Scope:** Victoria-first suburb intelligence, free data sources only  
**Purpose:** Establish the evidence chain required before rebuilding scores, rankings and AI summaries.

## 1. Decision

Every public suburb statement must follow this chain:

```text
Official or permitted observation (Fact)
  -> deterministic calculation (Derived Metric)
  -> versioned model or normalisation (Factor / Score)
  -> evidence-grounded explanation (AI Summary)
```

The layers must remain separate. A derived metric or model estimate must never be stored,
labelled or described as an observed fact.

## 2. Data Classes

| Class | Meaning | May display as a factual number? | Required metadata |
|---|---|---:|---|
| `FACT` | Direct observation from an authoritative or permitted source | Yes | source, period, geography, unit, licence, loaded_at |
| `DERIVED` | Deterministic formula using named facts | Yes, labelled as calculated | formula_version, input observations, period alignment |
| `MODELLED` | Estimate, percentile, weighted factor or statistical model | Only as estimated/modelled | model_version, inputs, cohort, confidence, limitations |
| `SCORE` | Normalised 0-100 decision-support signal | Yes, as a score only | scoring_version, direction, confidence, evidence IDs |
| `AI_TEXT` | Natural-language explanation of the four classes above | No new numbers | evidence IDs, prompt version, generated_at, review status |

`null` means unknown. It must not be silently replaced with a state average, a neutral score,
or a convenient default. A fallback may be used only when its geography and fallback tier are
stored and shown.

## 3. Current Production Audit

Read-only audit of Production Neon on 2026-06-30:

- `suburb_metrics`: 248 rows.
- House median: 248; unit median: 205.
- DFFH rent: 200; house rent: 200; unit rent: 210.
- Gross yield: 248.
- Existing `vacancy_rate` and `vacancy_rate_adjusted`: 248, but neither is a verified current
  rental vacancy observation.
- School score: 248.
- Population score: 200; population-growth field: 215.
- Supply and infrastructure scores: 215 each.
- Overall confidence: 215.
- `suburb_snapshots`: 0 rows, so no canonical history exists for charts or trend explanations.
- `data_source_registry`: not yet created in Production.
- Production database size: about 98.7 MiB.

The current table mixes facts, calculations, scores, confidence values, fallbacks and AI output in
one row. V2 must preserve compatibility while creating separate canonical layers.

## 4. Direct Facts We Can Use

These fields may be used by calculation and AI only when their source period and geography are
attached.

| Domain | Canonical fact | Free preferred source | Grain / cadence | Current readiness |
|---|---|---|---|---|
| Identity | suburb, state, postcode, LGA, SA2 mapping | Vicmap Address, ABS geography | Address/suburb; weekly or release-based | Partial; canonical mapping required |
| Price | house/unit/land median, sales count | VGV property sales | Suburb; quarterly/annual | House strong; unit partial; history needs loading |
| Rent | house/unit weekly rent, new-letting period | DFFH Rental Report | Suburb; quarterly | Partial, 200-210 suburbs |
| Population | ERP population by year, components | ABS Regional Population | SA2; annual | Loaded, mapping confidence required |
| Forecast | population, household and dwelling projections | Victoria in Future | SA2/LGA; release-based | Source found, not canonicalised |
| Income | median household/family income | ABS Census | SA2; five-yearly | Loaded in Census JSON, not exposed canonically |
| Socio-economic | IRSAD/SEIFA measures | ABS SEIFA | SA1/SA2; release-based | To confirm/load |
| Dwelling stock | occupied dwellings, structure, bedrooms, tenure | ABS Census | SA2; five-yearly | Substantial fields loaded |
| Schools | location, level, enrolment, ICSEA, SEA | ACARA downloadable profiles | School; annual | Locations/profiles loaded |
| Labour | unemployment and labour force | DEWR SALM | SA2; quarterly | Loaded |
| Crime | incidents/offences by category | Victorian CSA | Suburb/LGA; quarterly | 246/248 coverage |
| Planning | zone, overlays, growth corridor, FUS | VicPlan / VPA | Polygon; release-based | Cache and summaries available |
| Heritage | HO/VHR intersection and identifiers | VicPlan / Heritage Victoria | Address/polygon; release-based | Compact data available |
| Address/land | address point, property PFI, parcel area | Vicmap Address/Property | Address/parcel; weekly | Process on Oracle; cache results only |
| Transport | stops, routes, service frequency | Transport Victoria GTFS | Stop/route; frequent | Not yet integrated |
| POI | facility type and coordinates | Vicmap Features of Interest; OSM supplement | Point; periodic | Partial, 106/248 |
| Infrastructure | funded project, status, coordinates, dates | Official project registers | Project; irregular | Current registry too small |

### Direct-fact restrictions

- VGV suburb medians are not address-level comparable sales.
- ABS unoccupied dwellings are not rental vacancies.
- ICSEA measures socio-educational advantage, not investment quality or guaranteed school outcomes.
- A project announcement is not a funded infrastructure benefit.
- Regional or SA2 values allocated to a suburb remain proxies and must retain mapping confidence.

## 5. Deterministic Metrics We Should Calculate

| Derived metric | Formula | Minimum inputs | Public label |
|---|---|---|---|
| House gross yield | `house_weekly_rent * 52 / house_median_price * 100` | Same property type; compatible periods | Calculated gross yield |
| Unit gross yield | `unit_weekly_rent * 52 / unit_median_price * 100` | Same property type; compatible periods | Calculated gross yield |
| Price CAGR | `(latest / base)^(1/years) - 1` | Same VGV series and property type | Historical price CAGR |
| Rent growth | `(latest_rent / prior_rent) - 1` or CAGR | Same DFFH series/type | Historical rent growth |
| Price-to-income | `median_price / annual_household_income` | Price + ABS income | Calculated affordability ratio |
| Price-to-rent | `median_price / (weekly_rent * 52)` | Matching price/rent type | Calculated price-to-rent ratio |
| Population growth | ERP percentage change / CAGR | Same SA2 allocation across periods | Historical population growth |
| Population-to-supply gap | `population_growth - dwelling_stock_growth` | ERP + dwelling stock/approvals | Demand-supply growth gap |
| Unoccupied dwelling rate | `unoccupied_private_dwellings / private_dwellings` | ABS Census | Census unoccupied dwelling rate |
| Crime rate | `recorded_incidents / ERP_population * 1000` | Same period/geography | Recorded incidents per 1,000 |
| Dwelling mix | dwelling type count / total dwellings | ABS Census | Dwelling composition |
| School access | weighted school count within radius/catchment | ACARA locations + geography | School access indicator |
| Transport access | stops, routes and frequency with distance decay | GTFS + suburb geometry | Public transport access indicator |
| Relative price | suburb median / matched cohort median | Canonical cohort + price | Relative market price |

Derived metrics inherit the lowest confidence and oldest material period among their inputs.
Calculations may never combine house rent with unit price or combine incompatible reference periods
without a disclosed adjustment.

## 5A. Council Planning Applications and Approvals

Council planning data is a high-value supplementary fact source because it describes the local
development pipeline before completed dwelling statistics appear. It must be collected in stages:

| Lane | Source | Grain | Best use | Access reality |
|---|---|---|---|---|
| Statewide activity | [Victorian PPARS public reporting](https://www.planning.vic.gov.au/guides-and-resources/council-resources/planning-permit-activity-reporting) | Council/LGA; monthly, quarterly, annual | Comparable council trends, approval workload and outcomes | Public dashboard and extracts; completeness changes as councils submit data |
| Building activity | VBA/BPC monthly summaries | LGA/month | Permits, construction type and declared value | Free files; current download path may require manual browser retrieval |
| Council register | Individual council online planning register, for example [Monash](https://www.monash.vic.gov.au/Planning-Development/Planning/View-Planning-Applications) | Application/address/status | Suburb and nearby development pipeline | Public but heterogeneous; one adapter per council/vendor family |
| Ministerial/state | [Ministerial permits and state projects registers](https://www.planning.vic.gov.au/planning-approvals) | Project/address | Large or state-significant approvals | Public register; separate from council decisions |

The current project already has:

- `council_registry` with all 79 Victorian LGAs.
- `suburb_metrics.council_lga_code` mapped for 247 current Victorian suburbs.
- `council_metrics` and a rolling 12-month design for VBA/BPC building-permit summaries.
- A council ETL plan and loader scaffolding. These should be reviewed and reused rather than rebuilt.

### Canonical planning facts

Collect only fields necessary for property intelligence:

```text
lga_code
application_id
application_version / amendment_number
site_address_normalised
suburb / postcode
property_pfi or parcel reference when public and permitted
lodged_date
decision_date
status
outcome
application_type
proposal_category
proposal_text_public
estimated_cost_of_works
dwellings_proposed
dwellings_approved
lots_proposed
lots_approved
permit_number
source_url
source_updated_at
retrieved_at
```

Do not collect or republish applicant names, home/contact addresses, phone numbers, emails,
signatures or other personal information. Do not download application drawings, titles or PDFs in
bulk when the council states that documents are supplied only for public review. Store a public
source link and non-personal metadata instead.

### Status must remain explicit

```text
lodged -> advertised -> under_assessment -> decision_issued
       -> approved / refused / withdrawn / lapsed
approved -> building_permit / under_construction / completed (only when separately observed)
```

An approved planning permit is not evidence that construction started. A lodged application is not
an approval. Expired, amended and superseded applications must not remain in the active pipeline.

### Deduplication and history

- Business key: `lga_code + application_id + application_version`.
- Address is not a unique key; one site can have multiple applications and amendments.
- Keep status history as dated snapshots rather than overwriting the previous status.
- Normalise council-specific statuses into a canonical enum while retaining the raw status.
- Match addresses through Vicmap Address and retain match confidence.

### Derived planning metrics

| Metric | Calculation | Data class |
|---|---|---|
| Application intensity | applications lodged / 1,000 existing dwellings | `DERIVED` |
| Approval rate | approved decisions / determined applications | `DERIVED` |
| Median decision time | median decision date minus valid lodged date | `DERIVED` |
| Approved dwelling pipeline | approved dwellings / 1,000 existing dwellings | `DERIVED` |
| Active dwelling pipeline | valid proposed dwellings still under assessment / dwelling stock | `DERIVED` |
| Multi-dwelling share | multi-unit applications / residential applications | `DERIVED` |
| Alteration intensity | alteration/extension permits / dwelling stock | `DERIVED` |
| Construction value intensity | permitted declared value / dwelling stock or population | `DERIVED` |
| Nearby similar approvals | matched approved applications by radius, proposal and lot context | `DERIVED` evidence signal |

These metrics feed `supply_constraint_score`, `development_score`, planning confidence and
property-level feasibility evidence. They do not by themselves produce an approval prediction.

### Phased acquisition

1. **Council P0 - Statewide baseline:** ingest public PPARS aggregates and complete the existing
   VBA/BPC monthly permit pipeline.
2. **Council P1 - Two-council pilot:** Monash and Manningham, covering current Oakleigh and
   Doncaster product/testing needs. Validate terms, extraction, status mapping and address matching.
3. **Council P2 - Priority metro expansion:** select the next councils by covered-suburb demand,
   permit volume and accessible data format. Prefer reusable vendor/API families over bespoke PDF
   scraping.
4. **Council P3 - Remaining councils:** add adapters in controlled batches with per-source QA and
   refresh monitoring.
5. **Council P4 - Model integration:** only after at least 12 months of comparable history and
   acceptable address/status coverage.

### Storage placement

- Oracle: raw CSV/JSON/HTML responses, status snapshots, normalised application records, address
  matching and full historical planning facts.
- Neon: council/suburb quarterly aggregates, current active/approved nearby signals and evidence
  links only. Do not store bulk PDFs or complete council-register mirrors in Neon.
- Suggested Neon tables: `suburb_planning_activity_current`,
  `suburb_planning_activity_history`, and a bounded `nearby_planning_signals` cache.

### AI Summary permissions

AI may say: “Approved dwelling pipeline is above the matched council cohort for the stated
period,” when evidence supports it. AI must also state that approval does not guarantee
construction. AI may not say that a development will proceed, that a property will receive a
permit, or that a suburb is supply constrained solely because application volume is low.

## 6. Metrics That Require a Model or Factor

| Model / score | Recommended evidence | Output | Key guardrail |
|---|---|---|---|
| Value | price-to-income, price-to-rent, relative price, momentum | `value_score` | Cheap alone is not undervalued |
| Growth | 1Y/3Y/5Y price growth, ERP growth | `growth_score` | At least one multi-year price series |
| Yield | house/unit gross yield, rent growth | `yield_score` | Property types remain separate |
| Rental pressure | rent growth, new lettings, population-supply gap, unoccupied rate, renter stock | `rental_pressure_score` | Never publish as a vacancy percentage |
| School | profile quality + access/coverage | `school_score` | Do not describe ICSEA as NAPLAN performance |
| Income | household income + IRSAD | `income_score` | Never infer income from house price |
| Population | 5Y and 1Y ERP growth | `population_score` | Interpret with supply growth |
| Supply constraint | approvals/stock, developable land, listings/inventory when available | `supply_constraint_score` | At least two defensible inputs for high confidence |
| Infrastructure/access | existing access + funded/under-construction projects | `infrastructure_score` | Unfunded announcements contribute zero |
| Planning/development | zone, overlays, lot, heritage, FUS | `development_score` | Signal, not approval or legal advice |
| Safety | crime rate, trend and category mix | `safety_score` | Recorded crime is not total crime incidence |
| Opportunity | confidence-adjusted factor combination | strategy scores | Version weights; keep confidence separate |
| Risk | explicit adverse factors | `risk_score` | No synthetic defaults for missing factors |
| Confidence | source, freshness, directness, sample, completeness | `confidence_score` | Confidence is not an investment factor |

## 7. Vacancy Decision

### What we currently have

- ABS Census unoccupied private dwelling rate.
- DFFH suburb rent observations and, when added, new-letting counts.
- Gross yield and rent growth calculations.
- ERP population growth.
- Census dwelling stock and dwelling growth.
- Planning/supply evidence.

### What we do not have

A free, authoritative, current suburb-level rental vacancy percentage suitable for publication as
an observed fact.

### V2 rule

Retire `vacancy_rate` from public factual use. Preserve it temporarily for compatibility, marked
`deprecated_proxy`. Replace the public factor with:

```text
rental_pressure_score (0-100, higher = tighter rental conditions)
```

Provisional model candidate, subject to back-testing:

```text
30% rent growth percentile
25% population growth minus dwelling growth percentile
20% new-letting flow/tightness percentile
15% inverse Census unoccupied dwelling percentile
10% renter-stock and occupancy context
```

If new-letting counts are unavailable, that weight is not silently redistributed. The score is
shrunk toward neutral and confidence falls. The model does not output an estimated vacancy
percentage until a verified target series exists for calibration and validation.

## 8. Required Canonical Records

Each fact or metric exposed to scoring must have:

```json
{
  "metric_key": "median_house_price",
  "value": 1250000,
  "unit": "AUD",
  "data_class": "FACT",
  "geography_type": "suburb",
  "geography_key": "doncaster-vic-3108",
  "property_type": "house",
  "period_start": "2025-10-01",
  "period_end": "2025-12-31",
  "source_key": "vgv_property_sales",
  "source_class": "authoritative_government",
  "fallback_level": "direct_suburb",
  "source_confidence": 100,
  "mapping_confidence": 100,
  "freshness_status": "current",
  "calculation_version": null,
  "model_version": null
}
```

Every derived metric also stores its input observation IDs. Every score stores its metric evidence
IDs and scoring version.

## 9. AI Summary Input Contract

AI receives a bounded, pre-approved evidence package. It never queries raw tables and never
calculates a score.

```json
{
  "suburb": { "name": "Doncaster", "state": "VIC", "postcode": "3108" },
  "facts": [],
  "derived_metrics": [],
  "factor_scores": [],
  "strategy_scores": [],
  "strength_evidence_ids": [],
  "risk_evidence_ids": [],
  "limitations": [],
  "data_as_of": "2026-06-30",
  "score_version": "opp-2.0.0"
}
```

### AI may

- Explain why scores are high or low.
- Compare current values against the declared cohort.
- Summarise strengths, weaknesses, suitable buyer profiles, risks and long-term signals.
- State data limitations and freshness.

### AI may not

- Introduce a number absent from the evidence package.
- Convert a proxy into an observed fact.
- Calculate or adjust factor scores.
- Claim causation from correlation.
- Promise growth, rent, school admission, planning approval or investment returns.
- Output `Strong Buy`, `Buy`, `Sell` or `Avoid` as personalised financial advice.

Preferred public conclusion labels are:

- `Strong opportunity signal`
- `Moderate opportunity signal`
- `Mixed evidence`
- `Limited evidence`
- `Elevated risk signals`

Each AI sentence containing a statistic must reference one or more internal evidence IDs. The
stored summary must include prompt version, evidence package hash, model identifier, generation
time and validation status.

## 10. Current AI Summary Issues to Retire

The current `scripts/compute-ai-summary.mjs` must not be treated as the V2 source of truth because:

1. Missing vacancy is replaced with `3.0`, manufacturing evidence.
2. `conf_income` is used as if it were household income or affordability rather than confidence.
3. `vacancy_rate_adjusted` is described as a verified vacancy percentage.
4. `dwelling_occupancy_rate` is interpreted as household density without a canonical definition.
5. Missing factors are filled with neutral defaults inside risk calculations without disclosure.
6. `Strong Buy`, `Buy` and `Avoid` labels overstate the platform's evidence and product role.
7. AI summary output has no complete source/period/evidence lineage.

The rule-based driver extraction can be retained only after it reads the new evidence contract.

## 11. Storage Contract

### Oracle data factory

Store immutable raw downloads, all historical versions, large GIS/GTFS datasets, PostGIS working
tables, model training data and transformation outputs. Prefer compressed source files and Parquet
for large tabular history.

### Production Neon

Store only:

- `data_source_registry` and `metric_definition_registry`.
- Canonical suburb/geography mappings.
- Current facts and derived metrics needed by APIs.
- Quarterly/annual suburb history needed by charts.
- Versioned factor and strategy scores.
- Compact evidence packages and approved AI summaries.
- On-demand address/parcel results without statewide raw geometry.
- Customer, report, payment and membership records.

Operational target: keep Production Neon below 250 MiB. The current size is about 98.7 MiB, so the
V2 current/history/evidence layer should target no more than 40-60 MiB before address-cache growth.

## 12. Implementation Order

### D0 - Registry and naming freeze

1. Populate `data_source_registry`.
2. Create `metric_definition_registry`.
3. Freeze canonical names, units and data classes.
4. Mark legacy proxy and duplicate columns as deprecated; do not delete them yet.

### D1 - Fact layer

1. Load VGV quarterly/annual history.
2. Load DFFH rent history and available new-letting counts.
3. Canonicalise ABS ERP, Census income/dwellings and ACARA/CSA mappings.
4. Add source periods, geography and freshness to every observation.

### D2 - Derived layer

Implement and test property-type yield, price/rent CAGR, price-to-income, price-to-rent,
population-supply gap, crime rate, school access and transport access.

### D3 - Model and scoring layer

Implement versioned factors, rental pressure, confidence and neutral-prior shrinkage. Back-test
distributions and reject scores with inadequate evidence.

### D4 - AI explanation layer

Build the evidence package, deterministic driver/risk extraction, AI text generation, validation,
SEO rendering and regeneration rules.

## 13. Acceptance Gates

- 100% of public facts have source, period, geography, unit and data class.
- 100% of derived metrics have formula version and input lineage.
- 100% of scores have scoring version, confidence and evidence IDs.
- No synthetic default is presented as a suburb observation.
- No Census unoccupied rate is labelled rental vacancy.
- No AI statistic exists outside the supplied evidence package.
- AI generation failure never blocks the factual suburb page; deterministic content remains.
- The last successfully published data snapshot remains available when refresh fails.
