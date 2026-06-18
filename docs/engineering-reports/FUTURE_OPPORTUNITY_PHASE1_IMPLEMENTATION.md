# Future Opportunity Phase 1 Implementation

Date: 2026-06-18

## Purpose

This phase upgrades the Top Opportunities funnel from a legacy composite opportunity score into a versioned Future Opportunity Index.

The index is a relative 0-100 screening signal for the next 3-5 years. It is not a price forecast, a rental return forecast, financial advice, or a guaranteed return.

## Model

Module: `lib/future-opportunity-outlook.js`

Version: `future_outlook_v1`

Core dimensions:

- affordability
- rental income pressure
- demand and vacancy
- supply constraint
- infrastructure access
- school demand
- data confidence

Normalisation uses piecewise scoring where an excellent line maps to 80 rather than automatically clipping common strong values to 100. This keeps 100 rare and preserves separation between good and exceptional suburbs.

## Strategies

Canonical strategies:

- `balanced`
- `smart`
- `growth`
- `income`
- `cashflow`
- `school`
- `value`

Customer-facing aliases are accepted and normalised, including:

- `Capital Growth` -> `growth`
- `Rental Income` / `rental yield` -> `income`
- `School Zone` -> `school`
- `Smart Buy` -> `smart`

Unknown strategies are rejected by `api/opportunity.js` with `unsupported_strategy`.

## Property Type Handling

The model supports:

- `house`
- `unit`
- `either`

Aliases:

- townhouse and villa map to `house`
- apartment and flat map to `unit`

Budget filtering now uses the relevant median price:

- house filters use `median_house_price`
- unit filters use `median_unit_price`
- either allows either matching house or unit price

## Lifestyle Market Handling

Lifestyle and holiday markets are not excluded outright. Instead:

- confidence is capped
- score receives a small discount
- risk text explains seasonal or lifestyle-market liquidity risk

This avoids over-promoting high-yield, low-vacancy holiday markets while still allowing them to rank when other evidence is strong.

## API Integration

Endpoint: `api/opportunity.js`

The endpoint now returns:

- `futureOpportunityIndex`
- `band`
- `confidence`
- `confidenceScore`
- `componentScores`
- `why`
- `risks`
- `forecastHorizon`
- `isPriceForecast: false`
- `modelVersion`
- legacy compatibility fields: `opportunityScore`, `opportunityType`, `legacyOpportunityScore`, `legacyOpportunityType`

The homepage snippet now calls `/api/opportunity?maxResults=50&strategy=balanced`.

## Funnel Integration

Endpoint: `api/unlock-opportunity.js`

The lead gate now fetches raw opportunity data using the user's selected goal strategy, then re-ranks the result with `rankPersonalised()`.

The personalised Top 10 response now carries:

- `baseFutureScore`
- `personalisedFutureScore`
- `futureOpportunityIndex`
- `forecastHorizon`
- `isPriceForecast: false`
- model-generated reasons and risks

The re-ranking adjustment remains capped at +/-12 points, so personalisation cannot fully override the base Future Opportunity Index.

## Property-Level Formula

The model exposes a property-level scoring helper:

```text
property_future_score =
  suburb_future_outlook_score * 0.70
  + property_specific_score * 0.30
```

This helper is implemented but not yet wired into the valuation report UI.

## Data Sources

Phase 1 uses existing stored metrics:

- `suburb_metrics.median_house_price`
- `suburb_metrics.median_unit_price`
- `suburb_metrics.gross_yield`
- `suburb_metrics.school_score`
- `suburb_metrics.vacancy_rate`
- `suburb_metrics.supply_constraint_score`
- `suburb_metrics.infrastructure_score`
- `suburb_metrics.overall_confidence`

Future phases may add public free data sources such as ABS, RBA, VIF, transport/infrastructure datasets, council planning data, and labour market releases. Those should be imported as separate, source-labelled fields rather than blended into undocumented heuristics.

## Tests

Added:

- `tests/future-opportunity-outlook-tests.mjs`
- `tests/future-opportunity-api-tests.mjs`

Updated:

- `test-opportunity-funnel.mjs`

Key test coverage:

- excellent thresholds map to 80
- strategy aliases work
- property type price filters use correct median price
- classifications avoid collapsing everything into Balanced
- lifestyle markets are discounted/capped
- missing data reduces confidence
- personalised Top 10 prefers Future Opportunity Index over legacy score
- homepage uses the real opportunity API endpoint
- property future formula follows exact 70/30 weighting
