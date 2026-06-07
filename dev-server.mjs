// ── AusHomeValue Dev Server ──
// 本地开发服务器，完整静态+API
// 与 api/valuation.js 共享 lib/valuation-service.js

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runValuation } from "./lib/valuation-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.post("/api/valuation", async (req, res) => {
  try {
    const result = await runValuation(req.body || {}, { fetch: true });
    res.json(result);
  } catch (err) {
    console.error("[valuation] error:", err.message);
    res.json({
      ok: false,
      status: "error",
      error: err.message,
      valuation: null,
      evidenceMode: "unavailable",
      isFallback: false
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏠 AusHomeValue dev server running at http://127.0.0.1:${PORT}`);
});
