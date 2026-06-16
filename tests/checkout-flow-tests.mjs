// ── Phase 1E3D-1A: Checkout Flow Frontend Tests ──
//
// Tests purchase button state, draft token capture, checkout modal,
// Stripe redirect, URL validation, and error handling.
//
// Uses real index.html as DOM so all element IDs exist.
// Uses data.valuation format (not estimate-only) to avoid freeData
// transform that strips nested objects.

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const fs = require("node:fs");
const JS = fs.readFileSync(path.join(projectRoot, "public/app.js"), "utf-8");
const HTML = fs.readFileSync(path.join(projectRoot, "public/index.html"), "utf-8");

const VALID_TOKEN = "draft_…6789";
const VALID_EXPIRES = new Date(Date.now() + 86400000).toISOString();

function makeResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

// Use data.valuation format to avoid freeData transform (which strips
// nested sub-objects like location/planning/reasons/suburb).
// Include ALL fields that renderValuation references after transforming.
function makeValuation(overrides) {
  return {
    valuation: {
      estimate: { midpoint: 800000, low: 750000, high: 850000 },
      confidence: { label: "Medium", dataScore: 5 },
      propertyType: "House",
      keyFactors: ["Good location"],
      acceptedComparables: [],
    },
    subject: { address: "123 Test St, Oakleigh VIC 3166" },
    address: "123 Test St, Oakleigh VIC 3166",
    propertyType: "House",
    addressZh: "",
    dataLimitations: [],
    location: { rank: "", type: "", amenity: "", parking: "" },
    planning: { landSource: "", granny: "", approval: "" },
    landData: { size: "", type: "", builtForm: "", landSource: "" },
    valuationScenario: "",
    evidenceSummary: "",
    comparableSales: [],
    comparables: [],
    planningLabels: { en: [], zh: [] },
    modelNotes: [],
    modelNotesZh: [],
    reasons: ["Good location"],
    reasonsZh: ["好位置"],
    suburb: [],
    suburbZh: [],
    addressMismatch: false,
    mismatchMessage: "",
    reportDraftToken: null,
    draftExpiresAt: null,
    paymentsEnabled: true,
    ...overrides,
  };
}

function createPage() {
  const dom = new JSDOM(HTML, {
    url: "https://aushomevalue.com.au/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  dom.window.fetch = function () {
    return makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/test" });
  };

  // Polyfill dialog.showModal for JSDOM
  if (typeof dom.window.HTMLDialogElement === "function") {
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }

  return dom;
}

function loadApp(dom) {
  new dom.window.Function(JS)(dom.window);
  // Payments gate: enable for checkout flow tests
  dom.window.paymentsEnabled = true;
}

function tick() {
  return new Promise((r) => setTimeout(r, 20));
}

function getBtn(dom) {
  return dom.window.document.getElementById("unlock-report");
}

// Drain any pending async from app.js self-init so its fetch
// resolves BEFORE our explicit renderValuation calls.
async function drainInit(dom) {
  for (let i = 0; i < 5; i++) {
    await tick();
  }
}

// ── URL validation (tested against both the exported function and the
//    static white-list rules in the design doc) ──────────────────────

const ALLOWED_STRIPE = [
  "https://checkout.stripe.com/c/pay/test123",
  "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4",
  "https://checkout.stripe.com/",
];

const REJECTED_URLS = [
  // Non-HTTPS
  ["http://checkout.stripe.com/c/test", "http stripe"],
  // Direct protocol attacks
  ["javascript:alert(1)", "javascript protocol"],
  ["data:text/html,<script>alert(1)</script>", "data protocol"],
  ["file:///etc/passwd", "file protocol"],
  ["ftp://checkout.stripe.com/", "ftp protocol"],
  // Wrong host
  ["https://evil.com/phish", "non-stripe host"],
  ["https://checkout.evil.com/", "stripe subdomain on wrong domain"],
  ["https://stripe.com/checkout", "stripe.com (no checkout subdomain)"],
  // Edge cases
  // https://Checkout.Stripe.Com — new URL() normalizes hostname so this is valid; tested in T16
  ["https://checkout.stripe.com.evil.com/", "subdomain of evil"],
  ["https://checkout.stripe.com@evil.com/", "credentials syntax"],
];

// ── Tests ───────────────────────────────────────────────────────────

test("T1: button disabled initially", () => {
  const dom = createPage();
  loadApp(dom);
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists");
  assert.ok(btn.disabled);
  assert.equal(btn.getAttribute("aria-disabled"), "true");
});

test("T2: button enabled after valid draft token", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN,
    draftExpiresAt: VALID_EXPIRES,
  }));
  const btn = getBtn(dom);
  assert.ok(!btn.disabled, "button should be enabled");
  assert.equal(btn.getAttribute("aria-disabled"), "false");
});

