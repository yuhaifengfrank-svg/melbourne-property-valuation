import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const HTML = readFileSync(new URL("../public/report-success.html", import.meta.url), "utf-8");
const JS = readFileSync(new URL("../public/report-success.js", import.meta.url), "utf-8");

function makeResponse(statusCode, body) {
  return { status: statusCode, json: () => Promise.resolve(body), ok: statusCode >= 200 && statusCode < 300 };
}

// ── Microtask flush ──
// Bridges the JSDOM vm-context microtask queue and Node.js test-context.
// A single queueMicrotask/nextTick is enough because Node's microtask queue
// is shared across vm contexts (same EventLoop).

function flush() {
  // 8 queueMicrotask rounds to flush chained async/await microtasks:
  // fetch → .json() → checkStatus → doPoll.then → render/setTimeout
  return new Promise(r => {
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => queueMicrotask(
      () => queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => queueMicrotask(r))))
    ))));
  });
}

function flushMany(n) {
  // Call flush n times sequentially
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) {
    p = p.then(() => flush());
  }
  return p;
}

// ── Manual Timer Queue ──

class TimerQueue {
  constructor() {
    this._timers = [];
    this._nextId = 1;
    this._fired = [];
    this._fetchCalls = [];
    this._fetchOptions = [];
    this._abortCount = 0;
  }

  makeHook(fetchMock) {
    const tq = this;
    return {
      fetch: function (url, opts) {
        tq._fetchCalls.push(typeof url === "string" ? url : url.url || String(url));
        tq._fetchOptions.push(opts);
        if (opts && opts.signal && opts.signal.aborted) {
          return Promise.reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        }
        try {
          const r = fetchMock(url, opts);
          return r && typeof r.then === "function" ? r : Promise.resolve(r);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      setTimeout: function (fn, ms) {
        const id = tq._nextId++;
        tq._timers.push({ callback: fn, delayMs: ms, id, fired: false });
        return id;
      },
      clearTimeout: function (id) {
        const idx = tq._timers.findIndex(t => t.id === id && !t.fired);
        if (idx !== -1) {
          tq._timers.splice(idx, 1);
        }
      },
      createAbortController: function () {
        let aborted = false;
        const signal = { get aborted() { return aborted; } };
        return {
          signal,
          abort: function () {
            if (!aborted) {
              aborted = true;
              tq._abortCount++;
            }
          },
        };
      },
    };
  }

  /** Fire the next pending timer callback */
  fireNext() {
    if (this._timers.length === 0) return null;
    const t = this._timers.shift();
    t.fired = true;
    this._fired.push({ delayMs: t.delayMs });
    t.callback();
    return t.delayMs;
  }

  /** Fire all pending timers in order */
  fireAll() {
    const delays = [];
    while (this._timers.length > 0) {
      const d = this.fireNext();
      if (d !== null) delays.push(d);
    }
    return delays;
  }

  get fetchCalls() { return this._fetchCalls; }
  get fetchOptions() { return this._fetchOptions; }
  get fetchCount() { return this._fetchCalls.length; }
  get abortCount() { return this._abortCount; }
  get timerCount() { return this._timers.length; }
  get firedDelays() { return this._fired.map(f => f.delayMs); }
}

// ── Test runner ──

function runPage(queryString, fetchMock) {
  const dom = new JSDOM(HTML, {
    url: "https://aushomevalue.com.au/report-success" + (queryString || ""),
    runScripts: "outside-only",
    contentType: "text/html",
    pretendToBeVisual: true,
    beforeParse() {},
  });

  const win = dom.window;
  const tq = new TimerQueue();
  const hook = tq.makeHook(fetchMock);
  win.__REPORT_SUCCESS_TEST_RUNTIME__ = hook;

  new win.Function(JS)(win);

  return { dom, win, tq };
}

function getVisibleStatus(dom) {
  for (const p of dom.window.document.querySelectorAll(".rs-page"))
    if (p.style.display !== "none") return p.getAttribute("data-status");
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

// ── Initial state / input validation ──

test("initial state is confirming with valid report_id", async () => {
  const { tq, dom } = runPage("?report_id=rp_1234567890_abcdef1234567890",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(getVisibleStatus(dom), "confirming");
});

test("missing report_id shows generic_error, no timer", async () => {
  const { tq, dom } = runPage("", () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(getVisibleStatus(dom), "generic_error");
  assert.equal(tq.timerCount, 0);
  assert.equal(tq.fetchCount, 0);
});

test("invalid report_id shows generic_error, no timer", async () => {
  const { tq, dom } = runPage("?report_id=BAD", () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(getVisibleStatus(dom), "generic_error");
  assert.equal(tq.timerCount, 0);
  assert.equal(tq.fetchCount, 0);
});

test("empty report_id shows generic_error, no timer", async () => {
  const { tq, dom } = runPage("?report_id=", () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(getVisibleStatus(dom), "generic_error");
  assert.equal(tq.timerCount, 0);
  assert.equal(tq.fetchCount, 0);
});

// ── Fetch setup ──

test("fetch URL targets payment-status API with report_id only", async () => {
  const { tq } = runPage("?report_id=rp_11111_1234567890123456",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  const url = tq.fetchCalls[0];
  assert.ok(url.includes("/api/report-payment-status"));
  assert.ok(url.includes("report_id="));
  assert.ok(!url.includes("email="));
  assert.ok(!url.includes("leadContactId"));
});

test("fetch uses credentials same-origin", async () => {
  const { tq } = runPage("?report_id=rp_1234567890_abcdef1234567890",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  const opts = tq.fetchOptions[0];
  assert.equal(opts.credentials, "same-origin");
});

// ── Core schedule ──

test("continuous pending fires exactly 6 requests", async () => {
  let rc = 0;
  const { tq } = runPage("?report_id=rp_99999_1234567890123456",
    () => { rc++; return makeResponse(200, { status: "pending" }); });
  await flush();
  assert.equal(rc, 1, "initial fetch");

  for (let i = 2; i <= 6; i++) {
    tq.fireNext();
    await flush();
    assert.equal(rc, i, `fetch ${i} should fire`);
  }

  assert.equal(tq.timerCount, 0, "no more pending timers");
  assert.equal(tq.fetchCount, 6, "exactly 6 fetch calls");
});

test("pending delays are [2000,2000,3000,3000,5000]", async () => {
  const { tq } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  for (let i = 0; i < 5; i++) {
    tq.fireNext();
    await flush();
  }
  assert.deepEqual(tq.firedDelays, [2000, 2000, 3000, 3000, 5000],
    `Got delays: ${JSON.stringify(tq.firedDelays)}`);
});

test("after 6th pending: no more timers, shows pending page", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "pending" }));
  await flush();

  for (let i = 0; i < 5; i++) {
    tq.fireNext();
    await flush();
  }

  assert.equal(tq.timerCount, 0, "no pending timers after max attempts");
  assert.equal(tq.fetchCount, 6, "exactly 6 fetches");
  assert.equal(getVisibleStatus(dom), "pending", "shows pending for manual retry");
});

// ── Terminal stops ──

test("ready stops polling immediately, no timer", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "ready" }));
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  assert.equal(tq.fetchCount, 1, "only initial fetch");
  assert.equal(tq.timerCount, 0, "no pending timers");
  assert.equal(getVisibleStatus(dom), "ready");
});

for (const [s, c] of [["refunded",403],["revoked",403],["session_expired",401],["not_found",404],["owner_conflict",403],["data_unavailable",503]]) {
  test(`terminal "${s}" stops polling, no timer`, async () => {
    const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
      () => makeResponse(c, { status: s }));
    await flush();
    assert.equal(tq.timerCount, 0, `no pending timers for ${s}`);
    assert.equal(tq.fetchCount, 1, `only initial fetch for ${s}`);
  });
}

