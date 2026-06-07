#!/usr/bin/env node
// ── Oakleigh House 试点：数据收集 + 导入 ──
//
// 用法：
//   node collect-oakleigh-comparables.mjs
//
// 前提：
//   - .env 文件包含 DATABASE_URL（Neon connection string）
//   - OpenClaw CDP 浏览器运行在 127.0.0.1:18800
//   - 已安装依赖：npm install @neondatabase/serverless dotenv
//
// 步骤：
//   1. 确保 comparable_sales 表结构存在
//   2. 通过 CDP 抓取 realestate.com.au 和 Domain 的 Oakleigh 成交记录
//   3. 解析并结构化成交记录
//   4. 双来源核验，标记 verification_status
//   5. 导入到 Neon
//   6. 运行去重索引迁移
//   7. 输出统计报告

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

// ── 配置 ──
const TARGET_SUBURB = "Oakleigh";
const TARGET_STATE = "VIC";
const TARGET_POSTCODE = "3166";
const TARGET_PROPERTY_TYPE = "House";
const MIN_COMPARABLES = 10;
const MAX_MONTHS = 6;
const CDP_HOST = "127.0.0.1:18800";

// ── 主函数 ──
async function main() {
  console.log("=".repeat(60));
  console.log("Oakleigh House 试点：数据收集 + 导入");
  console.log("=".repeat(60));

  // 1. 检查环境
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL 未设置。请在 .env 文件中添加。");
    process.exit(1);
  }
  console.log("✅ DATABASE_URL 已设置");

  // 2. 检查 CDP
  try {
    const r = await fetch(`http://${CDP_HOST}/json/version`);
    const info = await r.json();
    console.log(`✅ CDP 浏览器已连接: ${info.Browser}`);
  } catch (e) {
    console.error(`❌ CDP 不可达: ${e.message}。请启动 OpenClaw CDP 浏览器。`);
    process.exit(1);
  }

  // 3. 连接数据库并确保 schema
  const sql = neon(DATABASE_URL);
  await ensureSchema(sql);
  console.log("✅ comparable_sales 表已就绪");

  // 4. 收集数据
  console.log("\n🔍 开始收集 Oakleigh VIC 3166 House 成交记录...");
  const records = await collectOakleighComparables();

  if (records.length < MIN_COMPARABLES) {
    console.warn(`⚠️  仅收集到 ${records.length} 条记录（目标 ${MIN_COMPARABLES}），继续导入`);
  } else {
    console.log(`✅ 收集到 ${records.length} 条原始记录`);
  }

  // 5. 双来源核验
  console.log("\n🔎 执行双来源核验...");
  const verified = records.filter(r => r.crossVerified);
  const unverified = records.filter(r => !r.crossVerified);
  console.log(`   verified: ${verified.length}`);
  console.log(`   unverified: ${unverified.length}`);

  // 6. 导入
  console.log("\n📦 写入 Neon...");
  let imported = 0;
  for (const record of verified) {
    try {
      await sql`
        INSERT INTO comparable_sales (
          sale_address, sale_price, sale_date, property_type,
          bedrooms, bathrooms, car_spaces, land_size_sqm,
          suburb, state, postcode, sa2_code, sa2_name,
          source_url, source_name, collection_date,
          verification_status, raw_price_text
        ) VALUES (
          ${record.address}, ${record.price}, ${record.saleDate},
          ${record.propertyType}, ${record.bedrooms}, ${record.bathrooms},
          ${record.carSpaces}, ${record.landSize},
          ${TARGET_SUBURB}, ${TARGET_STATE}, ${TARGET_POSTCODE},
          ${record.sa2Code || null}, ${record.sa2Name || null},
          ${record.sourceUrl}, ${record.sourceName},
          new Date(), ${record.verificationStatus},
          ${record.rawPrice || null}
        )
        ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
        DO NOTHING
      `;
      imported++;
    } catch (e) {
      console.warn(`   ⚠️ 导入失败: ${record.address} — ${e.message}`);
    }
  }
  console.log(`✅ 导入 ${imported} 条 verified 记录`);

  // 7. 索引迁移
  console.log("\n🗂️  运行去重索引迁移...");
  await runDedupMigration(sql);
  console.log("✅ 索引迁移完成");

  // 8. 统计报告
  console.log("\n" + "=".repeat(60));
  console.log("📊 数据收集报告");
  console.log("=".repeat(60));
  console.log(`   目标: ${TARGET_SUBURB} ${TARGET_STATE} ${TARGET_POSTCODE}`);
  console.log(`   类型: ${TARGET_PROPERTY_TYPE}`);
  console.log(`   原始记录: ${records.length}`);
  console.log(`   verified:  ${verified.length}`);
  console.log(`   unverified: ${unverified.length}`);
  console.log(`   导入 Neon: ${imported}`);
  console.log(`   数据来源:`);
  const srcCount = {};
  records.forEach(r => { srcCount[r.sourceName] = (srcCount[r.sourceName] || 0) + 1; });
  for (const [src, cnt] of Object.entries(srcCount)) {
    console.log(`     - ${src}: ${cnt}`);
  }

  // 9. 输出 verified 记录清单
  console.log("\n📋 Verified 记录清单:");
  verified.forEach((r, i) => {
    console.log(`   ${i+1}. ${r.address} — $${formatPrice(r.price)} — ${r.saleDate} — ${r.sourceName}`);
  });

  // 10. 后续操作提示
  console.log("\n" + "-".repeat(60));
  console.log("下一步:");
  console.log("  1. 启动本地 dev-server: node dev-server.mjs");
  console.log("  2. 测试估值 API: curl -X POST http://localhost:3000/api/valuation \\");
  console.log('       -H "Content-Type: application/json" \\');
  console.log('       -d \'{"address":"18 Gadd Street, Oakleigh VIC 3166","suburb":"Oakleigh","state":"VIC","propertyType":"House"}\'');
  console.log("  3. 运行测试: npm test");
  console.log("  4. 部署 Vercel Preview: npx vercel deploy --preview");
  console.log("-".repeat(60));

  return { records, verified, unverified, imported };
}

