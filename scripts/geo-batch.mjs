// geo-batch.mjs — Batch geocode all unique comparable_sales addresses
//  Runs forever until all addresses are processed.
//  Designed to survive reboot / SIGTERM via nohup or systemd.
//
//  Usage:  node scripts/geo-batch.mjs
//
//  On SIGTERM/SIGINT: gracefully saves state and exits (restart = resume).

import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

// ──────────────────── Config ────────────────────
const RATE_LIMIT_MS = 1200;                     // Nominatim: 1 req/s + 200ms safety
const PROGRESS_INTERVAL = 50;                   // Log line every N addresses
const FETCH_PAGE = 200;                         // Rows per DB page (smaller = faster paging)
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "AusHomeValue/1.0 (geo-batch; +https://aushomevalue.com.au)";

// All paths relative to `scripts/` so the project root is `..`
const PROJECT_ROOT = import.meta.dirname ? path.resolve(import.meta.dirname, "..") : process.cwd();
const STATUS_FILE = path.join(PROJECT_ROOT, "geo-batch-status.json");
const ERROR_LOG = path.join(PROJECT_ROOT, "geo-batch-errors.ndjson");
const LOG_FILE = path.join(PROJECT_ROOT, "geo-batch.log");

// ──────────────────── DB ────────────────────
function loadDatabaseUrl() {
  for (const c of [
    path.join(PROJECT_ROOT, ".env"),
    "/home/ubuntu/scraper/.env",
    process.env.DATABASE_URL,
  ]) {
    if (!c) continue;
    try {
      if (c.startsWith("postgres://") || c.startsWith("postgresql://")) return c;
      const content = fs.readFileSync(c, "utf8");
      const m = content.match(/DATABASE_URL="([^"]+)"/);
      if (m) return m[1];
    } catch { /*  */ }
  }
  return null;
}

const DATABASE_URL = loadDatabaseUrl();
if (!DATABASE_URL) { console.error("FATAL: DATABASE_URL not found"); process.exit(1); }
const sql = neon(DATABASE_URL);

// ──────────────────── Helpers ────────────────────
function tee(...args) {
  const line = args.join(" ");
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { }
}

