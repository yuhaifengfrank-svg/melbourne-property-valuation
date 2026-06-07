# Comparable Research Collector

## Purpose

The Comparable Research Collector is a backend research tool for one property address at a time. It is not a bulk scraping database.

Its job is to:

- parse the customer address;
- verify the actual locality before any price research;
- generate public-source research links;
- fetch accessible public pages when allowed;
- extract visible sold-price signals where possible;
- keep every source URL and source status;
- return comparable candidates, confidence and missing checks to the valuation model.

## Core rule

No unsupported comparable should enter the valuation model.

Hard rules:

- Map/locality verification happens before comparable research.
- The verified standard address overrides a conflicting suburb typed by the customer.
- No source URL, no formal comparable.
- No verified sold price, no price anchor.
- If same-street evidence is insufficient, expand radius and lower confidence.
- Suburb median or area average is a low-confidence fallback only.

## Search levels

| Level | Search scope | Use |
|---|---|---|
| L0 | Subject address and locality verification | Google Maps, council/locality evidence and property profile links |
| L1 | Same address / same building / same complex | Strongest direct evidence |
| L2 | Same street same-type sold records | Highest priority for house valuation |
| L3 | 500m same-type sold records | Expand when L1/L2 are insufficient |
| L4 | 1km same-type sold records | Medium confidence if enough matches |
| L5 | 2km same-type sold records | Lower confidence |
| L6 | 3km same-type sold records | Low to low-medium confidence |
| L7 | Suburb median / area average | Fallback context only |

## Sources in the first version

- Google Maps address verification link.
- realestate.com.au property and sold-listing links.
- Domain sold-listing links.
- property.com.au property profile/search links.
- Google search links for local agent sold results.
- Google search links for suburb market reports.
- Google search links for ABS QuickStats.

The tool records whether each source is:

- `link-only`: source link generated but not fetched;
- `not-fetched`: fetch disabled for planning or dry-run mode;
- `fetched`: public page fetched and visible price signals found;
- `no-price-found`: public page fetched but no useful sold-price signal found;
- `unavailable`: fetch failed, blocked, timed out or unavailable.

## Address-first workflow

The collector keeps both:

- `enteredAddress` and `enteredSuburb`: exactly what the customer supplied;
- `address`, `suburb`, `postcode` and `council`: the verified standard locality used by all later searches.

Example:

```text
Entered: 18 Example Street, Exampleville VIC 3000
Verified: pending external address verification
Council: pending authoritative lookup
```

The collector does not contain address-specific corrections. Any locality correction must
come from a current authoritative address or map source and retain its source URL.

## Current implementation

Files:

- `lib/comparable-research-collector.js`: core collector module.
- `collect-comparables.mjs`: command-line runner.
- `api/valuation.js`: Vercel serverless API wrapper.
- `comparable-collector-test.mjs`: local tests.

CLI example:

```bash
node collect-comparables.mjs \
  --address "22 Lancaster Street Bentleigh East VIC 3165" \
  --type House \
  --suburb "Bentleigh East" \
  --state VIC \
  --no-fetch \
  --pretty
```

API request:

```json
{
  "address": "22 Lancaster Street Bentleigh East VIC 3165",
  "suburb": "Bentleigh East",
  "state": "VIC",
  "propertyType": "House",
  "fetch": true
}
```

API response includes:

- `subject`
- `searchPlan`
- `sourceResults`
- `priceSignals`
- `estimate`
- `sourceScore`
- `confidence`
- `missingChecks`
- `rules`

## Important limitation

Some public websites may block automated access, require JavaScript rendering, hide sold prices, or display price-withheld records. The collector must not pretend it has data when it does not.

When no visible verified sold-price signal is found, the collector returns:

```json
{
  "status": "needs-more-data",
  "value": "No verified price range yet",
  "midpoint": "Unavailable",
  "confidence": "Low"
}
```

## Next technical step

The next step is to improve source-specific extraction after reviewing real returned pages:

- parse Domain sold cards;
- parse realestate.com.au sold cards;
- parse property.com.au profile pages;
- detect price-withheld records;
- attach distance once geocoding is added;
- score comparable quality by same address, same street, radius, type, date and source cross-check count.
