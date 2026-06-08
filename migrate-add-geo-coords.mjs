// ── Migration: Add lat/lon columns to comparable_sales ──
// 用法: node migrate-add-geo-coords.mjs
// 注意：用 DOTENV 导入，或者手动设 DATABASE_URL

import "dotenv/config";

// 用 pg Pool 而不是 neon，因为 ALTER TABLE+后续查询在 neon driver 中有 batch 问题
import pg from "pg";
const { Pool } = pg;

async function geocode(address, suburb, state) {
  const cleanAddr = address.replace(/^(\d+\/\s*)/, "").trim();
  const q = encodeURIComponent(`${cleanAddr}, ${suburb}, ${state || "VIC"}, Australia`);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "AusHomeValue/1.0 (geo migration)" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  
  // Add columns
  await pool.query("ALTER TABLE comparable_sales ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7), ADD COLUMN IF NOT EXISTS lon NUMERIC(10,7)");
  console.log("✅ lat/lon columns ready");
  
  const { rows: totalRow } = await pool.query("SELECT COUNT(*)::int AS c FROM comparable_sales");
  const { rows: doneRow } = await pool.query("SELECT COUNT(*)::int AS c FROM comparable_sales WHERE lat IS NOT NULL AND lon IS NOT NULL");
  const total = totalRow[0].c;
  const done = doneRow[0].c;
  const need = total - done;
  console.log(`📊 ${done}/${total} have coordinates, ${need} to geocode`);
  
  if (need === 0) {
    console.log("All done.");
    await pool.end();
    return;
  }
  
  let geocoded = 0, failed = 0;
  
  while (geocoded + failed < need) {
    const { rows } = await pool.query(
      "SELECT id, sale_address, suburb, state FROM comparable_sales WHERE lat IS NULL OR lon IS NULL ORDER BY id LIMIT 50"
    );
    
    if (rows.length === 0) break;
    
    for (const row of rows) {
      const state = row.state || "VIC";
      const geo = await geocode(row.sale_address, row.suburb, state);
      if (geo) {
        await pool.query("UPDATE comparable_sales SET lat = $1, lon = $2, updated_at = NOW() WHERE id = $3", [geo.lat, geo.lon, row.id]);
        geocoded++;
      } else {
        failed++;
      }
      // Nominatim: 1 req/sec
      await new Promise(r => setTimeout(r, 1100));
    }
    
    const pct = ((geocoded + failed) / need * 100).toFixed(1);
    console.log(`  ${geocoded} ok, ${failed} failed — ${pct}% (${geocoded + failed}/${need})`);
  }
  
  console.log(`\n✅ Complete: ${geocoded} geocoded, ${failed} failed`);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
