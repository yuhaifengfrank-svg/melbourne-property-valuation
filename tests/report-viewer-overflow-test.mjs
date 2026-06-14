#!/usr/bin/env node

/**
 * report-viewer-overflow-test.mjs
 *
 * Playwright-based overflow test for report-viewer.html.
 * Tests 320px, 390px, and 1440px viewports with a full fixture
 * containing 20 comparable sales entries.
 *
 * Run: node tests/report-viewer-overflow-test.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PROJECT = process.cwd();
const HTML = readFileSync(PROJECT + "/public/report-viewer.html", "utf-8");
const JS = readFileSync(PROJECT + "/public/report-viewer.js", "utf-8");
const VALID_RID = "rp_20260613_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";

function buildFixture() {
  const comps = [];
  for (let i = 0; i < 20; i++) {
    comps.push({
      address: i + " Playwright Street, Testville VIC 3000",
      salePrice: 1000000 + i * 50000,
      saleDate: "2025-01-01",
      distanceMeters: 200 + i * 50,
      landSize: 500 + i * 25,
      propertyType: "House",
      bedrooms: 3 + (i % 2),
      bathrooms: 2,
      carSpaces: 2,
      weight: 1.0,
      adjustment: 0.05 - i * 0.002,
      verificationStatus: "verified"
    });
  }

  return {
    subject: {
      address: "1 Test Street, Suburb VIC 3000",
      suburb: "Suburb", state: "VIC",
      propertyType: "House",
      bedrooms: 4, bathrooms: 2, carSpaces: 2,
      landSize: 650, buildingArea: 180
    },
    estimate: {
      midpoint: 1500000, low: 1350000, high: 1650000,
      anchor: 1450000, weightedMedian: 1480000, weightedMean: 1490000,
      factorAdjustments: 1.03, factorTotal: 0.97, customerHalfRange: 150000, sigma: 0.10
    },
    confidence: { label: "High", score: 85, dataScore: 80,
      reasons: [
        "Sufficient comparable sales data",
        "Property located in high-demand school zone with multiple recent sales within 500m",
        "Limited recent sales of similar land size properties in this micro-market area"
      ] },
    valuationMode: "standard_house",
    acceptedComparables: comps,
    rejectedComparables: [],
    methodology: "hedonic regression with comparable sales",
    marketContext: {
      suburbMedian: 1400000, rent: 700, yield: 0.03,
      school: "Test Primary School", vacancy: 0.02
    }
  };
}

function buildMockResponse() {
  return {
    ok: true,
    status: "completed",
    reportId: VALID_RID,
    entitlementStatus: "active",
    paymentStatus: "paid",
    valuationVersion: "v2.1",
    purchasedAt: "2026-06-10T10:00:00Z",
    report: buildFixture()
  };
}

async function servePage(html, js) {
  const mockResp = JSON.stringify(buildMockResponse());

  // Remove the <script src="/report-viewer.js"> link (not available on test server)
  const cleanHtml = html.replace('<script src="/report-viewer.js"></script>', '');

  // Inject mock data + fetch override and report-viewer JS.
  // Use __MOCK global to avoid string escaping issues.
  // Split into TWO <script> blocks to avoid any </script> text (from comments in JS)
  // from breaking the HTML parser.
  const mockRespStr = 'var __MOCK=' + mockResp + ';';
  const mockFetchJS = mockRespStr +
    'window.fetch=function(){return Promise.resolve({ok:true,status:200,' +
    'text:function(){return Promise.resolve(__MOCK)},' +
    'json:function(){return Promise.resolve(JSON.parse(JSON.stringify(__MOCK)))}});}';

  const injectedHTML = cleanHtml.replace("</body>",
    "<script>" + mockFetchJS + "</script><script>" + js + "</script></body>");

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(injectedHTML);
    });
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port, url: "http://localhost:" + port + "/" });
    });
  });
}

async function main() {
  const viewports = [
    { name: "320px", w: 320, h: 900 },
    { name: "390px", w: 390, h: 900 },
    { name: "1440px", w: 1440, h: 900 }
  ];

  const { server, url } = await servePage(HTML, JS);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto(url + "?report_id=" + VALID_RID, { waitUntil: "load" });
      await page.waitForSelector('[data-state="report"]', { timeout: 5000 });
      await page.waitForTimeout(300);

      const checks = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, hasOverflow: doc.scrollWidth > window.innerWidth };

        // ── rv-info-row CSS checks ──
        const rows = document.querySelectorAll(".rv-info-row");
        const labels = document.querySelectorAll(".rv-info-label");
        const values = document.querySelectorAll(".rv-info-value");

        let rowDisplay = null, labelDisplay = null, valueDisplay = null;
        if (rows.length > 0) rowDisplay = getComputedStyle(rows[0]).display;
        if (labels.length > 0) labelDisplay = getComputedStyle(labels[0]).display;
        if (values.length > 0) valueDisplay = getComputedStyle(values[0]).display;

        // ── Confidence Factors overflow check ──
        const allInfoValues = document.querySelectorAll(".rv-info-value");
        let confidenceOverflow = false;
        for (const el of allInfoValues) {
          if (el.textContent && el.textContent.length > 40) {
            // Check if content overflows its container
            confidenceOverflow = confidenceOverflow || el.scrollWidth > el.clientWidth;
          }
        }

        // ── Label-value adjacency (not stuck together) ──
        let labelValueGap = true; // assume fine
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const childLabels = row.querySelectorAll(".rv-info-label, .rv-info-value");
          // Check that display:flex gives them gap
          const rowStyle = getComputedStyle(row);
          if (rowStyle.display === "flex") {
            // gap should be >= 6px on desktop, but on mobile it wraps so it's fine too
            const gapPx = parseFloat(rowStyle.gap) || 0;
            if (window.innerWidth >= 768 && gapPx < 4) {
              labelValueGap = false;
            }
          }
        }

        // ── Comparables table/cards ──
        const isMobile = innerWidth < 768;
        const table = document.querySelector(".rv-comparables-table");
        const cards = document.querySelector(".rv-comparable-cards");
        const tableDisplay = table ? getComputedStyle(table).display : "none";
        const cardsDisplay = cards ? getComputedStyle(cards).display : "none";

        return {
          overflow, rowDisplay, labelDisplay, valueDisplay,
          confidenceOverflow, labelValueGap, isMobile,
          tableDisplay, cardsDisplay,
          totalRows: rows.length
        };
      });

      const noOverflow = !checks.overflow.hasOverflow;
      const tableOk = checks.isMobile ? checks.tableDisplay === "none" : checks.tableDisplay !== "none";
      const cardsOk = checks.isMobile ? checks.cardsDisplay !== "none" : checks.cardsDisplay === "none";
      const cssOk = checks.rowDisplay === "flex";
      const adjOk = checks.labelValueGap;
      const longTextOk = !checks.confidenceOverflow;
      const passed = noOverflow && tableOk && cardsOk && cssOk && adjOk && longTextOk;

      results.push({
        vp: vp.name, noOverflow, tableOk, cardsOk, cssOk, adjOk, longTextOk, passed,
        totalRows: checks.totalRows, tableDisplay: checks.tableDisplay, cardsDisplay: checks.cardsDisplay
      });

      const status = passed ? "\u2705" : "\u274c";
      let msg = status + " " + vp.name;
      msg += noOverflow ? " clean" : " OVERFLOW";
      msg += " css=" + (cssOk ? "Y" : "N");
      msg += " adj=" + (adjOk ? "Y" : "N");
      msg += " long=" + (longTextOk ? "Y" : "N");
      msg += " rows=" + checks.totalRows;
      msg += " tbl=" + checks.tableDisplay + " crd=" + checks.cardsDisplay;
      console.log(msg);

      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log("");
  const allPassed = results.every(r => r.passed);
  if (allPassed) {
    console.log("\u2705 ALL OVERFLOW + CSS TESTS PASSED");
    results.forEach(r => console.log("  " + r.vp + ": rows=" + r.totalRows + " overflow=" + !r.noOverflow + " css=" + r.cssOk + " adj=" + r.adjOk + " long=" + r.longTextOk));
  } else {
    console.log("\u274c SOME FAILED");
    results.filter(r => !r.passed).forEach(r => {
      console.log("  FAIL " + r.vp + ": overflow=" + !r.noOverflow + " css=" + r.cssOk + " adj=" + r.adjOk + " long=" + r.longTextOk);
    });
  }
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("\u274c", err.message);
  process.exit(1);
});