function buildFullAddress(addr, suburb, postcode) {
  let clean = addr.replace(/,\s*[^,]*$/, "").trim();
  clean = clean.replace(/^\d+\/\s*/, "").trim();
  clean = clean.replace(/^(Unit|Apt|Flat)\s+\d+\/?\s*,?\s*/i, "").trim();
  // Remove trailing suburb from address if present
  clean = clean.replace(new RegExp(`,\\s*${escapeRegex(suburb)}\\s*(vic|\\d{4})?$`, "i"), "");
  return `${clean}, ${suburb} VIC ${postcode}, Australia`;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function geocodeOne(fullAddr, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `${NOMINATIM_URL}?q=${encodeURIComponent(fullAddr)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) { tee(`  HTTP ${res.status} for ${fullAddr.slice(0, 55)}...`); return null; }
      const data = await res.json();
      return data.length === 0 ? null : { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch (err) {
      if (attempt < retries) {
        tee(`  Retry ${attempt + 1}/${retries} for ${fullAddr.slice(0, 55)}... (${err.message})`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        tee(`  Failed after ${retries + 1} attempts: ${fullAddr.slice(0, 55)}... (${err.message})`);
        return null;
      }
    }
  }
  return null;
}

// ──────────────────── Checkpoint state ────────────────────
function loadCheckpoint() {
  try {
    const s = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    return { ok: s.ok ?? 0, fail: s.fail ?? 0, processed: s.processed ?? 0 };
  } catch {
    return { ok: 0, fail: 0, processed: 0 };
  }
}

function saveCheckpoint(state) {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(state)); } catch { }
}

// ──────────────────── Main ────────────────────
async function main() {
  tee(`[${new Date().toISOString()}] Starting geo-batch…`);

  //── graceful shutdown ──
  let shuttingDown = false;
  process.on("SIGTERM", () => { shuttingDown = true; tee("  Received SIGTERM — will stop after current address"); });
  process.on("SIGINT",  () => { shuttingDown = true; tee("  Received SIGINT  — will stop after current address"); });

  //── restore checkpoint ──
  let { ok: totalOk, fail: totalFail, processed } = loadCheckpoint();
  tee(`  Checkpoint: ${totalOk} ok, ${totalFail} fail, ${processed} processed`);

  //── count remaining ──
  const [totalRow] = await sql`
    SELECT COUNT(DISTINCT c.sale_address || '|' || c.suburb)::int AS c
    FROM comparable_sales c
    WHERE NOT EXISTS (
      SELECT 1 FROM address_geocode_cache g
      WHERE LOWER(g.cache_key) = LOWER(c.sale_address || '|' || c.suburb)
    )
    AND (c.postcode IS NOT NULL AND c.postcode != '')
  `;
  const total = totalRow.c;
  tee(`  Remaining: ${total} unique addresses  (already cached: ${totalOk + totalFail})`);

  if (total === 0) { tee("  Nothing to do — all done!"); process.exit(0); }

  //── main loop ──
  while (!shuttingDown) {
    const batch = await sql`
      SELECT DISTINCT c.sale_address, c.suburb, c.postcode
      FROM comparable_sales c
      LEFT JOIN address_geocode_cache g
        ON LOWER(g.cache_key) = LOWER(c.sale_address || '|' || c.suburb)
      WHERE g.cache_key IS NULL
        AND (c.postcode IS NOT NULL AND c.postcode != '')
      ORDER BY c.suburb, c.sale_address
      LIMIT ${FETCH_PAGE}
    `;

    if (batch.length === 0) break; // all done

    for (const a of batch) {
      if (shuttingDown) break;
      const key = `${a.sale_address}|${a.suburb}`.toLowerCase();

      const full = buildFullAddress(a.sale_address, a.suburb, a.postcode);
      const geo = await geocodeOne(full);

      try {
        if (geo) {
          await sql`
            INSERT INTO address_geocode_cache (cache_key, sale_address, suburb, postcode, latitude, longitude, geocode_source)
            VALUES (${key}, ${a.sale_address}, ${a.suburb}, ${a.postcode}, ${geo.lat}, ${geo.lon}, 'nominatim')
            ON CONFLICT (cache_key) DO UPDATE
            SET latitude = ${geo.lat}, longitude = ${geo.lon}, updated_at = NOW()
          `;
          totalOk++;
        } else {
          await sql`
            INSERT INTO address_geocode_cache (cache_key, sale_address, suburb, postcode, geocode_source)
            VALUES (${key}, ${a.sale_address}, ${a.suburb}, ${a.postcode}, 'nominatim')
            ON CONFLICT (cache_key) DO NOTHING
          `;
          totalFail++;
          try {
            fs.appendFileSync(ERROR_LOG,
              JSON.stringify({ address: a.sale_address, suburb: a.suburb, fullAddr: full }) + "\n");
          } catch { }
        }
      } catch (err) {
        tee(`  DB error: ${err.message} for ${key}, sale_address=${a.sale_address}, suburb=${a.suburb}`);
        totalFail++;
      }

      processed++;

      if (processed % PROGRESS_INTERVAL === 0) {
        const done = totalOk + totalFail;
        const pct = total > 0 ? ((done / total) * 100).toFixed(1) : "100.0";
        const remaining = total - done;
        const etaHours = remaining * (RATE_LIMIT_MS / 1000 / 3600);
        tee(`  [${processed}/${total} (${pct}%)]  OK:${totalOk}  FAIL:${totalFail}  ETA:${etaHours.toFixed(1)}h`);
        saveCheckpoint({ ok: totalOk, fail: totalFail, processed });
      }

      // Rate limit (only if we're not shutting down)
      if (!shuttingDown) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  //── cleanup ──
  if (shuttingDown) {
    tee(`[${new Date().toISOString()}] Graceful stop.  Last checkpoint saved.`);
    saveCheckpoint({ ok: totalOk, fail: totalFail, processed });
    process.exit(0);
  }

  try { fs.rmSync(STATUS_FILE, { force: true }); } catch { }
  tee(`[${new Date().toISOString()}] Complete!  OK:${totalOk}  FAIL:${totalFail}  Total:${processed}`);
  process.exit(0);
}

main().catch(e => { tee("FATAL:", e.message); process.exit(1); });
