export default async (req, res) => {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const r = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales WHERE suburb = 'kew'`;
  res.json(r[0]);
};
