// ── Report Success Page — Static UI Framework ──
// Phase 1E3C-2A
//
// No network requests, no Stripe SDK, no API calls.
// Renders status views based on URL params only.
// Does NOT read Opportunity cookie, localStorage unlock state,
// or accept email / leadContactId / payment status from client.

(function () {
  "use strict";

  // ── reportId format validation ──
  // Must match api/report-payment-status.js isValidReportId()
  const REPORT_ID_RE = /^rp_\d+_[0-9a-f]{16,}$/i;

  // ── Status page mapping ──
  // Maps status → CSS class / data-status to show
  // All documented statuses plus generic_error for missing/invalid report_id

  const STATUS_PAGES = [
    "confirming",
    "ready",
    "pending",
    "data_unavailable",
    "refunded",
    "revoked",
    "session_expired",
    "not_found",
    "owner_conflict",
    "generic_error",
  ];

  // DOM cache
  const root = document.getElementById("rs-root");

  // ── Get report_id from URL ──
  // Only reads from URL — never from cookie, localStorage, or DOM.
  // Validates format. Malformed → generic_error.

  function getReportIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("report_id");
  }

  function isValidReportId(value) {
    return typeof value === "string" && REPORT_ID_RE.test(value);
  }

  // ── Render a status page ──
  // Shows only the matching status page; hides all others.
  // Falls back to confirming if status is unrecognised.

  function renderStatus(status) {
    // Normalise
    const target = (typeof status === "string" && status.length > 0)
      ? status
      : "confirming";

    // Hide all pages
    const pages = root.querySelectorAll(".rs-page");
    for (let i = 0; i < pages.length; i++) {
      pages[i].style.display = "none";
    }

    // Show the matching page (fallback to generic_error)
    const match = target.replace(/_/g, "-");
    let found = false;
    for (let i = 0; i < pages.length; i++) {
      const dataStatus = pages[i].getAttribute("data-status");
      if (dataStatus === target) {
        pages[i].style.display = "block";
        found = true;
        break;
      }
    }

    if (!found) {
      // Unknown status → generic_error
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].getAttribute("data-status") === "generic_error") {
          pages[i].style.display = "block";
          break;
        }
      }
    }
  }

  // ── Retry / retry handlers ──
  // Retry and "Try again" buttons reload the page so the cookie and
  // query string are re-evaluated by the server. This keeps the UI
  // stateless — no polling state, no timers.

  function attachRetryHandlers() {
    const btns = root.querySelectorAll('[id^="btn-retry-"]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        window.location.reload();
      });
    }

    // View report button is a placeholder — will be wired in Phase 1E3C-3
    const viewBtn = document.getElementById("btn-view-report");
    if (viewBtn) {
      viewBtn.addEventListener("click", function (e) {
        e.preventDefault();
        // Placeholder — will navigate to report viewer in Phase 1E3C-3
      });
    }
  }

  // ── Init ──

  function init() {
    const reportId = getReportIdFromUrl();

    if (!reportId || !isValidReportId(reportId)) {
      // Missing or invalid report_id → generic_error
      renderStatus("generic_error");
    } else {
      // report_id present and valid → start at confirming
      renderStatus("confirming");
    }

    attachRetryHandlers();
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
