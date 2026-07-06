// tests/test-address-geocoder.mjs
// 测试：Nominatim 地址解析 → 精确坐标 → 估值差异对比
// 阶段 1: 只跑 Scoresby（433 个唯一个地址，1 req/s ≈ 7 分钟）
// 阶段 2: 对比中心点坐标 vs 精确坐标的估值差异

import { neon } from "@neondatabase/serverless";
import fs from "fs";
import assert from "node:assert";

// ---------- Config ----------
const TEST_SUBURB = "scoresby";
const RATE_LIMIT_MS = 1100; // Nominatim: 1 req/s
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "AusHomeValue/1.0 (test-geocoder)";

// ---------- DB ----------
const env = fs.readFileSync(
  "/Users/FrankAI/Documents/澳洲房地产评估系统/.env",
  "utf8"
);
const m = env.match(/DATABASE_URL="([^"]+)"/);
if (!m) throw new Error("DATABASE_URL not found");
const sql = neon(m[1]);

// ---------- Helpers ----------
function buildFullAddress(addr, suburb, postcode) {
  const clean = addr.replace(/,\s*[^,]*$/, "").trim(); // strip trailing suburb
  return `${clean}, ${suburb} VIC ${postcode}, Australia`;
}

async function geocodeAddress(fullAddr) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(fullAddr)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} for: ${fullAddr}`);
    return null;
  }
  const data = await res.json();
  if (data.length === 0) {
    console.error(`  No results for: ${fullAddr}`);
    return null;
  }
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// ---------- Main ----------
async function main() {
  const mode = process.argv[2] || "compare";

  if (mode === "geocode") {
    // Phase 1: Geocode all unique addresses in the test suburb
    const addrs = await sql`
      SELECT DISTINCT sale_address, suburb, postcode
      FROM comparable_sales
      WHERE LOWER(suburb) = ${TEST_SUBURB}
        AND (postcode IS NOT NULL AND postcode != '')
    `;
    console.log(`\n${TEST_SUBURB}: ${addrs.length} 个唯一个地址待解析`);
    console.log(`速率: 1 req/s (Nominatim 限制)\n`);

    let success = 0;
    let fail = 0;
    let cached = 0;

    for (let i = 0; i < addrs.length; i++) {
      const a = addrs[i];
      const key = `${a.sale_address}|${a.suburb}`.toLowerCase();

      // Check cache first
      const existing =
        await sql`SELECT id FROM address_geocode_cache WHERE cache_key = ${key}`;
      if (existing.length > 0) {
        cached++;
        continue;
      }

      const full = buildFullAddress(a.sale_address, a.suburb, a.postcode);
      const result = await geocodeAddress(full);

      if (result) {
        await sql`
          INSERT INTO address_geocode_cache (cache_key, sale_address, suburb, postcode, latitude, longitude, geocode_source)
          VALUES (${key}, ${a.sale_address}, ${a.suburb}, ${a.postcode}, ${result.lat}, ${result.lon}, 'nominatim')
          ON CONFLICT (cache_key) DO UPDATE
          SET latitude = ${result.lat}, longitude = ${result.lon}, updated_at = NOW()
        `;
        success++;
      } else {
        // Insert as failed attempt (null coords) so we don't re-try
        await sql`
          INSERT INTO address_geocode_cache (cache_key, sale_address, suburb, postcode, geocode_source)
          VALUES (${key}, ${a.sale_address}, ${a.suburb}, ${a.postcode}, 'nominatim')
          ON CONFLICT (cache_key) DO NOTHING
        `;
        fail++;
      }

      // Progress
      if ((i + 1) % 50 === 0 || i === addrs.length - 1) {
        const pct = (((i + 1) / addrs.length) * 100).toFixed(1);
        console.log(
          `  [${i + 1}/${addrs.length} (${pct}%)] OK:${success} FAIL:${fail} CACHED:${cached}`
        );
      }

      // Rate limit
      if (i < addrs.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }
    }

    console.log(`\n✅ ${TEST_SUBURB} 完成`);
    console.log(`  成功: ${success}, 失败: ${fail}, 缓存命中: ${cached}`);
  } else if (mode === "compare") {
    // Phase 2: Compare valuation with centerpoint vs exact coords
    console.log(`\n对比 ${TEST_SUBURB} 估值差异 (中心点 vs 精确坐标)\n`);

    // Get the SQL generation for centerpoint coords
    // (Just check what coords we currently have vs what cache gives us)
    const centerpoint =
      await sql`SELECT DISTINCT \"lat\", \"lon\" FROM comparable_sales WHERE LOWER(suburb) = ${TEST_SUBURB} AND \"lat\" IS NOT NULL LIMIT 5`;
    console.log("当前坐标 (suburb 中心点):", centerpoint);

    const exactPoints =
      await sql`SELECT COUNT(*)::int AS c FROM address_geocode_cache WHERE LOWER(suburb) = ${TEST_SUBURB} AND latitude IS NOT NULL`;
    console.log(
      `精确坐标 (address_geocode_cache): ${exactPoints[0].c} 条`
    );

    // Sample a few addresses to see the precision difference
    const samples = await sql`
      SELECT c.sale_address, c."lat" AS center_lat, c."lon" AS center_lon,
             g.latitude AS exact_lat, g.longitude AS exact_lon
      FROM comparable_sales c
      JOIN address_geocode_cache g ON LOWER(g.cache_key) = LOWER(c.sale_address || '|' || c.suburb)
      WHERE LOWER(c.suburb) = ${TEST_SUBURB}
        AND g.latitude IS NOT NULL
      LIMIT 10
    `;

    console.log("\n坐标精度对比:");
    let totalDrift = 0;
    let count = 0;
    for (const s of samples) {
      const drift = haversine(
        s.center_lat,
        s.center_lon,
        s.exact_lat,
        s.exact_lon
      );
      totalDrift += drift;
      count++;
      console.log(
        `  ${s.sale_address}: 中心(${s.center_lat?.toFixed(4)}, ${s.center_lon?.toFixed(4)}) → 精确(${s.exact_lat?.toFixed(4)}, ${s.exact_lon?.toFixed(4)}) [偏差 ${drift.toFixed(1)}m]`
      );
    }

    if (count > 0) {
      console.log(
        `\n平均偏差: ${(totalDrift / count).toFixed(1)}m (n=${count})`
      );
    }

    // Now do a real valuation comparison
    console.log("\n--- Ready to run valuation comparison ---");
    console.log("Run: node tests/test-address-geocoder.mjs valuation");
  } else if (mode === "valuation") {
    console.log("\n🔶 阶段 3: 估值对比暂未实现");
    console.log("需要先补全地址坐标 → 再跑完整估值管道\n");
    console.log("预期估值差异分析:");
    console.log("  1. 精确坐标 → 同 suburb 内距离不再为 0");
    console.log("     → 距离权重生效 (≤100m=20分, >3km=0分)");
    console.log("     → 距离价格调整生效 (distAdj +0.6% ~ -6%)");
    console.log("  2. 中心点坐标 → 同 suburb 内距离 ≈ 0");
    console.log("     → 所有同 suburb 记录距离权重一样");
    console.log("     → 价格调整仅基于时间和房产类型\n");
    console.log("预计影响最大的区域:");
    console.log("  - suburb 边界附近 (邻近另一suburb的成交被低估/高估)");
    console.log("  - 大型 suburb 内 (不同区域价格差大)");
    console.log("  - 边缘地带 (最近的成交可能在另一suburb)");
  }
}

// ---------- Haversine ----------
function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
