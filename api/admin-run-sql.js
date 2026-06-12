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

    // Use sql via tagged template
    const stmt = sqlStmt.trim();

    // Execute via raw query using a temporary tagged template
    // Neon serverless requires tagged template: sql`SELECT ...`
    // For dynamic SQL, we use the Query class or exec
    const result = await neonClient.unsafe(stmt);

    // Normalize: Handle different neon return formats
    let rows = [];
    if (result) {
      if (Array.isArray(result)) rows = result;
      else if (result.rows && Array.isArray(result.rows)) rows = result.rows;
      else if (typeof result === 'object' && result !== null) rows = [result];
    }

    return res.status(200).json({ ok: true, rows, _raw: rows.length === 0 ? JSON.stringify(result).substring(0,200) : undefined });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
