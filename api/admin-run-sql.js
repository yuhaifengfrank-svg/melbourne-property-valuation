import { neon } from "@neondatabase/serverless";

// One-time admin endpoint for Phase 1B cleanup
// Removed before next deployment

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  // Secret to prevent abuse
  const secret = req.headers["x-admin-secret"];
  if (secret !== "phase1b-cleanup-20260612") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const { sql: sqlStmt } = req.body;
  if (!sqlStmt) {
    return res.status(400).json({ ok: false, error: "missing sql" });
  }

  try {
    const neonClient = neon(process.env.DATABASE_URL);
    const results = [];

    // Use sql.unsafe() for dynamic SQL execution
    // Each call is a single statement (no semicolon splitting needed)
    const result = await neonClient.unsafe(sqlStmt);

    return res.status(200).json({ ok: true, rows: result || [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
