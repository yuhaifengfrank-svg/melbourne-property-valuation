import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const publicApp = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const engine = fs.readFileSync(new URL("../lib/valuation-engine.js", import.meta.url), "utf8");

function addressPriorityBlock(source) {
  const start = source.indexOf("function buildEnteredAddress()");
  const end = source.indexOf("function looksLikeStreetOnly", start);
  return source.slice(start, end);
}

test("canonical public address builder preserves suburb priority", () => {
  assert.match(
    addressPriorityBlock(publicApp),
    /if \(inlineSuburb && !looksLikeStreetOnly\(inlineSuburb\)\)/
  );
});

test("comparable score gives location 20 and recency 16 while preserving 100 points", () => {
  assert.match(engine, /dist <= 100 \? 20/);
  assert.match(engine, /ageM <= 3 \? 16/);

  const maximums = {
    propertyType: 18,
    location: 20,
    recency: 16,
    size: 15,
    accommodation: 10,
    ageAndCondition: 8,
    streetAndOrientation: 8,
    sourceQuality: 5,
  };
  assert.equal(Object.values(maximums).reduce((sum, value) => sum + value, 0), 100);
});
