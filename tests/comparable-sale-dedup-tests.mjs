import test from "node:test";
import assert from "node:assert/strict";

import { deduplicateSaleRows } from "../lib/db-comparable-source.js";
import { valueProperty } from "../lib/valuation-engine.js";

test("deduplicateSaleRows merges one transaction across address variants and sources", () => {
  const rows = [
    {
      id: 1,
      sale_address: "7/8 Willgilson Court",
      suburb: "Oakleigh",
      state: "VIC",
      postcode: "3166",
      sale_date: "2026-05-11",
      sale_price: "1090100",
      property_type: "Townhouse",
      bedrooms: null,
      bathrooms: null,
      source_name: "realestate.com.au",
      verification_status: "single_source_observed"
    },
    {
      id: 2,
      sale_address: "7/8 Willgilson Court,\u00a0Oakleigh",
      suburb: "Oakleigh",
      state: "VIC",
      postcode: "3166",
      sale_date: "2026-05-11",
      sale_price: "1090100",
      property_type: "Townhouse",
      bedrooms: 3,
      bathrooms: 2,
      car_spaces: 2,
      source_name: "domain.com.au",
      verification_status: "single_source_observed"
    },
    {
      id: 3,
      sale_address: "7/8 Willgilson Court",
      suburb: "Oakleigh",
      state: "VIC",
      postcode: "3166",
      sale_date: "2024-04-20",
      sale_price: "900000",
      property_type: "Townhouse",
      source_name: "domain.com.au",
      verification_status: "single_source_observed"
    }
  ];

  const result = deduplicateSaleRows(rows);

  assert.equal(result.length, 2);
  assert.equal(result[0].bedrooms, 3);
  assert.equal(result[0].bathrooms, 2);
  assert.equal(result[0]._source_count, 2);
  assert.equal(result[0].verification_status, "cross_source_verified");
  assert.deepEqual(new Set(result[0]._source_names), new Set(["realestate.com.au", "domain.com.au"]));
});

test("Unit accepts Townhouse and Villa but rejects Apartment", () => {
  const comparables = [
    ["Unit", "1/10 Example Street", 610000],
    ["Townhouse", "2/10 Example Street", 720000],
    ["Villa", "3/10 Example Street", 680000],
    ["Apartment", "4/10 Example Street", 590000]
  ].map(([propertyType, address, salePrice], index) => ({
    address,
    propertyType,
    salePrice,
    saleDate: `2026-0${index + 1}-15`,
    bedrooms: 2,
    bathrooms: 1,
    carSpaces: 1,
    verificationStatus: "single_source_observed",
    sourceName: "test-source"
  }));

  const result = valueProperty({
    subject: {
      address: "2/11 McIntosh Street, Oakleigh VIC 3166",
      propertyType: "Unit",
      bedrooms: 2,
      bathrooms: 1,
      carSpaces: 1
    },
    comparables,
    asOfDate: "2026-06-28",
    annualMarketGrowthRate: 0
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    new Set(result.acceptedComparables.map((row) => row.propertyType)),
    new Set(["Unit", "Townhouse", "Villa"])
  );
  assert.equal(
    result.rejectedComparables.find((row) => row.address === "4/10 Example Street")?.reasons.includes("incompatible-property-type"),
    true
  );
});
