# AusHomeValue Valuation Source Policy

This is the internal rule for how the valuation system should work.

## Principle

AusHomeValue must not estimate a property by matching it to a fixed sample address or a generic internal sample database.

Every customer-entered address should be treated as a new subject property. The system should estimate it by running the valuation logic against evidence collected for that address, property type, suburb and market.

## Correct Workflow

1. Parse the customer address.
   - Unit / apartment / lot label.
   - Street number and street name.
   - Suburb and state from the pasted address where available.
   - Selected property type, with address-based type correction where needed.

2. Verify the subject property.
   - Geocoding / Google Maps style address confirmation.
   - Current built form and visible property configuration.
   - Basic property profile where publicly available.

3. Collect public evidence.
   - Recent same-type sold comparables.
   - Same building / same complex for apartment, unit, villa and townhouse.
   - Same street and same suburb where same-address evidence is unavailable.
   - Public authority data for planning, council, ABS suburb fundamentals and government context.
   - Commercial portal data from realestate.com.au, Domain and other sources as cross-checks.

4. Calculate the first estimate.
   - Comparable sales remain the primary price anchor when enough recent evidence exists.
   - Public portal automated estimates can be used as cross-checks, not as the only basis.
   - If fewer than three relevant comparables are found, confidence must drop.
   - If same-address, same-street or same-suburb evidence is not available, expand the comparable radius progressively, for example to nearby streets, 1 km, 2 km and 3 km.
   - The customer should still receive a preliminary automated estimate, but confidence and range must reflect the weaker comparable fit.

5. Apply client-supplied evidence.
   - Title / title plan.
   - Section 32 or vendor statement.
   - Planning notes.
   - Current photos.
   - Inspection, street, rental and condition notes.
   - This is the "manual adjustment" stage: the customer supplies documents or observations, and the system uses that evidence to automatically revise the estimate.

6. Produce the customer report.
   - Show the estimate, reason, evidence and missing checks.
   - Do not tell the customer about internal fixtures, samples or fallback data.
   - Keep source logic transparent enough to be useful, but do not expose implementation language.

## What Is Not Allowed

- Do not use an unrelated address as a fallback estimate.
- Do not use another suburb's stored values as a blind fallback. Nearby suburb evidence can only be used when it is part of a radius-based comparable search and the lower confidence is disclosed.
- Do not show "sample", "demo case", "internal dataset" or similar language in the customer report.
- Do not allow old historical sales to pull down a current estimate unless the history is explicitly part of a trend model.

## Static Demo Limitation

The static website can only demonstrate the workflow using curated public evidence that has already been added to the app. A production version needs a backend valuation API so that every new customer address can trigger live public-data collection and comparable-sales analysis.
