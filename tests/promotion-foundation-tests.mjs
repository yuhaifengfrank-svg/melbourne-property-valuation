import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildCampaign, publicScoreValue, trackedUrl } from "../scripts/promotion/campaign-core.mjs";

const opportunities = [
  { suburb: "Balwyn", state: "VIC", selectedMedianPrice: 2100000, score: { value: 87, band: "Strong", type: "Balanced Opportunity" } },
  { suburb: "Werribee", state: "VIC", selectedMedianPrice: 650000, score: { value: 82, band: "Strong", type: "Growth Opportunity" } },
];

test("promotion uses only canonical score.value and /100 display", () => {
  assert.equal(publicScoreValue({ score: { value: 87 }, futureOpportunityIndex: 12 }), 87);
  assert.equal(publicScoreValue({ futureOpportunityIndex: 87 }), null);
  const campaign = buildCampaign(opportunities, { date: "2026-07-18", strategy: "balanced" });
  assert.equal(campaign.source.field, "score.value");
  assert.deepEqual(campaign.items.map((item) => item.rank), [1, 2]);
  assert.deepEqual(campaign.items.map((item) => item.scoreDisplay), ["87/100", "82/100"]);
  assert.doesNotMatch(JSON.stringify(campaign.drafts), /87%|82%/);
});

test("every platform remains a draft requiring approval", () => {
  const campaign = buildCampaign(opportunities, { date: "2026-07-18" });
  assert.equal(campaign.publishingEnabled, false);
  assert.equal(campaign.approval.status, "pending");
  assert.equal(Object.keys(campaign.drafts).length, 8);
  for (const draft of Object.values(campaign.drafts)) {
    assert.equal(draft.status, "draft");
    assert.equal(draft.approvalRequired, true);
  }
});

test("each platform link has a complete attribution trail", () => {
  const url = new URL(trackedUrl("/suburb/balwyn-vic.html", {
    platform: "linkedin",
    campaignId: "ahv-balanced-2026-07-18",
    contentId: "balanced-balwyn",
  }));
  assert.equal(url.hostname, "www.aushomevalue.com.au");
  assert.equal(url.searchParams.get("utm_source"), "linkedin");
  assert.equal(url.searchParams.get("utm_medium"), "organic_social");
  assert.ok(url.searchParams.get("utm_campaign"));
  assert.ok(url.searchParams.get("utm_content"));
});

test("missing canonical score fails closed instead of publishing 0/100", () => {
  assert.throws(() => buildCampaign([{ suburb: "Unknown", score: { value: null } }]), /canonical score\.value/);
});

test("draft builder contains no platform publishing or secret access", () => {
  const source = readFileSync(new URL("../scripts/promotion/build-campaign.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Authorization|access[_-]?token|client[_-]?secret|POST\s+https?:/i);
  assert.match(source, /Publishing: disabled; human approval required/);
});
