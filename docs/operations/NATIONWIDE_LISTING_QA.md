# AusHomeValue Nationwide Listing Intake QA

Purpose: use current public listing addresses as real subject-property inputs, then run the valuation model from comparable sold evidence, uploaded evidence, unlock, PDF, lead email and database capture.

This is an operational QA file. It must not be shown on the customer-facing page as address examples. The customer sees a valuation workflow. The system keeps only source, confidence and evidence records needed to explain the estimate.

## Core Flow

1. Customer enters an address.
   - Parse unit / room / lot label where present.
   - Parse street number, street name, suburb, state and postcode if pasted.
   - If pasted address has suburb or state, prefer the pasted address over the dropdown.
   - If dropdown conflicts with pasted state, the pasted address wins and the valuation record flags the conflict.

2. System determines property type.
   - Explicit customer type is used first.
   - Address signals can override a default House chip: `unit`, `apartment`, `apt`, `level`, `1/11`, `1-11`, `Unit 1`, `Lot`.
   - Unit-style addresses must not match detached-house evidence by accident.

3. Target address verification.
   - Use current public listing pages to select a real subject property address.
   - Use Google Maps / street imagery as location and built-form verification only.
   - Do not use a sold property as the subject property.

4. Initial valuation.
   - Use recent same-type comparable sold evidence first.
   - Public authority and government sources are Layer 1 for suburb / planning / demographic context.
   - Major portals such as realestate.com.au and Domain are high-weight commercial sources.
   - Secondary portals and agent pages are lower-weight cross-check sources.

5. Manual evidence revision.
   - Section 32 / contract, title plan, planning notes, photos, inspection notes and street notes can revise confidence and range.
   - Uploaded evidence is not part of the initial automated estimate. It is a second-stage refinement.

6. Unlock, PDF, email and database.
   - Basic estimate is free.
   - Full details and PDF require registration.
   - PDF download requires phone number and contact consent.
   - Same email + same property + same event should not send duplicate notifications.
   - Database stores lead details, property details, event type, visitor region and valuation summary.

## Valuation Weights

House:
- Recent same-type comparable sales: 60%-70%.
- Land / title / planning / dimensions: 15%-20%.
- Micro-location, street quality, access and road condition: 10%-15%.
- Building condition, renovation, orientation and usability: 5%-10%.

Townhouse / Villa:
- Same-type comparable sales, preferably same complex or same street: 60%-70%.
- Title / strata / owners corporation / common property: 10%-15%.
- Position, street frontage, driveway, parking and access: 10%-15%.
- Internal condition, courtyard and privacy: 5%-10%.

Apartment:
- Same-building or same-project comparable sales: 60%-75%.
- Internal area, floor level, aspect, light and layout efficiency: 10%-15%.
- Car space, storage and building amenity: 5%-10%.
- Owners corporation, building defects, cladding and sinking fund risk: 10%-15%.

Commercial:
- Placeholder only. Commercial needs separate income, lease, yield and tenancy-risk modelling.

## Listing Intake Cases

