# Suburb vacancy model v1

## Decision

AusHomeValue may publish a suburb vacancy figure only as an **estimate**, never as an observed fact, unless a licensed suburb observation with a clear vacancy definition is available. Version 1 is anchored to Cotality's Greater Melbourne Q4 2025 vacancy benchmark of **1.6%**. It is not valid for regional Victoria.

The estimate represents the modelled share of long-term rental dwellings vacant in a suburb. It is not the 2021 Census unoccupied-dwelling rate and is not the number of current advertisements divided by all dwellings.

## Function

For each approved feature, calculate its percentile across the same Greater Melbourne suburb comparison set and same period. Convert percentile `p` to `x = 2 × (p - 0.5)`.

`S = -0.25 population_growth + 0.12 unemployment - 0.08 employment_growth - 0.10 income_capacity + 0.25 building_permit_supply + 0.15 planning_pipeline + 0.05 apartment_share`

Each term is multiplied by its source-quality value. Missing terms contribute zero and lower evidence coverage. They are not redistributed to the remaining terms.

`S_shrunk = S × evidence_coverage`

`adjustment_coefficient = clamp(exp(0.45 × S_shrunk), 0.65, 1.60)`

`suburb_estimate = 1.6% × adjustment_coefficient`

The cap produces a preliminary supported range of 1.04%–2.56%. This cap is a safeguard, not proof that every suburb lies in that interval. It must be recalibrated when observed suburb vacancy evidence becomes legally reusable.

## Approved evidence

| Feature | Weight | Direction | Free source | Required transformation |
|---|---:|---:|---|---|
| Population growth | 25% | higher lowers vacancy | ABS Regional Population / Census | Spatially allocate to suburb; keep SA2-only values out of public facts |
| Unemployment | 12% | higher raises vacancy | DEWR SALM | Map SA2/LGA observation to suburb and preserve geography quality |
| Employment growth | 8% | higher lowers vacancy | DEWR SALM historical quarters | Compute like-for-like four-quarter change; never use the employment level as growth |
| Income capacity | 10% | higher lowers vacancy | ABS Census income, updated with ABS WPI | Reconstruct actual income; `conf_income` is prohibited |
| Building permit supply | 25% | higher raises vacancy | BPC permit-level open data | Net new residential dwellings per rental-stock estimate; reported and inferred counts remain separate |
| Planning pipeline | 15% | higher raises vacancy | PPARS + council registers | Proposed dwellings per rental stock, discounted by status/probability and source quality |
| Apartment share | 5% | higher raises vacancy | ABS Census dwelling structure | Share of occupied residential stock using an explicit dwelling definition |

RBA indicators have zero cross-sectional weight. They may update a future Melbourne-wide benchmark over time but cannot explain why Oakleigh differs from another suburb on the same date.

## Council planning acquisition

1. Reconcile every council against the statewide PPARS totals and definitions.
2. Use Vicmap zones and overlays for parcel planning context; do not treat zoning capacity as approved supply.
3. Retrieve address/suburb applications from an official council register only where the licence and access method are verified.
4. Prefer reported proposed dwelling counts. Description-derived quantities are marked `inferred` and discounted.
5. Deduplicate amendments and repeat applications by council and application number.
6. Keep lodged, approved, refused, withdrawn and completed statuses separate. A lodged application is not an approved dwelling.

## Publication gates

- Below 40% weighted evidence coverage: `Data not available`.
- At or above 40%: publish only with the label “Modelled vacancy estimate”, benchmark, as-of date, range, confidence and limitations.
- Direct suburb facts and model estimates must never share the same label.
- Oakleigh cannot receive a planning-pipeline contribution until a Monash source is verified. Its existing SA2 population figures may inform a low-quality model feature but cannot be published as Oakleigh population facts.

## Known exclusions

Legacy vacancy fields, adjusted vacancy fields, Opportunity scores, school scores, crime counts, POI scores and price-growth fields are not inputs. They either have unrelated meanings or unresolved lineage and would create circular or misleading results.
