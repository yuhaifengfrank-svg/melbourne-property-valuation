// ── api/simple-report.js ──
// Phase 2: Registered-tier simple PDF report (hook)
// Returns a lightweight HTML that can be printed/converted to PDF.
//
// POST only.
// Body: { address, propertyType, leadContactId }
// Requires valid leadContactId to proceed.

const COMPARABLES_COUNT = 5;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { getSql } = await import("./_db.js");
    const sql = getSql();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { address, propertyType = "house", leadContactId } = body;
    const suburb = body.suburb || "";
    const state = body.state || "VIC";

    // ── Validate the lead ──
    if (!leadContactId) {
      return res.status(400).json({ ok: false, error: "leadContactId required" });
    }
    const [lead] = await sql`SELECT id, email, name, consented FROM lead_contacts WHERE id = ${leadContactId} LIMIT 1`;
    if (!lead) {
      return res.status(403).json({ ok: false, error: "Invalid lead contact" });
    }
    // Require consent for generating a PDF
    if (!lead.consented) {
      return res.status(403).json({ ok: false, error: "Contact consent required for PDF download" });
    }

    // ── Get the same data valuation-lead would return ──
    const { handler: valuationLeadHandler } = await import("./valuation-lead.js");

    // Build a mini request to re-use valuation-lead logic
    const mockReq = {
      method: "POST",
      body: body // already parsed
    };
    const mockRes = {
      _status: 200,
      _json: null,
      status(s) { this._status = s; return this; },
      setHeader() { return this; },
      json(d) { this._json = d; },
      end() {}
    };

    await valuationLeadHandler(mockReq, mockRes);

    if (!mockRes._json || !mockRes._json.ok) {
      return res.status(500).json({ ok: false, error: "Failed to retrieve valuation data" });
    }

    const data = mockRes._json;

    // ── Build a simple HTML report ──
    const reportDate = new Date().toLocaleDateString("en-AU", {
      year: "numeric", month: "long", day: "numeric"
    });

    const estimate = data.estimate || {};
    const low = estimate.low != null ? `$${Number(estimate.low).toLocaleString()}` : "—";
    const high = estimate.high != null ? `$${Number(estimate.high).toLocaleString()}` : "—";
    const midpoint = estimate.midpoint != null ? `$${Number(estimate.midpoint).toLocaleString()}` : "—";

    const comparablesHtml = (data.comparables || []).slice(0, COMPARABLES_COUNT).map(c => {
      const price = c.salePrice != null ? `$${Number(c.salePrice).toLocaleString()}` : "—";
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.address || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${price}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.saleDate || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.distance != null ? c.distance.toFixed(2) + " km" : "—"}</td>
      </tr>`;
    }).join("");

    const loc = data.location || {};
    const suburbList = Array.isArray(data.suburb) ? data.suburb : [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Property Summary — ${address || "AusHomeValue"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 32px 40px; color: #1a1a2e; font-size: 14px; line-height: 1.6; }
    h1 { font-size: 22px; margin: 0 0 4px 0; }
    h2 { font-size: 16px; margin: 24px 0 8px 0; color: #3a3a5e; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .subtitle { color: #667; font-size: 13px; margin-bottom: 20px; }
    .estimate-box { background: #f0f8ff; border: 1px solid #b8daff; border-radius: 8px; padding: 16px 20px; margin: 8px 0; }
    .estimate-row { display: flex; gap: 20px; }
    .estimate-item { flex: 1; }
    .estimate-item .label { font-size: 11px; color: #667; text-transform: uppercase; letter-spacing: 0.5px; }
    .estimate-item .value { font-size: 18px; font-weight: 700; color: #1a1a2e; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { background: #f5f5f5; padding: 6px 10px; text-align: left; font-size: 12px; color: #667; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #ddd; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    ul { padding-left: 20px; margin: 8px 0; }
    li { margin-bottom: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; }
    .badge { display: inline-block; background: #e8f5e8; color: #2d7d2d; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Property Summary Report</h1>
  <div class="subtitle">
    ${address || "—"} | Generated ${reportDate} | Registered-tier preview
  </div>

  <div class="estimate-box">
    <div style="font-size:11px;color:#667;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Estimated Value Range</div>
    <div class="estimate-row">
      <div class="estimate-item">
        <div class="label">Low</div>
        <div class="value">${low}</div>
      </div>
      <div class="estimate-item">
        <div class="label">Midpoint</div>
        <div class="value">${midpoint}</div>
      </div>
      <div class="estimate-item">
        <div class="label">High</div>
        <div class="value">${high}</div>
      </div>
    </div>
  </div>

  <h2>Comparable Sales (${data.comparableCount || 0})</h2>
  ${comparablesHtml ? `<table>
    <thead><tr>
      <th>Address</th><th>Sale Price</th><th>Date</th><th>Distance</th>
    </tr></thead>
    <tbody>${comparablesHtml}</tbody>
  </table>` : "<p style='color:#999;'>Comparable sales data not yet available.</p>"}

  <h2>Micro-Location Assessment</h2>
  <table>
    <tr><td style="width:160px;font-weight:600;">Street rank</td><td>${loc.rank || "—"}</td></tr>
    <tr><td style="font-weight:600;">Street type</td><td>${loc.type || "—"}</td></tr>
    <tr><td style="font-weight:600;">Amenity access</td><td>${loc.amenity || "—"}</td></tr>
    <tr><td style="font-weight:600;">Parking pressure</td><td>${loc.parking || "—"}</td></tr>
  </table>

  <h2>Suburb Fundamentals</h2>
  ${suburbList.length ? `<ul>${suburbList.map(s => `<li>${s}</li>`).join("")}</ul>` : "<p style='color:#999;'>Suburb data pending.</p>"}

  <h2>Planning &amp; Potential</h2>
  <table>
    <tr><td style="width:160px;font-weight:600;">Land source</td><td>${(data.planning && data.planning.landSource) || "—"}</td></tr>
    <tr><td style="font-weight:600;">Granny flat potential</td><td>${(data.planning && data.planning.granny) || "—"}</td></tr>
    <tr><td style="font-weight:600;">Approval certainty</td><td>${(data.planning && data.planning.approval) || "—"}</td></tr>
  </table>

  <div class="footer">
    <p><strong>AusHomeValue</strong> — Property Summary (Registered Tier)</p>
    <p>This is a summary report for research purposes only. Not a formal valuation, not financial advice.</p>
    <p>Full detailed report available for AUD $3.99.</p>
  </div>
</body>
</html>`;

    return res.status(200)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .setHeader("Content-Disposition", `inline; filename="property-summary-${suburb || 'report'}.html"`)
      .setHeader("Cache-Control", "no-store")
      .send(html);

  } catch (err) {
    console.error("simple-report error:", err);
    return res.status(500).json({ ok: false, error: "Internal error generating report" });
  }
}
