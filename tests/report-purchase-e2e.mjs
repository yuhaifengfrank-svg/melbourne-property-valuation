// ── Phase 1E3D-1B: Browser E2E Purchase Link Tests ──
//
// Run: node tests/report-purchase-e2e.mjs

import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Valid report IDs must match rp_\d+_[0-9a-f]{16,}
const VALID_REPORT_ID = "rp_1_a1b2c3d4e5f67890";
const VALID_DRAFT_TOKEN = "dt_test_" + Date.now();

function makeReport(overrides) {
  return {
    ok: true, status: "completed",
    reportId: VALID_REPORT_ID,
    entitlementStatus: "active", paymentStatus: "paid",
    report: {
      record: "valuation",
      valuation: {
        midpoint: 712000, low: 682000, high: 742000, ok: true,
        confidence: { label: "High", dataScore: 8, score: 85 },
        acceptedComparables: [
          { address: "1 Smith St", salePrice: 705000, saleDate: "2026-03-01",
            distanceMeters: 350, landSize: 550,
            verificationStatus: "cross_source_verified" }
        ],
        date: "2026-06-10", reasons: ["Good location"],
        marketContext: { suburbMedian: 698000, rent: 520, yield: 0.036, vacancy: 0.052 }
      },
      subject: { address: "123 Test St, Oakleigh VIC 3166", propertyType: "House",
        bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 607 },
      address: "123 Test St, Oakleigh VIC 3166",
      type: "house", bedrooms: 3, bathrooms: 2, carSpaces: 2, landSize: 607
    },
    ...overrides
  };
}

const MALICIOUS_REPORT = makeReport({
  report: {
    record: '<script>document.body.innerHTML="hacked"</script>',
    valuation: { midpoint: '<script>alert("XSS")</script>' },
    subject: { propertyType: '<script>alert("XSS")</script>' },
    address: '<b>Bold</b> address <a href="evil">link</a>',
    type: '<img src=x onerror=alert(1)>'
  }
});

// ═══════════════════════════════════════════════════════
//  Mock Server State
// ═══════════════════════════════════════════════════════

const state = {
  valuationCount: 0, valuationBodies: [],
  checkoutCount: 0, checkoutBodies: [],
  paymentStatusCount: 0,
  valuationFullCount: 0, valuationFullBodies: [],
  draftToken: VALID_DRAFT_TOKEN,
  draftExpires: new Date(Date.now() + 86400000).toISOString(),
  checkoutError: null,
  checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_test123",
  reportStatus: "ready",
  valuationFullError: null,
  reportContent: null,
  reportId: VALID_REPORT_ID
};

function resetState() {
  const now = Date.now();
  state.valuationCount = 0; state.valuationBodies = [];
  state.checkoutCount = 0; state.checkoutBodies = [];
  state.paymentStatusCount = 0;
  state.valuationFullCount = 0; state.valuationFullBodies = [];
  state.draftToken = "dt_test_" + now;
  state.draftExpires = new Date(now + 86400000).toISOString();
  state.checkoutError = null;
  state.checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_test123";
  state.reportStatus = "ready";
  state.valuationFullError = null;
  state.reportContent = null;
  state.reportId = VALID_REPORT_ID;
}

// ═══════════════════════════════════════════════════════
//  Mock HTTP Server
// ═══════════════════════════════════════════════════════