test("T3: button disabled with expired token", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN,
    draftExpiresAt: new Date(Date.now() - 3600000).toISOString(),
  }));
  assert.ok(getBtn(dom).disabled);
});

test("T4: new valuation overwrites old token", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  const tokA = "draft_A_a1b2c3d4";
  const tokB = "draft_B_f6e5d4c3";
  dom.window.renderValuation(makeValuation({
    reportDraftToken: tokA, draftExpiresAt: VALID_EXPIRES,
  }));
  assert.ok(!getBtn(dom).disabled, "button enabled after tokA");
  dom.window.renderValuation(makeValuation({
    reportDraftToken: tokB, draftExpiresAt: VALID_EXPIRES,
  }));
  assert.ok(!getBtn(dom).disabled, "button enabled after tokB");
});

test("T5: token cleared on address mismatch", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.currentReportDraft = {
    token: VALID_TOKEN, expiresAt: VALID_EXPIRES, address: "123 St",
  };
  dom.window.renderValuation(makeValuation({
    reportDraftToken: null,
    addressMismatch: true,
    mismatchMessage: "Mismatch",
  }));
  assert.ok(getBtn(dom).disabled, "button disabled on mismatch");
  const mm = dom.window.document.getElementById("address-mismatch-message");
  if (mm) {
    assert.ok(mm.textContent.includes("Mismatch"), "mismatch message shown");
  }
});

test("T6: no storage writes", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  assert.equal(dom.window.localStorage.length, 0);
  assert.equal(dom.window.sessionStorage.length, 0);
});

test("T7: modal opens and shows price/address", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
    address: "123 Test St, Oakleigh VIC 3166",
  }));
  getBtn(dom).click();
  const modal = dom.window.document.getElementById("checkout-modal");
  assert.ok(modal.open, "modal open");
  assert.ok(modal.textContent.includes("123 Test St"), "address shown");
  assert.ok(modal.textContent.includes("$3.99"), "price shown");
});

test("T8: empty email shows error", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  const msg = dom.window.document.getElementById("checkout-message");
  assert.ok(msg.textContent.length > 0, "error shown");
});

test("T9: consent required", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-submit").click();
  const msg = dom.window.document.getElementById("checkout-message");
  assert.ok(msg.textContent.length > 0, "error shown");
});

