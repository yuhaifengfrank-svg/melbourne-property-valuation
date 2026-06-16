// ── Keep-alive endpoint for Vercel Cron ──
// Purpose: Prevent cold starts by hitting this every 5 minutes
// Response: fast JSON, no DB, no heavy modules
export default function handler(req, res) {
  // Set CORS headers for cron
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Only accept GET or HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.status(200).json({
    ok: true,
    ts: Date.now(),
    message: "keep-warm"
  });
}
