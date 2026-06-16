// ── api/leads.js ──
// GET only. Returns lead_contacts sorted by created_at DESC.
// No auth for now — endpoint returns minimal info (email, phone, name, created_at).
// Phase 2: list leads for admin review.

// Cold-start: lazy-import only when handling request

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  // Lazy-import DB module on cold start
  const { getSql } = await import("./_db.js");

  try {
    const sql = getSql();

    const rows = await sql`
      SELECT id, email, name, phone, created_at
      FROM lead_contacts
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return res.status(200).json({
      ok: true,
      total: rows.length,
      leads: rows.map(r => ({
        id: r.id,
        email: r.email,
        name: r.name || null,
        phone: r.phone || null,
        registeredAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("leads error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
