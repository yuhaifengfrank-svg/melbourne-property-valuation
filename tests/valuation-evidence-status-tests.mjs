import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadResolver(file) {
  const source = fs.readFileSync(file, "utf8");
  const functionSource = extractFunction(source, "getValuationEvidenceText");
  return vm.runInNewContext(`(${functionSource})`);
}

for (const file of ["public/app.js", "app.js"]) {
  test(`${file}: model-based estimate is not reported as a failure`, () => {
    const resolve = loadResolver(file);
    const text = resolve({ customerDataStatus: "model_based", midpointValue: 718200 }, "en");

    assert.match(text, /Model-based estimate/);
    assert.doesNotMatch(text, /Unable to generate valuation/);
  });

  test(`${file}: valid estimate with an unknown status fails safe to model-based copy`, () => {
    const resolve = loadResolver(file);
    const text = resolve({ customerDataStatus: "future_status", midpointValue: 718200 }, "en");

    assert.match(text, /Model-based estimate/);
    assert.doesNotMatch(text, /Unable to generate valuation/);
  });

  test(`${file}: unknown status without an estimate can report failure`, () => {
    const resolve = loadResolver(file);
    const text = resolve({ customerDataStatus: "future_status", midpointValue: null }, "en");

    assert.equal(text, "✗ Unable to generate valuation");
  });
}
