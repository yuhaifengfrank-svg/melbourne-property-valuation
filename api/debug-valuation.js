// ── Debug handler: run valuation and dump full internal state ──
// Temporary — will be deleted after debugging session.
import { runValuation } from "../lib/valuation-service.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = await runValuation(body, { fetch: false });

    // Return full result, no sanitize
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