function createMockServer() {
  const collectBody = (req, cb) => {
    let b = "";
    req.on("data", c => b += c);
    req.on("end", () => { try { cb(JSON.parse(b)); } catch { cb({}); } });
  };

  const json = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };

  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pn = url.pathname;

    // ── Valuation ──
    if (pn === "/api/valuation" && req.method === "POST") {
      return collectBody(req, body => {
        state.valuationCount++; state.valuationBodies.push(body);
        json(res, 200, {
          ok: true, address: "123 Test St, Oakleigh VIC 3166",
          propertyType: "House", landSize: 607,
          estimate: { midpoint: 712000, low: 682000, high: 742000 },
          confidence: { label: "High", dataScore: 8 },
          valuationDate: "2026-06-10", comparableCount: 2,
          keyFactors: ["Good location"],
          reportDraftToken: state.draftToken,
          draftExpiresAt: state.draftExpires
        });
      });
    }

    // ── Checkout ──
    if (pn === "/api/create-report-checkout" && req.method === "POST") {
      return collectBody(req, body => {
        state.checkoutCount++; state.checkoutBodies.push(body);
        if (state.checkoutError) {
          const m = { DRAFT_EXPIRED: [400, { ok: false, error: "DRAFT_EXPIRED" }],
            REPORT_OWNER_CONFLICT: [409, { ok: false, error: "REPORT_OWNER_CONFLICT" }] };
          const [s, d] = m[state.checkoutError] || [500, { ok: false }];
          return json(res, s, d);
        }
        json(res, 200, {
          ok: true, alreadyPurchased: false,
          reportId: state.reportId, checkoutUrl: state.checkoutUrl
        });
      });
    }

    // ── Payment status ──
    if (pn === "/api/report-payment-status" && req.method === "GET") {
      state.paymentStatusCount++;
      json(res, 200, { ok: state.reportStatus === "ready", status: state.reportStatus });
      return;
    }

    // ── Valuation full ──
    if (pn === "/api/valuation-full" && req.method === "POST") {
      return collectBody(req, body => {
        state.valuationFullCount++; state.valuationFullBodies.push(body);
        if (state.valuationFullError) {
          const m = { REPORT_SESSION_EXPIRED: [401, { ok: false, error: "REPORT_SESSION_EXPIRED" }],
            REPORT_OWNER_CONFLICT: [403, { ok: false, error: "REPORT_OWNER_CONFLICT" }],
            PAYMENT_NOT_CONFIRMED: [402, { ok: false, error: "PAYMENT_NOT_CONFIRMED" }],
            REPORT_REFUNDED: [403, { ok: false, error: "REPORT_REFUNDED" }] };
          const [s, d] = m[state.valuationFullError] || [500, { ok: false, error: "INTERNAL_ERROR" }];
          return json(res, s, d);
        }
        json(res, 200, state.reportContent || makeReport());
      });
    }

    // ── HTML pages ──
    if (pn === "/report-success.html") {
      const h = fs.readFileSync(path.join(projectRoot, "public/report-success.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      return res.end(h);
    }
    if (pn === "/report-viewer.html") {
      const h = fs.readFileSync(path.join(projectRoot, "public/report-viewer.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      return res.end(h);
    }

    // Static files
    const fp = path.join(projectRoot, "public", pn === "/" ? "index.html" : pn);
    try {
      if (fs.statSync(fp).isFile()) {
        const extMap = { ".css": "text/css", ".js": "application/javascript", ".html": "text/html",
          ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
        res.writeHead(200, { "Content-Type": extMap[path.extname(fp)] || "application/octet-stream",
          "Cache-Control": "no-store" });
        return res.end(fs.readFileSync(fp));
      }
    } catch (_) {}

    json(res, 404, { error: "not_found" });
  });
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

function findFreePort() {
  return new Promise(r => { const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { r(s.address().port); s.close(); }); });
}

async function runValuation(page) {
  await page.fill("#address", "123 Test St, Oakleigh VIC 3166");
  await page.locator(".chip").first().click();
  await page.click("#start-valuation");
  await page.waitForFunction(() => {
    const btn = document.getElementById("start-valuation");
    return btn && !btn.disabled;
  }, { timeout: 10000 });
  await page.waitForTimeout(150);
}

async function waitForBtnEnabled(page, sel, timeoutMs = 8000) {
  await page.locator(sel).waitFor({ state: "attached", timeout: 3000 });
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return el && !el.disabled && el.getAttribute("aria-disabled") === "false";
  }, sel, { timeout: timeoutMs });
}


// Counter for Stripe route interception count
let stripeBlockCount = 0;

/**
 * Install a page route that intercepts ALL Stripe connections.
 * Returns the counter so tests can assert blockCount === 1.
 */