// ── Error handling ──

test("unknown status stops polling, no timer", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "bogus" }));
  await flush();
  assert.equal(tq.timerCount, 0, "no pending timers");
  assert.equal(tq.fetchCount, 1, "only initial fetch");
  assert.equal(getVisibleStatus(dom), "generic_error");
});

test("invalid JSON stops polling, no timer", async () => {
  const { tq } = runPage("?report_id=rp_99999_1234567890123456",
    () => ({ status: 200, ok: true, json: () => Promise.reject(new Error("bad")) }));
  await flush();
  assert.equal(tq.timerCount, 0);
  assert.equal(tq.fetchCount, 1);
});

test("malformed body (non-object) stops polling, no timer", async () => {
  const { tq } = runPage("?report_id=rp_99999_1234567890123456",
    () => ({ status: 200, ok: true, json: () => Promise.resolve("not-json") }));
  await flush();
  assert.equal(tq.timerCount, 0);
  assert.equal(tq.fetchCount, 1);
});

test("second network error shows generic_error", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => Promise.reject(new TypeError("fail")));
  await flush();
  assert.equal(tq.fetchCount, 1, "first fetch errored");

  // First timer at 2000 should be pending (retry)
  assert.equal(tq.timerCount, 1, "retry timer pending");

  tq.fireNext();
  await flush();
  assert.equal(tq.fetchCount, 2, "second fetch errored");
  assert.equal(tq.timerCount, 0, "no more timers after second error");
  assert.equal(getVisibleStatus(dom), "generic_error");
});

// ── Cleanup handlers ──

test("visibilitychange clears pending timers", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(tq.timerCount, 1, "timer should exist before hide");

  Object.defineProperty(dom.window.document, "hidden", { value: true, configurable: true });
  dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
  await flush();

  assert.equal(tq.timerCount, 0, "visibilitychange cleared timer");
});

