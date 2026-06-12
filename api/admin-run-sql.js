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

    // Use sql.query() which accepts dynamic SQL text
    // neon() returns a function with .query() method
    const result = await neonClient.query(sqlStmt);

    // Normalize — query() returns postgres.js style result with .rows
    const rows = (result && result.rows) ? result.rows : [];

    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
