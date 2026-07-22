# Statewide suburb data remediation

**Baseline:** `016ae3c98124327e22d4fc886c692c5afcd09aae`

**Analysis policy:** use the latest verified observation available on or before
the run date. Each metric keeps its own source period; the system does not
pretend every source shares one common cutoff.

**Scope:** every Victorian suburb represented by the canonical suburb inventory

## Publication contract

Every metric is classified as `fact`, `derived_fact`, `estimate`, `signal`,
`score`, or `unavailable`. Facts require a named source and reference period;
estimates require a model version, inputs, range and confidence. Missing values
remain unavailable and must never become zero.

The geographic target is one suburb. Combined-suburb, SA2 or LGA observations
may be model inputs, but are not published as suburb facts. The two supported
house-rent products are three-bedroom and four-bedroom detached houses.

## Confirmed unsafe legacy paths removed

`lib/refresh-suburb-metrics.js` no longer:

- treats the 2021 Census-night unoccupied-dwelling share as rental vacancy;
- fills a missing suburb vacancy with the statewide average;
- treats the 2021 Census all-dwelling weekly rent as current house rent;
- calculates current gross yield from that stale, mismatched rent.

Existing database values are not deleted by this code change. They remain
legacy fields and are not evidence for the new observations table. A separate,
reviewed data migration is required before changing Production data.

## Free-source hierarchy

1. Latest official suburb observation available by the analysis date.
2. Earlier official observation plus a local, legally reusable current index.
3. Official larger-area anchor plus a spatially calibrated local index.
4. 2021 structural baseline plus current housing, bond, population or listing inputs.
5. `Data not available` when minimum inputs or reuse rights are absent.

The machine-readable registry is `data/free-source-registry.json`. A publicly
visible web page is not automatically reusable data. Search snippets are never
treated as evidence, access controls are never bypassed, and sources without
confirmed automation rights are citation/cross-check sources only.

The free-source investigation found no open address-level Victorian rental
listing history suitable for automated statewide reuse. RTBA transaction
records are confidential; the open DFFH Rental Report is aggregated. SQM shows
postcode vacancy publicly, but its terms prohibit systematic retrieval and
commercial republication without written permission. It is therefore marked
`licence_blocked`, not used as an automated source. REIV public figures are
regional benchmarks unless reuse permission and finer geography are confirmed.

## Rent nowcast v1

For bedroom count `b` in `{3,4}`:

```text
Rent(suburb,b,analysis date)
  = official combined-area bond-rent anchor
  × local listing index at anchor / combined listing index at anchor
  × local listing index at cutoff / local listing index at anchor
```

The output is an estimate, even though its anchor is official. Minimum unique
local observations are five; 5–14 is low confidence, 15–29 medium and 30 or
more high. Duplicate addresses, rooms, short stays and non-house property types
must be excluded before the index is calculated.

## Rental vacancy v1

```text
estimated rental stock at analysis date
  = rented dwellings 2021
  × current dwelling stock / dwelling stock 2021
  × current rental bond index / rental bond index 2021

raw vacancy rate
  = unique long-term rentals continuously advertised >= 21 days
  / estimated rental stock 2025
```

The raw local rate may be calibrated against a legally reusable metropolitan
or regional benchmark, then shrunk toward that benchmark when local observed
vacancies are sparse. The local evidence weight is
`vacancies / (vacancies + 30)`. The result remains an estimate and is published
with its range, sample size and model inputs. The 2021 Census
unoccupied-dwelling rate is excluded from this formula.

The model cannot run credibly without at least 21 days of deduplicated local
listing first-seen/last-seen history and a rental-stock estimate. A one-day
listing count is only a diagnostic snapshot. In their absence, the public value
is unavailable.

## Historical price growth

Published 1-, 3-, 5- and 10-year growth must be CAGR derived from dated,
same-geography, same-property-type official price observations:

```text
CAGR = (ending price / starting price)^(1 / actual elapsed years) - 1
```

An anchor must be within 120 days of the requested horizon. The legacy
`growth_1y`, `growth_3y`, `growth_5y` fields are experimental short-window
momentum signals and cannot be labelled as historical returns. The legacy
`vgv_cagr_10y` value has no reproducible source lineage and is also blocked from
fact publication.

## Crime and points of interest

Crime is publishable only with the CSA reference period, geography, count,
population denominator and rate definition. The legacy raw `crime_total_count`
and count-based rank have no recorded period and are blocked.

The legacy POI score was built from an OSM node-only radius search around an
approximate centre. It lacks a retrieval date, complete feature geometry,
category counts and a versioned scoring definition. It remains unavailable for
publication until those inputs and ODbL attribution are stored.

## Population nowcast v1

Use latest ABS ERP where available. Spatially allocate SA2 observations to
official suburb boundaries using population-grid or residential-address
weights. If a short projection to the cutoff is required:

```text
population(cutoff) = latest ERP × (1 + bounded population growth rate)^years
```

The annual rate is bounded to -1% through 4%. Property price growth is never a
population input.

## Statewide workflow

1. Create one research task per suburb for 3-bedroom rent, 4-bedroom rent and
   rental vacancy.
2. Search official/open sources first and record period, geography, licence and
   download location.
3. Store observations without overwriting source history.
4. Apply the exact-suburb and analysis-date filters.
5. Model only after the research task concludes `estimate_required` and all
   minimum inputs are available.
6. Apply sample, freshness, confidence and range publication gates.
7. Only then feed eligible metrics into yield, rental-pressure and Opportunity
   calculations.

`scripts/audit-suburb-market-coverage.mjs` builds the initial statewide gap
inventory from the repository artifact. It is read-only and does not connect to
the database.

## Remaining dependency before real statewide values

The repository does not currently contain a verified statewide current rental
listing time series with address-level first-seen/last-seen dates and reuse
rights. Comparable sales cannot substitute for this dataset. Until a free,
legally reusable source is acquired, the new code deliberately returns
unavailable rather than manufacturing rent or vacancy numbers.
