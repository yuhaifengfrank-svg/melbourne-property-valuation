import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildValidatedSuburbPage } from "../scripts/generate-validated-suburb-pages.mjs";

const profile = (name) => JSON.parse(fs.readFileSync(new URL(`../data/validation/${name}-validated-metrics.json`, import.meta.url), "utf8"));

test("Oakleigh page publishes verified facts and removes legacy metrics", () => {
  const html = buildValidatedSuburbPage(profile("oakleigh"));
  for (const expected of ["$1,311,000", "-1.90%", "+3.55%", "+5.04%", "$630/week", "$850/week", "15,326", "+4.67%", "About 1.6%", "Net additional dwellings"]) assert.match(html, new RegExp(expected.replace(/[+$]/g, "\\$&")));
  for (const blocked of ["$1025K", "18.0/100", "Opportunity Score", "9.61%", "Data not available", "sampleSize"]) assert.doesNotMatch(html, new RegExp(blocked.replace(/[.$]/g, "\\$&"), "i"));
  assert.match(html, /Model estimate[^<]*not an observed suburb vacancy rate/i);
});

test("Mount Waverley uses the same template and omits unavailable market fields", () => {
  const html = buildValidatedSuburbPage(profile("mount-waverley"));
  for (const expected of ["35,338", "$2,065/week", "20,910", "+4.68%", "1.56%", "Mount Waverley North and South SA2s", "About 1.6%", "Planning pipeline", "Planning register records", "227", "Unique planning projects", "225", "Proposed dwellings", "176", "161.7"] ) assert.match(html, new RegExp(expected.replace(/[+$]/g, "\\$&")));
  for (const absent of ["Median house price", "3-bedroom house rent", "<h2>Housing supply</h2>", "Data not available", "Opportunity Score"]) assert.doesNotMatch(html, new RegExp(absent, "i"));
  assert.match(html, /not commencements or completions/i);
  assert.match(html, /model indicator; not a physical dwelling count/i);
});

test("only explicitly publishable fields enter structured data", () => {
  const html = buildValidatedSuburbPage(profile("oakleigh"));
  assert.doesNotMatch(html, /planningPipeline2025|incomeCapacity|blockedLegacyMetrics|technicalRange/);
  assert.match(html, /estimatedRentalVacancy/);
});
