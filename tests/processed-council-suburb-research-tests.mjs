import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { generateCouncilResearchPages } from "../scripts/generate-council-suburb-research.mjs";

const root = process.cwd();
const readPage = (slug) => fs.readFileSync(path.join(root, "public", "suburb", `${slug}-vic.html`), "utf8");

test("all processed council artifacts generate a reproducible research collection", () => {
  assert.deepEqual(generateCouncilResearchPages({ onlyCouncil: "City of Yarra" }), {
    councilArtifacts: 261,
    councilSuburbs: 233,
    validatedPages: 2,
    publishedPages: 235,
  });
  const index = fs.readFileSync(path.join(root, "public", "suburb-research.html"), "utf8");
  for (const expected of [
    "235个区域 · 18个已处理Council",
    "完整验证页 / Fully validated profiles",
    "Mount Waverley",
    "Banyule City Council",
    "Bayside City Council",
    "City of Boroondara",
    "City of Casey",
    "City of Melbourne",
    "City of Monash",
    "City of Port Phillip",
    "City of Stonnington",
    "City of Yarra",
    "Darebin City Council",
    "Glen Eira City Council",
    "Kingston City Council",
    "Manningham City Council",
    "Maribyrnong City Council",
    "Maroondah City Council",
    "Merri-bek City Council",
    "Moonee Valley City Council",
    "Whitehorse City Council",
  ]) assert.match(index, new RegExp(expected));
});

test("all 235 linked research pages include market, valuation and planning layers", () => {
  const index = fs.readFileSync(path.join(root, "public", "suburb-research.html"), "utf8");
  const links = [...index.matchAll(/href="(\/suburb\/[^"]+\.html)"/g)].map((match) => match[1]);
  const uniqueLinks = [...new Set(links)];
  assert.equal(uniqueLinks.length, 235);
  for (const link of uniqueLinks) {
    const html = fs.readFileSync(path.join(root, "public", link), "utf8");
    assert.match(html, /data-suburb-market/);
    assert.match(html, /Median house price \/ 独立屋中位价/);
    assert.match(html, /Future Opportunity Index/);
    assert.match(html, /Rental market \/ 租赁市场/);
    assert.match(html, /href="\/#valuation"/);
    assert.match(html, /src="\/suburb-market-snapshot\.js"/);
  }
});

test("exact suburb pipeline pages publish aggregates with limitations", () => {
  const doncasterEast = readPage("doncaster-east");
  for (const expected of ["Planning application records", ">148<", "Unique planning projects", "Stated proposed dwellings", ">143<", "Manningham City Council"]) {
    assert.match(doncasterEast, new RegExp(expected));
  }
  assert.match(doncasterEast, /proposals or register records, not completed housing/i);
  assert.doesNotMatch(doncasterEast, /Opportunity Score|95\/100|Legacy Opportunity/i);
});

test("council-context pages never invent suburb application counts", () => {
  const bentleigh = readPage("bentleigh");
  assert.match(bentleigh, /Council-wide planning-service context/i);
  assert.match(bentleigh, /Council median decision time/);
  assert.match(bentleigh, />70 days</);
  assert.match(bentleigh, /Decisions within required time/);
  assert.match(bentleigh, />80%</);
  assert.doesNotMatch(bentleigh, /Planning application records/);
});

test("partial and overlapping council coverage stays separated", () => {
  const berwick = readPage("berwick");
  assert.match(berwick, /recorded by City of Casey for Berwick 3806/);
  assert.match(berwick, />131</);

  const brightonEast = readPage("brighton-east");
  assert.match(brightonEast, /Bayside City Council/);
  assert.match(brightonEast, /Glen Eira City Council/);
  assert.equal((brightonEast.match(/Council规划背景/g) || []).length, 2);
});

test("validated Oakleigh and Mount Waverley pages retain their richer evidence", () => {
  const oakleigh = readPage("oakleigh");
  assert.match(oakleigh, /\$1,311,000/);
  assert.match(oakleigh, /Verified sources/);
  assert.doesNotMatch(oakleigh, /15,326|\+4\.67%/);

  const mountWaverley = readPage("mount-waverley");
  assert.match(mountWaverley, /Population/);
  assert.match(mountWaverley, /Planning pipeline/);
});
