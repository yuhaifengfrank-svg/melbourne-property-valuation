// ── Report Viewer — Phase 1E3C-3B-2 ──
// Renders full valuation report from /api/valuation-full.
// Security: textContent only, no innerHTML/eval, no cookie/localStorage reads.

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════════════
  //  Constants
  // ══════════════════════════════════════════════════════════════

  var NA = "Data unavailable";

  // Keys to strip from normalized payload (sensitive fields)
  var FILTERED_KEYS = {
    email: true,
    phone: true,
    lead_contact_id: true,
    stripe_payment_intent: true,
    token: true,
    session_id: true,
    purchase_intent_key: true,
    snapshot_hash: true
  };

  // Error code mapping from API
  var ERROR_MAP = {
    REPORT_SESSION_EXPIRED: "session_expired",
    REPORT_SESSION_MISMATCH: "session_mismatch",
    REPORT_NOT_ENTITLED: "not_entitled",
    PAYMENT_NOT_CONFIRMED: "payment_not_confirmed",
    REPORT_REFUNDED: "refunded",
    REPORT_REVOKED: "revoked",
    REPORT_DATA_UNAVAILABLE: "data_unavailable",
    REPORT_NOT_FOUND: "not_found",
    REPORT_OWNER_CONFLICT: "session_mismatch",
    BAD_REQUEST: "generic_error",
    INTERNAL_ERROR: "generic_error"
  };

  // ── State ──

  var state = {
    reportId: null,
    rawPayload: null,
    currentState: null
  };

  // ── AbortController helpers ──
  var currentAbort = null;
  var requestGeneration = 0;
  var isFetching = false;
  var retryBtn = null;

  // ── DOM refs ──

  var root, pages, ariaLive;

  // ══════════════════════════════════════════════════════════════
  //  Helpers
  // ══════════════════════════════════════════════════════════════

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function escapeHTML(str) {
    if (str == null) return NA;
    var s = String(str);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtCurrency(n) {
    if (n == null || isNaN(n)) return NA;
    return "$" + Number(n).toLocaleString("en-AU");
  }

  function fmtDate(d) {
    if (!d) return NA;
    var date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-AU", {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return NA;
    return (Number(n) * 100).toFixed(1) + "%";
  }

  function fmtArea(n) {
    if (n == null || isNaN(n)) return NA;
    return Number(n).toLocaleString("en-AU") + " m\u00B2";
  }

  function isEmptyObj(v) {
    return v == null || typeof v !== "object" || Array.isArray(v);
  }

  // ══════════════════════════════════════════════════════════════
  //  Normalizer
  // ══════════════════════════════════════════════════════════════

  function normalizePayload(input) {
    if (!input || typeof input !== "object") return null;

    var p = {};

    // ── Estimate ──
    var est = input.estimate || input.valuation || {};
    if (est.estimate) est = est.estimate;

    p.midpoint = est.midpoint;
    p.low = est.low || est.rangeLow || (est.range && est.range.low);
    p.high = est.high || est.rangeHigh || (est.range && est.range.high);
    p.anchor = est.anchor || null;
    p.weightedMedian = est.weightedMedian || null;
    p.weightedMean = est.weightedMean || null;
    p.factorAdjustments = est.factorAdjustments || null;
    p.factorTotal = est.factorTotal || null;
    p.customerHalfRange = est.customerHalfRange || null;
    p.sigma = est.sigma || null;

    // ── Confidence ──
    var conf = input.confidence || {};
    p.confidenceLabel = conf.label || null;
    p.confidenceScore = conf.score || null;
    p.confidenceDataScore = conf.dataScore || null;
    p.confidenceReasons = conf.reasons || null;

    // ── Subject ──
    // Precedence (highest first):
    //   1. New format input.subject (from buildReportSnapshot)
    //   2. Legacy format input.addressVerification / input.customerData
    //   3. Top-level fallback fields
    var sub = input.subject || {};
    var av = input.addressVerification || {};
    var cd = input.customerData || {};

    // Use != null to preserve legitimate 0 values (bedrooms, carSpaces)
    function firstDefined(/* ...args */) {
      for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] != null) return arguments[i];
      }
      return null;
    }

    p.address = firstDefined(sub.address, av.address, input.address);
    p.suburb = firstDefined(sub.suburb, av.suburb);
    p.state = firstDefined(sub.state, av.state);
    p.propertyType = firstDefined(sub.propertyType, av.propertyType, input.propertyType);
    p.bedrooms = firstDefined(sub.bedrooms, cd.bedrooms, input.bedrooms);
    p.bathrooms = firstDefined(sub.bathrooms, cd.bathrooms, input.bathrooms);
    p.carSpaces = firstDefined(sub.carSpaces, cd.carSpaces, input.carSpaces);
    p.landSize = firstDefined(sub.landSize, av.landSize, input.landSize);
    p.buildingArea = firstDefined(sub.buildingArea, input.buildingArea);
    p.zoning = firstDefined(sub.zoning, input.zoning);

    // ── Valuation mode ──
    p.valuationMode = input.valuationMode || null;
    p.largeLotDetect = input.largeLotDetect || null;
    p.largeLotResult = input.largeLotResult || null;

    // ── Comparables ──
    p.acceptedComparables = input.acceptedComparables || input.comparables || [];
    p.rejectedComparables = input.rejectedComparables || [];
    p.methodology = input.methodology || null;

    // ── Market context ──
    var mc = input.marketContext || {};
    if (mc && typeof mc === "object") {
      p.suburbMedian = mc.suburbMedian || null;
      p.rent = mc.rent || null;
      p["yield"] = mc["yield"] || null;
      p.school = mc.school || null;
      p.vacancy = mc.vacancy || null;
    }

    // ── Meta ──
    p.reportId = input.reportId || input.report_id || null;
    p.valuationVersion = input.valuationVersion || null;
    p.purchasedAt = input.purchasedAt || input.purchased_at || null;
    p.asOfDate = input.asOfDate || input.as_of_date || null;
    p.coverageIssue = input.coverageIssue || input.coverage_issue || null;

    // ── Sensitive field stripping ──
    for (var sk in p) {
      if (Object.prototype.hasOwnProperty.call(p, sk) && FILTERED_KEYS[sk]) {
        p[sk] = null;
      }
    }

    return p;
  }

  // ══════════════════════════════════════════════════════════════
  //  State machine
  // ══════════════════════════════════════════════════════════════

  function showPage(stateName) {
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].getAttribute("data-state") === stateName) {
        pages[i].className = "rv-page rv-active";
      } else {
        pages[i].className = "rv-page";
      }
    }
    state.currentState = stateName;
  }

  function setAriaLive(text) {
    if (ariaLive) ariaLive.textContent = text;
  }

  function showLoading() {
    showPage("loading");
    setAriaLive("Loading your property report.");
  }

  function showError(stateName) {
    showPage(stateName);
    var label = stateName.replace(/_/g, " ");
    setAriaLive("Report error: " + label + ".");
  }

  function showReport(payload) {
    state.rawPayload = payload;
    renderReport(payload);
    showPage("report");
    setAriaLive("Your property report is ready.");
  }

  // ══════════════════════════════════════════════════════════════
  //  API fetch
  // ══════════════════════════════════════════════════════════════

  function cancelCurrentRequest() {
    requestGeneration += 1;
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    isFetching = false;
    if (retryBtn) retryBtn.disabled = false;
  }

  function fetchReport() {
    var rid = state.reportId;
    if (!rid) {
      showError("generic_error");
      return;
    }

    // Prevent concurrent / duplicate
    if (isFetching) return;
    isFetching = true;
    if (retryBtn) retryBtn.disabled = true;

    // Bump generation so old callbacks are ignored
    var gen = ++requestGeneration;
    var ac = new AbortController();
    currentAbort = ac;

    showLoading();
    setAriaLive("Loading your property report.");

    fetch("/api/valuation-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reportId: rid }),
      signal: ac.signal
    }).then(function (res) {
      if (gen !== requestGeneration) return;

      if (!res.ok) {
        return res.text().then(function (text) {
          if (gen !== requestGeneration) return;
          var parsed;
          try { parsed = JSON.parse(text); } catch (_) {}
          var code = parsed && parsed.error;
          var mapped = ERROR_MAP[code] || "generic_error";
          showError(mapped);
        }).catch(function () {
          if (gen !== requestGeneration) return;
          showError("generic_error");
        });
      }

      return res.json().then(function (data) {
        if (gen !== requestGeneration) return;

        // Validate response structure
        if (!data || data.ok !== true || data.status !== "completed" ||
            data.entitlementStatus !== "active" ||
            data.paymentStatus !== "paid" ||
            String(data.reportId) !== String(rid) ||
            isEmptyObj(data.report)) {
          showError("generic_error");
          return;
        }

        // Merge outer meta into a shallow copy — never mutate the original
        var reportData = Object.assign({}, data.report, {
          reportId: data.reportId,
          valuationVersion: data.valuationVersion || data.report.valuationVersion,
          purchasedAt: data.purchasedAt || data.report.purchasedAt
        });

        var p = normalizePayload(reportData);
        if (!p) {
          showError("generic_error");
          return;
        }

        showReport(p);
      });
    }).catch(function (err) {
      if (gen !== requestGeneration) return;

      // Ignore abort errors
      if (err && err.name === "AbortError") return;

      showError("generic_error");
    }).finally(function () {
      if (gen !== requestGeneration) return;
      isFetching = false;
      if (retryBtn) retryBtn.disabled = false;
      if (currentAbort === ac) currentAbort = null;
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════

  function renderReport(p) {
    if (!p) return;

    var sections = document.getElementById("rv-sections");
    if (!sections) return;

    // Clear sections with textContent-safe child removal
    while (sections.firstChild) {
      sections.removeChild(sections.firstChild);
    }

    function appendSection(title, contentFn) {
      var div = document.createElement("div");
      div.className = "rv-section";

      var h2 = document.createElement("h2");
      h2.textContent = title;
      div.appendChild(h2);

      var body = document.createElement("div");
      body.className = "rv-section-body";
      contentFn(body);
      div.appendChild(body);

      sections.appendChild(div);
    }

    // ── 1. Executive Summary ──
    appendSection("Executive Summary", function (el) {
      var val = p.valuationMode || "Standard";
      var modeLabel = val.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      el.appendChild(makeInfoRow("Valuation Type", modeLabel));
      el.appendChild(makeInfoRow("Estimated Value", fmtCurrency(p.midpoint)));
      el.appendChild(makeInfoRow("Value Range", fmtCurrency(p.low) + " \u2013 " + fmtCurrency(p.high)));
      if (p.confidenceLabel) {
        el.appendChild(makeInfoRow("Confidence", p.confidenceLabel));
      }
      if (p.confidenceScore != null) {
        el.appendChild(makeInfoRow("Confidence Score", p.confidenceScore + "%"));
      }
      if (p.confidenceReasons && p.confidenceReasons.length) {
        el.appendChild(makeInfoRow("Confidence Factors", p.confidenceReasons.join("; ")));
      }
    });

    // ── 2. Property Details ──
    appendSection("Property Details", function (el) {
      el.appendChild(makeInfoRow("Address", p.address));
      el.appendChild(makeInfoRow("Suburb", p.suburb));
      el.appendChild(makeInfoRow("State", p.state));
      el.appendChild(makeInfoRow("Property Type", p.propertyType));
      el.appendChild(makeInfoRow("Bedrooms", p.bedrooms != null ? String(p.bedrooms) : NA));
      el.appendChild(makeInfoRow("Bathrooms", p.bathrooms != null ? String(p.bathrooms) : NA));
      el.appendChild(makeInfoRow("Car Spaces", p.carSpaces != null ? String(p.carSpaces) : NA));
      el.appendChild(makeInfoRow("Land Size", fmtArea(p.landSize)));
      el.appendChild(makeInfoRow("Building Area", fmtArea(p.buildingArea)));
      el.appendChild(makeInfoRow("Zoning", p.zoning));
    });

    // ── 3. Comparable Sales ──
    appendSection("Comparable Sales", function (el) {
      var comps = p.acceptedComparables || [];
      var count = comps.length;
      if (count === 0) {
        el.appendChild(makeInfoRow("Comparables", "None available"));
        return;
      }

      // Table for desktop
      var table = document.createElement("table");
      table.className = "rv-comparables-table";
      var thead = document.createElement("thead");
      // Build table header with createElement/textContent
      var headerRow = document.createElement("tr");
      var headerLabels = ["Address","Sale Price","Sale Date","Distance","Land","Type","Adjust.","Status"];
      for (var hi = 0; hi < headerLabels.length; hi++) {
        var th = document.createElement("th");
        th.textContent = headerLabels[hi];
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      var limit = Math.min(count, 20);
      for (var ci = 0; ci < limit; ci++) {
        var c = comps[ci];
        var tr = document.createElement("tr");
        tr.appendChild(makeCell(c.address));
        tr.appendChild(makeCell(fmtCurrency(c.salePrice)));
        tr.appendChild(makeCell(fmtDate(c.saleDate)));
        tr.appendChild(makeCell(c.distanceMeters != null ? Math.round(c.distanceMeters) + " m" : NA));
        tr.appendChild(makeCell(fmtArea(c.landSize)));
        tr.appendChild(makeCell(c.propertyType));
        tr.appendChild(makeCell(c.adjustment != null ? fmtPct(c.adjustment) : NA));
        tr.appendChild(makeCell(c.verificationStatus));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      el.appendChild(table);

      // Cards for mobile
      var cards = document.createElement("div");
      cards.className = "rv-comparable-cards";
      for (var cj = 0; cj < limit; cj++) {
        var comp = comps[cj];
        if (comp) {
          var card = document.createElement("div");
          card.className = "rv-comparable-card";
          card.textContent = comp.address + " \u2014 " + fmtCurrency(comp.salePrice) + " (" + fmtDate(comp.saleDate) + ")";
          cards.appendChild(card);
        }
      }
      el.appendChild(cards);
    });

    // ── 4. Valuation Methodology ──
    appendSection("Valuation Methodology", function (el) {
      el.appendChild(makeInfoRow("Methodology", p.methodology));
      if (p.valuationMode === "large_lot_house" && p.largeLotDetect) {
        el.appendChild(makeInfoRow("Large Lot Mode", "Detected"));
        el.appendChild(makeInfoRow("Land Size", fmtArea(p.largeLotDetect.landSize)));
        el.appendChild(makeInfoRow("Local P90", fmtArea(p.largeLotDetect.localP90)));
        el.appendChild(makeInfoRow("Land Ratio", p.largeLotDetect.ratio != null ? p.largeLotDetect.ratio.toFixed(1) + "x" : NA));
      }
      if (p.largeLotResult) {
        el.appendChild(makeInfoRow("Combined Midpoint", fmtCurrency(p.largeLotResult.combinedMidpoint)));
        el.appendChild(makeInfoRow("Channel A Weight", p.largeLotResult.channelAWeight != null ? fmtPct(p.largeLotResult.channelAWeight) : NA));
        el.appendChild(makeInfoRow("Channel B Weight", p.largeLotResult.channelBWeight != null ? fmtPct(p.largeLotResult.channelBWeight) : NA));
      }
      el.appendChild(makeInfoRow("Anchor Value", fmtCurrency(p.anchor)));
      el.appendChild(makeInfoRow("Weighted Median", fmtCurrency(p.weightedMedian)));
      el.appendChild(makeInfoRow("Weighted Mean", fmtCurrency(p.weightedMean)));
      el.appendChild(makeInfoRow("Factor Adjustments", p.factorAdjustments != null ? fmtPct(p.factorAdjustments) : NA));
      el.appendChild(makeInfoRow("Factor Total", p.factorTotal != null ? fmtPct(p.factorTotal) : NA));
      el.appendChild(makeInfoRow("Half Range", fmtCurrency(p.customerHalfRange)));
      el.appendChild(makeInfoRow("Sigma", p.sigma != null ? String(Number(p.sigma).toFixed(4)) : NA));
    });

    // ── 5. Market Context ──
    appendSection("Market Context", function (el) {
      el.appendChild(makeInfoRow("Suburb Median", fmtCurrency(p.suburbMedian)));
      el.appendChild(makeInfoRow("Rent Estimate", fmtCurrency(p.rent)));
      if (p["yield"] != null) { el.appendChild(makeInfoRow("Gross Yield", fmtPct(p["yield"]))); }
      if (p.school) { el.appendChild(makeInfoRow("Nearby School", p.school)); }
      if (p.vacancy != null) { el.appendChild(makeInfoRow("Vacancy Rate", fmtPct(p.vacancy))); }
    });

    // ── 6. Risks and Limitations ──
    appendSection("Risks and Limitations", function (el) {
      if (p.coverageIssue) {
        var note = document.createElement("p");
        note.className = "rv-risk-note";
        note.textContent = p.coverageIssue;
        el.appendChild(note);
      } else {
        var note2 = document.createElement("p");
        note2.textContent = "No issues or limitations reported by the valuation engine.";
        el.appendChild(note2);
      }
      var stdNote = document.createElement("p");
      stdNote.textContent = "This report is for informational purposes only and does not constitute formal professional property valuation advice. Market conditions may change after the as-of date. All values are estimates based on available data and statistical models.";
      el.appendChild(stdNote);
    });

    // ── 7. Report Metadata ──
    appendSection("Report Metadata", function (el) {
      el.appendChild(makeInfoRow("Report ID", p.reportId));
      el.appendChild(makeInfoRow("As of Date", fmtDate(p.asOfDate)));
      el.appendChild(makeInfoRow("Purchased", fmtDate(p.purchasedAt)));
      if (p.valuationVersion) {
        el.appendChild(makeInfoRow("Valuation Engine", p.valuationVersion));
      }
    });
  }

  // ── Render helpers ──

  function makeInfoRow(label, value) {
    var row = document.createElement("div");
    row.className = "rv-info-row";
    var lbl = document.createElement("span");
    lbl.className = "rv-info-label";
    lbl.textContent = label;
    var val = document.createElement("span");
    val.className = "rv-info-value";
    val.textContent = (value != null && value !== "" ? String(value) : NA);
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  }

  function makeCell(text) {
    var td = document.createElement("td");
    td.textContent = text != null ? String(text) : NA;
    return td;
  }

  // ══════════════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════════════

  function init() {
    root = document.getElementById("rv-root");
    if (!root) return;

    pages = qsa(".rv-page", root);
    ariaLive = document.getElementById("rv-aria-live");
    retryBtn = document.getElementById("rv-btn-retry");

    // Parse report_id from URL
    var search = window.location.search;
    var rid = null;
    if (search && search.length > 1) {
      var qsStr = search.substring(1);
      var pairs = qsStr.split("&");
      for (var pi = 0; pi < pairs.length; pi++) {
        var pair = pairs[pi].split("=");
        var key = pair[0];
        if (key === "report_id" && pair.length > 1) {
          rid = decodeURIComponent(pair[1]);
          break;
        }
      }
    }

    // Validate report_id format: rp_<digits>_<16+ hex chars>
    var formatOk = rid && /^rp_\d+_[0-9a-f]{16,}$/i.test(rid);
    if (!formatOk) {
      showError("generic_error");
      return;
    }

    state.reportId = rid;
    showLoading();

    // Retry button handler
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        fetchReport();
      });
    }

    // Cancel on visibility change / beforeunload
    window.addEventListener("beforeunload", function () {
      cancelCurrentRequest();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        cancelCurrentRequest();
      }
    });

    // Fetch report
    fetchReport();
  }

  // ══════════════════════════════════════════════════════════════
  //  Public API
  // ══════════════════════════════════════════════════════════════

  window.__REPORT_VIEWER__ = {
    renderReport: renderReport,
    showLoading: showLoading,
    showError: showError,
    showPage: showPage,
    fetchReport: fetchReport,
    cancelCurrentRequest: cancelCurrentRequest,
    getState: function () { return state; },
    getRequestGeneration: function () { return requestGeneration; },
    getIsFetching: function () { return isFetching; }
  };

  // Script is at end of <body>; DOM is ready. Run init immediately.
  init();
})();
