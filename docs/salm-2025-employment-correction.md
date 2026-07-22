# SALM 2025 employment correction

**Source:** DEWR Small Area Labour Markets, March 2026 release

**Model period loaded:** December 2025

**Source file SHA-256:** `e05f45d9cf5e38abcc55c8925afbb988697374ffb473d5dcb20ef57573c6c517`

Migration 016 separates employed-person counts from year-on-year employment
growth. The legacy `supply_employment_growth` field previously held a person
count; it is corrected to the growth percentage for compatibility, while new
code uses `supply_employment_count` and `supply_employment_growth_yoy`.

`conf_income` is no longer derived from unemployment. A value of 80 denotes an
SA2-allocated ABS Census income input. It is a geographic/source confidence,
not an income score.

## Verified results

| Suburb | SA2 coverage | Dec-25 employment | YoY growth | Dec-25 unemployment |
|---|---|---:|---:|---:|
| Oakleigh | Oakleigh–Huntingdale | 15,326 | 4.6715% | 2.40% |
| Mount Waverley | North + South | 20,910 | 4.6809% | 1.56% |

Mount Waverley must not use `LIMIT 1`: the school-derived mapping contains both
North and South. Employment counts are summed, unemployment is calculated from
combined persons/labour force, and employment growth is calculated from the
combined current and prior-year employed-person totals.

ABS 2021 median household income for Mount Waverley is a dwelling-weighted
model input across North ($2,049/week; 5,683 dwellings) and South
($2,079/week; 6,797 dwellings), producing approximately $2,065/week. It is not
a directly observed suburb median.
