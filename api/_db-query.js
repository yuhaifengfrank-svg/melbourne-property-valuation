export default async function handler(req, res) {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    
    const ap = await sql`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT sale_address) as unique_addresses,
        COUNT(DISTINCT sale_address || '-' || sale_date || '-' || sale_price) as unique_transactions,
        MIN(sale_price) as min_price,
        MAX(sale_price) as max_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)::bigint as median_price,
        COUNT(*) FILTER (WHERE sale_date >= CURRENT_DATE - INTERVAL '3 years') as last_3y_count,
        ARRAY_AGG(DISTINCT property_type) as property_types
      FROM comparable_sales 
      WHERE LOWER(suburb) = 'albert park'
        AND sale_price > 50000
    `;
    
    const allStats = await sql`
      SELECT COUNT(*)::int as total_rows FROM comparable_sales
    `;
    
    res.json({ albert_park: ap[0], total_db: allStats[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
