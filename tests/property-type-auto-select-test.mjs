#!/usr/bin/env node
/**
 * property-type-auto-select-test.mjs
 *
 * Verifies that when the user enters a unit-style address (e.g. "2/15 wingate av, mount waverley"),
 * the property type chip auto-selects "Unit" (not "House") before the request is sent.
 *
 * Run: node tests/property-type-auto-select-test.mjs
 * Requires: local server on port 3000 serving public/
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = "http://localhost:3334";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${name}: ${e.message}`);
    }
  }

  await page.goto(BASE, { waitUntil: "networkidle" });

  // ===== Test 1: Lookup chip configuration =====
  await test("chips exist with correct labels", async () => {
    await page.waitForSelector(".chip", { timeout: 5000 });
    const chips = await page.$$eval(".chip", (els) =>
      els.map((el) => ({ type: el.dataset.type, text: el.textContent.trim() }))
    );
    assert.ok(chips.length >= 5, "at least 5 chips");
    assert.ok(chips.some((c) => c.type === "Unit"), "Unit chip exists");
    assert.ok(chips.some((c) => c.type === "House"), "House chip exists");
  });

  // ===== Test 2: Default chip is House =====
  await test("default active chip is House", async () => {
    await page.waitForSelector(".chip.active", { timeout: 5000 });
    const active = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(active, "House", "default active chip is House");
  });

  // ===== Test 3: Enter unit address, chip auto-selects Unit on click =====
  await test("changing address does NOT auto-select chip before click", async () => {
    // Type a unit address but don't click — chip should still be House
    await page.waitForSelector("#address", { timeout: 5000 });
    await page.fill("#address", "2/15 wingate av, mount waverley");
    const activeBefore = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(activeBefore, "House", "still House before click");
  });

  // ===== Test 4: Click button, chip auto-selects Unit =====
  await test("clicking start-valuation auto-selects Unit for unit address", async () => {
    // Make sure address is filled
    await page.fill("#address", "2/15 wingate av, mount waverley");

    // Click the get estimate button
    await page.click("#start-valuation");

    // Wait briefly for chip update (happens synchronously before fetch)
    await page.waitForTimeout(500);

    // Check chip state
    const activeType = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(activeType, "Unit", "chip switched to Unit");

    // House should NOT be active
    const houseActive = await page.$eval(
      '.chip[data-type="House"]',
      (el) => el.classList.contains("active")
    );
    assert.equal(houseActive, false, "House chip is not active");
  });

  // ===== Test 5: Ordinary house address keeps House =====
  await test("ordinary house address keeps House chip", async () => {
    // Wait for previous request to settle or navigate away
    await page.goto(BASE, { waitUntil: "networkidle" });

    await page.fill("#address", "11 mcintosh st, oakleigh");
    const activeBefore = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(activeBefore, "House", "starts as House");

    await page.click("#start-valuation");
    await page.waitForTimeout(500);

    const activeType = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(activeType, "House", "still House after click");
  });

  // ===== Test 6: User manually selects Townhouse before address — should keep selection =====
  await test("user manual chip selection takes priority over inferred type", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });

    // User clicks Townhouse chip first
    await page.click('.chip[data-type="Townhouse"]');
    await page.waitForTimeout(100);

    // Then enters an address
    await page.fill("#address", "2/15 wingate av, mount waverley");

    // Click button
    await page.click("#start-valuation");
    await page.waitForTimeout(500);

    // Chip should still be what user selected (Townhouse)
    const activeType = await page.$eval(".chip.active", (el) => el.dataset.type);
    assert.equal(activeType, "Townhouse", "user selection preserved");
  });

  await browser.close();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Test suite error:", e);
  process.exit(1);
});