| State | Type | Subject listing address | Listing source | Google Maps check | Initial status |
| --- | --- | --- | --- | --- | --- |
| VIC | House | 62 Beacon Vista, Port Melbourne VIC 3207 | realestate.com.au VIC house listing page | https://www.google.com/maps/search/?api=1&query=62%20Beacon%20Vista%20Port%20Melbourne%20VIC%203207 | Ready for comparable collection |
| VIC | Townhouse | 9A Heywood Street, Ringwood VIC 3134 | realestate.com.au VIC townhouse listing page | https://www.google.com/maps/search/?api=1&query=9A%20Heywood%20Street%20Ringwood%20VIC%203134 | Ready for comparable collection |
| VIC | Apartment | 202/687 Toorak Road, Kooyong VIC 3144 | realestate.com.au VIC unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=202%2F687%20Toorak%20Road%20Kooyong%20VIC%203144 | Ready for comparable collection |
| NSW | House | 21 Tolson Place, Balgownie NSW 2519 | realestate.com.au NSW house listing page | https://www.google.com/maps/search/?api=1&query=21%20Tolson%20Place%20Balgownie%20NSW%202519 | Ready for comparable collection |
| NSW | Townhouse | 10/2-12 Frances Street, Northmead NSW 2152 | realestate.com.au NSW townhouse listing page | https://www.google.com/maps/search/?api=1&query=10%2F2-12%20Frances%20Street%20Northmead%20NSW%202152 | Ready for comparable collection |
| NSW | Apartment | 110/517 Pittwater Road, Brookvale NSW 2100 | realestate.com.au NSW unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=110%2F517%20Pittwater%20Road%20Brookvale%20NSW%202100 | Ready for comparable collection |
| QLD | House | 13 Freshwater Creek Road, Mango Hill QLD 4509 | realestate.com.au QLD house listing page | https://www.google.com/maps/search/?api=1&query=13%20Freshwater%20Creek%20Road%20Mango%20Hill%20QLD%204509 | Ready for comparable collection |
| QLD | Townhouse | 74/391 Belmont Road, Belmont QLD 4153 | realestate.com.au QLD townhouse listing page | https://www.google.com/maps/search/?api=1&query=74%2F391%20Belmont%20Road%20Belmont%20QLD%204153 | Ready for comparable collection |
| QLD | Apartment | WHA CA002/14 Resort Drive, Hamilton Island QLD 4803 | realestate.com.au QLD unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=WHA%20CA002%2F14%20Resort%20Drive%20Hamilton%20Island%20QLD%204803 | Ready for comparable collection |
| WA | House | 5 Harrod Street, Willagee WA 6156 | realestate.com.au WA house listing page | https://www.google.com/maps/search/?api=1&query=5%20Harrod%20Street%20Willagee%20WA%206156 | Ready for comparable collection |
| WA | Townhouse | 2/1 King Edward Street, South Perth WA 6151 | realestate.com.au WA townhouse listing page | https://www.google.com/maps/search/?api=1&query=2%2F1%20King%20Edward%20Street%20South%20Perth%20WA%206151 | Ready for comparable collection |
| WA | Apartment | 417/263 Hay Street, Subiaco WA 6008 | realestate.com.au WA unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=417%2F263%20Hay%20Street%20Subiaco%20WA%206008 | Ready for comparable collection |
| SA | House | 16 Florence Street, Murray Bridge SA 5253 | realestate.com.au SA house listing page | https://www.google.com/maps/search/?api=1&query=16%20Florence%20Street%20Murray%20Bridge%20SA%205253 | Ready for comparable collection |
| SA | Townhouse | D3/2 Richardson Avenue, Tranmere SA 5073 | realestate.com.au SA townhouse listing page | https://www.google.com/maps/search/?api=1&query=D3%2F2%20Richardson%20Avenue%20Tranmere%20SA%205073 | Ready for comparable collection |
| SA | Apartment | 406/14 Gilbert Street, Adelaide SA 5000 | realestate.com.au SA apartment listing page | https://www.google.com/maps/search/?api=1&query=406%2F14%20Gilbert%20Street%20Adelaide%20SA%205000 | Ready for comparable collection |
| TAS | House | 54 McKinly Street, Midway Point TAS 7171 | realestate.com.au TAS house listing page | https://www.google.com/maps/search/?api=1&query=54%20McKinly%20Street%20Midway%20Point%20TAS%207171 | Ready for comparable collection |
| TAS | Townhouse | 4/35 Lower Road, New Norfolk TAS 7140 | realestate.com.au TAS townhouse listing page | https://www.google.com/maps/search/?api=1&query=4%2F35%20Lower%20Road%20New%20Norfolk%20TAS%207140 | Ready for comparable collection |
| TAS | Apartment | 56/1 Collins Street, Hobart TAS 7000 | realestate.com.au Hobart unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=56%2F1%20Collins%20Street%20Hobart%20TAS%207000 | Ready for comparable collection |
| ACT | House | 49 Kitchener Street, Hughes ACT 2605 | realestate.com.au ACT house listing page | https://www.google.com/maps/search/?api=1&query=49%20Kitchener%20Street%20Hughes%20ACT%202605 | Ready for comparable collection |
| ACT | Townhouse | 9/49 Fullston Way, Holt ACT 2615 | realestate.com.au ACT townhouse listing page | https://www.google.com/maps/search/?api=1&query=9%2F49%20Fullston%20Way%20Holt%20ACT%202615 | Ready for comparable collection |
| ACT | Apartment | 203/100 Northbourne Avenue, Braddon ACT 2612 | realestate.com.au ACT unit/apartment listing page | https://www.google.com/maps/search/?api=1&query=203%2F100%20Northbourne%20Avenue%20Braddon%20ACT%202612 | Ready for comparable collection |
| NT | House | 18 Providence Court, Katherine NT 0850 | realestate.com.au NT house listing page | https://www.google.com/maps/search/?api=1&query=18%20Providence%20Court%20Katherine%20NT%200850 | Ready for comparable collection |
| NT | Townhouse | 3/8 Annear Court, Stuart Park NT 0820 | realestate.com.au NT townhouse listing page | https://www.google.com/maps/search/?api=1&query=3%2F8%20Annear%20Court%20Stuart%20Park%20NT%200820 | Ready for comparable collection |
| NT | Apartment | 704/31 Woods Street, Darwin City NT 0800 | realestate.com.au NT apartment listing page | https://www.google.com/maps/search/?api=1&query=704%2F31%20Woods%20Street%20Darwin%20City%20NT%200800 | Ready for comparable collection |

## QA Completion Criteria

Each case is complete only when:
- The address parser returns the correct unit, street, suburb and state.
- The selected property type matches the listing built form.
- Google Maps verification link opens to the intended address or requires manual map confirmation.
- At least three recent same-type comparable sales are attached, or confidence is automatically reduced.
- Initial valuation range is generated from comparable evidence.
- Uploaded evidence changes confidence or range where appropriate.
- Registration unlock works.
- PDF requires phone and consent.
- PDF is generated as a PDF blob.
- Lead database record is created.
- Notification email is sent once only for the same email + address + event.
- Mobile layout passes the same flow.
