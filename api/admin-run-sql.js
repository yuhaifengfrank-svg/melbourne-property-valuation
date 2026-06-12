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

    // Use sql.unsafe() for dynamic SQL execution
    const result = await neonClient.unsafe(sqlStmt);

    // Debug: dump the full result type
    const debugInfo = {
      type: typeof result,
      isArray: Array.isArray(result),
      keys: result && typeof result === 'object' ? Object.keys(result) : null,
      hasRows: !!(result && result.rows),
      hasLength: !!(result && result.length !== undefined),
      sample: result ? (typeof result === 'object' ? 
        (Array.isArray(result) ? result.slice(0,2) : 
          JSON.stringify(result).substring(0,200)) : 
        String(result).substring(0,200)) : null
    };

    // Normalize: try multiple access patterns
    let rows;
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && Array.isArray(result.rows)) {
      rows = result.rows;
    } else if (result && result.length !== undefined) {
      rows = Array.from(result);
    } else {
      rows = [];
    }

    return res.status(200).json({ ok: true, rows, _debug: debugInfo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
