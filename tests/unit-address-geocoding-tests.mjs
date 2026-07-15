import test from "node:test";
import assert from "node:assert/strict";

import { streetAddressForGeocoding } from "../lib/address-geocoding.js";

const cases = [
  ["Unit 1, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Unit 1/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["1/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Apartment 2, 11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
  ["Flat A/11 McIntosh Street, Oakleigh VIC 3166", "11 McIntosh Street, Oakleigh VIC 3166"],
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
