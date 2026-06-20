#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../lib/valuation-service.js", import.meta.url), "utf8");

function extractFunctionSource(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} function exists`);
  const braceStart = SOURCE.indexOf("{", start);
  assert.notEqual(braceStart, -1, `${name} body starts`);
  let depth = 0;
  for (let i = braceStart; i < SOURCE.length; i += 1) {
    const ch = SOURCE[i];
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

const overridePropertyTypeFromAddress = new Function(`
  ${extractFunctionSource("overridePropertyTypeFromAddress")}
  return overridePropertyTypeFromAddress;
`)();

test("unit-style address overrides default House to Unit", () => {
  assert.equal(
    overridePropertyTypeFromAddress("unit1 11 McIntosh Street, Oakleigh VIC", "House"),
    "Unit"
  );
  assert.equal(
    overridePropertyTypeFromAddress("Unit 2, 11 McIntosh Street, Oakleigh VIC", "House"),
    "Unit"
  );
  assert.equal(
    overridePropertyTypeFromAddress("2/11 McIntosh Street, Oakleigh VIC", "House"),
    "Unit"
  );
});

test("ordinary house address remains House", () => {
  assert.equal(
    overridePropertyTypeFromAddress("11 McIntosh Street, Oakleigh VIC", "House"),
    "House"
  );
});