function installStripeBlock(page) {
  const counter = { count: 0 };
  page.route('**://checkout.stripe.com/**', route => {
    counter.count++;
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>Mock Stripe Checkout</body></html>'
    });
  });
  return counter;
}

// ═══════════════════════════════════════════════════════
//  E2E-1: Full success flow — desktop 1440×900
// ═══════════════════════════════════════════════════════════

test("E2E-1: Desktop success flow 1440×900", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState();

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);
    assert.equal(state.valuationCount, 1, "valuation called");

    await waitForBtnEnabled(page, "#unlock-report");
    assert.equal(await page.locator("#unlock-report").getAttribute("aria-disabled"), "false");

    const stripeCounter = installStripeBlock(page);

    await page.click("#unlock-report");
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "test@example.com");
    await page.check("#checkout-consent");
    await Promise.all([
      page.waitForURL(/stripe\.com/, { timeout: 5000 }),
      page.click("#checkout-submit"),
    ]);

    assert.equal(stripeCounter.count, 1, "stripe route blocked exactly once");
    assert.equal(state.checkoutCount, 1, "checkout called");
    assert.deepEqual(Object.keys(state.checkoutBodies[0]).sort(), ["email", "reportDraftToken"],
      "checkout body: only email+token");
    assert.ok(page.url().includes("stripe.com"), "navigated to Stripe");

    // Success page — payment-status returns pending first, then ready after 2nd call
    state.reportStatus = "pending";
    await page.goto(`http://127.0.0.1:${port}/report-success.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    assert(state.paymentStatusCount >= 1, "payment-status called at least once (pending)");
    state.reportStatus = "ready";
    await waitForBtnEnabled(page, "#btn-view-report", 15000);
    assert.equal(await page.locator("#btn-view-report").getAttribute("aria-disabled"), "false");
    assert(state.paymentStatusCount >= 2, "payment-status called at least twice (pending→ready)");

    // View report
    await page.click("#btn-view-report");
    await page.waitForURL(/report-viewer\.html/, { timeout: 5000 });
    const rv = page.locator("#rv-root");
    await rv.waitFor({ state: "visible", timeout: 5000 });
    const txt = await rv.textContent();
    assert.ok(txt.includes("Executive Summary"), "report rendered");
    assert.ok(txt.includes("712"), "estimate shown");

    assert.equal(state.valuationFullCount, 1, "valuation-full called");

    const bad = errors.filter(e =>
      !e.includes("CSS") && !e.includes("favicon") && !e.includes("resource") && !e.includes("stripe") && !e.includes("CheckoutInitError"));
    assert.equal(bad.length, 0, `no errors: ${bad.join("; ")}`);
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-2: Mobile success flow 390×844
// ═══════════════════════════════════════════════════════════

test("E2E-2: Mobile success flow 390×844", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState();

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);
    assert.equal(state.valuationCount, 1, "mobile: valuation called");

    await waitForBtnEnabled(page, "#unlock-report");
    await page.click("#unlock-report");
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "m@t.com");
    await page.check("#checkout-consent");
    const stripeCounter2 = installStripeBlock(page);

    await Promise.all([
      page.waitForURL(/stripe\.com/, { timeout: 5000 }),
      page.click("#checkout-submit"),
    ]);
    assert.equal(stripeCounter2.count, 1, "mobile: stripe route blocked exactly once");
    assert.equal(state.checkoutCount, 1, "mobile: checkout called");
    assert.ok(page.url().includes("stripe.com"), "mobile: navigated to Stripe");

    // Mobile: no horizontal overflow
    const overflowChk = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      modalScrollWidth: document.getElementById("checkout-modal")?.scrollWidth || 0,
      modalClientWidth: document.getElementById("checkout-modal")?.clientWidth || 0
    }));
    assert.ok(overflowChk.scrollWidth <= overflowChk.innerWidth,
      "mobile: no horizontal overflow, scrollWidth=" + overflowChk.scrollWidth + " innerWidth=" + overflowChk.innerWidth);
    assert.ok(overflowChk.modalScrollWidth <= overflowChk.modalClientWidth + 5,
      "mobile: checkout modal no horizontal overflow");

    await page.goto(`http://127.0.0.1:${port}/report-success.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });
    await waitForBtnEnabled(page, "#btn-view-report", 10000);
    await page.click("#btn-view-report");
    await page.waitForURL(/report-viewer\.html/, { timeout: 5000 });
    const rv = page.locator("#rv-root");
    await rv.waitFor({ state: "visible", timeout: 5000 });
    assert.ok((await rv.textContent()).includes("Executive Summary"), "mobile: report rendered");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-3: No draft token → button disabled
// ═══════════════════════════════════════════════════════════

test("E2E-3: No draft token → unlock disabled", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.draftToken = "";
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);
    const btn = page.locator("#unlock-report");
    await btn.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(await btn.getAttribute("aria-disabled"), "true");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-4: Expired draft → button disabled
// ═══════════════════════════════════════════════════════════

test("E2E-4: Expired draft → unlock disabled", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.draftExpires = new Date(Date.now() - 3600000).toISOString();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);
    const btn = page.locator("#unlock-report");
    await btn.waitFor({ state: "visible", timeout: 3000 });
    assert.equal(await btn.getAttribute("aria-disabled"), "true");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-5: Checkout DRAFT_EXPIRED
// ═══════════════════════════════════════════════════════════

test("E2E-5: Checkout DRAFT_EXPIRED", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.checkoutError = "DRAFT_EXPIRED";
    state.draftToken = VALID_DRAFT_TOKEN;
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);

    const btn = page.locator("#unlock-report");
    await waitForBtnEnabled(page, "#unlock-report");
    assert.equal(await btn.getAttribute("aria-disabled"), "false", "unlock must be enabled");

    await btn.click();
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "t@t.com");
    await page.check("#checkout-consent");
    await page.click("#checkout-submit");
    await page.waitForTimeout(500);

    assert.equal(state.checkoutCount, 1, "checkout must be called exactly once");
    assert.ok(!page.url().includes("stripe.com"), "no stripe nav after DRAFT_EXPIRED");
    assert.ok(page.url().includes("127.0.0.1"), "stayed on localhost");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-6: Checkout owner conflict
