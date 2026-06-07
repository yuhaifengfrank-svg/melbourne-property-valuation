import assert from "node:assert/strict";
import handler from "./api/valuation.js";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    }
  };
}

const noComparableResponse = createResponse();
await handler({
  method: "POST",
  body: {
    address: "18 Example Street, Exampleville VIC 3000",
    suburb: "Exampleville",
    state: "VIC",
    propertyType: "House",
    fetch: false
  }
}, noComparableResponse);

assert.equal(noComparableResponse.statusCode, 200);
const noComparableBody = JSON.parse(noComparableResponse.body);
assert.equal(noComparableBody.subject.suburb, "Exampleville");
assert.equal(noComparableBody.valuation, null);
assert.equal(noComparableBody.estimate.midpointValue, null);

const valuedResponse = createResponse();
await handler({
  method: "POST",
  body: {
    address: "18 Example Street, Exampleville VIC 3000",
    suburb: "Exampleville",
    state: "VIC",
    propertyType: "House",
    fetch: false,
    asOfDate: "2026-06-06",
    annualMarketGrowthRate: 0.02,
    subject: {
      bedrooms: 4,
      bathrooms: 2,
      carSpaces: 2,
      landSize: 530,
      conditionScore: 3,
      microLocationScore: 3
    },
    comparables: [
      {
        address: "Verified Comparable A",
        propertyType: "House",
        salePrice: 1078000,
        saleDate: "2026-05-30",
        distanceMeters: 700,
        bedrooms: 4,
        bathrooms: 2,
        carSpaces: 2,
        landSize: 531,
        conditionScore: 3,
        microLocationScore: 3,
        sourceUrl: "https://source.example/verified-a",
        sourceCount: 2
      },
      {
        address: "Verified Comparable B",
        propertyType: "House",
        salePrice: 950000,
        saleDate: "2026-05-27",
        distanceMeters: 1200,
        bedrooms: 4,
        bathrooms: 1,
        carSpaces: 4,
        landSize: 632,
        conditionScore: 3,
        microLocationScore: 3,
        sourceUrl: "https://source.example/verified-b",
        sourceCount: 2
      },
      {
        address: "Rejected no-source row",
        propertyType: "House",
        salePrice: 1200000,
        saleDate: "2026-05-20",
        distanceMeters: 400
      }
    ]
  }
}, valuedResponse);

assert.equal(valuedResponse.statusCode, 200);
const valuedBody = JSON.parse(valuedResponse.body);
assert.equal(valuedBody.valuation.ok, true);
assert.equal(valuedBody.valuation.acceptedComparables.length, 2);
assert.equal(valuedBody.valuation.rejectedComparables.length, 1);
assert.ok(valuedBody.valuation.estimate.midpoint > 900000);
assert.ok(valuedBody.valuation.estimate.midpoint < 1150000);
assert.ok(valuedBody.valuation.estimate.customerHalfRange <= 0.10);

console.log("Valuation API checks passed.");
