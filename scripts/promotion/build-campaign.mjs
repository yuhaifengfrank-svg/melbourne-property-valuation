#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCampaign } from "./campaign-core.mjs";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const strategy = argument("--strategy", "balanced");
const inputPath = argument("--input");
const outputDir = resolve(argument("--output", `output/promotion/${new Date().toISOString().slice(0, 10)}-${strategy}`));

async function loadOpportunities() {
  if (inputPath) {
    const parsed = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.opportunities;
  }
  const url = new URL("https://www.aushomevalue.com.au/api/opportunity");
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("maxResults", "5");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Opportunity API returned HTTP ${response.status}`);
  const payload = await response.json();
  return payload.opportunities;
}

const opportunities = await loadOpportunities();
const campaign = buildCampaign(opportunities, { strategy });
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, "campaign.json"), `${JSON.stringify(campaign, null, 2)}\n`);

for (const [platform, draft] of Object.entries(campaign.drafts)) {
  const content = `# ${draft.headline}\n\n${draft.body}\n\nCTA: ${draft.callToAction}\n\nStatus: DRAFT — APPROVAL REQUIRED\n`;
  writeFileSync(resolve(outputDir, `${platform}.md`), content);
}

console.log(`Promotion draft created: ${outputDir}`);
console.log(`Campaign: ${campaign.campaignId}`);
console.log(`Platforms: ${Object.keys(campaign.drafts).length}`);
console.log("Publishing: disabled; human approval required");
