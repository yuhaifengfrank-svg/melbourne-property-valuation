// Test: null/undefined distance produces null not 0
// Verifies that comparables without coordinates get location=5, distW=0.5, not
// treated as if they're within 100m of the subject.

import { describe, it } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const CWD = process.cwd();
const ENGINE = `${CWD}/lib/valuation-engine.js`;

describe("number() helper — null/undefined/empty string", () => {
  const js = readFileSync(ENGINE, "utf-8");
  // Extract the number() function via eval
  const numberSrc = js.match(/function number\(v\)\s*\{[^}]+\}/)?.[0];
  if (!numberSrc) throw new Error("Could not extract number() from source");
  const number = eval(`(${numberSrc})`);

  it("should return null for null input", () => {
    assert.strictEqual(number(null), null,
      "number(null) must return null, not 0");
  });

  it("should return null for undefined input", () => {
    assert.strictEqual(number(undefined), null,
      "number(undefined) must return null");
  });

  it("should return null for empty string", () => {
    assert.strictEqual(number(""), null,
      'number("") must return null');
  });

  it("should return number for valid numeric input", () => {
    assert.strictEqual(number(42), 42);
    assert.strictEqual(number("42"), 42);
    assert.strictEqual(number(0), 0);
  });

  it("should return null for non-numeric string", () => {
    assert.strictEqual(number("abc"), null);
  });
});

describe("scoreComparable — null distance → location=5", () => {
  const js = readFileSync(ENGINE, "utf-8");

  it("should have dist === null ? 5 in scoreComparable location", () => {
    assert.match(js,
      /dist\s*===?\s*null\s*\?\s*5/,
      "scoreComparable location line should check dist === null first");
  });

  it("should have dist === null ? 0.5 in channelAEstimate distW", () => {
    assert.match(js,
      /dist\s*===\s*null\s*\?\s*0\.5\s*:/,
      "channelAEstimate distW should be 0.5 when dist === null");
  });

  it("should have dist === null handling in distAdj (channelA)", () => {
    assert(js.includes('if (dist === null) { distAdj = 1.0; }'),
      "distAdj should set 1.0 when dist === null");
  });
});