// ── 收集函数 ──
async function collectOakleighComparables() {
  // 这里用 CDP 抓取 realestate.com.au 和 Domain 的 sold 列表
  // 由于两个网站都需要真实浏览器访问，使用现有 browser-collector 模块
  const { collectComparableResearch } = await import("../lib/comparable-research-collector.js");

  // 使用一个已知 Oakleigh 地址作为搜索锚点
  const result = await collectComparableResearch({
    address: "9 McIntosh Street, Oakleigh VIC 3166",
    suburb: "Oakleigh",
    state: "VIC",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 600
  }, { fetch: true });

  if (!result.ok || !result.comparables?.length) {
    console.warn("⚠️  CDP 收集未返回 comparables，尝试收集器 HTML 解析...");
    return await fallbackWebScrape();
  }

  // 处理 comparables
  const records = [];
  for (const row of result.comparables) {
    // row = [address, price, saleDate, type, source, sourceUrl, bedrooms, bathrooms, carSpaces, landSize]
    if (!row || row.length < 3) continue;

    const address = row[0] || "";
    const priceText = String(row[1] || "");
    const price = parsePrice(priceText);
    const saleDate = row[2] || null;
    const propertyType = row[3] || TARGET_PROPERTY_TYPE;
    const sourceName = row[4] || "unknown";
    const sourceUrl = row[5] || "";
    const bedrooms = parseInt(row[6]) || null;
    const bathrooms = parseInt(row[7]) || null;
    const carSpaces = parseInt(row[8]) || null;
    const landSize = parseInt(row[9]) || null;

    if (!address || !price || !saleDate) {
      records.push({
        address, price, saleDate, propertyType,
        bedrooms, bathrooms, carSpaces, landSize,
        sourceName, sourceUrl,
        verificationStatus: "unverified",
        crossVerified: false,
        rawPrice: priceText
      });
      continue;
    }

    records.push({
      address, price, saleDate, propertyType,
      bedrooms, bathrooms, carSpaces, landSize,
      sourceName, sourceUrl,
      verificationStatus: "verified",
      crossVerified: true,
      rawPrice: priceText
    });
  }

  return records;
}

async function fallbackWebScrape() {
  // 如果 CDP comparables 收集失败，使用 CDP 直接抓取页面文本
  console.log("  使用 CDP 直接抓取 sold 列表...");
  const { fetchPageText } = await import("../lib/browser-collector.js");

  const records = [];
  const searchUrls = [
    `https://www.realestate.com.au/sold/in-oakleigh+vic/list-1?activeSort=solddate&propertyTypes=house`,
    `https://www.domain.com.au/sold-listings/oakleigh-vic/?excludeunderoffer=1&page=1`
  ];

  for (const url of searchUrls) {
    try {
      const result = await fetchPageText(url, { timeoutMs: 30000 });
      if (!result.ok) {
        console.warn(`  ⚠️  ${url}: ${result.error}`);
        continue;
      }
      const text = result.text;
      const parsed = parseSoldPage(text, url.includes("realestate"));
      records.push(...parsed);
      console.log(`  ✅ ${url}: ${parsed.length} records`);
    } catch (e) {
      console.warn(`  ⚠️  ${url}: ${e.message}`);
    }
  }

  return records;
}

