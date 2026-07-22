import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBuildingPermitRow, aggregateResidentialPermitSupply } from "../lib/building-permit-normalizer.js";

test("normalizes official-style field names without depending on column order", () => {
  const row = normalizeBuildingPermitRow({
    "Permit Number": "BP-1", Municipality: "Monash", Suburb: "Oakleigh", Postcode: "3166",
    "Issue Date": "2025-10-01", "Nature of Work": "Construct two new dwellings",
    "Number of Dwellings": "2", "Estimated Cost": "$800,000",
  });
  assert.equal(row.suburb, "OAKLEIGH");
  assert.equal(row.newDwellings, 2);
  assert.equal(row.estimatedCost, 800000);
  assert.equal(row.quality, "reported");
});

test("does not count a non-residential alteration as dwelling supply", () => {
  const result = aggregateResidentialPermitSupply([{ Council: "Monash", Suburb: "Oakleigh", "Issue Date": "2025-06-01", Description: "Alter office fitout" }], { suburb: "Oakleigh" });
  assert.equal(result.newDwellings, 0);
  assert.equal(result.excludedRows, 1);
});

test("keeps inferred dwelling counts visibly separate", () => {
  const result = aggregateResidentialPermitSupply([{ LGA: "Monash", Locality: "Oakleigh", "Date Issued": "2025-06-01", Description: "Construct new residential dwelling" }], { suburb: "Oakleigh" });
  assert.equal(result.newDwellings, 1);
  assert.equal(result.inferredDwellingRows, 1);
  assert.equal(result.reportedDwellingRows, 0);
});

test("filters by suburb and period", () => {
  const rows = [
    { LGA: "Monash", Suburb: "Oakleigh", "Issue Date": "2025-02-01", Description: "New dwelling", "New Dwellings": 1 },
    { LGA: "Monash", Suburb: "Clayton", "Issue Date": "2025-02-01", Description: "New dwelling", "New Dwellings": 4 },
    { LGA: "Monash", Suburb: "Oakleigh", "Issue Date": "2024-02-01", Description: "New dwelling", "New Dwellings": 3 },
  ];
  const result = aggregateResidentialPermitSupply(rows, { suburb: "Oakleigh", periodStart: "2025-01-01", periodEnd: "2025-12-31" });
  assert.equal(result.newDwellings, 1);
  assert.equal(result.permitCount, 1);
});

test("normalizes the exact BPC DataVic columns and Excel serial dates", () => {
  const row = normalizeBuildingPermitRow({
    permit_stage_number: 0,
    permit_date: 45677,
    site_town_suburb__c: "Oakleigh",
    site_postcode__c: 3166,
    "Municipal Full Name": "Monash, City of",
    Number_of_New_Dwellings__c: 3,
    Number_of_Dwellings_Demolished__c: 1,
    Total_Estimated_Cost_of_Works__c: 1800000,
    BASIS_Building_Use: "Domestic",
  });
  assert.equal(row.issueDate, "2025-01-20");
  assert.equal(row.permitNumber, null);
  assert.equal(row.permitStageNumber, 0);
  assert.equal(row.suburb, "OAKLEIGH");
  assert.equal(row.postcode, "3166");
  assert.equal(row.newDwellings, 3);
  assert.equal(row.demolishedDwellings, 1);
  assert.equal(row.residentialEvidence, true);
  assert.equal(row.quality, "reported");
});

test("strict filters prevent same-name and adjoining-suburb contamination", () => {
  const common = {
    permit_date: "2025-06-01",
    Number_of_New_Dwellings__c: 2,
    Number_of_Dwellings_Demolished__c: 0,
    BASIS_Building_Use: "Domestic",
  };
  const result = aggregateResidentialPermitSupply([
    { ...common, site_town_suburb__c: "Oakleigh", site_postcode__c: 3166, "Municipal Full Name": "Monash, City of" },
    { ...common, site_town_suburb__c: "Oakleigh South", site_postcode__c: 3167, "Municipal Full Name": "Monash, City of" },
    { ...common, site_town_suburb__c: "Oakleigh", site_postcode__c: 3166, "Municipal Full Name": "Moonee Valley, City of" },
  ], { suburb: "Oakleigh", postcode: "3166", municipality: "Monash", periodStart: "2025-01-01", periodEnd: "2025-12-31" });
  assert.equal(result.matchedPermitCount, 1);
  assert.equal(result.permitCount, 1);
  assert.equal(result.newDwellings, 2);
});

test("counts demolition-only official rows in net supply", () => {
  const result = aggregateResidentialPermitSupply([{
    permit_date: "2025-07-01",
    site_town_suburb__c: "Oakleigh",
    site_postcode__c: 3166,
    "Municipal Full Name": "Monash, City of",
    Number_of_New_Dwellings__c: 0,
    Number_of_Dwellings_Demolished__c: 1,
    BASIS_Building_Use: "Domestic",
  }], { suburb: "Oakleigh" });
  assert.equal(result.permitCount, 1);
  assert.equal(result.netAdditionalDwellings, -1);
});
