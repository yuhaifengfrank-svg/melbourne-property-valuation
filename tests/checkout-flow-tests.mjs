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

function markRegistered(dom) {
  dom.window.localStorage.setItem("aushomevalue.leadContactId", "123");
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

test("T1: button price-free before valuation result", () => {
  const dom = createPage();
  loadApp(dom);
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists");
  assert.ok(!btn.textContent.includes("$"), "no price before valuation result");
  assert.ok(!btn.textContent.includes("3.99"), "no 3.99 before valuation result");
});

test("T2: button enabled after valid draft token", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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
  markRegistered(dom);
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

test("paymentsEnabled=true thru runAddressValuation keeps unregistered users on free registration", async () => {
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

  // 2) renderValuation processes it, but does not skip the free registration layer.
  dom.window.renderValuation(result);

  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button must exist");
  assert.ok(!btn.disabled, "button must be enabled");
  assert.equal(btn.getAttribute("aria-disabled"), null);

  // 3) Free registration remains the second layer.
  assert.ok(btn.textContent.includes("Register Free") || btn.textContent.includes("免费注册"),
    "Button must remain a free registration CTA before lead registration");
  assert.ok(!btn.textContent.includes("$3.99") && !btn.textContent.includes("3.99"),
    "Button must not show AUD $3.99 before lead registration");

  // 4) Draft token captured, but checkout is gated behind registration.
  assert.ok(!btn.disabled, "button must be enabled (proxies token capture)");
  assert.equal(btn.getAttribute("aria-disabled"), null,
    "free registration CTA should not advertise paid checkout state");
});

test("Phase 2B: registered user + paymentsEnabled=true with draft shows $3.99 CTA", async () => {
  const dom = createPage();

  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse({ paymentsEnabled: true, reportDraftToken: "draft_abc123", draftExpiresAt: new Date(Date.now() + 86400000).toISOString() })),
    });
  };

  loadApp(dom);
  dom.window.paymentsEnabled = true;
  markRegistered(dom);
  // Simulate a valid reportDraft token
  dom.window.currentReportDraft = { token: "draft_abc123" };
  await drainInit(dom);

  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );

  assert.equal(result.paymentsEnabled, true,
    "paymentsEnabled must be true");

  dom.window.renderValuation(result);

  // Button visible with $3.99
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists");
  assert.equal(btn.style.display, "", "button must be visible");
  assert.ok(!btn.disabled, "button must be enabled when draft exists");
  assert.ok(btn.textContent.includes("$3.99") || btn.textContent.includes("3.99"),
    "button must show $3.99 when payments enabled");

  // Lead panel visible
  const leadPanel = dom.window.document.querySelector(".lead-panel");
  assert.ok(leadPanel, "lead-panel exists");
  assert.notEqual(leadPanel.style.display, "none",
    "lead panel must be visible");
});

test("Phase 2B: free registration success keeps third-layer paid CTA visible", async () => {
  const dom = createPage();

  dom.window.fetch = function (url) {
    if (String(url).includes("/api/lead-consent")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, leadContactId: 456 }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse({
        paymentsEnabled: true,
        reportDraftToken: "draft_after_registration",
        draftExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      })),
    });
  };

  loadApp(dom);
  await drainInit(dom);

  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );
  dom.window.renderValuation(result);

  dom.window.document.getElementById("lead-email").value = "buyer@example.com";
  dom.window.document.getElementById("lead-name").value = "Buyer";
  dom.window.openCheckoutModal();
  await drainInit(dom);

  const leadPanel = dom.window.document.querySelector(".lead-panel");
  assert.ok(leadPanel, "lead-panel exists");
  assert.notEqual(leadPanel.style.display, "none",
    "lead panel must remain visible after registration so the paid CTA is reachable");

  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists");
  assert.equal(btn.style.display, "", "paid CTA button must remain visible");
  assert.ok(!btn.disabled, "paid CTA must be enabled after registration + draft");
  assert.ok(btn.textContent.includes("$3.99") || btn.textContent.includes("3.99"),
    "paid CTA must show the third-layer $3.99 offer after free registration");
});

test("Phase 2B: unregistered user + paymentsEnabled=true click does not open Stripe modal", async () => {
  const dom = createPage();

  dom.window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(makeApiResponse({ paymentsEnabled: true, reportDraftToken: "draft_abc123", draftExpiresAt: new Date(Date.now() + 86400000).toISOString() })),
    });
  };

  loadApp(dom);
  await drainInit(dom);

  const result = await dom.window.runAddressValuation(
    "8 Melrose Ct, Scoresby VIC 3179",
    "house",
    "VIC",
    "Scoresby"
  );

  dom.window.renderValuation(result);

  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists");
  assert.ok(!btn.disabled, "free registration button must be enabled");
  assert.ok(!btn.textContent.includes("$3.99") && !btn.textContent.includes("3.99"),
    "unregistered CTA must not show paid price");

  btn.click();

  const modal = dom.window.document.getElementById("checkout-modal");
  assert.equal(modal.open, false,
    "Stripe checkout modal must not open before free registration");
  const leadEmail = dom.window.document.getElementById("lead-email");
  assert.equal(dom.window.document.activeElement, leadEmail,
    "clicking unregistered CTA should keep user in free registration form");
});

