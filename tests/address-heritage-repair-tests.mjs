import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { checkHeritage } from "../lib/heritage-service.js";

const valuationSource = readFileSync(new URL("../lib/valuation-service.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../api/valuation.js", import.meta.url), "utf8");
const leadApiSource = readFileSync(new URL("../api/valuation-lead.js", import.meta.url), "utf8");
const snapshotSource = readFileSync(new URL("../lib/report-snapshot-service.js", import.meta.url), "utf8");

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} function exists`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body did not close`);
}

const overridePropertyTypeFromAddress = new Function(`
  ${extractFunctionSource(valuationSource, "overridePropertyTypeFromAddress")}
  return overridePropertyTypeFromAddress;
`)();

test("hyphenated addresses use property-type context", () => {
  assert.equal(
    overridePropertyTypeFromAddress("5-7 Old Warrandyte Road, Donvale VIC", "House"),
    "House"
  );
  assert.equal(
    overridePropertyTypeFromAddress("2-11 McIntosh Street, Oakleigh VIC", "Unit"),
    "Unit"
  );
  assert.equal(
    overridePropertyTypeFromAddress("2-11 McIntosh Street, Oakleigh VIC", "House"),
    "House"
  );
});

test("frontend only infers the narrow supported hyphen-unit shorthand", () => {
  const shouldInterpret = new Function(`
    ${extractFunctionSource(appSource, "shouldInterpretHyphenAsUnit")}
    return shouldInterpretHyphenAsUnit;
  `)();

  assert.equal(shouldInterpret("2-11 McIntosh Street", "", true), true);
  assert.equal(shouldInterpret("5-7 Old Warrandyte Road", "", true), false);
  assert.equal(shouldInterpret("5-11 Example Road", "Unit", false), true);
  assert.equal(shouldInterpret("2-4 Example Road", "House", false), false);
});

test("Heritage combines exact HO and VHR query results", async () => {
  const sql = {
    async query(text) {
      if (text.includes("vicplan_overlays")) {
        return { rows: [{ zone_code: "HO12", zone_description: "Heritage Overlay" }] };
      }
      if (text.includes("vhr_zones")) {
        return { rows: [{ vhr_num: "H1234", site_name: "Example Residence" }] };
      }
      return { rows: [] };
    }
  };

  const result = await checkHeritage(sql, -37.9, 145.1, null);
  assert.equal(result.flagged, true);
  assert.deepEqual(result.sources, ["HO", "VHR"]);
  assert.equal(result.discount, -0.20);
  assert.equal(result.details.length, 2);
});

test("Heritage supports the Neon tagged-template client", async () => {
  const sql = async (strings) => {
    const text = strings.join("?");
    if (text.includes("vhr_zones")) return [{ vhr_num: "H9", site_name: "Tagged Client Site" }];
    return [];
  };
  const result = await checkHeritage(sql, -37.9, 145.1, { ok: true, overlays: [] });
  assert.equal(result.flagged, true);
  assert.deepEqual(result.sources, ["VHR"]);
});

test("valuation chain applies the approved 20 percent Heritage discount", async () => {
  const { runValuation } = await import("../lib/valuation-service.js");
  const comparables = [
    { address: "1 Example St, Test VIC", suburb: "Test", state: "VIC", salePrice: 900000, saleDate: "2025-09-01", propertyType: "House", bedrooms: 3, bathrooms: 2, carSpaces: 1, landSize: 500, distanceMeters: 500, verificationStatus: "cross_source_verified", sourceCount: 2 },
    { address: "2 Example St, Test VIC", suburb: "Test", state: "VIC", salePrice: 1000000, saleDate: "2025-10-01", propertyType: "House", bedrooms: 3, bathrooms: 2, carSpaces: 1, landSize: 520, distanceMeters: 700, verificationStatus: "cross_source_verified", sourceCount: 2 },
    { address: "3 Example St, Test VIC", suburb: "Test", state: "VIC", salePrice: 1100000, saleDate: "2025-11-01", propertyType: "House", bedrooms: 3, bathrooms: 2, carSpaces: 1, landSize: 510, distanceMeters: 900, verificationStatus: "cross_source_verified", sourceCount: 2 },
  ];
  const dbSource = {
    async checkConnection() { return true; },
    async fetch() { return comparables; },
    async fetchLargeLot() { return []; },
  };
  const emptySql = { async query() { return { rows: [] }; } };
  const heritageSql = {
    async query(text) {
      if (text.includes("vicplan_overlays")) {
        return { rows: [{ zone_code: "HO1", zone_description: "Heritage Overlay" }] };
      }
      return { rows: [] };
    }
  };
  const input = {
    address: "10 Example Street, Test VIC",
    suburb: "Test",
    state: "VIC",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    coordinates: { lat: -37.9, lon: 145.1 },
  };

  const baseline = await runValuation(input, { fetch: false, dbSource, sql: emptySql });
  const heritage = await runValuation(input, { fetch: false, dbSource, sql: heritageSql });
  assert.ok(baseline.valuation?.estimate?.midpoint);
  assert.equal(
    heritage.valuation.estimate.midpoint,
    Math.round(baseline.valuation.estimate.midpoint * 0.8)
  );
  assert.equal(heritage.heritage.discountPercent, 20);
  assert.ok(heritage.valuation.estimate.factorAdjustments.some((item) => item.name === "heritageDiscount"));
});

test("Heritage output is propagated and rendered without innerHTML", () => {
  assert.match(apiSource, /heritage:\s*fullResult\.heritage\s*\|\|\s*null/);
  assert.match(leadApiSource, /heritage:\s*result\.heritage\s*\|\|\s*null/);
  assert.match(snapshotSource, /heritage:\s*fullResult\.heritage\s*\|\|\s*null/);
  const renderer = extractFunctionSource(appSource, "renderHeritageWarning");
  assert.doesNotMatch(renderer, /innerHTML/);
  assert.match(renderer, /textContent/);
});

test("Heritage renderer treats database names as text, not markup", () => {
  const dom = new JSDOM('<div id="heritage-warning"></div>');
  const renderer = new Function("document", `
    ${extractFunctionSource(appSource, "renderHeritageWarning")}
    return renderHeritageWarning;
  `)(dom.window.document);
  const container = dom.window.document.getElementById("heritage-warning");
  renderer(container, {
    flagged: true,
    sources: ["VHR"],
    discountPercent: 20,
    details: [{ code: "H1", name: '<img src=x onerror="alert(1)">' }],
  }, "en");

  assert.equal(container.querySelector("img"), null);
  assert.match(container.textContent, /<img src=x/);
  assert.match(container.textContent, /20%/);
});
