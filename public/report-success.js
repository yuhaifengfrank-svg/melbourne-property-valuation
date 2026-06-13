// ── Report Success Page — Payment Status Polling ──
// Phase 1E3C-2B
//
// Fetches /api/report-payment-status with limited polling.
// Never calls /api/valuation-full, never reads cookies/localStorage.
// No Stripe SDK.

(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────────────────

  // Matches api/report-payment-status.js isValidReportId()
  const REPORT_ID_RE = /^rp_\d+_[0-9a-f]{16,}$/i;

  // Polling schedule (seconds between attempts)
  const POLL_INTERVALS = [2, 2, 3, 3, 5];
  const MAX_ATTEMPTS = POLL_INTERVALS.length + 1; // 5 intervals → 6 fetches total

  // Statuses that stop polling (terminal states)
  const TERMINAL_STATUSES = new Set([
    "ready",
    "data_unavailable",
    "refunded",
    "revoked",
    "session_expired",
    "not_found",
    "owner_conflict",
    "generic_error",
  ]);

  // ── Runtime (test-injectable) ──────────────────────────────────────

  const runtime = {
    fetch: function () { return window.fetch.apply(window, arguments); },
    setTimeout: function () { return window.setTimeout.apply(window, arguments); },
    clearTimeout: function () { return window.clearTimeout.apply(window, arguments); },
    createAbortController: function () { return new window.AbortController(); },
  };

  // Test hook — overrideable navigate (must be before hook check so hoisting doesn't overwrite)
  var testNavigate = null;

  // Test hook — only present in test environment
  if (typeof window !== "undefined" && window.__REPORT_SUCCESS_TEST_RUNTIME__) {
    var hook = window.__REPORT_SUCCESS_TEST_RUNTIME__; // eslint-disable-line no-var
    if (typeof hook.fetch === "function") runtime.fetch = hook.fetch;
    if (typeof hook.setTimeout === "function") runtime.setTimeout = hook.setTimeout;
    if (typeof hook.clearTimeout === "function") runtime.clearTimeout = hook.clearTimeout;
    if (typeof hook.createAbortController === "function") runtime.createAbortController = hook.createAbortController;
    if (typeof hook.navigateTo === "function") testNavigate = hook.navigateTo;
  }

  // ── State ─────────────────────────────────────────────────────────

  let state = {
    polling: false,
    cancelled: false,
    attempt: 0,
    timerId: null,
    fetchController: null,
    networkErrorRetried: false,
  };

  // DOM cache
  const root = document.getElementById("rs-root");
  let ariaLive = document.getElementById("rs-aria-live");

  // ── Helpers ───────────────────────────────────────────────────────

  function getReportIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("report_id");
  }

  function isValidReportId(value) {
    return typeof value === "string" && REPORT_ID_RE.test(value);
  }

  // ── Status page rendering ─────────────────────────────────────────

  function renderStatus(status) {
    const target = (typeof status === "string" && status.length > 0)
      ? status
      : "confirming";

    // Hide all pages
    const pages = root.querySelectorAll(".rs-page");
    for (let i = 0; i < pages.length; i++) {
      pages[i].style.display = "none";
    }

    // Show matching page (fallback to generic_error)
    let found = false;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].getAttribute("data-status") === target) {
        pages[i].style.display = "block";
        found = true;
        break;
      }
    }

    if (!found) {
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].getAttribute("data-status") === "generic_error") {
          pages[i].style.display = "block";
          break;
        }
      }
    }

    // Update aria-live region
    updateAriaLive(target);

    // Update View Full Report button
    updateViewButton(target);
  }

  // ── Aria-live ─────────────────────────────────────────────────────

  function ensureAriaLive() {
    if (!ariaLive) {
      ariaLive = document.getElementById("rs-aria-live");
    }
    if (!ariaLive) {
      ariaLive = document.createElement("div");
      ariaLive.id = "rs-aria-live";
      ariaLive.setAttribute("aria-live", "polite");
      ariaLive.setAttribute("aria-atomic", "true");
      ariaLive.className = "sr-only";
      // Screen-reader-only styling
      ariaLive.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
      document.body.appendChild(ariaLive);
    }
  }

  function updateAriaLive(status) {
    if (!ariaLive) return;
    const labels = {
      confirming: "Confirming your payment.",
      ready: "Your report is ready.",
      pending: "Payment confirmation is taking a little longer. Please check again.",
      data_unavailable: "Report temporarily unavailable.",
      refunded: "This payment has been refunded.",
      revoked: "Report access has been revoked.",
      session_expired: "Your session has expired.",
      not_found: "Report not found.",
      owner_conflict: "Access denied.",
      generic_error: "An error occurred.",
    };
    ariaLive.textContent = labels[status] || "Status updated.";
  }

  // ── Get status title/desc for a status (used internally) ─────────

  function getStatusLabel(status) {
    const labels = {
      confirming: "Confirming your payment…",
      ready: "Your report is ready",
      pending: "Payment confirmation is taking a little longer",
      data_unavailable: "Report temporarily unavailable",
      refunded: "Payment refunded",
      revoked: "Report access revoked",
      session_expired: "Session expired",
      not_found: "Report not found",
      owner_conflict: "Access denied",
      generic_error: "Something went wrong",
    };
    return labels[status] || "Something went wrong";
  }

  // ── API call ──────────────────────────────────────────────────────

  /**
   * Make a single status API request.
   * Returns { status, ok } on success, throws on network error.
   */
  async function fetchStatus(reportId) {
    const url = "/api/report-payment-status?report_id=" + encodeURIComponent(reportId);
    const controller = runtime.createAbortController();
    state.fetchController = controller;

    const resp = await runtime.fetch(url, {
      method: "GET",
      credentials: "same-origin",
      signal: controller.signal,
    });

    // Parse JSON — any failure → generic_error
    let body;
    try {
      body = await resp.json();
    } catch {
      return { status: "generic_error", isTerminal: true };
    }

    if (!body || typeof body !== "object" || typeof body.status !== "string") {
      return { status: "generic_error", isTerminal: true };
    }

    // Whitelist of allowed status values
    const ALLOWED = new Set([
      "pending", "ready", "data_unavailable",
      "refunded", "revoked", "session_expired",
      "not_found", "owner_conflict",
    ]);

    if (!ALLOWED.has(body.status)) {
      return { status: "generic_error", isTerminal: true };
    }

    // HTTP 401/403/404/503 → always terminal even if body says pending
    // (cookie cleared server-side, no point retrying)
    const terminalHttp = new Set([401, 403, 404, 503]);
    if (terminalHttp.has(resp.status)) {
      return { status: body.status, isTerminal: true };
    }

    const isTerminal = TERMINAL_STATUSES.has(body.status);
    return { status: body.status, isTerminal };
  }

  // ── Polling logic ─────────────────────────────────────────────────

  function startPolling(reportId) {
    // Cancel any existing polling
    stopPolling();

    state.cancelled = false;
    state.attempt = 0;
    state.networkErrorRetried = false;
    state.polling = true;

    // Ensure confirming is shown
    renderStatus("confirming");

    doPoll(reportId);
  }

  function doPoll(reportId) {
    if (state.cancelled || !state.polling) return;

    const attempt = state.attempt + 1;
    state.attempt = attempt;

    fetchStatus(reportId)
      .then((result) => {
        if (state.cancelled) return;

        if (result.isTerminal) {
          // Stop polling, show the status
          state.polling = false;
          renderStatus(result.status);
          return;
        }

        // Only pending continues polling
        if (result.status === "pending") {
          if (attempt < MAX_ATTEMPTS) {
            const delayMs = (POLL_INTERVALS[attempt - 1] || 5) * 1000;
            state.timerId = runtime.setTimeout(function () {
              doPoll(reportId);
            }, delayMs);
            return;
          }

          // Max attempts reached — stay on pending, show manual retry
          state.polling = false;
          renderStatus("pending");
          return;
        }

        // Unknown non-terminal status → stop with generic_error
        state.polling = false;
        renderStatus("generic_error");
      })
      .catch((err) => {
        if (state.cancelled) return;

        // AbortError = stopped intentionally by user or visibility change
        if (err.name === "AbortError") return;

        // Network error: allow one automatic retry
        if (!state.networkErrorRetried) {
          state.networkErrorRetried = true;
          state.timerId = runtime.setTimeout(function () {
            doPoll(reportId);
          }, 2000);
          return;
        }

        // Second network error → generic_error, stop polling
        state.polling = false;
        renderStatus("generic_error");
      });
  }

  function stopPolling() {
    state.polling = false;
    state.cancelled = true;

    if (state.timerId) {
      runtime.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (state.fetchController) {
      state.fetchController.abort();
      state.fetchController = null;
    }
  }

  // ── View report button ──────────────────────────────────────────

  let viewReportId = null;
  let hasNavigated = false;

  function updateViewButton(status) {
    const btn = document.getElementById("btn-view-report");
    if (!btn) return;

    const enabled = status === "ready";

    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", String(!enabled));

    if (enabled) {
      updateAriaLive(status);
    }
  }

  function navigateTo(target) {
    if (testNavigate) { testNavigate(target); return; }
    window.location.href = target;
  }

  function handleViewReport(e) {
    if (e) e.preventDefault();
    if (!viewReportId || hasNavigated) return;
    hasNavigated = true;
    var navTarget = "/report-viewer.html?report_id=" + encodeURIComponent(viewReportId);
    navigateTo(navTarget);
  }

  // Test hook — overrideable navigation


  // ── Retry handler (called by retry buttons) ───────────────────────

  function handleRetry() {
    const reportId = getReportIdFromUrl();
    if (!reportId || !isValidReportId(reportId)) {
      renderStatus("generic_error");
      return;
    }

    // Disable all retry buttons during retry
    disableRetryButtons(true);

    // Start fresh polling
    startPolling(reportId);

    // Re-enable buttons after a short delay (they'll be hidden by renderStatus anyway)
    runtime.setTimeout(function () { disableRetryButtons(false); }, 500);
  }

  function disableRetryButtons(disabled) {
    const btns = root.querySelectorAll('[id^="btn-retry-"]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].disabled = disabled;
    }
  }

  // ── Visibility change handler ─────────────────────────────────────

  function handleVisibilityChange() {
    if (document.hidden) {
      // Page hidden → stop polling (resume on show via init)
      stopPolling();
    }
  }

  // ── Beforeunload handler ──────────────────────────────────────────

  function handleBeforeUnload() {
    stopPolling();
  }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    const reportId = getReportIdFromUrl();
    const isValid = reportId && isValidReportId(reportId);

    if (!isValid) {
      renderStatus("generic_error");
      return;
    }

    // Store report ID for view navigation
    viewReportId = reportId;

    // Ensure aria-live region exists
    ensureAriaLive();

    // Show confirming, then start polling
    renderStatus("confirming");
    startPolling(reportId);

    // Bind retry buttons
    const btns = root.querySelectorAll('[id^="btn-retry-"]');
    for (let i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", handleRetry);
    }

    // View report button
    const viewBtn = document.getElementById("btn-view-report");
    if (viewBtn) {
      viewBtn.addEventListener("click", handleViewReport);
      viewBtn.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          // Prevent scroll on Space
          if (e.key === " ") e.preventDefault();
          handleViewReport(e);
        }
      });
    }

    // Visibility and unload handlers
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
  }

  // ── Run ──────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