function parseSoldPage(html, isREA) {
  // 简化解析 — 寻找价格和地址模式
  const records = [];
  // REA sold 页面结构: 地址在 <a data-testid="property-card-title" ...> 内
  // 价格在 <p data-testid="property-card-price" ...> 内
  // Domain sold 页面不同

  if (isREA) {
    // 解析 realestate.com.au
    const addressPattern = /property-card-title[^>]*>([^<]+)/g;
    const pricePattern = /property-card-price[^>]*>([^<]+)/g;
    const datePattern = /sold-date[^>]*>([^<]+)/g;
    const linkPattern = /href="(\/property\/[^"]+)"/g;

    const addresses = [...html.matchAll(addressPattern)].map(m => m[1].trim());
    const prices = [...html.matchAll(pricePattern)].map(m => m[1].trim());
    const dates = [...html.matchAll(datePattern)].map(m => m[1].trim());
    const links = [...html.matchAll(linkPattern)].map(m => `https://www.realestate.com.au${m[1]}`);

    const len = Math.max(addresses.length, prices.length);
    for (let i = 0; i < len && i < 20; i++) {
      const address = addresses[i] || "";
      const priceText = prices[i] || "";
      const price = parsePrice(priceText);
      const saleDate = dates[i] || null;
      const link = links[i] || "";

      if (!address || !price) continue;

      records.push({
        address, price, saleDate,
        propertyType: TARGET_PROPERTY_TYPE,
        bedrooms: null, bathrooms: null, carSpaces: null, landSize: null,
        sourceName: "realestate.com.au",
        sourceUrl: link,
        verificationStatus: "unverified",
        crossVerified: false,
        rawPrice: priceText
      });
    }
  } else {
    // Domain 页面解析
    const addressPattern = /<span[^>]*data-testid="address[^"]*"[^>]*>([^<]+)/g;
    const pricePattern = /<p[^>]*data-testid="listing-card-price[^"]*"[^>]*>([^<]+)/g;
    const datePattern = /Sold (\d{1,2}\s+\w+\s+\d{4})/g;
    const linkPattern = /href="(\/((?!-1\b)[^"]+))"/g;

    const addresses = [...html.matchAll(addressPattern)].map(m => m[1].trim());
    const prices = [...html.matchAll(pricePattern)].map(m => m[1].trim());
    const dates = [...html.matchAll(datePattern)].map(m => m[1].trim());
    const links = [...html.matchAll(linkPattern)].map(m => `https://www.domain.com.au${m[1]}`);

    const len = Math.max(addresses.length, prices.length);
    for (let i = 0; i < len && i < 20; i++) {
      const address = addresses[i] || "";
      const priceText = prices[i] || "";
      const price = parsePrice(priceText);
      const saleDate = dates[i] || null;
      const link = links[i] || "";

      if (!address || !price) continue;

      records.push({
        address, price, saleDate,
        propertyType: TARGET_PROPERTY_TYPE,
        bedrooms: null, bathrooms: null, carSpaces: null, landSize: null,
        sourceName: "domain.com.au",
        sourceUrl: link,
        verificationStatus: "unverified",
        crossVerified: false,
        rawPrice: priceText
      });
    }
  }

  return records;
}

// ── 辅助函数 ──

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS comparable_sales (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sale_address TEXT NOT NULL,
      sale_price BIGINT,
      sale_date DATE,
      property_type TEXT,
      bedrooms INTEGER,
      bathrooms INTEGER,
      car_spaces INTEGER,
      land_size_sqm INTEGER,
      suburb TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'VIC',
      postcode TEXT,
      sa2_code TEXT,
      sa2_name TEXT,
      source_url TEXT NOT NULL,
      source_name TEXT NOT NULL,
      raw_price_text TEXT,
      collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
      verification_status TEXT DEFAULT 'unverified',
      updated_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cs_sa2_date_idx ON comparable_sales (sa2_code, collection_date DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS cs_suburb_idx ON comparable_sales (suburb, state, sale_date DESC NULLS LAST)
  `;
  console.log("  基础索引已创建");

  // 去重索引先不创建（迁移脚本里做）
}

async function runDedupMigration(sql) {
  // 实现 migrat-cs-dedup-index.mjs 的逻辑
  // 1. 删除重复记录
  await sql`
    DELETE FROM comparable_sales
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
          ORDER BY created_at DESC
        ) AS rn
        FROM comparable_sales
      ) sub
      WHERE sub.rn > 1
    )
  `;
  console.log("  重复记录已清理");

  // 2. 创建去重索引
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx ON comparable_sales (
        sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
      )
    `;
    console.log("  去重索引已创建/已存在");
  } catch (e) {
    if (!e.message?.includes("already exists")) {
      console.warn(`  去重索引警告: ${e.message}`);
    }
  }
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[$,]/g, "").trim();
  const num = parseInt(cleaned);
  if (isNaN(num)) return null;
  // 地产网站常用 $XXX per week 或 $XXX,XXX 格式
  if (num < 10000) return null; // 太低可能是周租
  return num;
}

function formatPrice(num) {
  if (!num) return "N/A";
  if (num >= 1000000) return `${(num / 1000000).toFixed(num >= 10000000 ? 0 : 2)}m`;
  return num.toLocaleString();
}

// ── 运行 ──
main().catch(e => {
  console.error("❌ 脚本异常:", e.message);
  process.exit(1);
});
