// ── AusHomeValue Dev Server ──
// Phase 1B: Updated with free summary + gated full report + unlock-opportunity

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

/* ── Valuation (free summary) ── */
app.post("/api/valuation", async (req, res) => {
  try {
    // Dynamically import to share code with Vercel API
    const { default: handler } = await import("./api/valuation.js");
    // Express → Vercel-style request shim
    const vercelReq = { method: "POST", body: req.body, query: req.query || {}, headers: req.headers };
    const vercelRes = {
      _headers: {},
      _body: null,
      _status: 200,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      send(body) { this._body = body; }
    };
    await handler(vercelReq, vercelRes);
    res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
  } catch (err) {
    console.error("[valuation] error:", err.message);
    res.json({
      ok: false, status: "error", error: err.message,
      estimate: null, customerDataStatus: "unavailable",
      disclaimer: "Free valuation summary unavailable."
    });
  }
});

/* ── Full valuation (requires token) ── */
app.post("/api/valuation-full", async (req, res) => {
  try {
    const { default: handler } = await import("./api/valuation-full.js");
    const vercelReq = { method: "POST", body: req.body, query: req.query || {}, headers: req.headers };
    const vercelRes = {
      _headers: {}, _body: null, _status: 200,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      send(body) { this._body = body; }
    };
    await handler(vercelReq, vercelRes);
    res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
  } catch (err) {
    console.error("[valuation-full] error:", err.message);
    res.status(500).json({ ok: false, error: "Full valuation service unavailable." });
  }
});

/* ── Unlock opportunity (Phase 1B) ── */
app.post("/api/unlock-opportunity", async (req, res) => {
  try {
    const { default: handler } = await import("./api/unlock-opportunity.js");
    const vercelReq = { method: "POST", body: req.body, query: req.query || {}, headers: req.headers };
    const vercelRes = {
      _headers: {}, _body: null, _status: 200,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      send(body) { this._body = body; },
      end() {}
    };
    await handler(vercelReq, vercelRes);
    res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
  } catch (err) {
    console.error("[unlock-opportunity] error:", err.message);
    res.status(500).json({ ok: false, error: "Unlock service unavailable." });
  }
});

app.get("/api/unlock-opportunity", async (req, res) => {
  try {
    const { default: handler } = await import("./api/unlock-opportunity.js");
    const vercelReq = { method: "GET", query: req.query || {}, headers: req.headers, body: {} };
    const vercelRes = {
      _headers: {}, _body: null, _status: 200,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      send(body) { this._body = body; },
      end() {}
    };
    await handler(vercelReq, vercelRes);
    res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
  } catch (err) {
    console.error("[unlock-opportunity] GET error:", err.message);
    res.status(500).json({ ok: false, error: "Unlock service unavailable." });
  }
});

/* ── Existing API endpoints ── */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Proxy existing API endpoints from ./api/
const apiEndpoints = [
  "leads", "opportunity", "opportunity-unlock", "ping",
  "suburb-intelligence", "top-growth", "top-school",
  "top-supply", "top-value", "top-yield"
];

apiEndpoints.forEach(endpoint => {
  const methods = endpoint === "opportunity-unlock" ? ["GET", "POST"] : ["GET"];
  methods.forEach(method => {
    const route = `/api/${endpoint}`;
    if ((route === "/api/unlock-opportunity") || (route === "/api/valuation") || (route === "/api/valuation-full")) {
      return; // already handled above
    }
    if (method === "GET") {
      app.get(route, async (req, res) => {
        try {
          const mod = await import(`./api/${endpoint}.js`);
          const vercelReq = { method: "GET", query: req.query || {}, headers: req.headers, body: {} };
          const vercelRes = {
            _headers: {}, _body: null, _status: 200,
            status(code) { this._status = code; return this; },
            setHeader(k, v) { this._headers[k] = v; return this; },
            send(body) { this._body = body; },
            end() {}
          };
          await mod.default(vercelReq, vercelRes);
          res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
        } catch (err) {
          console.error(`[${route}] error:`, err.message);
          res.status(500).json({ ok: false, error: `${route} unavailable.` });
        }
      });
    } else if (method === "POST") {
      app.post(route, async (req, res) => {
        try {
          const mod = await import(`./api/${endpoint}.js`);
          const vercelReq = { method: "POST", body: req.body, query: req.query || {}, headers: req.headers };
          const vercelRes = {
            _headers: {}, _body: null, _status: 200,
            status(code) { this._status = code; return this; },
            setHeader(k, v) { this._headers[k] = v; return this; },
            send(body) { this._body = body; },
            end() {}
          };
          await mod.default(vercelReq, vercelRes);
          res.status(vercelRes._status).set(vercelRes._headers).send(vercelRes._body);
        } catch (err) {
          console.error(`[${route}] error:`, err.message);
          res.status(500).json({ ok: false, error: `${route} unavailable.` });
        }
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏠 AusHomeValue dev server running at http://127.0.0.1:${PORT}`);
});
