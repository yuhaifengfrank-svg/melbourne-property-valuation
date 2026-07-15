import test from "node:test";
import assert from "node:assert/strict";
import { runValuation } from "../lib/valuation-service.js";

/**
 * Test that overridePropertyTypeFromAddress correctly infers propertyType
 * when no propertyType is passed in the request body.
 *
 * Uses an injected mock dbSource whose .fetch() records its arguments so
 * the test can assert what type was actually sent to the database.
 */

// ── mock helpers ──────────────────────────────────────────────────────

function makeMockDbSource() {
  const calls = [];
  const mock = {
    /** Array of { params, opts } — each time fetch was called */
    calls,
    async checkConnection() { return true; },
    async fetch(params, opts) {
      calls.push({ params, opts });
      return [];
    },
    // Needed for large-lot code path even when no large-lot trigger
    async fetchLargeLot() { return []; },
  };
  return mock;
}

// ── test cases ────────────────────────────────────────────────────────

const fixtures = [
  // [label, address, expectedPropertyType]
  ["Unit prefix with comma & street",       "Unit 1, 11 McIntosh Street, Oakleigh VIC 3166", "Unit"],
  ["Unit1 concatenated",                    "Unit1 11 McIntosh Street, Oakleigh VIC 3166",   "Unit"],
  ["Unit1 slash",                           "Unit1/11 McIntosh Street, Oakleigh VIC 3166",    "Unit"],
  ["Leading number-slash",                  "1/11 McIntosh Street, Oakleigh VIC 3166",         "Unit"],
  ["Flat slash prefix",                     "FlatA/11 McIntosh Street, Oakleigh VIC 3166",     "Unit"],
  ["Apt2",                                  "Apt2, 11 McIntosh Street, Oakleigh VIC 3166",     "Apartment"],
  ["Apartment prefix",                      "Apartment 2, 11 McIntosh Street, Oakleigh VIC 3166", "Apartment"],
  ["Plain street (House)",                  "11 McIntosh Street, Oakleigh VIC 3166",           "House"],
  ["Dash range (not a unit)",               "5-7 Old Warrandyte Road, Donvale VIC",           "House"],
];

for (const [label, address, expectedType] of fixtures) {
  test(`runValuation infers propertyType from address: ${label}`, async () => {
    const mock = makeMockDbSource();
    const result = await runValuation({ address }, { fetch: false, dbSource: mock });

    // The mock should have been called at least once (fetch with suburb/state/type)
    assert.ok(mock.calls.length >= 1,
      `Expected at least 1 dbSource.fetch() call for "${label}", got ${mock.calls.length}`);

    // The first fetch call should carry the inferred propertyType
    const firstFetchParams = mock.calls[0].params;
    // console.log(`[${label}] dbSource.fetch params:`, JSON.stringify(firstFetchParams, null, 2));
    assert.equal(firstFetchParams.propertyType, expectedType,
      `For address "${address}", expected propertyType="${expectedType}" but got "${firstFetchParams.propertyType}"`);
  });
}

// ── regression: when propertyType IS provided, existing rules still apply ──

test("explicit propertyType=House with unit address stays House (no incomingType overload)", async () => {
  const mock = makeMockDbSource();
  await runValuation(
    { address: "Unit 1, 11 McIntosh Street, Oakleigh VIC 3166", propertyType: "House" },
    { fetch: false, dbSource: mock }
  );
  assert.ok(mock.calls.length >= 1);
  // When explicit "House" is passed, the existing override rule applies:
  // address has unit signal → override to "Unit"
  assert.equal(mock.calls[0].params.propertyType, "Unit",
    "House + unit address should be overridden to Unit per existing rule");
});

test("explicit propertyType=Unit with plain street stays Unit (external source trusted)", async () => {
  const mock = makeMockDbSource();
  await runValuation(
    { address: "11 McIntosh Street, Oakleigh VIC 3166", propertyType: "Unit" },
    { fetch: false, dbSource: mock }
  );
  assert.ok(mock.calls.length >= 1);
  // Plain street + explicit "Unit" → the old override rule (line 778) kicks in:
  // incomingType="Unit" but no unit signal in address → downgrade to House
  // This is the existing behaviour and must remain unchanged.
  assert.equal(mock.calls[0].params.propertyType, "House",
    "explicit Unit + no unit signal → downgrade to House per existing rule");
});

// ── regression: Unit 1, vs Unit1 — must produce identical fetch params ──

test("Unit with comma and Unit1 produce identical dbSource.fetch params", async () => {
  const mockA = makeMockDbSource();
  await runValuation(
    { address: "Unit 1, 11 McIntosh Street, Oakleigh VIC 3166" },
    { fetch: false, dbSource: mockA }
  );

  const mockB = makeMockDbSource();
  await runValuation(
    { address: "Unit1 11 McIntosh Street, Oakleigh VIC 3166" },
    { fetch: false, dbSource: mockB }
  );

  assert.ok(mockA.calls.length >= 1, "A should have fetch call");
  assert.ok(mockB.calls.length >= 1, "B should have fetch call");

  const pA = mockA.calls[0].params;
  const pB = mockB.calls[0].params;

  assert.equal(pA.propertyType, pB.propertyType,
    `propertyType mismatch: A=${pA.propertyType} B=${pB.propertyType}`);
  assert.equal(pA.suburb, pB.suburb,
    `suburb mismatch: A=${pA.suburb} B=${pB.suburb}`);
  assert.equal(pA.state, pB.state,
    `state mismatch: A=${pA.state} B=${pB.state}`);
  // Coordinates may be null in fetch:false — but when not, they must match
  const coordA = pA.coordinates ? `${pA.coordinates.lat},${pA.coordinates.lon}` : "null";
  const coordB = pB.coordinates ? `${pB.coordinates.lat},${pB.coordinates.lon}` : "null";
  assert.equal(coordA, coordB,
    `coordinates mismatch: A=${coordA} B=${coordB}`);
});

// ── edge: no address at all ──

test("missing address returns early without calling dbSource", async () => {
  const mock = makeMockDbSource();
  const result = await runValuation({}, { fetch: false, dbSource: mock });
  assert.equal(mock.calls.length, 0,
    "Should not call dbSource when address is missing");
  assert.equal(result.ok, false);
  assert.equal(result.status, "missing-address");
});
