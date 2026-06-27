#!/usr/bin/env node
// ── 批量补全 comparable_sales 地理坐标 ──
// Nominatim 地理编码，每秒 ≤1 请求，支持中断恢复
// 用法: node scripts/backfill-coords.cjs [--dry-run]

const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
const fs = require("fs");
const PROGRESS = "/tmp/backfill-coords-progress.json";
const DRY_RUN = process.argv.includes("--dry-run");

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS)) {
      return JSON.parse(fs.readFileSync(PROGRESS, "utf-8"));
    }
  } catch {}
  return { done: 0, skipped: 0, failed: [], lastId: 0 };
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", VIC, Australia")}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "AusHomeValue/1.0 (property valuation)" },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  if (!data || data.length === 0) return { ok: false, error: "no results" };
  return { ok: true, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function main() {
  console.log(`Nominatim Backfill Coords (Dry run: ${DRY_RUN})\n`);
  const prog = loadProgress();
  
  const rows = await sql`
    SELECT id, sale_address, suburb FROM comparable_sales
    WHERE lat IS NULL OR lon IS NULL ORDER BY id
  `;
  console.log(`需补坐标: ${rows.length} 条（已处理 ${prog.done} 条）\n`);

  let done = prog.done;
  let skipped = prog.skipped;

  for (const row of rows) {
    if (row.id <= prog.lastId) continue;

    const result = await geocode(row.sale_address);

    if (result.ok) {
      if (!DRY_RUN) {
        await sql`UPDATE comparable_sales SET lat = ${result.lat}, lon = ${result.lon} WHERE id = ${row.id}`;
      }
      done++;
      if (done % 50 === 0) {
        console.log(`  [${done}/${rows.length}] ${row.sale_address.slice(0,45).padEnd(48)} → ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
        prog.done = done; prog.lastId = row.id; saveProgress(prog);
      }
    } else {
      skipped++;
      if (skipped % 10 === 0) { console.log(`  ⚠ [skip] ${row.sale_address}: ${result.error}`); }
    }

    await new Promise(r => setTimeout(r, 1100));
  }

  prog.done = done; prog.skipped = skipped; saveProgress(prog);
  console.log(`\n✅ 完成！成功: ${done}, 跳过: ${skipped}/${rows.length}`);
  process.exit(0);
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });
