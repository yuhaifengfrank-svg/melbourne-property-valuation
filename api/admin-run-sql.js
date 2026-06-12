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

  const { sql: sqlStatements } = req.body;
  if (!sqlStatements) {
    return res.status(400).json({ ok: false, error: "missing sql" });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const results = [];

    // Split by semicolons (simple splitting, no complex SQL)
    const statements = sqlStatements
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        const result = await sql(stmt);
        results.push({ statement: stmt.substring(0, 60), rows: result || [] });
      } catch (e) {
        results.push({
          statement: stmt.substring(0, 60),
          error: e.message,
        });
      }
    }

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
