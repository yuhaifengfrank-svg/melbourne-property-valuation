// ── api/paid-report.js ──
// Phase 2: Paid tier full professional property report ($3.99)
// Returns a polished HTML report for printing/saving as PDF.
//
// POST only.
// Body: { leadContactId, address, suburb, state, propertyType }
// Requires valid leadContactId AND a report_entitlements record.
// Fallback for non-paid leads during development: allow leadContactId >= 80.

const COMPARABLES_FULL_COUNT = 12;

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

    // ── Check paid entitlement (or dev bypass for IDs >= 80) ──
    const [entitlement] = await sql`
      SELECT id, status FROM report_entitlements
      WHERE lead_contact_id = ${leadContactId} AND status = 'active'
      LIMIT 1
    `;
    const isPaid = !!entitlement || Number(leadContactId) >= 80;
    if (!isPaid) {
      return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "Full report requires payment ($3.99)" });
    }

    // ── Fetch valuation data ──
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
    let sm = {};
    if (suburb) {
      try {
        const [metric] = await sql`
          SELECT median_house_price, median_unit_price, vacancy_rate,
                 dwelling_separate_house, dwelling_flat, dwelling_semi_detached,
                 dwelling_occupancy_rate, dwelling_3br_plus,
                 supply_housing_stock AS dwelling_housing_stock,
                 supply_unemployment_rate,
                 growth_1y, growth_3y, growth_5y
          FROM suburb_metrics
          WHERE LOWER(suburb) = LOWER(${suburb})
            AND state = ${state}
          LIMIT 1
        `;
        if (metric) sm = metric;
      } catch (_) {}
    }

    const allComparables = result.comparables || val.acceptedComparables || [];
    const comparables = allComparables.slice(0, COMPARABLES_FULL_COUNT);

    // ── Fetch schools ──
    let schools = [];
    try {
      const rows = await sql`
        SELECT school_name, school_type, school_sector
        FROM school_locations
        WHERE LOWER(suburb) = LOWER(${suburb})
          AND state = ${state}
        ORDER BY school_name
        LIMIT 10
      `;
      schools = rows;
    } catch (_) {}

    // ── Derive presentation values ──
    const reportDate = new Date().toLocaleDateString("en-AU", {
      year: "numeric", month: "long", day: "numeric"
    });
    const reportTime = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

    const low = est.low != null ? `$${Number(est.low).toLocaleString()}` : "—";
    const high = est.high != null ? `$${Number(est.high).toLocaleString()}` : "—";
    const midpoint = est.midpoint != null ? `$${Number(est.midpoint).toLocaleString()}` : "—";
    const anchor = est.anchor != null ? `$${Number(est.anchor).toLocaleString()}` : "—";
    const totalFactor = est.factorTotal != null ? `${(Number(est.factorTotal) * 100).toFixed(2)}%` : "—";
    const confLabel = confidence.label || "N/A";
    const confScore = confidence.dataScore != null ? `${confidence.dataScore}/100` : "—";

    const separateHousePct = sm.dwelling_separate_house != null ? Number(sm.dwelling_separate_house).toFixed(1) : null;
    const flatPct = sm.dwelling_flat != null ? Number(sm.dwelling_flat).toFixed(1) : null;
    const semiPct = sm.dwelling_semi_detached != null ? Number(sm.dwelling_semi_detached).toFixed(1) : null;
    const unempRate = sm.supply_unemployment_rate != null ? Number(sm.supply_unemployment_rate).toFixed(1) : null;
    const occRate = sm.dwelling_occupancy_rate != null ? Number(sm.dwelling_occupancy_rate).toFixed(2) : null;
    const vacRate = sm.vacancy_rate != null ? Number(sm.vacancy_rate).toFixed(1) : null;
    const familyPct = sm.dwelling_3br_plus != null ? Number(sm.dwelling_3br_plus).toFixed(1) : null;

    const growthLines = [
      sm.growth_1y != null ? `1-year: ${Number(sm.growth_1y) >= 0 ? '+' : ''}${Number(sm.growth_1y).toFixed(1)}%` : null,
      sm.growth_3y != null ? `3-year: ${Number(sm.growth_3y) >= 0 ? '+' : ''}${Number(sm.growth_3y).toFixed(1)}%` : null,
      sm.growth_5y != null ? `5-year: ${Number(sm.growth_5y) >= 0 ? '+' : ''}${Number(sm.growth_5y).toFixed(1)}%` : null
    ].filter(Boolean);

    // Factor adjustments
    const factorItems = (est.factorAdjustments || []).map(f => {
      const pct = f.factor != null ? `${(Number(f.factor) * 100).toFixed(2)}%` : "—";
      const base = f.base != null ? `$${Number(f.base).toLocaleString()}` : "—";
      const subj = f.subject != null ? (typeof f.subject === 'number' ? f.subject + (f.name === 'land_size_vicmap' || f.name === 'land_size' ? ' m²' : '') : f.subject) : "—";
      const detail = f.detail || "";
      const direction = f.factor > 0 ? "▲" : f.factor < 0 ? "▼" : "—";
      let label = f.name || "";
      const labelMap = {
        "land_size_vicmap": "Land Size (Vicmap LGA)",
        "land_size": "Land Size (Comparable)",
        "bedrooms": "Bedrooms",
        "bathrooms": "Bathrooms",
        "census_consistency": "Census Consistency",
        "education_score": "Education Premium",
        "car_spaces": "Car Spaces",
        "building_size": "Building Size"
      };
      label = labelMap[f.name] || f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { label, base, subj, pct, detail, direction };
    });

    const housingMix = separateHousePct && flatPct
      ? `${separateHousePct}% detached · ${flatPct}% flats${semiPct ? ` · ${semiPct}% semi-detached` : ''}`
      : "Data pending";

    // Comparables HTML
    const comparablesHtml = comparables.map((c, i) => {
      const price = c.salePrice != null ? `$${Number(c.salePrice).toLocaleString()}` : "—";
      const dist = c.distanceMeters ? `${(c.distanceMeters / 1000).toFixed(2)} km` : "—";
      return `<tr${i % 2 === 1 ? ' class="alt"' : ''}>
        <td>${c.address || "—"}</td>
        <td class="num">${price}</td>
        <td>${c.saleDate || "—"}</td>
        <td class="num">${dist}</td>
        <td class="num">${c.bedrooms != null ? c.bedrooms : "—"}</td>
        <td class="num">${c.bathrooms != null ? c.bathrooms : "—"}</td>
        <td class="num">${c.carSpaces != null ? c.carSpaces : "—"}</td>
        <td class="num">${c.landSize ? c.landSize + ' m²' : "—"}</td>
      </tr>`;
    }).join("");

    // Factor adjustments HTML
    const factorsHtml = factorItems.length > 0 ? `
      <table class="factors">
        <thead><tr><th>Factor</th><th>Base Value</th><th>Subject Value</th><th>Adjustment</th><th>Note</th></tr></thead>
        <tbody>${factorItems.map((f, i) => `
          <tr${i % 2 === 1 ? ' class="alt"' : ''}>
            <td><strong>${f.label}</strong></td>
            <td class="num">${f.base}</td>
            <td class="num">${f.subj}</td>
            <td class="num ${f.direction === '▲' ? 'pos' : f.direction === '▼' ? 'neg' : ''}">${f.direction} ${f.pct}</td>
            <td>${f.detail}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div class="summary-line">
        <span class="label">Base Price:</span> <strong>${anchor}</strong>
        <span class="sep">|</span>
        <span class="label">Total Adjustment:</span> <strong>${totalFactor}</strong>
        <span class="sep">|</span>
        <span class="label">Estimated Midpoint:</span> <strong>${midpoint}</strong>
      </div>` : `
      <p class="note">Factor breakdown not available for this valuation method.</p>
      <div class="summary-line">
        <span class="label">Estimated Range:</span> <strong>${low} – ${high}</strong>
        <span class="sep">|</span>
        <span class="label">Confidence:</span> <strong>${confLabel}</strong>
      </div>`;

    // Schools HTML
    const schoolsHtml = schools.length
      ? `<table class="schools">
        <thead><tr><th>School</th><th>Type</th><th>Sector</th></tr></thead>
        <tbody>${schools.map((s, i) => `
          <tr${i % 2 === 1 ? ' class="alt"' : ''}>
            <td><strong>${s.school_name}</strong></td>
            <td>${s.school_type || "—"}</td>
            <td>${s.school_sector || "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`
      : "<p class='note'>School data not yet available for this area.</p>";

    // Micro-location from result
    const loc = result.location || {};
    const rankScore = loc.rank != null ? `${loc.rank}/100` : "—";
    const amenityScore = loc.amenity != null ? `${loc.amenity}/100` : "—";
    const parkingScore = loc.parking != null ? `${loc.parking}/100` : "—";
    const schoolDensity = loc.schoolDensity || "—";
    const streetType = loc.type || "—";

    // Suburb fundamentals from result
    const sub = result.suburb || {};
    const sfm = sub.housingMix || {};

    // ── Assembly HTML ──
    const growthSection = growthLines.length
      ? `<section class="section">
          <h2>Market Performance</h2>
          <div class="growth-grid">
            ${growthLines.map(g => `<div class="growth-item"><span class="growth-value">${g.split(':')[1]?.trim() || g}</span><span class="growth-label">${g.split(':')[0] || ''}</span></div>`).join("")}
          </div>
        </section>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Full Valuation Report — ${address || "AusHomeValue"}</title>
  <style>
    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1a1a2e;
      font-size: 13px;
      line-height: 1.7;
      background: #f5f7fa;
    }
    .report-wrap {
      max-width: 900px;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08);
    }

    /* ── Cover Page ── */
    .cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 60px 40px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
    }
    .cover .brand { font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: #e0e0ff; margin-bottom: 40px; }
    .cover h1 { font-size: 36px; font-weight: 700; margin-bottom: 12px; }
    .cover .address { font-size: 20px; color: #c0c0ff; margin-bottom: 8px; }
    .cover .subtitle { font-size: 15px; color: #9999cc; margin-bottom: 40px; }
    .cover .meta { font-size: 12px; color: #7777aa; }
    .cover .meta span { display: inline-block; margin: 0 12px; }

    /* ── Sections ── */
    .section { padding: 32px 48px; }
    .section h2 {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 3px solid #0f3460;
    }

    /* ── Executive Summary ── */
    .exec-summary { background: #f0f4ff; border-radius: 8px; padding: 24px; margin-bottom: 20px; }
    .exec-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .exec-item { flex: 1; min-width: 140px; }
    .exec-item .label { font-size: 11px; color: #667; text-transform: uppercase; letter-spacing: 0.5px; }
    .exec-item .value { font-size: 24px; font-weight: 700; color: #0f3460; }
    .exec-item .sub { font-size: 12px; color: #889; }

    .meta-grid { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
    .meta-item { font-size: 12px; color: #556; }
    .meta-item strong { color: #1a1a2e; }

    /* ── Comparables Table ── */
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    thead th {
      background: #1a1a2e;
      color: #fff;
      padding: 8px 10px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #e8e8ee; }
    tbody tr.alt td { background: #f8f9fc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .note { color: #889; font-size: 12px; margin: 8px 0; }

    /* ── Factor Adjustments ── */
    table.factors thead th { background: #0f3460; }
    table.factors td.pos { color: #1a8a3a; }
    table.factors td.neg { color: #c0392b; }
    .summary-line { background: #f0f4ff; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 13px; }
    .summary-line .label { color: #667; }
    .summary-line .sep { color: #ccc; margin: 0 10px; }

    /* ── Growth Grid ── */
    .growth-grid { display: flex; gap: 16px; flex-wrap: wrap; }
    .growth-item {
      background: #f8f9fc;
      border: 1px solid #e0e4ee;
      border-radius: 8px;
      padding: 16px 20px;
      text-align: center;
      flex: 1;
      min-width: 120px;
    }
    .growth-value { font-size: 20px; font-weight: 700; color: #0f3460; display: block; }
    .growth-label { font-size: 11px; color: #889; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 4px; display: block; }

    /* ── Data Grid (2-col) ── */
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .data-card {
      background: #f8f9fc;
      border: 1px solid #e0e4ee;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .data-card .card-label { font-size: 11px; color: #889; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
    .data-card .card-value { font-size: 16px; font-weight: 600; color: #1a1a2e; }

    /* ── Schools Table ── */
    table.schools thead th { background: #2c3e50; }

    /* ── Disclaimer ── */
    .disclaimer {
      background: #fafafa;
      border-top: 1px solid #ddd;
      padding: 24px 48px;
      font-size: 11px;
      color: #999;
      line-height: 1.6;
    }
    .disclaimer strong { color: #667; }

    /* ── Footer ── */
    .page-footer {
      text-align: center;
      font-size: 10px;
      color: #aaa;
      padding: 8px 48px;
      border-top: 1px solid #eee;
    }

    /* ── Print Styles ── */
    @media print {
      body { background: #fff; }
      .report-wrap { max-width: 100%; box-shadow: none; margin: 0; }
      .cover { page-break-after: always; min-height: 100vh; }
      .section { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      .page-footer { position: fixed; bottom: 0; left: 0; right: 0; }
    }
  </style>
</head>
<body>
<div class="report-wrap">

  <!-- ════ COVER ════ -->
  <div class="cover">
    <div class="brand">AusHomeValue</div>
    <h1>Full Valuation Report</h1>
    <div class="address">${address || suburb || "Property Address"}</div>
    <div class="subtitle">${suburb ? suburb + ', ' + state : ''} ${propertyType ? '— ' + propertyType.charAt(0).toUpperCase() + propertyType.slice(1) : ''}</div>
    <div class="meta">
      <span>Report Date: ${reportDate}</span>
      <span>|</span>
      <span>Confidence: ${confLabel}</span>
    </div>
  </div>

  <!-- ════ EXECUTIVE SUMMARY ════ -->
  <div class="section">
    <h2>1. Executive Summary</h2>
    <div class="exec-summary">
      <div class="exec-row">
        <div class="exec-item">
          <div class="label">Estimated Value (Low)</div>
          <div class="value">${low}</div>
        </div>
        <div class="exec-item">
          <div class="label">Estimated Value (Midpoint)</div>
          <div class="value">${midpoint}</div>
        </div>
        <div class="exec-item">
          <div class="label">Estimated Value (High)</div>
          <div class="value">${high}</div>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-item">Confidence Level: <strong>${confLabel}</strong></div>
        <div class="meta-item">Data Score: <strong>${confScore}</strong></div>
        <div class="meta-item">Valuation Date: <strong>${reportDate}</strong></div>
        <div class="meta-item">Data Source: <strong>Registered-tier database + public records</strong></div>
      </div>
    </div>
    ${growthSection}
  </div>

  <!-- ════ COMPARABLE SALES ════ -->
  <div class="section">
    <h2>2. Comparable Sales Analysis</h2>
    <p class="note">The following ${comparables.length} comparable sales were used to inform this valuation. Distances calculated from subject property.</p>
    ${comparables.length ? `
    <table>
      <thead><tr>
        <th>Address</th><th class="num">Price</th><th>Date</th><th class="num">Distance</th>
        <th class="num">Beds</th><th class="num">Baths</th><th class="num">Cars</th><th class="num">Land</th>
      </tr></thead>
      <tbody>${comparablesHtml}</tbody>
    </table>
    <p class="note">Source: Public property records and recent sales data.</p>` : '<p class="note">Comparable sales data pending for this area.</p>'}
  </div>

  <!-- ════ VALUATION FACTORS ════ -->
  <div class="section">
    <h2>3. Valuation Factor Breakdown</h2>
    <p class="note">Each adjustment compares the subject property characteristic to the suburb median. Positive adjustments increase the estimate; negative adjustments decrease it.</p>
    ${factorsHtml}
  </div>

  <!-- ════ MICRO-LOCATION ════ -->
  <div class="section">
    <h2>4. Micro-Location Analysis</h2>
    <div class="data-grid">
      <div class="data-card">
        <div class="card-label">Street Rank</div>
        <div class="card-value">${rankScore}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Street Type</div>
        <div class="card-value">${streetType}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Amenity Access</div>
        <div class="card-value">${amenityScore}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Parking Score</div>
        <div class="card-value">${parkingScore}</div>
      </div>
      <div class="data-card">
        <div class="card-label">School Density</div>
        <div class="card-value">${schoolDensity}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Occupancy Rate</div>
        <div class="card-value">${occRate ? occRate + ' /dwelling' : '—'}</div>
      </div>
    </div>
  </div>

  <!-- ════ SUBURB FUNDAMENTALS ════ -->
  <div class="section">
    <h2>5. Suburb Fundamentals</h2>
    <div class="data-grid">
      <div class="data-card">
        <div class="card-label">Housing Mix</div>
        <div class="card-value" style="font-size:13px;">${housingMix}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Occupancy</div>
        <div class="card-value">${occRate ? occRate + ' /dwelling' : '—'}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Family Dwellings (3+ BR)</div>
        <div class="card-value">${familyPct ? familyPct + '%' : '—'}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Unemployment Rate</div>
        <div class="card-value">${unempRate ? unempRate + '%' : '—'}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Vacancy Rate</div>
        <div class="card-value">${vacRate ? vacRate + '%' : '—'}</div>
      </div>
    </div>
  </div>

  <!-- ════ SCHOOLS ════ -->
  <div class="section">
    <h2>6. Schools Nearby</h2>
    ${schoolsHtml}
  </div>

  <!-- ════ PLANNING & POTENTIAL ════ -->
  <div class="section">
    <h2>7. Planning &amp; Potential</h2>
    ${result.planning ? `
    <div class="data-grid">
      <div class="data-card">
        <div class="card-label">Land Source</div>
        <div class="card-value" style="font-size:13px;">${result.planning.landSource || '—'}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Granny Flat Potential</div>
        <div class="card-value" style="font-size:13px;">${result.planning.granny || '—'}</div>
      </div>
      <div class="data-card">
        <div class="card-label">Approval Certainty</div>
        <div class="card-value" style="font-size:13px;">${result.planning.approval || '—'}</div>
      </div>
    </div>` : '<p class="note">Planning data not yet available for this property.</p>'}
  </div>

  <!-- ════ DISCLAIMER ════ -->
  <div class="disclaimer">
    <p><strong>Disclaimer</strong></p>
    <p>This valuation report is based on publicly available market information, property characteristics, and statistical analysis. It is provided for general information and research purposes only. Data may be delayed, incomplete, or subject to third-party recording discrepancies.</p>
    <p style="margin-top:8px;">This report does not constitute a formal valuation, credit decision, legal, tax, or financial advice. Always consult licensed professionals before making property transactions or investment decisions.</p>
    <p style="margin-top:8px;">© ${new Date().getFullYear()} AusHomeValue. All rights reserved.</p>
  </div>

  <div class="page-footer">
    AusHomeValue — Full Property Report | Generated ${reportDate} ${reportTime} | Page 1
  </div>

</div>
</body>
</html>`;

    return res.status(200)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .setHeader("Content-Disposition", `inline; filename="full-report-${suburb || 'property'}.html"`)
      .setHeader("Cache-Control", "no-store")
      .send(html);

  } catch (err) {
    console.error("paid-report error:", err);
    return res.status(500).json({ ok: false, error: "Internal error generating report" });
  }
}
