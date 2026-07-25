import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Suburb Research landing page exposes the verified Oakleigh pilot", async () => {
  const html = await readFile(new URL("../public/suburb-research.html", import.meta.url), "utf8");
  assert.match(html, /先看证据，再判断区域/);
  assert.match(html, /href="\/suburb\/oakleigh-vic\.html"/);
  assert.match(html, /直接事实 \/ Direct facts/);
  assert.match(html, /区域背景 \/ Area context/);
  assert.match(html, /模型估算 \/ Model estimates/);
  assert.doesNotMatch(html, /Opportunity Score|95\/100/);
});

test("Oakleigh SALM publication gate withholds derived employment values", async () => {
  const profile = JSON.parse(await readFile(new URL("../data/validation/oakleigh-validated-metrics.json", import.meta.url), "utf8"));
  assert.equal(profile.facts.employment.employedPersonsPublishable, false);
  assert.equal(profile.facts.employment.employmentGrowthYoYPublishable, false);
  assert.equal(profile.facts.employment.unemploymentRate, 2.4);
  assert.match(profile.facts.employment.note, /should not be derived from SALM/i);
});