test("T10: request body only email+token", async () => {
  let body = null;
  const dom = createPage();
  dom.window.fetch = function (url, opts) {
    body = JSON.parse(opts.body);
    return makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/12345" });
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  await tick();
  assert.ok(body, "fetch called");
  assert.equal(body.email, "test@example.com");
  assert.equal(body.reportDraftToken, VALID_TOKEN);
  assert.equal(Object.keys(body).length, 2);
});

test("T11: credentials same-origin", async () => {
  let creds = null;
  const dom = createPage();
  dom.window.fetch = function (url, opts) {
    creds = opts.credentials;
    return makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/12345" });
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  await tick();
  assert.equal(creds, "same-origin");
});

test("T12: no amount/priceId/reportId in body", async () => {
  let body = null;
  const dom = createPage();
  dom.window.fetch = function (url, opts) {
    body = JSON.parse(opts.body);
    return makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/12345" });
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  await tick();
  assert.ok(body);
  assert.equal(body.amount, undefined);
  assert.equal(body.priceId, undefined);
  assert.equal(body.reportId, undefined);
});

test("T13: double-click guard — direct handleCheckoutSubmit call", async () => {
  const dom = createPage();
  let checkoutCount = 0;
  // Make fetch hang so we can observe concurrent state
  let fetchResolve = null;
  dom.window.fetch = function (url, opts) {
    if (opts && opts.body && typeof opts.body === "string") {
      try {
        const body = JSON.parse(opts.body);
        if (body.reportDraftToken && body.email) {
          checkoutCount++;
        }
      } catch(e) {}
    }
    return new Promise(r => { fetchResolve = r; });
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  // Open modal and populate
  dom.window.openCheckoutModal();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  // First call — starts, sets checkoutPending
  const p1 = dom.window.handleCheckoutSubmit();
  await tick();
  // Second call — should be rejected by guard (checkoutPending===true)
  const p2 = dom.window.handleCheckoutSubmit();
  await tick();
  assert.equal(checkoutCount, 1, "checkout fetch called exactly once");
  assert.ok(dom.window.checkoutPending, "checkoutPending still true during request");
  // Resolve fetch with a non-navigating response so finally runs cleanly
  if (fetchResolve) fetchResolve(makeResponse(400, { ok: false, error: "DRAFT_EXPIRED" }));
  await Promise.allSettled([p1, p2]);
  await tick();
  assert.ok(!dom.window.checkoutPending, "checkoutPending false after completion");
});
// ── Generation overlap test ──
// first request pending → cancel → second request starts → first abort/finally
// must NOT corrupt second request state.
test("T13b: generation guard — cancel then new request", async () => {
  const dom = createPage();
  let fetchCallOrder = [];
  let fetchResolve1 = null;
  let fetchResolve2 = null;
  let fetchIdx = 0;
  dom.window.fetch = function (url, opts) {
    if (opts && opts.body && typeof opts.body === "string") {
      try {
        const body = JSON.parse(opts.body);
        if (body.reportDraftToken && body.email) {
          fetchIdx++;
          const idx = fetchIdx;
          fetchCallOrder.push(`fetch${idx}`);
          return new Promise(r => {
            if (idx === 1) fetchResolve1 = () => r(makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/1" }));
            else fetchResolve2 = () => r(makeResponse(200, { ok: true, checkoutUrl: "https://checkout.stripe.com/c/2" }));
          });
        }
      } catch(e) {}
    }
    return Promise.resolve(makeResponse(200, {}));
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  // Open modal
  dom.window.openCheckoutModal();
  dom.window.document.getElementById("checkout-email").value = "a@b.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  // Start first request
  const p1 = dom.window.handleCheckoutSubmit();
  await tick();
  assert.equal(fetchCallOrder.length, 1, "first fetch started");
  assert.ok(dom.window.checkoutPending, "checkoutPending true for first request");
  // Cancel first request via cancelCheckoutRequest
  dom.window.cancelCheckoutRequest();
  await tick();
  assert.ok(!dom.window.checkoutPending, "checkoutPending false after cancel");
  // Start second request immediately
  const p2 = dom.window.handleCheckoutSubmit();
  await tick();
  assert.equal(fetchCallOrder.length, 2, "second fetch started");
  assert.ok(dom.window.checkoutPending, "checkoutPending true for second request");
  // Now resolve first abort/finally — must NOT corrupt second request
  if (fetchResolve1) fetchResolve1();
  await tick();
  // Second request still pending
  assert.ok(dom.window.checkoutPending, "checkoutPending still true — old finally didn't corrupt");
  // Resolve second request
  if (fetchResolve2) fetchResolve2();
  await Promise.allSettled([p1, p2]);
  await tick();
  assert.ok(!dom.window.checkoutPending, "checkoutPending false after second completion");
});

test("T13c: direct calls during pending blocked", async () => {
  const dom = createPage();
  let checkoutCount = 0;
  dom.window.fetch = function (url, opts) {
    if (opts && opts.body && typeof opts.body === "string") {
      try {
        const body = JSON.parse(opts.body);
        if (body.reportDraftToken && body.email) {
          checkoutCount++;
        }
      } catch(e) {}
    }
    return new Promise(() => {}); // never resolve — keep pending
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  dom.window.openCheckoutModal();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.handleCheckoutSubmit();
  await tick();
  // Try 3 more calls while pending
  dom.window.handleCheckoutSubmit();
  dom.window.handleCheckoutSubmit();
  dom.window.handleCheckoutSubmit();
  await tick();
  assert.equal(checkoutCount, 1, "only one checkout fetch started");
});

test("T14: cancelCheckoutRequest safe", () => {
  const dom = createPage();
  loadApp(dom);
  assert.equal(typeof dom.window.cancelCheckoutRequest, "function");
  dom.window.cancelCheckoutRequest(); // no throw
});

test("T15: isValidCheckoutUrl white-list — valid Stripe URLs accepted", () => {
  const dom = createPage();
  loadApp(dom);
  const fn = dom.window.isValidCheckoutUrl;
  assert.equal(typeof fn, "function", "isValidCheckoutUrl exported");
  ALLOWED_STRIPE.forEach(url => {
    assert.ok(fn(url), `valid: ${url}`);
  });
});

test("T15b: isValidCheckoutUrl rejects dangerous URLs", () => {
  const dom = createPage();
  loadApp(dom);
  const fn = dom.window.isValidCheckoutUrl;
  REJECTED_URLS.forEach(([url, label]) => {
    assert.ok(!fn(url), `rejected: ${label}`);
  });
});

test("T15c: _navigateTo called once for valid Stripe URL through full checkout flow", async () => {
  const dom = createPage();
  let navCallCount = 0;
  let lastNavUrl = null;

  // Replace the navigation hook before loadApp so the exported reference
  // is the one handleCheckoutSubmit will call.
  // Strategy: intercept after loadApp by replacing dom.window._navigateTo
  loadApp(dom);
  dom.window._navigateTo = function (url) {
    navCallCount++;
    lastNavUrl = url;
  };

  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  await tick();
  assert.equal(navCallCount, 1, "navigation called exactly once");
  assert.ok(lastNavUrl.startsWith("https://checkout.stripe.com/"), "navigated to Stripe");
});

test("T16: isValidCheckoutUrl static white-list rules", () => {
  // Test the exported pure function directly — no DOM page needed
  const dom = createPage();
  loadApp(dom);
  const fn = dom.window.isValidCheckoutUrl;

  // White-list: checkout.stripe.com with HTTPS
  assert.ok(fn("https://checkout.stripe.com/c/pay/cs_test_a1b2c3"), "standard Stripe Checkout URL");

  // Off-white-list: all must be rejected
  assert.ok(!fn("javascript:alert(1)"), "javascript: rejected");
  assert.ok(!fn("data:text/html,<script>alert(1)</script>"), "data: rejected");
  assert.ok(!fn("http://checkout.stripe.com/c/test"), "HTTP rejected");
  assert.ok(!fn("https://evil.com/phish"), "non-Stripe host rejected");
  assert.ok(!fn("https://checkout.stripe.com.evil.com/"), "subdomain spoof rejected");
  assert.ok(!fn("https://checkout.stripe.com@evil.com/"), "credentials syntax rejected");
  assert.ok(fn("https://Checkout.Stripe.Com/c/test"), "case variant (URL normalizes hostname)");
  assert.ok(!fn("https://stripe.com/checkout"), "stripe.com (no checkout subdomain) rejected");
  assert.ok(!fn("ftp://checkout.stripe.com/"), "FTP protocol rejected");
});

test("T17: no window.open in source", () => {
  const clean = JS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!clean.includes("window.open("));
});

test("T18: error codes mapped", () => {
  const dom = createPage();
  loadApp(dom);
  const codes = ["INVALID_EMAIL", "DRAFT_EXPIRED", "REPORT_OWNER_CONFLICT",
    "STRIPE_NOT_CONFIGURED", "CHECKOUT_CREATE_FAILED", "PAYMENT_AWAITING_ENTITLEMENT"];
  codes.forEach(c => {
    const m = dom.window.handleCheckoutError(c);
    assert.ok(typeof m === "string" && m.length > 0, c);
  });
});

test("T19: DRAFT_EXPIRED clears token", async () => {
  const dom = createPage();
  dom.window.fetch = function () {
    return makeResponse(400, { ok: false, error: "DRAFT_EXPIRED" });
  };
  loadApp(dom);
  await drainInit(dom);
  dom.window.renderValuation(makeValuation({
    reportDraftToken: VALID_TOKEN, draftExpiresAt: VALID_EXPIRES,
  }));
  getBtn(dom).click();
  dom.window.document.getElementById("checkout-email").value = "test@example.com";
  dom.window.document.getElementById("checkout-consent").checked = true;
  dom.window.document.getElementById("checkout-submit").click();
  await tick();
  assert.ok(getBtn(dom).disabled, "button disabled after DRAFT_EXPIRED");
});

test("T20: no document.cookie", () => {
  const clean = JS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!clean.match(/document\.cookie/));
});

test("T21: no innerHTML in checkout section", () => {
  const checkoutSection = JS.split("Expose for testing")[0].split("Purchase button & checkout")[1];
  if (checkoutSection) {
    assert.equal(
      checkoutSection.split("\n").filter(l => l.includes(".innerHTML")).length, 0
    );
  }
});

test("T22: no opportunity in checkout", () => {
  const checkoutSection = JS.split("Expose for testing")[0].split("Purchase button & checkout")[1];
  if (checkoutSection) {
    assert.ok(!checkoutSection.includes("opportunity"));
    assert.ok(!checkoutSection.includes("Opportunity"));
  }
});

test("T23: button in index.html", () => {
  assert.ok(HTML.match(/<button[^>]*id="unlock-report"[^>]*>/));
});

test("T24: checkout modal in index.html", () => {
  assert.ok(HTML.includes('id="checkout-modal"'));
});

// ── Phase Migration-011b: Payments-enabled pipeline test ─────────────
//
// Verifies that when the API returns paymentsEnabled=true, the value
// propagates through runAddressValuation → renderValuation → unlock
// button visible & enabled with the correct price label.

function makeApiResponse(overrides = {}) {
  return {
    status: 200,
    ok: true,
    estimate: {
      midpoint: 1065332,
      low: 960000,
      high: 1170000,
    },
    confidence: { label: "Moderate", dataScore: 74 },
    comparableCount: 12,
    reportDraftToken: VALID_TOKEN,
    draftExpiresAt: VALID_EXPIRES,
    paymentsEnabled: true,
    address: "8 Melrose Ct, Scoresby VIC 3179",
    propertyType: "house",
    ...overrides,
  };
}

test("paymentsEnabled=true thru runAddressValuation yields unlock button", async () => {
  const dom = createPage();

  // Override fetch BEFORE loadApp: the app init fires on startup
  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse()),
    });
  };

  loadApp(dom);
  dom.window.paymentsEnabled = false;
  await drainInit(dom);

  // Direct call to runAddressValuation
  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );

  // 1) runAddressValuation forwarded paymentsEnabled
  assert.equal(result.paymentsEnabled, true,
    "runAddressValuation must forward paymentsEnabled=true from API");

  // 2) renderValuation processes it
  dom.window.renderValuation(result);

  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button must exist");
  assert.ok(!btn.disabled, "button must be enabled");
  assert.equal(btn.getAttribute("aria-disabled"), "false");

  // 3) Price label shows AUD $3.99
  assert.ok(btn.textContent.includes("$3.99") || btn.textContent.includes("3.99"),
    "Button must show AUD $3.99 price");

  // 4) Draft token captured — verify via updatePurchaseButton enabling the button
  //    (currentReportDraft is in Function closure scope, not on dom.window)
  //    Button enabled + paymentsEnabled=true + draft token present = token captured
  assert.ok(!btn.disabled, "button must be enabled (proxies token capture)");
  assert.equal(btn.getAttribute("aria-disabled"), "false",
    "aria-disabled must be false (proxies token capture)");
});