test("beforeunload clears pending timers", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(200, { status: "pending" }));
  await flush();
  assert.equal(tq.timerCount, 1, "timer should exist before unload");

  dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
  await flush();

  assert.equal(tq.timerCount, 0, "beforeunload cleared timer");
});

// ── Retry ──

test("retry button click restarts polling from confirming", async () => {
  let rc = 0;
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => { rc++; return makeResponse(200, { status: "pending" }); });
  await flush();

  // Exhaust all 5 timers
  for (let i = 0; i < 5; i++) {
    tq.fireNext();
    await flush();
  }

  assert.equal(getVisibleStatus(dom), "pending", "should be in manual retry state");
  assert.equal(rc, 6, "6 fetches before retry");

  const btn = dom.window.document.querySelector('[id^="btn-retry-"]');
  assert.ok(btn, "retry button exists");

  btn.click();
  await flush();

  // Retry should have called init again → confirmed + new fetch
  assert.equal(getVisibleStatus(dom), "confirming", "retry shows confirming");
  assert.equal(rc, 7, "retry triggers new fetch");

  // Clean up remaining timers
  while (tq.timerCount > 0) {
    tq.fireNext();
    await flush();
  }
});

// ── Concurrency: at most one fetch at a time ──

test("no concurrent fetches", async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const { tq } = runPage("?report_id=rp_99999_1234567890123456",
    () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      // Return a promise that decrements inFlight on resolution
      return new Promise(resolve => {
        queueMicrotask(() => { inFlight--; resolve(makeResponse(200, { status: "pending" })); });
      });
    });
  await flush();

  for (let i = 0; i < 5; i++) {
    tq.fireNext();
    await flush();
  }

  assert.equal(maxConcurrent, 1, "at most 1 concurrent fetch");
});

// ── AbortController on visibilitychange/beforeunload ──

test("visibilitychange aborts active fetch controller", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => new Promise(() => {})); // Never-resolving fetch (simulates in-flight)
  await flush();
  // fetch is still in-flight (promise never resolves)
  assert.equal(tq.fetchCount, 1, "fetch called");

  Object.defineProperty(dom.window.document, "hidden", { value: true, configurable: true });
  dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
  await flush();

  assert.ok(tq.abortCount >= 1, "abort() called on active controller");
});

test("beforeunload aborts active fetch controller", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => new Promise(() => {})); // Never-resolving fetch
  await flush();
  assert.equal(tq.fetchCount, 1, "fetch called");

  dom.window.dispatchEvent(new dom.window.Event("beforeunload"));
  await flush();

  assert.ok(tq.abortCount >= 1, "abort() called on active controller");
});

// ── Security / integrity ──

test("no cookie or localStorage reads in JS code", () => {
  const c = JS.replace(/\/\/.*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
  assert.ok(!c.includes("document.cookie"));
  assert.ok(!c.includes("localStorage"));
  assert.ok(!c.includes("sessionStorage"));
  assert.ok(!c.includes("opportunity_report"));
});

test("no valuation-full or Stripe calls in JS code", () => {
  const c = JS.replace(/\/\/.*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
  assert.ok(!c.includes("valuation-full"));
  assert.ok(!c.includes("stripe"));
  assert.ok(!c.includes("Stripe("));
});

test("no innerHTML or insertAdjacentHTML in JS code", () => {
  assert.ok(!JS.includes(".innerHTML"));
  assert.ok(!JS.includes("insertAdjacentHTML"));
});

test("shared-responsive.css linked in HTML", () => {
  assert.ok(HTML.includes('href="/shared-responsive.css"'));
});

test("all 10 status sections exist in HTML", () => {
  for (const s of ["confirming","ready","pending","data_unavailable","refunded","revoked","session_expired","not_found","owner_conflict","generic_error"])
    assert.ok(HTML.includes('data-status="' + s + '"'), "missing " + s);
});

test("test report IDs absent in HTML", () => {
  assert.equal(HTML.replace(/<!--[\s\S]*?-->/g,"").match(/rp_\d+_[0-9a-f]{16,}/g), null);
});

test("ready button is disabled placeholder", () => {
  const dom = new JSDOM(HTML, { url: "https://aushomevalue.com.au/report-success", runScripts: "outside-only" });
  const btn = dom.window.document.getElementById("btn-view-report");
  assert.ok(btn);
  assert.ok(btn.getAttribute("aria-disabled") === "true" || btn.disabled);
  assert.ok(btn.textContent.includes("viewer connecting next"));
});

test("retry buttons exist in HTML", () => {
  assert.ok(HTML.includes('id="btn-retry-'), "At least one retry button in HTML");
});

test("aria-live region exists and has content", async () => {
  const { tq, dom } = runPage("?report_id=rp_99999_1234567890123456",
    () => makeResponse(403, { status: "refunded" }));
  await flush();
  const el = dom.window.document.getElementById("rs-aria-live");
  assert.ok(el);
  assert.ok(el.textContent.length > 0);
});
