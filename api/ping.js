/**
 * Simple ping endpoint — tests Neon HTTP connection
 */
import { neon } from '@neondatabase/serverless';

let _sql = null;
function getSql() {
  if (!_sql && process.env.DATABASE_URL) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

export default async function handler(request) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  try {
    const sql = getSql();
    const row = await sql`SELECT 1 AS ping, current_database() AS db, version() AS ver`;
    const count = await sql.query('SELECT COUNT(*)::int AS cnt FROM comparable_sales', []);
    return new Response(JSON.stringify({ 
      ok: true, 
      ping: row[0], 
      saleCount: count[0]?.cnt,
      envUrl: process.env.DATABASE_URL ? 'set' : 'not set'
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\\n') }), { status: 500, headers });
  }
}