// ═══════════════════════════════════════════════════════════

test("E2E-6: Checkout owner conflict", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.checkoutError = "REPORT_OWNER_CONFLICT";
    state.draftToken = VALID_DRAFT_TOKEN;
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);

    const btn = page.locator("#unlock-report");
    await waitForBtnEnabled(page, "#unlock-report");
    assert.equal(await btn.getAttribute("aria-disabled"), "false", "unlock must be enabled");

    await btn.click();
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "t@t.com");
    await page.check("#checkout-consent");
    await page.click("#checkout-submit");
    await page.waitForTimeout(500);

    assert.equal(state.checkoutCount, 1, "checkout must be called exactly once");
    assert.ok(!page.url().includes("stripe.com"), "no stripe nav after conflict");
    assert.ok(page.url().includes("127.0.0.1"), "stayed on localhost");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-7: Non-Stripe URL blocked
// ═══════════════════════════════════════════════════════════

test("E2E-7: Non-Stripe URL blocked", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.checkoutUrl = "http://evil.com/phish";
    state.draftToken = VALID_DRAFT_TOKEN;
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);

    const btn = page.locator("#unlock-report");
    await waitForBtnEnabled(page, "#unlock-report");
    assert.equal(await btn.getAttribute("aria-disabled"), "false", "unlock must be enabled");

    await btn.click();
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "t@t.com");
    await page.check("#checkout-consent");
    await page.click("#checkout-submit");
    await page.waitForTimeout(500);

    assert.equal(state.checkoutCount, 1, "checkout must be called exactly once");
    assert.ok(!page.url().includes("evil.com"), "blocked evil URL");
    assert.ok(page.url().includes("127.0.0.1"), "stayed on localhost");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-8: XSS escaped in viewer
// ═══════════════════════════════════════════════════════════

