export default async function handler(req, res) {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    
    const ap = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sale_date >= CURRENT_DATE - INTERVAL '3 years') as last_3y_count,
        MIN(sale_price) as min_price,
        MAX(sale_price) as max_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)::bigint as median_price,
        ARRAY_AGG(DISTINCT property_type) as property_types
      FROM comparable_sales 
      WHERE LOWER(suburb) = 'albert park'
        AND sale_price > 50000
    `;
    
    // Count all records
    const allStats = await sql`SELECT COUNT(*)::int as total_rows FROM comparable_sales`;
    
    // Count distinct suburbs
    const suburbs = await sql`SELECT COUNT(DISTINCT suburb)::int as suburb_count FROM comparable_sales WHERE suburb IS NOT NULL AND suburb != ''`;
    
    res.json({ 
      albert_park: ap[0], 
      total_db: allStats[0],
      suburbs_with_data: suburbs[0].suburb_count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