test("paymentsEnabled=false or missing shows registration mode", async () => {
  const dom = createPage();

  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse({ paymentsEnabled: undefined, reportDraftToken: null })),
    });
  };

  loadApp(dom);
  dom.window.paymentsEnabled = false;
  await drainInit(dom);

  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );

  assert.equal(result.paymentsEnabled, false,
    "missing paymentsEnabled must default to false");

  dom.window.renderValuation(result);

  // No registration/leadContactId → free tier → show register CTA
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button must exist in free tier");
  assert.ok(btn.disabled, "button must be disabled in free tier (no registration)");
  assert.ok(btn.textContent.includes("Register to View Full Report"),
    "button must show Register to View Full Report in free tier");

  // No payments-disabled class in free tier
  const layoutEl = dom.window.document.querySelector(".layout");
  if (layoutEl) {
    assert.ok(!layoutEl.classList.contains("payments-disabled"),
      "layout must NOT have payments-disabled in free tier");
  }
});

test("paymentsEnabled=false explicit keeps fail-closed", async () => {
  const dom = createPage();

  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse({ paymentsEnabled: false, reportDraftToken: null })),
    });
  };

  loadApp(dom);
  dom.window.paymentsEnabled = false;
  await drainInit(dom);

  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );

  assert.equal(result.paymentsEnabled, false,
    "explicit paymentsEnabled=false must be forwarded as false");

  dom.window.renderValuation(result);

  // Free tier (no leadContactId, no draft): button disabled
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button must exist");
  assert.ok(btn.disabled || btn.getAttribute("aria-disabled") === "true",
    "button must remain disabled in free tier");
  assert.ok(btn.textContent.includes("Register to View Full Report"),
    "button must show Register CTA in free tier");
});
