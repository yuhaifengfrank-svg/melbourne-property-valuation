import assert from "node:assert/strict";
import { collectComparableResearch, extractPriceSignals, parsePrice } from "./lib/comparable-research-collector.js";

assert.equal(parsePrice("$1.25m"), 1250000);
assert.equal(parsePrice("$845,000"), 845000);
assert.equal(parsePrice("$920k"), 920000);

const html = `
  <html>
    <body>
      <article>Sold house nearby. Sold for $1.42m in March 2026.</article>
      <article>Rental guide $720 per week should be ignored.</article>
      <article>Another sale result $1,515,000.</article>
    </body>
  </html>
`;
const signals = extractPriceSignals(
  html,
  { source: "Fixture source", kind: "fixture", url: "https://example.com/sold" },
  { level: "L2", label: "Same street same-type sold records" }
);
assert.equal(signals.length, 2);
assert.equal(signals[0].level, "L2");
assert.equal(signals[0].url, "https://example.com/sold");

const planOnly = await collectComparableResearch(
  {
    address: "Unit 2, 11 Example Street Exampleville VIC 3000",
    suburb: "Exampleville",
    state: "VIC",
    propertyType: "House"
  },
  { fetch: false }
);

assert.equal(planOnly.ok, true);
assert.equal(planOnly.mode, "link-plan-only");
assert.equal(planOnly.subject.propertyType, "Unit");
assert.equal(planOnly.subject.state, "VIC");
assert.equal(planOnly.estimate.status, "requires-structured-comparables");
assert.equal(planOnly.estimate.midpointValue, null);
assert.ok(planOnly.searchPlan.some((step) => step.level === "L0"));
assert.ok(planOnly.searchPlan.some((step) => step.level === "L2"));
assert.ok(planOnly.searchPlan.some((step) => step.radiusMeters === 3000));
assert.ok(planOnly.sourceResults.some((source) => source.source === "Google Maps"));
assert.ok(planOnly.sourceResults.some((source) => source.url.includes("domain.com.au")));
assert.ok(planOnly.sourceResults.some((source) => source.url.includes("realestate.com.au")));
assert.ok(planOnly.missingChecks.includes("verified sold price evidence"));
assert.ok(planOnly.rules.includes("No source URL, no formal comparable."));

const unverifiedLocality = await collectComparableResearch(
  {
    address: "18 Example Street, Exampleville VIC 3000",
    suburb: "Exampleville",
    state: "VIC",
    propertyType: "House"
  },
  { fetch: false }
);

assert.equal(unverifiedLocality.subject.enteredAddress, "18 Example Street, Exampleville VIC 3000");
assert.equal(unverifiedLocality.subject.enteredSuburb, "Exampleville");
assert.equal(unverifiedLocality.subject.suburb, "Exampleville");
assert.equal(unverifiedLocality.subject.postcode, "3000");
assert.equal(unverifiedLocality.subject.council, "");
assert.equal(unverifiedLocality.subject.localityStatus, "unverified");
assert.equal(unverifiedLocality.subject.address, "18 Example Street, Exampleville VIC 3000");
assert.equal(unverifiedLocality.subject.localityEvidence.length, 0);

const fakeFetch = async () => ({
  ok: true,
  status: 200,
  text: async () => `
    <html>
      <body>
        <div>Sold result $1.30m</div>
        <div>Comparable sale $1.34m</div>
        <div>Rent $680 per week</div>
      </body>
    </html>
  `
});

const fetched = await collectComparableResearch(
  {
    address: "22 Lancaster Street Bentleigh East VIC 3165",
    suburb: "Bentleigh East",
    state: "VIC",
    propertyType: "House"
  },
  { fetch: true, fetchImpl: fakeFetch }
);

assert.equal(fetched.ok, true);
assert.equal(fetched.mode, "live-public-research");
assert.ok(fetched.priceSignals.length > 0);
assert.equal(fetched.estimate.midpointValue, null);
assert.equal(fetched.estimate.status, "requires-structured-comparables");
assert.ok(fetched.sourceScore > 0);

console.log("Comparable collector checks passed.");
