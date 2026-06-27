#!/usr/bin/env node
// ── 批量补全 comparable_sales 地理坐标 ──
// Nominatim 地理编码，每秒 ≤1 请求，支持中断恢复
// 用法: node scripts/backfill-coords.mjs [--dry-run]

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
import fs from "fs";

const PROGRESS = "/tmp/backfill-coords-progress.json";
const DRY_RUN = process.argv.includes("--dry-run");

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, "utf-8"));
  } catch {}
  return { done: 0, skipped: 0, failed: [], lastId: 0 };
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2)); }

function cleanAddress(raw) {
  // Strip complex unit prefixes: G18/, 501/, 501e/, 2402/, 3/, etc.
  let addr = (raw || '').trim();
  // Strip any pattern like ^(digits/|digitsletters/|letterdigits/)
  addr = addr.replace(/^[a-zA-Z0-9]+\/(?=\d+\s)/, '');
  // Also strip patterns like G18/, G01/, etc. (letter+number/)
  addr = addr.replace(/^[A-Z]\d+\//, '');
  addr = addr.replace(/^\d+[a-z]?\//, '');
  // Remove non-breaking spaces
  addr = addr.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  // Collapse multiple spaces
  addr = addr.replace(/\s{2,}/g, ' ').trim();
  // If still looks like a unit address (starts with digits), try stripping first chunk
  if (/^\d+[-\/\s]/.test(addr)) {
    addr = addr.replace(/^\d+[-\/]\s*/, '');
  }
  return addr;
}

async function geocode(address, suburb) {
  const cleaned = cleanAddress(address);
  let query = cleaned;
  // If cleaned still has unit patterns like "Unit 1," strip those too
  query = query.replace(/^Unit\s+\d+[,\/\s]*/i, '').replace(/^[A-Z]\d+[,\/\s]*(?=\d+\s)/, '');
  query = query.replace(/[\u00A0]/g, ' ').trim();
  // Only append suburb if it's not already in the query string
  if (suburb) {
    const queryLower = query.toLowerCase();
    const suburbLower = suburb.toLowerCase();
    // Check if suburb appears as a stand-alone word in the query
    const suburbInQuery = queryLower.includes(suburbLower) && 
      (queryLower.endsWith(suburbLower) || queryLower.includes(suburbLower + ',') || queryLower.includes(suburbLower + ' '));
    if (!suburbInQuery) {
      query = query + ", " + suburb;
    }
  }
  query = query + ", VIC, Australia";
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": "AusHomeValue/1.0 (property valuation)" } });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  if (!data || data.length === 0) return { ok: false, error: "no results" };
  return { ok: true, lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function main() {
  console.log(`Nominatim Backfill Coords (Dry run: ${DRY_RUN})
`);
  const prog = loadProgress();
  const rows = await sql`
    SELECT id, sale_address, suburb FROM comparable_sales
    WHERE lat IS NULL OR lon IS NULL ORDER BY id
  `;
  console.log(`需补坐标: ${rows.length} 条（已处理 ${prog.done} 条）
`);

  let done = prog.done, skipped = prog.skipped;
  const lastId = Number(prog.lastId) || 0;

  // 如果 --dry-run，只测 5 条
  const limit = DRY_RUN ? 5 : rows.length;

  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (lastId > 0 && Number(row.id) <= lastId) continue;

    const result = await geocode(row.sale_address, row.suburb);

    if (result.ok) {
      if (!DRY_RUN) {
        await sql`UPDATE comparable_sales SET lat = ${result.lat}, lon = ${result.lon} WHERE id = ${row.id}`;
      }
      done++;
      if (done % 50 === 0 || DRY_RUN) {
        console.log(`  [${done}/${rows.length}] ${row.sale_address.slice(0,45).padEnd(48)} → ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
        prog.done = done; prog.lastId = row.id; saveProgress(prog);
      }
    } else {
      skipped++;
      if (skipped % 10 === 0) console.log(`  ⚠ [skip] ${row.sale_address}: ${result.error}`);
    }

    await new Promise(r => setTimeout(r, 1100));
  }

  prog.done = done; prog.skipped = skipped; saveProgress(prog);
  console.log(`\n✅ ${DRY_RUN ? 'Dry run' : '完成'}！成功: ${done}, 跳过: ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
