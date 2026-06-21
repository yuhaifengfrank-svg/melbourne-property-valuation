/**
 * api/audit-sample.js
 *
 * Returns a random sample of addresses from comparable_sales for
 * production valuation audits. Exposed so the local test script
 * doesn't need DATABASE_URL access.
 *
 * Usage: POST /api/audit-sample
 *   Body: { count: 200, houseRatio: 0.5 }
 *
 * Returns: { ok: true, sample: [{ address, propertyType, salesCount }] }
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { getSql } = await import("./_db.js");
    const sql = getSql();

    const count = Math.min(Math.max(parseInt(req.body?.count) || 200, 1), 500);
    const houseRatio = Math.min(Math.max(parseFloat(req.body?.houseRatio) || 0.5, 0), 1);
    const houseTarget = Math.ceil(count * houseRatio);
    const unitTarget = count - houseTarget;

    // House / Villa
    const houseRows = await sql`
      SELECT
        sale_address,
        suburb,
        state,
        postcode,
        property_type,
        COUNT(*)::int AS sales_count
      FROM comparable_sales
      WHERE
        sale_price IS NOT NULL
        AND sale_price >= 200000
        AND sale_address IS NOT NULL
        AND suburb IS NOT NULL
        AND state = 'VIC'
        AND LOWER(property_type) IN ('house', 'villa')
      GROUP BY sale_address, suburb, state, postcode, property_type
      ORDER BY RANDOM()
      LIMIT ${houseTarget}
    `;

    // Unit / Apartment / Flat
    const unitRows = await sql`
      SELECT
        sale_address,
        suburb,
        state,
        postcode,
        COALESCE(NULLIF(property_type, ''), 'Unit') AS property_type,
        COUNT(*)::int AS sales_count
      FROM comparable_sales
      WHERE
        sale_price IS NOT NULL
        AND sale_price >= 100000
        AND sale_address IS NOT NULL
        AND suburb IS NOT NULL
        AND state = 'VIC'
        AND (
          LOWER(property_type) IN ('unit', 'apartment', 'flat')
          OR sale_address ~* '^(Unit\\s+\\d+|Unit\\s+\\d+/\\d+|Apartment\\s+\\d+|Flat\\s+\\d+)'
        )
      GROUP BY sale_address, suburb, state, postcode, property_type
      ORDER BY RANDOM()
      LIMIT ${unitTarget}
    `;

    const sample = [...houseRows, ...unitRows]
      .sort(() => Math.random() - 0.5)
      .map(r => ({
        address: r.sale_address.trim(),
        suburb: r.suburb.trim(),
        state: r.state.trim(),
        postcode: r.postcode?.toString().trim() || "",
        propertyType: r.property_type || "House",
        salesCount: r.sales_count,
      }));

    const houseCount = sample.filter(r => r.propertyType === "House").length;
    const unitCount = sample.length - houseCount;

    return res.status(200).json({
      ok: true,
      total: sample.length,
      houseCount,
      unitCount,
      sample,
    });
  } catch (err) {
    console.error("[audit-sample] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
