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
    const { address = "", propertyType = "house", leadContactId } = body;
    const suburb = body.suburb || "";
    const state = body.state || "VIC";

    // ── Validate the lead ──
    if (!leadContactId) {
      return res.status(400).json({ ok: false, error: "leadContactId required" });
    }
    const [lead] = await sql`SELECT id FROM lead_contacts WHERE id = ${leadContactId} LIMIT 1`;
    if (!lead) {
      return res.status(403).json({ ok: false, error: "Invalid lead contact" });
    }

    // ── Fetch valuation data directly ──
    const { runValuation } = await import("../lib/valuation-service.js");
    const result = await runValuation({
      address,
      suburb: body.suburb || suburb,
      state,
      propertyType: propertyType.toLowerCase(),
      landSize: body.landSize || null
    }, {
      fetch: false,
      useDatabaseFallback: true
    });

    const est = result.valuation?.estimate || result.estimate || {};
    const val = result.valuation || {};
    const confidence = val.confidence || {};

    // ── Fetch suburb metrics ──
    let suburbMetrics = {};
    if (suburb) {
      try {
        const [metric] = await sql`
          SELECT median_house_price, median_unit_price, vacancy_rate,
                 dwelling_separate_house, dwelling_flat, dwelling_semi_detached,
                 dwelling_occupancy_rate, dwelling_3br_plus,
                 supply_housing_stock AS dwelling_housing_stock, supply_unemployment_rate,
                 growth_1y, growth_3y, growth_5y
          FROM suburb_metrics
          WHERE LOWER(suburb) = LOWER(${suburb})
            AND state = ${state}
          LIMIT 1
        `;
        if (metric) suburbMetrics = metric;
      } catch (_) {}
    }

    const allComparables = result.comparables || val.acceptedComparables || [];
    const comparables = allComparables.slice(0, COMPARABLES_COUNT);

    // ── Fetch schools for this suburb ──
    let schools = [];
    try {
      const rows = await sql`
        SELECT school_name, school_type, school_sector
        FROM school_locations
        WHERE LOWER(suburb) = LOWER(${suburb})
          AND state = ${state}
        ORDER BY school_name
        LIMIT 5
      `;
      schools = rows;
    } catch (_) {}

    const isUnitLike = propertyType === "unit" || propertyType === "apartment";
    const sm = suburbMetrics;
    const separateHousePct = sm.dwelling_separate_house != null ? Number(sm.dwelling_separate_house) : null;
    const flatPct = sm.dwelling_flat != null ? Number(sm.dwelling_flat) : null;
    const unempRate = sm.supply_unemployment_rate != null ? Number(sm.supply_unemployment_rate) : null;
    const occRate = sm.dwelling_occupancy_rate != null ? Number(sm.dwelling_occupancy_rate) : null;

    // ── Build a simple HTML report ──
    const reportDate = new Date().toLocaleDateString("en-AU", {
      year: "numeric", month: "long", day: "numeric"
    });

    const low = est.low != null ? `$${Number(est.low).toLocaleString()}` : "—";
    const high = est.high != null ? `$${Number(est.high).toLocaleString()}` : "—";
    const midpoint = est.midpoint != null ? `$${Number(est.midpoint).toLocaleString()}` : "—";

    const comparablesHtml = comparables.map(c => {
      const price = c.salePrice != null ? `$${Number(c.salePrice).toLocaleString()}` : "—";
      const dist = c.distanceMeters ? `${(c.distanceMeters / 1000).toFixed(2)} km` : "—";
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.address || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${price}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.saleDate || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${dist}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.bedrooms != null ? c.bedrooms : "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px;">${c.landSize ? c.landSize + ' m²' : "—"}</td>
      </tr>`;
    }).join("");

    const housingMixLine = separateHousePct && flatPct
      ? `${separateHousePct}% detached, ${flatPct}% flats, ${sm.dwelling_semi_detached != null ? Number(sm.dwelling_semi_detached) + '% semi' : '-'}`
      : "—";

    const schoolsHtml = schools.length
      ? `<ul>${schools.map(s => `<li>${s.school_name} (${s.school_type || ''}${s.school_sector ? ', ' + s.school_sector : ''})</li>`).join("")}</ul>`
      : "<p style='color:#999;'>No schools mapped yet.</p>";

    const growthLines = [
      sm.growth_1y != null ? `1-year: ${Number(sm.growth_1y) >= 0 ? '+' : ''}${Number(sm.growth_1y).toFixed(1)}%` : null,
      sm.growth_3y != null ? `3-year: ${Number(sm.growth_3y) >= 0 ? '+' : ''}${Number(sm.growth_3y).toFixed(1)}%` : null,
      sm.growth_5y != null ? `5-year: ${Number(sm.growth_5y) >= 0 ? '+' : ''}${Number(sm.growth_5y).toFixed(1)}%` : null
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Property Summary — ${address || "AusHomeValue"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 32px 40px; color: #1a1a2e; font-size: 14px; line-height: 1.6; }
    h1 { font-size: 24px; margin: 0 0 2px 0; color: #1a1a2e; }
    h2 { font-size: 16px; margin: 24px 0 8px 0; color: #3a3a5e; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .subtitle { color: #667; font-size: 13px; margin-bottom: 16px; }
    .estimate-box { background: #f0f8ff; border: 1px solid #b8daff; border-radius: 8px; padding: 16px 20px; margin: 8px 0; }
    .estimate-row { display: flex; gap: 20px; }
    .estimate-item { flex: 1; }
    .estimate-item .label { font-size: 11px; color: #667; text-transform: uppercase; letter-spacing: 0.5px; }
    .estimate-item .value { font-size: 18px; font-weight: 700; color: #1a1a2e; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: #f9f9fb; border: 1px solid #e8e8ee; border-radius: 8px; padding: 12px 16px; }
    .card h3 { font-size: 14px; margin: 0 0 6px 0; color: #3a3a5e; }
    .card .stat { font-size: 16px; font-weight: 600; }
    .card .stat-sub { font-size: 11px; color: #667; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th { background: #f5f5f5; padding: 6px 10px; text-align: left; font-size: 12px; color: #667; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #ddd; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    ul { padding-left: 20px; margin: 8px 0; }
    li { margin-bottom: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <h1>Property Summary Report</h1>
  <div class="subtitle">
    ${address} | Generated ${reportDate} | Registered-tier preview
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

  <h2>Comparable Sales (${comparables.length})</h2>
  ${comparables.length ? `<table>
    <thead><tr><th>Address</th><th>Price</th><th>Date</th><th>Distance</th><th>Bed</th><th>Land</th></tr></thead>
    <tbody>${comparablesHtml}</tbody>
  </table>` : "<p style='color:#999;'>Comparable sales data pending.</p>"}

  <h2>Micro-Location &amp; Suburb Data</h2>
  <div class="grid-2">
    <div class="card">
      <h3>Housing mix</h3>
      <div class="stat">${housingMixLine}</div>
    </div>
    <div class="card">
      <h3>Unemployment</h3>
      <div class="stat">${unempRate != null ? unempRate.toFixed(1) + '%' : '—'}</div>
    </div>
    <div class="card">
      <h3>Vacancy rate</h3>
      <div class="stat">${sm.vacancy_rate != null ? Number(sm.vacancy_rate).toFixed(1) + '%' : '—'}</div>
    </div>
    <div class="card">
      <h3>Occupancy</h3>
      <div class="stat">${occRate != null ? occRate.toFixed(2) + ' /dwelling' : '—'}</div>
    </div>
  </div>
  ${growthLines ? `<p style="font-size:13px;color:#555;margin-top:4px;">Price growth: ${growthLines}</p>` : ""}

  <h2>Schools Nearby</h2>
  ${schoolsHtml}

  <div class="footer">
    <p><strong>AusHomeValue</strong> — Property Summary Report (Registered Tier)</p>
    <p>This summary is for research purposes only. Not a formal valuation, credit decision, legal, tax or financial advice.</p>
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
