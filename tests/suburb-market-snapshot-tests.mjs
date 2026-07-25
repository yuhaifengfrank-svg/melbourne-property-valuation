import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import test from "node:test";

import {
  formatMoney,
  loadMarketSnapshot,
  renderMarketSnapshot,
  selectExactSuburb,
} from "../public/suburb-market-snapshot.js";

function panel(suburb = "Bentleigh") {
  return new JSDOM(`<section data-suburb-market data-suburb="${suburb}" aria-busy="true">
    <p data-market-status></p>
    ${["house-price", "unit-price", "opportunity-score", "school-score", "supply-score", "rent"]
      .map((key) => `<div data-market-field="${key}"></div><div data-market-meta="${key}"></div>`).join("")}
  </section>`).window.document.querySelector("section");
}

test("exact suburb selection cannot confuse Bentleigh with Bentleigh East", () => {
  const opportunities = [{ suburb: "bentleigh east" }, { suburb: "bentleigh" }];
  assert.equal(selectExactSuburb(opportunities, "Bentleigh"), opportunities[1]);
  assert.equal(selectExactSuburb(opportunities, "Bentleigh East"), opportunities[0]);
});

test("market snapshot renders current prices and unified public score", () => {
  const root = panel("Doncaster East");
  renderMarketSnapshot(root, {
    medianHousePrice: 1380000,
    medianUnitPrice: 1155000,
    schoolScore: 77.3,
    supplyConstraintScore: 61,
    dataUpdated: "2026-07-22",
    score: { display: "22/100", band: "Limited signal", horizon: "3-5 years", modelVersion: "future_outlook_v2" },
  });
  assert.equal(root.querySelector('[data-market-field="house-price"]').textContent, "$1,380,000");
  assert.equal(root.querySelector('[data-market-field="unit-price"]').textContent, "$1,155,000");
  assert.equal(root.querySelector('[data-market-field="opportunity-score"]').textContent, "22/100");
  assert.equal(root.querySelector('[data-market-field="school-score"]').textContent, "77/100");
  assert.equal(root.querySelector('[data-market-field="rent"]').textContent, "3/4房租金数据补充中");
  assert.match(root.querySelector('[data-market-meta="rent"]').textContent, /legacy figures are not reused/);
  assert.equal(root.getAttribute("aria-busy"), "false");
});

test("rent, yield and vacancy only render when the API supplies finite values", () => {
  const root = panel("Example");
  renderMarketSnapshot(root, {
    threeBedroomHouseRent: 630,
    fourBedroomHouseRent: 850,
    rentalYield: 3.21,
    vacancyRate: 1.6,
  });
  assert.equal(root.querySelector('[data-market-field="rent"]').textContent, "3BR $630/wk · 4BR $850/wk · Yield 3.21% · Vacancy 1.60%");
});

test("API failure is fail-soft and does not affect static planning evidence", async () => {
  const root = panel("Bentleigh");
  await loadMarketSnapshot(root, async () => ({ ok: false }));
  assert.equal(root.querySelector('[data-market-field="house-price"]').textContent, "Temporarily unavailable");
  assert.match(root.querySelector("[data-market-status]").textContent, /规划内容仍可正常查看/);
  assert.equal(root.getAttribute("aria-busy"), "false");
});

test("money formatting rejects unavailable values", () => {
  assert.equal(formatMoney(null), null);
  assert.equal(formatMoney(undefined), null);
  assert.equal(formatMoney("not-a-number"), null);
});
