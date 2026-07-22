# Oakleigh metric validation

## Vacancy model v1 checkpoint (22 July 2026)

The new benchmark-adjusted vacancy model does **not** yet publish an Oakleigh percentage. The initial read-only evaluation produced 29% weighted evidence coverage. After retrieving DEWR employment history and reconstructing an ABS income-capacity input, technical coverage rises to approximately 42%; however, the comparison distributions are still Victorian SA2/stored suburb diagnostics rather than the final approved Greater Melbourne suburb set. The publication result therefore remains **Data not available**.

| Input | Current stored value | Comparison percentile | Quality applied | Publication note |
|---|---:|---:|---:|---|
| Population CAGR | 0.33% | 76.0th | 0.60 | SA2 allocation; model-only, not an Oakleigh fact |
| Unemployment | 2.3% | 15.8th | 0.80 | SA2 allocation and older period |
| Flat/apartment share | 16.1% | 82.3rd | 0.80 | 2021 Census-derived and spatially allocated |

The comparison set contained 525 stored Victorian suburb rows, not the final approved Greater Melbourne comparison set. Therefore these percentiles are a pipeline diagnostic only. BPC permit supply and the Monash planning register have now been retrieved and validated offline, but they are not yet loaded into the model comparison distribution. A technical run with the employment and income inputs still returns about 1.55% with low confidence and a wide 0.95%–2.15% range. That result remains **not publication-ready** until the new supply features and final Greater Melbourne comparison set are reproduced statewide. The correct current public result is **Data not available**, not 2.4%, 8.49%, 1.55%, or another provisional estimate.

Monash provides an official ePathway register with application and decision searches back to 2010. Date-range search and session-scoped `PageNumber` pagination have been verified without an account or access-control bypass. No first-party CSV/API export is exposed, so the planning factor remains offline until the HTML collector is rate-limited, schema-checked and approved for ongoing reuse.

## Official source research completed

### Employment growth

DEWR's March-quarter 2026 smoothed SALM file contains a continuous quarterly series for **Oakleigh–Huntingdale SA2 (212051326)**. For the model cutoff:

- December 2024 labour force 14,989; smoothed unemployed 347; derived employed 14,642.
- December 2025 labour force 15,709; smoothed unemployed 383; derived employed 15,326.
- Derived year-on-year employment growth: **4.67%**.
- Smoothed unemployment rate: 2.3% in December 2024 and 2.4% in December 2025.

This is an official SA2 estimate, not an Oakleigh SAL observation. DEWR recommends smoothed estimates and year-on-year comparisons because small-area quarterly movements can be volatile. It is suitable as a model feature with a geographic-quality discount, not as a direct Oakleigh fact.

### Income capacity

ABS 2021 Census QuickStats reports Oakleigh SAL22000 median weekly household income of **$1,926**. The ABS Victoria all-sectors Wage Price Index for total hourly rates excluding bonuses rose from 139.2 in September 2021 to 159.7 in December 2025. A mechanical nominal update gives:

`$1,926 × 159.7 / 139.2 = approximately $2,210 per week`

The $2,210 figure is a modelled income-capacity index, not observed 2025 household income. WPI measures wage-price change and deliberately excludes workforce-composition change. Applying one Victoria index to every suburb preserves the 2021 cross-sectional ordering and does not establish suburb-specific income growth.

For model consistency, the existing Census SA2 table maps Oakleigh to Oakleigh–Huntingdale SA2 and reports a 2021 median weekly household income of **$1,956**. Its WPI-updated December 2025 nominal value is approximately **$2,244/week**, at the 62.2nd percentile of the 524 available Victorian SA2 rows. The SAL $1,926 value remains the exact Oakleigh historical fact; the SA2 $1,956/$2,244 series is the model feature. They must not be mixed under one label.

### Building permits

The BPC official permit-level XLSB and supplementary field dictionary were downloaded through the normal public browser flow and parsed offline. For exact `OAKLEIGH`, postcode `3166`, municipality containing `MONASH`, and a 2025 permit issue date, the file contains **141 permits**. Of these, 97 are classified Domestic/Residential, 33 report at least one new dwelling, 43 new dwellings are reported and 27 dwellings are reported demolished, producing **net permitted supply of +16 dwellings**. The 2026 file through May contains 52 exact permits, 13 new dwellings and 4 demolitions, or net +9; it is a partial-year observation and must not be compared directly with full-year 2025.

These are building permits and reported dwelling quantities, not commencements or completions. Seven rows with a 2025 levy-return year were excluded from the 2025 issued-permit count because the issue date was outside 2025, missing, or the municipality was not Monash. The source is surveyor-reported and retains the BPC accuracy disclaimer.

### Monash planning pipeline

Monash publishes an official ePathway register and monthly Town Planning Schedules. A read-only date-range query for 1 January–31 December 2025 returned 36 pages (about 1,068 Monash applications), including **82 records whose address ends exactly in `OAKLEIGH VIC 3166`**. Oakleigh East, Oakleigh South and other postcode-3166 localities were excluded.