test("Phase 2B: paymentsEnabled=false hides all $3.99 and lead panel", async () => {
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

  // Free tier (no leadContactId, no draft): registration CTA visible, no paid checkout
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists in DOM");
  assert.notEqual(btn.style.display, "none",
    "button must remain visible for free registration when payments disabled");
  assert.equal(btn.disabled, false,
    "button must be enabled for free registration when payments disabled");

  // Lead panel visible
  const leadPanel = dom.window.document.querySelector(".lead-panel");
  assert.ok(leadPanel, "lead-panel exists");
  assert.notEqual(leadPanel.style.display, "none",
    "lead panel must remain visible for registration when payments disabled");

  // Layout no longer gets payments-disabled class because registration funnel remains visible
  const layoutEl = dom.window.document.querySelector(".layout");
  if (layoutEl) {
    assert.ok(!layoutEl.classList.contains("payments-disabled"),
      "layout must not hide registration funnel via payments-disabled class");
  }

  // No $3.99 text in button
  assert.ok(!btn.textContent.includes("$"),
    "button must not contain $ sign");
  assert.ok(!btn.textContent.includes("3.99"),
    "button must not contain 3.99");
  assert.ok(!btn.textContent.includes("$"),
    "button must not contain $ sign (checked again after renderValuation)");
  assert.ok(!btn.textContent.includes("AUD"),
    "button must not contain AUD (no price text)");
});

test("Phase 2B: paymentsEnabled=undefined fail-closed still shows free registration", async () => {
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
    "missing paymentsEnabled must default to false via data.paymentsEnabled === true");

  dom.window.renderValuation(result);

  // Free registration remains available, but paid checkout remains unavailable.
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists in DOM");
  assert.notEqual(btn.style.display, "none",
    "button remains visible for free registration when paymentsEnabled missing");
  assert.equal(btn.disabled, false,
    "button remains enabled for free registration when paymentsEnabled missing");
  assert.ok(!btn.textContent.includes("$"), "no dollar sign when payments are not enabled");
  assert.ok(!btn.textContent.includes("3.99"), "no price when payments are not enabled");

  // Lead panel remains visible for the free enhanced summary funnel.
  const leadPanel = dom.window.document.querySelector(".lead-panel");
  assert.ok(leadPanel, "lead-panel exists");
  assert.notEqual(leadPanel.style.display, "none",
    "lead panel remains visible when paymentsEnabled missing");
});

test("Micro-location right card renders context fallback instead of blank map", async () => {
  const dom = createPage();
  loadApp(dom);
  await drainInit(dom);

  dom.window.renderValuation(makeValuation({
    location: {
      rank: 83,
      type: "Residential — predominantly detached homes",
      amenity: 70,
      parking: 60,
    },
    reportDraftToken: VALID_TOKEN,
    draftExpiresAt: VALID_EXPIRES,
  }));

  const mapContainer = dom.window.document.getElementById("map-container");
  assert.ok(mapContainer, "map-container exists");
  assert.ok(mapContainer.classList.contains("map-fallback"),
    "map container must render a non-empty fallback when map coordinates are unavailable");
  assert.ok(mapContainer.textContent.includes("Location context"),
    "fallback must explain what the right-hand card represents");
  assert.ok(mapContainer.textContent.includes("Street rank"),
    "fallback must include micro-location signals instead of blank space");
  assert.ok(mapContainer.textContent.includes("83/100"),
    "fallback must include the street rank value");
});

test("Phase 2B: registered user + paymentsEnabled=false shows no price", async () => {
  const dom = createPage();

  // Set lead contact id to simulate registered user
  dom.window.localStorage.setItem("aushomevalue.leadContactId", "123");

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

  dom.window.renderValuation(result);

  // Lead panel hidden
  const leadPanel = dom.window.document.querySelector(".lead-panel");
  assert.ok(leadPanel, "lead-panel exists");
  assert.equal(leadPanel.style.display, "none",
    "lead panel must be hidden for registered user with payments disabled");

  // Button hidden
  const btn = getBtn(dom);
  assert.ok(btn, "unlock-report button exists in DOM");
  assert.equal(btn.style.display, "none",
    "button must be hidden for registered user with payments disabled");
});

test("Phase 2B: locked preview hidden for free tier when payments disabled", async () => {
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

  // Provide some lockedPreview data
  result.lockedPreview = {
    price: "AUD $3.99",
    chapters: [{ title: "Comparables" }, { title: "Location" }, { title: "Suburb" }]
  };

  dom.window.renderValuation(result);

  // Locked preview CTA should be hidden
  const lockedPreviewEl = dom.window.document.getElementById("locked-preview-cta");
  if (lockedPreviewEl) {
    assert.ok(lockedPreviewEl.classList.contains("hidden"),
      "locked-preview-cta must be hidden for free tier when payments disabled");
  }
});
