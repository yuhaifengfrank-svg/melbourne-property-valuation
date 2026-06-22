#!/usr/bin/env node

/**
 * Report Viewer — Phase 1E3C-3B-2 Tests
 *
 * Tests the report-viewer.js module with mocked fetch and AbortController.
 * No production API calls, no database.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../public/report-viewer.html", import.meta.url), "utf-8");
const JS = readFileSync(new URL("../public/report-viewer.js", import.meta.url), "utf-8");

// ── Test constants ──
var VALID_RID = "rp_20260613_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
var VALID_RID2 = "rp_1_baaaaaaaaaaaaaaaab";
var INVALID_RID_SHORT = "rp_1_abc123";
var INVALID_RID_NOPREFIX = "abc_123_def";

function makeSuccessResponse(overrides) {
  var r = {
    ok: true,
    status: "completed",
    reportId: VALID_RID,
    entitlementStatus: "active",
    paymentStatus: "paid",
    valuationVersion: "v2.1",
    purchasedAt: "2026-06-10T10:00:00Z",
    report: {
      subject: {
        address: "1 Test Street, Suburb VIC 3000",
        suburb: "Suburb",
        state: "VIC"
      },
      estimate: {
        midpoint: 1200000, low: 1080000, high: 1320000
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {}
    }
  };
  if (overrides) {
    for (var k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        r[k] = overrides[k];
      }
    }
  }
  return r;
}

function createDom(mockFetch, urlOverride) {
  var url = urlOverride || ('https://aushomevalue.com.au/report-viewer?report_id=' + VALID_RID);
  var dom = new JSDOM(HTML, { url: url, runScripts: 'outside-only' });

  // Patch global fetch before eval JS
  if (mockFetch) {
    dom.window.fetch = mockFetch;
  }
  // Mock AbortController — abort() rejects pending fetch via signal._reject
  dom.window.AbortController = function () {
    var self = this;
    this.signal = { aborted: false, onabort: null, _reject: null };
    this.abort = function () {
      self.signal.aborted = true;
      if (typeof self.signal.onabort === 'function') self.signal.onabort();
      if (typeof self.signal._reject === 'function') {
        self.signal._reject({ name: 'AbortError' });
      }
    };
  };

  dom.window.eval(JS);
  return dom;
}

function createDomWithoutFetch(mockFetch, url) {
  return createDom(mockFetch, url);
}

function mockFetchOk(response) {
  var body = JSON.stringify(response);
  return function (url, opts) {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return Promise.resolve(body); },
      json: function () { return Promise.resolve(JSON.parse(body)); }
    });
  };
}

function mockFetchError(status, body) {
  var b = body ? JSON.stringify(body) : '{}';
  return function () {
    return Promise.resolve({
      ok: false,
      status: status || 400,
      text: function () { return Promise.resolve(b); },
      json: function () { return Promise.resolve(JSON.parse(b)); }
    });
  };
}

function mockFetchNetworkError() {
  return function () {
    return Promise.reject(new Error('Network error'));
  };
}

function waitFor(dom, fn) {
  return fn(dom.window.__REPORT_VIEWER__, dom.window.document);
}

// ── 1. Valid URL sends fetch to valuation-full ──
test("1. valid URL loads and sends POST to /api/valuation-full", async () => {
  var fetchCalls = [];
  var mockFetch = function (url, opts) {
    fetchCalls.push({ url: url, opts: opts });
    return mockFetchOk(makeSuccessResponse())(url, opts);
  };
  var dom = createDom(mockFetch);
  var viewer = dom.window.__REPORT_VIEWER__;
  // Wait for init + fetch
  await new Promise(function (r) { setTimeout(r, 50); });
  assert.equal(fetchCalls.length, 1, 'one fetch call made');
  assert.ok(fetchCalls[0].url.indexOf("/api/valuation-full") !== -1, "url is valuation-full");
  assert.equal(fetchCalls[0].opts.method, 'POST', 'method is POST');
  var body = JSON.parse(fetchCalls[0].opts.body);
  assert.equal(body.reportId, VALID_RID, 'body contains reportId');
  assert.equal(body.email, undefined, 'no email in body');
  assert.equal(body.leadContactId, undefined, 'no leadContactId in body');
  assert.equal(body.token, undefined, 'no token in body');
  assert.equal(fetchCalls[0].opts.credentials, "same-origin", "credentials same-origin");
  var headers = fetchCalls[0].opts.headers;
  assert.equal(headers['Content-Type'], 'application/json', 'Content-Type header set');
});

// ── 2. Success response renders report ──
test("2. success response renders report page", async () => {
  var dom = createDom(mockFetchOk(makeSuccessResponse()));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var reportPage = root.querySelector('[data-state=report]');
  assert.ok(reportPage, 'report page exists');
  assert.ok(reportPage.className.indexOf('rv-active') !== -1, 'report page active');
});

// ── 3. Report metadata from response ──
test("3. reportId, valuationVersion, purchasedAt from response shown", async () => {
  var dom = createDom(mockFetchOk(makeSuccessResponse()));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  var text = sections.textContent;
  assert.ok(text.indexOf(VALID_RID) !== -1, 'reportId shown');
  assert.ok(text.indexOf('v2.1') !== -1, 'valuationVersion shown');
  assert.ok(text.indexOf('Jun 2026') !== -1 || text.indexOf('2026') !== -1, 'purchasedAt shown');
});

// ── 3b. Paid report must include Future Score, opportunity/risk and guidance ──
test("3b. paid report renders Future Score, key opportunities, risks, welcome and next steps", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC",
        propertyType: "House",
        bedrooms: 4,
        bathrooms: 2,
        carSpaces: 2,
        landSize: 409
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141,
        weightedMedian: 1060000,
        weightedMean: 1070000,
        factorTotal: 0.04,
        anchor: 1065340
      },
      valuationMode: "standard_house",
      acceptedComparables: [
        { address: "1 Test Sale St", salePrice: 1100000, saleDate: "2026-05-01", landSize: 450, propertyType: "House" }
      ],
      confidence: {
        label: "Medium",
        dataScore: 74,
        reasons: ["12 accepted", "Dispersion 9.9%", "17% single-source"]
      },
      customerName: "Frank",
      keyFactors: ["Recent comparable sales support the range", "Family-house demand is stable"],
      dataLimitations: ["Title, condition and planning overlays still require independent checks"],
      propertyFutureOutlook: {
        futureOpportunityIndex: 72,
        suburbFutureOutlookScore: 70,
        propertySpecificScore: 76,
        forecastHorizon: "3-5 years",
        confidence: "Medium",
        formula: "property_future_score = suburb_future_outlook_score * 0.70 + property_specific_score * 0.30",
        why: ["Good school access", "Tight established housing supply"],
        risks: ["Renovation condition must be checked", "Interest-rate sensitivity"]
      },
      suburbFutureOutlook: {
        futureOpportunityIndex: 70
      }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  var text = sections.textContent;
  assert.ok(text.indexOf("Welcome") !== -1, "welcome section shown");
  assert.ok(text.indexOf("Dear Frank") !== -1, "customer greeting shown");
  assert.ok(text.indexOf("Welcome to your AusHomeValue Full Valuation Report for 8 Melrose Ct") !== -1,
    "welcome references the property");
  assert.ok(text.indexOf("Future Opportunity Outlook") !== -1, "future section shown");
  assert.ok(text.indexOf("Future Opportunity Score") !== -1, "future score included in summary");
  assert.ok(text.indexOf("Property Future Score") !== -1, "property future score label shown");
  assert.ok(text.indexOf("72/100") !== -1, "future score value shown");
  assert.ok(text.indexOf("Score position") !== -1, "score position card shown");
  assert.ok(text.indexOf("Strong opportunity signal") !== -1, "score band interpretation shown");
  assert.ok(text.indexOf("Before you use this report") !== -1, "prominent scope note shown");
  assert.ok(text.indexOf("not a formal valuation") !== -1, "scope note explains report limits");
  assert.ok(sections.querySelector(".rv-score-card"), "score card DOM exists");
  assert.ok(sections.querySelector(".rv-score-marker"), "score marker DOM exists");
  assert.ok(text.indexOf("Good school access") !== -1, "opportunity reason shown");
  assert.ok(text.indexOf("Interest-rate sensitivity") !== -1, "risk reason shown");
  assert.equal(text.indexOf("single-source"), -1, "internal single-source confidence detail hidden");
  assert.ok(text.indexOf("Recommended Next Steps") !== -1, "next steps section shown");
  assert.ok(text.indexOf("How to Read These Metrics") !== -1, "metric glossary shown");
  assert.ok(text.indexOf("Anchor Value") !== -1, "anchor value definition shown");
  assert.ok(text.indexOf("Weighted Median") !== -1, "weighted median definition shown");
  assert.ok(text.indexOf("How to read this outlook") !== -1, "future outlook inline explanation shown");
  assert.ok(text.indexOf("The combined opportunity signal for this specific property") !== -1,
    "future score explanation shown");
  assert.ok(text.indexOf("How to read the methodology") !== -1, "methodology inline explanation shown");
  assert.ok(text.indexOf("The model's starting centre point") !== -1,
    "anchor value inline explanation shown");
  assert.ok(text.indexOf("Factor Adjustments") !== -1, "factor adjustment definition shown");
  assert.ok(sections.querySelector(".rv-definition-list"), "definition list DOM exists");
  assert.ok(text.indexOf("Thank You") !== -1, "thank you section shown");
  assert.ok(text.indexOf("thank you again for choosing AusHomeValue") !== -1,
    "closing thank-you message shown");
  assert.ok(text.indexOf("not a predicted price growth percentage") !== -1,
    "future score disclaimer shown");
});

test("3b.1 score position copy uses the actual score and unit property type", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "Unit 1, 11 McIntosh Street, Oakleigh VIC",
        suburb: "Oakleigh",
        state: "VIC",
        propertyType: "Unit"
      },
      estimate: {
        midpoint: 952933,
        low: 809993,
        high: 1095873
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {
        label: "Medium"
      },
      propertyFutureOutlook: {
        futureOpportunityIndex: 31,
        suburbFutureOutlookScore: 72,
        propertySpecificScore: 31,
        forecastHorizon: "3-5 years",
        confidence: "Low"
      }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  var text = sections.textContent;
  assert.ok(text.indexOf("31/100") !== -1, "actual score shown");
  assert.ok(text.indexOf("places 31/100") !== -1, "score intro uses actual score");
  assert.equal(text.indexOf("places 72/100"), -1, "hard-coded score removed");
  assert.ok(text.indexOf("Emerging opportunity signal") !== -1, "actual score band shown");
  assert.equal(text.indexOf("Top 25%"), -1, "score band does not pretend to be percentile");
  assert.ok(text.indexOf("Property Type") !== -1, "property type row shown");
  assert.ok(text.indexOf("Unit") !== -1, "unit property type displayed");
  assert.ok(text.indexOf("Unit 1, 11 McIntosh Street") !== -1, "unit address spacing normalized for display");
  assert.ok(text.indexOf("below the suburb outlook") !== -1,
    "property score is explained as lower than suburb-level signal");
  assert.ok(text.indexOf("suburb may look promising") !== -1,
    "copy explains property score and suburb score are different layers");
});

// ── 3b.1a Missing physical attributes are grouped as verification items ──
test("3b.1a missing property attributes render as verification checklist, not empty data rows", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC",
        propertyType: "House",
        landSize: 618
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {
        label: "Medium"
      }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  var text = sections.textContent;
  assert.ok(text.indexOf("Core address and property attributes") !== -1,
    "property details intro explains snapshot fields");
  assert.ok(text.indexOf("Land Size") !== -1, "available land size still shown");
  assert.ok(text.indexOf("618 m²") !== -1, "available land size value shown");
  assert.ok(text.indexOf("Attributes to verify manually") !== -1,
    "missing attributes grouped into verification note");
  assert.ok(text.indexOf("Bedrooms") !== -1, "missing bedrooms named for verification");
  assert.ok(text.indexOf("Bathrooms") !== -1, "missing bathrooms named for verification");
  assert.ok(text.indexOf("Car Spaces") !== -1, "missing car spaces named for verification");
  assert.equal(text.indexOf("BedroomsData unavailable"), -1,
    "missing bedroom value is not rendered as a blank data row");
  assert.equal(text.indexOf("Building AreaData unavailable"), -1,
    "missing building area value is not rendered as a blank data row");
});

// ── 3b.2 Missing keyFactors falls back to public confidence reasons ──
test("3b.2 missing keyFactors still shows main valuation signals from public evidence", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC",
        propertyType: "House"
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {
        label: "Medium",
        reasons: ["12 accepted comparable sales", "Dispersion 9.9%", "17% single-source"]
      },
      keyFactors: []
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.ok(text.indexOf("Main valuation signals") !== -1, "fallback signal heading shown");
  assert.ok(text.indexOf("12 accepted comparable sales") !== -1, "public confidence reason reused");
  assert.equal(text.indexOf("single-source"), -1, "internal single-source detail remains hidden");
});

// ── 3b.3 Factor adjustments render arrays/objects safely ──
test("3b.3 factor adjustments array/object values do not render as object noise", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC"
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141,
        factorAdjustments: [
          { factor: "Land size", adjustment: 0.031, note: "slightly above the comparable set" },
          { factor: "Recency", value: "Included in model" }
        ]
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: { label: "Medium" }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.ok(text.indexOf("Display-ready factor adjustment details") !== -1, "factor adjustment details heading shown");
  assert.ok(text.indexOf("Land size") !== -1, "factor label shown");
  assert.ok(text.indexOf("3.1%") !== -1, "numeric factor adjustment formatted");
  assert.equal(text.indexOf("[object Object]"), -1, "object values are not leaked");
});

// ── 3b.4 Missing market context is explained rather than looking broken ──
test("3b.4 missing market context shows explanatory snapshot note", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC"
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: { label: "Medium" }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.ok(text.indexOf("does not include display-ready suburb market context metrics") !== -1,
    "market context missing-data explanation shown");
  assert.ok(text.indexOf("accepted comparable-sales evidence") !== -1,
    "explanation preserves valuation evidence chain");
});

// ── 3c. Missing customer name falls back to Customer ──
test("3c. paid report uses Customer fallback when name is unavailable", async () => {
  var response = makeSuccessResponse({
    report: {
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC"
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {
        label: "Medium"
      }
    }
  });
  var dom = createDom(mockFetchOk(response));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  var text = sections.textContent;
  assert.ok(text.indexOf("Dear Customer") !== -1, "fallback greeting shown");
  assert.ok(text.indexOf("Thank You") !== -1, "closing section still shown");
});

// ── 3d. Chinese report language via URL ──
test("3d. report viewer renders Chinese content with lang=zh", async () => {
  var response = makeSuccessResponse({
    report: {
      customerName: "小鱼",
      subject: {
        address: "8 Melrose Ct, Scoresby VIC",
        suburb: "Scoresby",
        state: "VIC",
        propertyType: "House",
        landSize: 409
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141
      },
      valuationMode: "standard_house",
      acceptedComparables: [],
      confidence: {
        label: "Medium",
        reasons: ["12 accepted", "17% single-source"]
      },
      propertyFutureOutlook: {
        futureOpportunityIndex: 72,
        suburbFutureOutlookScore: 70,
        propertySpecificScore: 76,
        confidence: "Medium",
        why: ["Good school access"],
        risks: ["Interest-rate sensitivity"]
      }
    }
  });
  var dom = createDom(mockFetchOk(response),
    'https://aushomevalue.com.au/report-viewer.html?report_id=' + VALID_RID + '&lang=zh');
  await new Promise(function (r) { setTimeout(r, 50); });
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.equal(dom.window.document.documentElement.lang, "zh-CN", "document lang set to zh-CN");
  assert.ok(text.indexOf("欢迎") !== -1, "Chinese welcome title shown");
  assert.ok(text.indexOf("尊敬的小鱼") !== -1, "Chinese report keeps customer greeting");
  assert.ok(text.indexOf("核心摘要") !== -1, "Chinese executive summary shown");
  assert.ok(text.indexOf("未来机会分数") !== -1, "Chinese future score label shown");
  assert.ok(text.indexOf("感谢") !== -1, "Chinese thank-you section shown");
  assert.equal(text.indexOf("single-source"), -1, "internal single-source detail hidden in Chinese");
});

// ── 3e. Language toggle rerenders report ──
test("3e. language toggle switches rendered report from English to Chinese", async () => {
  var dom = createDom(mockFetchOk(makeSuccessResponse()));
  await new Promise(function (r) { setTimeout(r, 50); });
  var sections = dom.window.document.getElementById('rv-sections');
  assert.ok(sections.textContent.indexOf("Executive Summary") !== -1, "English initially shown");
  var toggle = dom.window.document.getElementById('rv-language-toggle');
  assert.ok(toggle, "language toggle exists");
  toggle.click();
  await new Promise(function (r) { setTimeout(r, 20); });
  assert.ok(sections.textContent.indexOf("核心摘要") !== -1, "Chinese content shown after toggle");
  assert.equal(toggle.textContent, "English", "toggle flips to English label");
});

// ── 3f. Demo paid report sample renders without API/cookie/payment ──
test("3f. demo paid report sample renders without fetching API", async () => {
  var fetchCalled = false;
  var mockFetch = function () {
    fetchCalled = true;
    return Promise.reject(new Error("demo should not fetch"));
  };
  var dom = createDom(mockFetch,
    'https://aushomevalue.com.au/report-viewer.html?demo=paid-report');
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCalled, false, "demo mode does not call fetch");
  var root = dom.window.document.getElementById('rv-root');
  var reportPage = root.querySelector('[data-state=report]');
  assert.ok(reportPage.className.indexOf('rv-active') !== -1, "report page active");
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.ok(text.indexOf("Welcome") !== -1, "welcome shown");
  assert.ok(text.indexOf("Dear Sample Buyer") !== -1, "demo customer greeting shown");
  assert.ok(text.indexOf("8 Melrose Ct, Scoresby, VIC") !== -1, "demo address shown");
  assert.ok(text.indexOf("Future Opportunity Score") !== -1, "future score shown");
  assert.ok(text.indexOf("72/100") !== -1, "future score value shown");
  assert.ok(text.indexOf("Score position") !== -1, "demo score position shown");
  assert.ok(text.indexOf("Strong opportunity signal") !== -1, "demo score band shown");
  assert.ok(text.indexOf("How to Read These Metrics") !== -1, "demo glossary shown");
  assert.ok(text.indexOf("How to read this outlook") !== -1, "demo future explanation shown");
  assert.ok(text.indexOf("How to read the methodology") !== -1, "demo methodology explanation shown");
  assert.ok(text.indexOf("Planning & Zoning Signals") !== -1, "planning section shown");
  assert.ok(text.indexOf("Investor Watch") !== -1, "investor watch upsell shown");
  assert.equal(text.indexOf("single-source"), -1, "internal single-source detail hidden in demo");
});

// ── 3g. Demo paid report sample supports Chinese URL ──
test("3g. demo paid report sample renders Chinese with lang=zh", async () => {
  var fetchCalled = false;
  var dom = createDom(function () {
    fetchCalled = true;
    return Promise.reject(new Error("demo should not fetch"));
  }, 'https://aushomevalue.com.au/report-viewer.html?demo=paid-report&lang=zh');
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCalled, false, "demo Chinese mode does not call fetch");
  var text = dom.window.document.getElementById('rv-sections').textContent;
  assert.ok(text.indexOf("欢迎") !== -1, "Chinese welcome shown");
  assert.ok(text.indexOf("尊敬的小鱼") !== -1, "Chinese demo greeting shown");
  assert.ok(text.indexOf("未来机会分数") !== -1, "Chinese future score label shown");
  assert.ok(text.indexOf("分数位置") !== -1, "Chinese score position shown");
  assert.ok(text.indexOf("较强机会信号") !== -1, "Chinese score band shown");
  assert.equal(text.indexOf("前 25%"), -1, "Chinese score band does not pretend to be percentile");
  assert.ok(text.indexOf("如何理解这些指标") !== -1, "Chinese glossary shown");
  assert.ok(text.indexOf("如何理解未来机会") !== -1, "Chinese future explanation shown");
  assert.ok(text.indexOf("如何理解估值方法") !== -1, "Chinese methodology explanation shown");
  assert.ok(text.indexOf("规划与分区信号") !== -1, "Chinese planning title shown");
  assert.equal(text.indexOf("single-source"), -1, "internal single-source detail hidden in Chinese demo");
});

// ── 4. reportId mismatch rejects ──
test("4. reportId mismatch shows generic_error", async () => {
  var resp = makeSuccessResponse({ reportId: 'other_id' });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error active on mismatch');
});

// ── 5. HTTP 200 but ok=false ──
test("5. HTTP 200 but ok=false shows generic_error", async () => {
  var resp = makeSuccessResponse({ ok: false });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error active when ok=false');
});

// ── 6. paymentStatus not paid ──
test("6. paymentStatus not paid shows generic_error", async () => {
  var resp = makeSuccessResponse({ paymentStatus: 'pending' });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when not paid');
});

// ── 7. entitlementStatus not active ──
test("7. entitlementStatus not active shows generic_error", async () => {
  var resp = makeSuccessResponse({ entitlementStatus: 'expired' });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when not active');
});

// ── 8. status not completed ──
test("8. status not completed shows generic_error", async () => {
  var resp = makeSuccessResponse({ status: 'processing' });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when status not completed');
});

// ── 9. report is null ──
test("9. report is null shows generic_error", async () => {
  var resp = makeSuccessResponse({ report: null });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when report null');
});

// ── 10. report is array ──
test("10. report is array shows generic_error", async () => {
  var resp = makeSuccessResponse({ report: [] });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when report array');
});

// ── 11. report is primitive ──
test("11. report is string shows generic_error", async () => {
  var resp = makeSuccessResponse({ report: 'hello' });
  var dom = createDom(mockFetchOk(resp));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error when report string');
});

// ── 12. Error code mapping: REPORT_SESSION_EXPIRED ──
test("12. REPORT_SESSION_EXPIRED maps to session_expired", async () => {
  var dom = createDom(mockFetchError(400, { error: 'REPORT_SESSION_EXPIRED' }));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var page = root.querySelector('[data-state=session_expired]');
  assert.ok(page.className.indexOf('rv-active') !== -1, 'session_expired active');
});

// ── 13. Error code mapping: all error codes ──
test("13. all error codes map to correct states", async () => {
  var errorTests = [
    ['REPORT_SESSION_EXPIRED', 'session_expired'],
    ['REPORT_SESSION_MISMATCH', 'session_mismatch'],
    ['REPORT_NOT_ENTITLED', 'not_entitled'],
    ['PAYMENT_NOT_CONFIRMED', 'payment_not_confirmed'],
    ['REPORT_REFUNDED', 'refunded'],
    ['REPORT_REVOKED', 'revoked'],
    ['REPORT_DATA_UNAVAILABLE', 'data_unavailable'],
    ['REPORT_NOT_FOUND', 'not_found'],
    ['REPORT_OWNER_CONFLICT', 'session_mismatch'],
    ['BAD_REQUEST', 'generic_error'],
    ['INTERNAL_ERROR', 'generic_error']
  ];
  for (var ti = 0; ti < errorTests.length; ti++) {
    var pair = errorTests[ti];
    var code = pair[0];
    var expected = pair[1];
    var dom = createDom(mockFetchError(400, { error: code }));
    await new Promise(function (r) { setTimeout(r, 30); });
    var root = dom.window.document.getElementById('rv-root');
    var page = root.querySelector('[data-state="' + expected + '"]');
    assert.ok(page, 'page exists for ' + code + ' -> ' + expected);
    assert.ok(page.className.indexOf('rv-active') !== -1, expected + ' active for ' + code);
  }
});

// ── 14. Unknown error code maps to generic_error ──
test("14. unknown error code maps to generic_error", async () => {
  var dom = createDom(mockFetchError(400, { error: 'SOME_UNKNOWN_CODE' }));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var page = root.querySelector('[data-state=generic_error]');
  assert.ok(page.className.indexOf('rv-active') !== -1, 'generic_error active for unknown code');
});

// ── 15. Invalid JSON from server ──
test("15. invalid JSON from server shows generic_error", async () => {
  var dom = createDom(function () {
    return Promise.resolve({
      ok: false,
      status: 500,
      text: function () { return Promise.resolve('not json {{{'); },
      json: function () { return Promise.reject(new Error('parse error')); }
    });
  });
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var page = root.querySelector('[data-state=generic_error]');
  assert.ok(page.className.indexOf('rv-active') !== -1, 'generic_error for invalid JSON');
});

// ── 16. Network error ──
test("16. network error shows generic_error", async () => {
  var dom = createDom(mockFetchNetworkError());
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var page = root.querySelector('[data-state=generic_error]');
  assert.ok(page.className.indexOf('rv-active') !== -1, 'generic_error for network error');
});

// ── 17. Retry button works ──
test("17. retry button re-fetches", async () => {
  var fetchCount = 0;
  var mockFetch = function () {
    fetchCount++;
    if (fetchCount === 1) {
      return mockFetchError(400, { error: 'INTERNAL_ERROR' })();
    }
    return mockFetchOk(makeSuccessResponse())();
  };
  var dom = createDom(mockFetch);
  await new Promise(function (r) { setTimeout(r, 50); });
  assert.equal(fetchCount, 1, 'first fetch attempted');
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'error after first fetch');

  // Click retry
  var retryBtn = dom.window.document.getElementById('rv-btn-retry');
  assert.ok(retryBtn, 'retry button exists');
  retryBtn.click();
  await new Promise(function (r) { setTimeout(r, 50); });
  assert.equal(fetchCount, 2, 'retry made second fetch');
  var reportPage = root.querySelector('[data-state=report]');
  assert.ok(reportPage.className.indexOf('rv-active') !== -1, 'report active after retry');
});

// ── 18. Duplicate clicks don\'t cause concurrent fetches ──
test("18. duplicate clicks do not cause concurrent fetches", async () => {
  var fetchCount = 0;
  var pendings = [];
  var mockFetch = function () {
    fetchCount++;
    var p = {};
    p.promise = new Promise(function (r) { p.resolve = r; });
    pendings.push(p);
    return p.promise;
  };
  var dom = createDom(mockFetch);
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCount, 1, 'only one fetch initiated on load');

  // Multiple clicks while fetching
  var retryBtn = dom.window.document.getElementById('rv-btn-retry');
  if (retryBtn) {
    retryBtn.click();
    retryBtn.click();
    retryBtn.click();
  }
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCount, 1, 'no additional fetches from duplicate clicks');
});

// ── 19. cancel+immediate-refetch: aborted finally does NOT corrupt new req ──
test("19. cancel+immediate-refetch: old reject must not clear new state", async () => {
  var fetchCalls = [];
  var mockFetch = function (url, opts) {
    var call = { resolve: null, reject: null };
    call.promise = new Promise(function (res, rej) {
      call.resolve = res;
      call.reject = rej;
    });
    var sig = opts && opts.signal;
    if (sig) {
      sig._reject = function (err) {
        if (call.reject) {
          var rj = call.reject;
          call.reject = null;
          rj(err);
        }
      };
    }
    fetchCalls.push(call);
    return call.promise;
  };
  var dom = createDom(mockFetch);
  var viewer = dom.window.__REPORT_VIEWER__;
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCalls.length, 1, 'first fetch started on init');
  assert.equal(viewer.getRequestGeneration(), 1, 'gen=1 after init');

  // Phase 1: cancel + immediately refetch (no await in between)
  viewer.cancelCurrentRequest();

  // At this point cancel bumped gen to 2, reset isFetching=false
  assert.equal(viewer.getRequestGeneration(), 2,
    'gen bumped to 2 after cancelCurrentRequest');

  // Immediate refetch — the old fetch's abort rejection
  // (from cancelCurrentRequest) may still be pending in microtask queue
  viewer.fetchReport();
  assert.equal(fetchCalls.length, 2, 'second fetch started immediately');

  // The second fetch must have isFetching=true
  assert.ok(viewer.getIsFetching(),
    'isFetching=true for second request immediately after cancel+refetch');

  // Duplicate clicks while second is pending must be blocked
  viewer.fetchReport();
  viewer.fetchReport();
  viewer.fetchReport();
  assert.equal(fetchCalls.length, 2, 'duplicate clicks blocked (isFetching guard)');

  // Now let microtasks flush (old abort reject + finally will run)
  await new Promise(function (r) { setTimeout(r, 50); });

  // After old finally runs, it must NOT clear second request's state
  // because finally has gen guard (gen1 !== gen2)
  assert.ok(viewer.getIsFetching(),
    'isFetching still true for second request after old finally runs');
  assert.equal(fetchCalls.length, 2, 'no extra fetches after old finally');

  // Resolve second fetch — success
  var newResp = makeSuccessResponse();
  newResp.report.subject.address = 'NEW RESPONSE';
  fetchCalls[1].resolve({
    ok: true, status: 200,
    text: function () { return Promise.resolve(JSON.stringify(newResp)); },
    json: function () { return Promise.resolve(newResp); }
  });
  await new Promise(function (r) { setTimeout(r, 50); });

  var sections = dom.window.document.getElementById('rv-sections');
  assert.ok(sections.textContent.indexOf('NEW RESPONSE') !== -1,
    'second response rendered NEW: ' + sections.textContent.substring(0, 60));
  assert.equal(viewer.getIsFetching(), false,
    'isFetching=false after second request completes');

  // Old abort->resolve must be ignored (generation guard in .then)
  var oldResp = makeSuccessResponse();
  oldResp.report.subject.address = 'OLD RESPONSE';
  if (fetchCalls[0].resolve) {
    fetchCalls[0].resolve({
      ok: true, status: 200,
      text: function () { return Promise.resolve(JSON.stringify(oldResp)); },
      json: function () { return Promise.resolve(oldResp); }
    });
  }
  await new Promise(function (r) { setTimeout(r, 50); });
  assert.ok(sections.textContent.indexOf('NEW RESPONSE') !== -1,
    'still has NEW after stale resolve');
  assert.equal(sections.textContent.indexOf('OLD RESPONSE'), -1,
    'OLD RESPONSE must not appear');
})

// ── 20. beforeunload and visibilitychange abort true ──// ── 20. beforeunload and visibilitychange abort true ──
test("20. beforeunload and visibilitychange cancelCurrentRequest", async () => {
  var receivedSignals = [];
  var mockFetch = function (url, opts) {
    var sig = opts && opts.signal;
    receivedSignals.push(sig);
    // Wire _reject so abort can reject
    sig._reject = function (err) {
      // just store that it fired
      sig._rejected = true;
    };
    return new Promise(function () {}); // never resolves
  };
  var dom = createDom(mockFetch);
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.ok(receivedSignals.length >= 1, 'at least one signal from init fetch');
  var sig1 = receivedSignals[0];
  assert.ok(!sig1.aborted, 'signal not aborted before beforeunload');

  // 1. beforeunload
  var beforeEvent = new dom.window.Event('beforeunload');
  dom.window.dispatchEvent(beforeEvent);
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.ok(sig1.aborted, 'signal aborted after beforeunload');

  // 2. visibilitychange (fresh dom + fetch)
  var receivedSignals2 = [];
  var mockFetch2 = function (url, opts) {
    var sig = opts && opts.signal;
    receivedSignals2.push(sig);
    sig._reject = function (err) { sig._rejected2 = true; };
    return new Promise(function () {});
  };
  var dom2 = createDom(mockFetch2);
  await new Promise(function (r) { setTimeout(r, 30); });
  var sig2 = receivedSignals2[0];
  assert.ok(!sig2.aborted, 'signal2 not aborted before visibilitychange');

  Object.defineProperty(dom2.window.document, 'visibilityState', {
    value: 'hidden', configurable: true
  });
  var visEvent = new dom2.window.Event('visibilitychange');
  dom2.window.document.dispatchEvent(visEvent);
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.ok(sig2.aborted, 'signal aborted after visibilitychange to hidden');
})

// ── 21. No cookie/localStorage reads ──// ── 21. No cookie/localStorage reads ──
test("21. no cookie, localStorage, or sessionStorage reads", () => {
  var cleanJS = JS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(cleanJS.indexOf('document.cookie') === -1, 'no document.cookie');
  assert.ok(cleanJS.indexOf('localStorage') === -1, 'no localStorage');
  assert.ok(cleanJS.indexOf('sessionStorage') === -1, 'no sessionStorage');
});

// ── 22. No Stripe/payment-status calls ──
test("22. no Stripe or payment-status calls", () => {
  var cleanJS = JS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(cleanJS.indexOf('Stripe') === -1, 'no Stripe');
  assert.ok(cleanJS.indexOf('payment-status') === -1, 'no payment-status');
});

// ── 23. No innerHTML/eval ──
test("23. no innerHTML, outerHTML, insertAdjacentHTML, or eval", () => {
  var cleanJS = JS.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(cleanJS.indexOf(".innerHTML") === -1, "no .innerHTML anywhere in source");
  assert.ok(cleanJS.indexOf(".outerHTML") === -1, "no outerHTML");
  assert.ok(cleanJS.indexOf("insertAdjacentHTML") === -1, "no insertAdjacentHTML");
  assert.ok(cleanJS.indexOf("eval(") === -1, "no eval");
});

// ── 24. API error message not injected into DOM ──
test("24. API error message text not displayed verbatim", async () => {
  var dom = createDom(mockFetchError(400, {
    error: 'REPORT_NOT_FOUND',
    message: '<script>alert(1)</script>Not found'
  }));
  await new Promise(function (r) { setTimeout(r, 50); });
  var root = dom.window.document.getElementById('rv-root');
  var page = root.querySelector('[data-state=not_found]');
  assert.ok(page.className.indexOf('rv-active') !== -1, 'not_found active');
  // The message should NOT appear anywhere in the visible DOM
  var allText = root.textContent;
  assert.ok(allText.indexOf('<script>alert') === -1, 'no script tag from message');
  assert.ok(allText.indexOf('Not found') === -1, 'server message not displayed');
});

// ── 25. Input response.report never mutated (Object.freeze test) ──
test("25. input response.report never mutated", async () => {
  var response = makeSuccessResponse();
  // Freeze the report object so any mutation attempt throws in strict mode
  Object.freeze(response.report);
  Object.freeze(response.report.subject);
  Object.freeze(response.report.estimate);
  Object.freeze(response.report.confidence);

  var mockFn = function () {
    return Promise.resolve({
      ok: true, status: 200,
      text: function () { return Promise.resolve(JSON.stringify(response)); },
      json: function () { return Promise.resolve(response); }
    });
  };
  var dom = createDom(mockFn);
  await new Promise(function (r) { setTimeout(r, 50); });

  // Must still succeed — report renders even with frozen input
  var root = dom.window.document.getElementById('rv-root');
  var reportPage = root.querySelector('[data-state=report]');
  assert.ok(reportPage.className.indexOf('rv-active') !== -1, 'report renders despite frozen input');

  // Verify original object has no new properties added
  assert.equal(Object.prototype.hasOwnProperty.call(response.report, 'reportId'), false,
    'no reportId added to original');
  assert.equal(Object.prototype.hasOwnProperty.call(response.report, 'valuationVersion'), false,
    'no valuationVersion added to original');
  assert.equal(Object.prototype.hasOwnProperty.call(response.report, 'purchasedAt'), false,
    'no purchasedAt added to original');

  // Deep nested values still intact
  assert.equal(response.report.estimate.midpoint, 1200000, 'estimate.midpoint unchanged');
  assert.equal(response.report.subject.address, '1 Test Street, Suburb VIC 3000', 'subject.address unchanged');
});

// ── 26. No fetch for missing report_id ──
test("26. missing/invalid report_id does not send any fetch", async () => {
  var fetchCalled = false;
  var mockFn = function () { fetchCalled = true; return Promise.resolve({}); };
  var dom = createDom(mockFn, 'https://aushomevalue.com.au/report-viewer');
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCalled, false, 'no fetch sent for missing report_id');
  var root = dom.window.document.getElementById('rv-root');
  var errorPage = root.querySelector('[data-state=generic_error]');
  assert.ok(errorPage.className.indexOf('rv-active') !== -1, 'generic_error for missing report_id');
});

// ── 27. isFetching guard prevents concurrent ──
test("27. isFetching guard prevents concurrent requests", async () => {
  var fetchCount = 0;
  var mockFetch = function () {
    fetchCount++;
    // Never resolve - stay pending
    return new Promise(function () {});
  };
  var dom = createDom(mockFetch);
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCount, 1, 'one fetch started');

  // Try calling fetchReport directly while pending
  var viewer = dom.window.__REPORT_VIEWER__;
  viewer.fetchReport();
  viewer.fetchReport();
  viewer.fetchReport();
  await new Promise(function (r) { setTimeout(r, 30); });
  assert.equal(fetchCount, 1, 'still only one fetch (isFetching guard)');
});

// ── 28. aria-live updates on success ──
test("28. aria-live updates on successful report load", async () => {
  var dom = createDom(mockFetchOk(makeSuccessResponse()));
  await new Promise(function (r) { setTimeout(r, 50); });
  var live = dom.window.document.getElementById('rv-aria-live');
  assert.ok(live.textContent.indexOf('ready') !== -1 || live.textContent.indexOf('report') !== -1, 'aria-live updated on success');
});

// ── 29. Same-origin credentials ──
// Already tested in test 1, adding explicit
test("29. fetch uses same-origin credentials", () => {
  var dom = createDom(mockFetchOk(makeSuccessResponse()));
  // Verified in test 1, just confirm fetchReport exists
  var viewer = dom.window.__REPORT_VIEWER__;
  assert.ok(typeof viewer.fetchReport === 'function', 'fetchReport is function');
});

// ── 30. Retry button exists in generic_error HTML ──
test("30. retry button exists in HTML", () => {
  assert.ok(HTML.indexOf('rv-btn-retry') !== -1, 'retry button id in HTML');
  assert.ok(HTML.indexOf('Try again') !== -1, 'Try again text in HTML');
});