The 82 records are not 82 housing projects. They include signage, tree works, alterations, subdivisions, withdrawn/lapsed applications and amendments. Verified examples include TPA/57234 (12 dwellings, VCAT appeal), TPA/57082 (2 dwellings, permit to issue), TPA/56944 (3 dwellings, permit to issue), TPA/56984 (3 dwellings, permit to issue), TPA/56613 (2 dwellings) and TPA/56457 (2 dwellings behind an existing dwelling). Replacement projects such as TPA/57141 are net zero; lapsed or incorrectly lodged projects receive zero weight. Application suffixes `/A` and `/B` are grouped with the base application before aggregation.

The current publishable conclusion is therefore **register coverage established; weighted dwelling pipeline remains a model feature pending collector/reuse approval and statewide comparison calibration**. Raw application count must never be labelled dwelling supply.

**Review date:** 2026-07-22
**Geography:** Oakleigh, VIC 3166 only (not Donvale and not a combined area)

## Publishable facts

| Metric | Observation | Period | Source | Publication note |
|---|---:|---|---|---|
| Population | 8,442 | 2021 Census | ABS Oakleigh SAL22000 | Fact; historical baseline only |
| Total dwellings | 3,831 | 2021 Census | ABS Oakleigh SAL22000 | Fact; structural baseline |
| Rented households | 1,125 | 2021 Census | ABS Oakleigh SAL22000 | Baseline input, not current rental stock |
| Unoccupied dwellings | 458 (12.3%) | 2021 Census night | ABS Oakleigh SAL22000 | Not rental vacancy |
| House median | $1,311,000 | 2024 calendar year | Valuer-General Victoria | Official annual suburb fact |
| 3-bedroom house rent | $630/week, n=175 | year to Sep 2025 | DFFH Chadstone–Oakleigh | Combined-area fact; not exact Oakleigh |
| 4-bedroom house rent | $850/week, n=79 | year to Sep 2025 | DFFH Chadstone–Oakleigh | Combined-area fact; not exact Oakleigh |

## Historical house-price growth from the official VGV series

Using the same Oakleigh house series and actual elapsed years ending in 2024:

| Horizon | Start | End | CAGR |
|---|---:|---:|---:|
| 1 year | $1,336,500 (2023) | $1,311,000 (2024) | -1.90% |
| 3 years | $1,388,000 (2021) | $1,311,000 (2024) | -1.88% p.a. |
| 5 years | $1,101,000 (2019) | $1,311,000 (2024) | 3.55% p.a. |
| 10 years | $801,500 (2014) | $1,311,000 (2024) | 5.04% p.a. |

The database value `vgv_cagr_10y = 14.72%` is not reproducible from this
official series and must not be published. The prior loader also used fixed
roots that did not equal the actual elapsed periods.

## Rental vacancy result

**Data not available.** The database contains no current exact-suburb rental
stock series and no reusable 21-day first-seen/last-seen rental listing history.
The legacy 9.61% is a weighted Census unoccupied-dwelling ratio produced through
a duplicated school-to-SA2 mapping. The legacy adjusted 2.40% is exactly one
quarter of that invalid input, not an observed vacancy rate.

A current one-day portal count may be used only to check plausibility. It must
not be divided by the 2021 rented-household count and published as vacancy. The
model will return `Data not available` until it has at least 21 days of
deduplicated listings, an updated rental-stock denominator and an approved
benchmark.

## Current comparable-sales cross-check

The internal comparable-sales table was queried read-only. These are derived
rolling medians, not VGV suburb medians and not a price index:

| House type | Latest 365 days | Previous 365 days | Change |
|---|---:|---:|---:|
| 3 bedroom | $1,090,000, n=31 | $1,105,000, n=26 | -1.36% |
| 4 bedroom | $1,245,000, n=13 | $1,055,000, n=18 | +18.01% |

The opposite movements show why bedroom mix must not be combined blindly.
The 4-bedroom result has a small sample and may reflect land, condition and sale
composition. These figures are suitable for model diagnostics with sample size
and period shown, but not as direct market-growth facts.

## Values blocked from publication

| Legacy value | Reason |
|---|---|
| Growth 1y/3y/5y `0/-8/-5` | Short-window model signals, not measured historical returns |
| Adjusted vacancy `2.40%` | Mechanical `9.61% × 0.25` from an invalid Census proxy |
| Opportunity `71/100` | Superseded private/legacy score, not the public Opportunity contract |
| AI “Low Vacancy 2.4%” | Derived from the invalid adjusted vacancy field |
| Crime `13,257`, rank `176` | Missing period/geographic/rate lineage; rank is raw-count based |
| POI `53/100` | Node-only OSM radius method with no retrieval date or auditable inputs |

## Model decision for discussion

1. Use official VGV dated observations for historical house-price CAGR.
2. Use DFFH 3- and 4-bedroom house rent as the official combined-area anchor;
   exact Oakleigh rent remains an estimate unless a reusable local index is secured.
3. Publish adjusted vacancy only from the versioned 21-day listing/rental-stock
   model, with sparse-evidence shrinkage, interval and confidence.
4. Keep experimental momentum as a separately named relative ranking signal;
   never label it as 1-, 3- or 5-year historical growth.
5. Rebuild crime from the latest CSA 12-month suburb rate and rebuild POI from
   complete OSM features with stored date, radius, category counts and attribution.
