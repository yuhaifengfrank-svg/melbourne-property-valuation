import test from "node:test";
import assert from "node:assert/strict";

import { hasUnitDesignator, streetAddressForGeocoding } from "../lib/address-geocoding.js";

const cases = [
  ["Unit 1, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Unit1, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Unit 1/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Unit1/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["1/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Apt2, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Apartment 2, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Flat A/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["FlatA/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
];

for (const [input, expected] of cases) {
  test(`normalizes geocoding address: ${input}`, () => {
    assert.equal(streetAddressForGeocoding(input), expected);
  });
}

test("does not strip a normal street number followed by a word", () => {
  assert.equal(streetAddressForGeocoding("1 McIntosh Street, Oakleigh VIC 3166"), "1 McIntosh Street, Oakleigh VIC 3166");
});

for (const input of ["Unit 1, 11 McIntosh Street", "Unit1, 11 McIntosh Street", "Unit1/11 McIntosh Street", "1/11 McIntosh Street", "FlatA/11 McIntosh Street"]) {
  test(`detects unit designator: ${input}`, () => {
    assert.equal(hasUnitDesignator(input), true);
  });
}

test("does not classify a normal street address as a unit designator", () => {
  assert.equal(hasUnitDesignator("11 McIntosh Street"), false);
});
