# Oakleigh metric validation

## Vacancy model v1 checkpoint (22 July 2026)

The new benchmark-adjusted vacancy model does **not** yet publish an Oakleigh percentage. Read-only evaluation of the currently available approved inputs produced 29% weighted evidence coverage, below the 40% minimum gate:

| Input | Current stored value | Comparison percentile | Quality applied | Publication note |
|---|---:|---:|---:|---|
| Population CAGR | 0.33% | 76.0th | 0.60 | SA2 allocation; model-only, not an Oakleigh fact |
| Unemployment | 2.3% | 15.8th | 0.80 | SA2 allocation and older period |
| Flat/apartment share | 16.1% | 82.3rd | 0.80 | 2021 Census-derived and spatially allocated |

The comparison set contained 525 stored Victorian suburb rows, not the final approved Greater Melbourne comparison set. Therefore these percentiles are a pipeline diagnostic only. Employment growth, actual income, BPC permit supply and Monash planning pipeline remain missing. The correct current public result is **Data not available**, not 2.4%, 8.49%, or a newly invented estimate.

Monash provides an official ePathway register with application and decision searches back to 2010, but a stable bulk/API route and reuse conditions have not been verified. Until they are, the planning factor is neutral and reduces confidence.

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
