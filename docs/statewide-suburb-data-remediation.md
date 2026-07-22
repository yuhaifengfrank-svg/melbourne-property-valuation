# Statewide suburb data remediation

**Baseline:** `016ae3c98124327e22d4fc886c692c5afcd09aae`

**Target data cutoff:** `2025-12-31`

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

1. Official suburb observation dated no later than 31 December 2025.
2. Earlier 2025 official observation plus a local, legally reusable index.
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
Rent(DE,b,Dec25)
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
estimated rental stock 2025
  = rented dwellings 2021
  × dwelling stock 2025 / dwelling stock 2021
  × rental bond index 2025 / rental bond index 2021

raw vacancy rate
  = unique long-term rentals continuously advertised >= 21 days
  / estimated rental stock 2025
```

The raw rate may be calibrated against a legally reusable metropolitan or
regional benchmark. The result remains an estimate and is published with a
range. The 2021 Census unoccupied-dwelling rate is excluded from this formula.

The model cannot run credibly without local listing first-seen/last-seen dates
and a rental-stock estimate. In their absence, the public value is unavailable.

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
4. Apply the exact-suburb and cutoff filters.
5. Model only after the research task concludes `estimate_required` and all
   minimum inputs are available.
6. Apply sample, freshness, confidence and range publication gates.
7. Only then feed eligible metrics into yield, rental-pressure and Opportunity
   calculations.

`scripts/audit-suburb-market-coverage.mjs` builds the initial statewide gap
inventory from the repository artifact. It is read-only and does not connect to
the database.

## Remaining dependency before real statewide values

The repository does not currently contain a verified statewide 2025 rental
listing time series with address-level first-seen/last-seen dates and reuse
rights. Comparable sales cannot substitute for this dataset. Until a free,
legally reusable source is acquired, the new code deliberately returns
unavailable rather than manufacturing rent or vacancy numbers.
