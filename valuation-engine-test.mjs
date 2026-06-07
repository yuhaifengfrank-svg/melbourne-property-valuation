import assert from "node:assert/strict";
import { valueProperty, valuationModelDefaults } from "./lib/valuation-engine.js";

const source = (slug) => `https://example.com/verified-sale/${slug}`;

const house = valueProperty({
  asOfDate: "2026-06-06",
  annualMarketGrowthRate: 0.03,
  subject: {
    address: "57 Churchill Drive, Winston Hills NSW 2153",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 651,
    conditionScore: 3,
    microLocationScore: 3,
    streetQualityScore: 3,
    planningScore: 3,
    riskScore: 2
  },
  comparables: [
    {
      address: "16 Mangalore Drive, Winston Hills NSW",
      propertyType: "House",
      salePrice: 1400000,
      saleDate: "2026-05-01",
      distanceMeters: 850,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      landSize: 670,
      conditionScore: 3,
      microLocationScore: 3,
      streetQualityScore: 3,
      planningScore: 3,
      riskScore: 2,
      sourceUrl: source("mangalore"),
      sourceCount: 2
    },
    {
      address: "30 Lloyd George Avenue, Winston Hills NSW",
      propertyType: "House",
      salePrice: 1731000,
      saleDate: "2026-05-02",
      distanceMeters: 1200,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      landSize: 700,
      conditionScore: 4,
      microLocationScore: 3,
      streetQualityScore: 3,
      planningScore: 3,
      riskScore: 2,
      sourceUrl: source("lloyd-george-30"),
      sourceCount: 2
    },
    {
      address: "22 Tennyson Street, Winston Hills NSW",
      propertyType: "House",
      salePrice: 1675000,
      saleDate: "2026-04-02",
      distanceMeters: 1700,
      bedrooms: 3,
      bathrooms: 1,
      carSpaces: 2,
      landSize: 556,
      conditionScore: 3,
      microLocationScore: 3,
      streetQualityScore: 3,
      planningScore: 3,
      riskScore: 2,
      sourceUrl: source("tennyson"),
      sourceCount: 1
    },
    {
      address: "Invalid listing",
      propertyType: "House",
      salePrice: 1800000,
      saleDate: "2026-05-02",
      distanceMeters: 300,
      listingPrice: true,
      sourceUrl: ""
    }
  ]
});

assert.equal(house.ok, true);
assert.equal(house.acceptedComparables.length, 3);
assert.equal(house.rejectedComparables.length, 1);
assert.equal(house.statisticalIntervals.sigma, 0.05);
assert.ok(house.estimate.midpoint > 1400000);
assert.ok(house.estimate.midpoint < 1800000);
assert.ok(house.estimate.customerHalfRange <= 0.10);
assert.ok(house.acceptedComparables.every((row) => row.sourceUrl.startsWith("https://")));
assert.ok(house.acceptedComparables.every((row) => Math.abs(row.adjustments.total) <= 0.15));

const townhouse = valueProperty({
  asOfDate: "2026-06-06",
  subject: {
    address: "48/26 Yaun Street, Coomera QLD 4209",
    propertyType: "Townhouse",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    internalArea: 124,
    outdoorArea: 17,
    conditionScore: 4,
    buildingPositionScore: 3,
    bodyCorporateScore: 3
  },
  comparables: [
    {
      address: "6/23 Park Esplanade, Coomera QLD",
      propertyType: "Townhouse",
      salePrice: 885000,
      saleDate: "2026-03-10",
      distanceMeters: 900,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 1,
      internalArea: 128,
      conditionScore: 4,
      buildingPositionScore: 3,
      bodyCorporateScore: 3,
      sourceUrl: source("park-esplanade"),
      sourceCount: 2
    },
    {
      address: "72/60 Beattie Road, Coomera QLD",
      propertyType: "Townhouse",
      salePrice: 830000,
      saleDate: "2026-02-02",
      distanceMeters: 1300,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      internalArea: 126,
      conditionScore: 3,
      buildingPositionScore: 3,
      bodyCorporateScore: 3,
      sourceUrl: source("beattie"),
      sourceCount: 2
    },
    {
      address: "38/31 Jotown Drive, Coomera QLD",
      propertyType: "Townhouse",
      salePrice: 775000,
      saleDate: "2025-09-01",
      distanceMeters: 2200,
      bedrooms: 3,
      bathrooms: 2,
      carSpaces: 2,
      internalArea: 144,
      conditionScore: 3,
      buildingPositionScore: 2,
      bodyCorporateScore: 3,
      sourceUrl: source("jotown"),
      sourceCount: 1
    }
  ]
});

assert.equal(townhouse.ok, true);
assert.equal(townhouse.statisticalIntervals.sigma, 0.045);
assert.ok(townhouse.estimate.midpoint > 750000 && townhouse.estimate.midpoint < 900000);

const apartment = valueProperty({
  asOfDate: "2026-06-06",
  subject: {
    address: "706/105 Stirling Street, Perth WA 6000",
    propertyType: "Apartment",
    bedrooms: 1,
    bathrooms: 1,
    carSpaces: 1,
    internalArea: 49,
    floorLevel: 7,
    viewScore: 3,
    buildingPositionScore: 3,
    bodyCorporateScore: 3
  },
  comparables: [
    {
      address: "86/101 Murray Street, Perth WA",
      propertyType: "Apartment",
      salePrice: 578000,
      saleDate: "2026-05-21",
      distanceMeters: 650,
      bedrooms: 1,
      bathrooms: 1,
      carSpaces: 1,
      internalArea: 72,
      floorLevel: 8,
      viewScore: 3,
      buildingPositionScore: 3,
      bodyCorporateScore: 3,
      sourceUrl: source("murray-86"),
      sourceCount: 2
    },
    {
      address: "9/838 Hay Street, Perth WA",
      propertyType: "Unit",
      salePrice: 550000,
      saleDate: "2026-05-19",
      distanceMeters: 1100,
      bedrooms: 1,
      bathrooms: 1,
      carSpaces: 1,
      internalArea: 52,
      floorLevel: 2,
      viewScore: 2,
      buildingPositionScore: 3,
      bodyCorporateScore: 3,
      sourceUrl: source("hay-9"),
      sourceCount: 2
    },
    {
      address: "817/305 Murray Street, Perth WA",
      propertyType: "Apartment",
      salePrice: 450000,
      saleDate: "2026-05-18",
      distanceMeters: 1200,
      bedrooms: 1,
      bathrooms: 1,
      carSpaces: 0,
      internalArea: 49,
      floorLevel: 8,
      viewScore: 2,
      buildingPositionScore: 2,
      bodyCorporateScore: 3,
      sourceUrl: source("murray-817"),
      sourceCount: 1
    }
  ]
});

assert.equal(apartment.ok, true);
assert.equal(apartment.statisticalIntervals.sigma, 0.035);
assert.ok(apartment.estimate.midpoint > 450000 && apartment.estimate.midpoint < 600000);
assert.equal(valuationModelDefaults.maxCustomerRange, 0.10);

const unsupported = valueProperty({
  subject: { propertyType: "House", bedrooms: 3 },
  comparables: [{ salePrice: 1000000, saleDate: "2026-01-01", propertyType: "House" }]
});
assert.equal(unsupported.ok, false);
assert.equal(unsupported.status, "insufficient-verifiable-comparables");

console.log("Independent valuation engine checks passed.");