test("E2E-8: XSS escaped in viewer", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.reportContent = MALICIOUS_REPORT;
    state.reportStatus = "ready";

    await page.goto(`http://127.0.0.1:${port}/report-viewer.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });

    const rvRoot = page.locator("#rv-root");
    await rvRoot.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(600);

    const html = await page.evaluate(() => document.getElementById("rv-root")?.innerHTML || "");

    // Raw HTML tags must NOT appear unescaped
    assert.ok(!html.includes("<script>"), "no raw script tags");
    assert.ok(!html.includes("<script"), "no unescaped script openers");
    assert.ok(!html.includes("onerror"), "no onerror handlers");
    assert.ok(!html.includes("<IMG"), "no uppercase img tags");

    // Dangerous attr patterns
    assert.ok(!html.includes('href="javascript:'), "no javascript: href");


    // But viewable text content should exist (properly escaped)
    const txt = await rvRoot.textContent();
    assert.ok(txt.length > 0, "viewer has content");
    assert.ok(txt.includes("XSS") || txt.includes("script") || txt.includes("onerror") || txt.includes("hacked"),
      "malicious intent text present (properly escaped): " + txt.substring(0, 200));

    // No page errors from XSS
    assert.equal(pageErrors.length, 0, "no page errors from malicious content");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-9: Viewer session expired
// ═══════════════════════════════════════════════════════════

test("E2E-9: Viewer session expired", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.valuationFullError = "REPORT_SESSION_EXPIRED";

    await page.goto(`http://127.0.0.1:${port}/report-viewer.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });

    const rvRoot = page.locator("#rv-root");
    await rvRoot.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(500);
    const txt = await rvRoot.textContent();
    assert.ok(txt.includes("expired") || txt.includes("session"), "session expired shown");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-10: Viewer refunded
// ═══════════════════════════════════════════════════════════

test("E2E-10: Viewer refunded", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.valuationFullError = "REPORT_REFUNDED";

    await page.goto(`http://127.0.0.1:${port}/report-viewer.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });

    const rvRoot = page.locator("#rv-root");
    await rvRoot.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(500);
    const txt = await rvRoot.textContent();
    assert.ok(txt.includes("refunded") || txt.includes("Refund"), "refunded shown");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});

// ═══════════════════════════════════════════════════════
//  E2E-11: Viewer payment not confirmed
// ═══════════════════════════════════════════════════════════

test("E2E-11: Viewer payment not confirmed", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState(); state.valuationFullError = "PAYMENT_NOT_CONFIRMED";

    await page.goto(`http://127.0.0.1:${port}/report-viewer.html?report_id=${state.reportId}`,
      { waitUntil: "networkidle", timeout: 10000 });

    const rvRoot = page.locator("#rv-root");
    await rvRoot.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(500);
    const txt = await rvRoot.textContent();
    assert.ok(txt.includes("payment") || txt.includes("Payment") || txt.includes("confirmed"),
      "payment not confirmed error shown");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});


// ═══════════════════════════════════════════════════════
//  E2E-12: Duplicate submit — double-click on checkout
// ═══════════════════════════════════════════════════════════

test("E2E-12: Duplicate checkout submit blocked", async () => {
  const port = await findFreePort();
  const server = createMockServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await new Promise(r => server.listen(port, "127.0.0.1", r));
    resetState();
    state.draftToken = "***";
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(200);
    await runValuation(page);
    await waitForBtnEnabled(page, "#unlock-report");

    await page.click("#unlock-report");
    await page.locator("#checkout-modal").waitFor({ state: "visible", timeout: 3000 });
    await page.fill("#checkout-email", "double@test.com");
    await page.check("#checkout-consent");

    // Rapid double-click via dispatchEvent to bypass Playwright's enabled check
    await page.evaluate(() => {
      const btn = document.getElementById("checkout-submit");
      if (btn) {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(500);

    // Checkout API must have been called only once
    assert.equal(state.checkoutCount, 1, "checkout API called only once despite double-click");
    assert.equal(state.checkoutBodies[0]?.email, "double@test.com", "correct email in body");
  } finally {
    await context.close(); await browser.close();
    await new Promise(r => server.close(r));
  }
});