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

    // Use UnsafeRawSql to inject dynamic SQL into tagged template
    const { UnsafeRawSql } = await import('@neondatabase/serverless');
    const raw = new UnsafeRawSql(sqlStmt);
    // Passing UnsafeRawSql instance into tagged template escapes injection
    const result = await neonClient`${raw}`;

    let rows = [];
    if (result) {
      if (Array.isArray(result)) rows = result;
      else if (result.rows) rows = result.rows;
      else rows = [result];
    }

    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
