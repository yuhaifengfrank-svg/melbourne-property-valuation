#!/usr/bin/env node
/**
 * sync-oakleigh.mjs — Dual-source verified comparable importer
 *
 *  Usage:  node scripts/sync-oakleigh.mjs
 *
 * - Scrapes REA + Domain sold listings for Oakleigh VIC
 * - Only imports House types (not Unit/Apartment/Townhouse)
 * - "verified" set by browser-collector deduplicate() logic:
 *   - Must appear in BOTH realestate.com.au AND domain.com.au
 *   - All dates must be present and consistent across sources
 *   - Prices must match
 * - Saves original_evidence JSONB with per-source URLs
 * - Never deletes data outside current batch
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { scrapeSoldData } from "../lib/browser-collector.js";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("❌ DATABASE_URL required in .env"); process.exit(1); }

const sql = neon(DB);

const SUBURB = "Oakleigh";
const STATE = "VIC";
const POSTCODE = "3166";
const SA2_CODE = "212051326";
const SA2_NAME = "Oakleigh";

function parseSaleDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mon = months[m[2].toLowerCase().slice(0, 3)];
  return mon ? `${m[3]}-${mon}-${m[1].padStart(2, "0")}` : null;
}

function normalizeAddress(a) {
  if (!a) return "";
  // Normalise NBSP + multiple whitespace → single space
  return a.toLowerCase().replace(/[\u00a0\u3000\s]+/g, " ").trim();
}

function buildEvidence(srcNames, collectionUrl, reaUrl, domainUrl) {
  const arr = [];
  for (const d of (srcNames || "").split("+")) {
    const d2 = d.trim();
    if (!d2) continue;
    if (d2.includes("rea")) {
      arr.push({ source: "realestate.com.au", collectionUrl, listingUrl: reaUrl || null });
    } else if (d2.includes("domain")) {
      arr.push({ source: "domain.com.au", collectionUrl, listingUrl: domainUrl || null });
    } else {
      arr.push({ source: d2, collectionUrl, listingUrl: null });
    }
  }
  return JSON.stringify(arr);
}

async function upsertRecord(r, sql) {
  const sd = parseSaleDate(r.saleDate);
  const vStatus = r.verificationStatus || "unverified";
  const srcNames = r.source || "";
  const srcUrls = (r.sourceUrl || "").split("+").filter(Boolean).join(" AND ");
  const evidenceJson = buildEvidence(srcNames, r.collectionUrl || "", "", "");
  const todayStr = new Date().toISOString().slice(0, 10);
  const priceText = r.price ? `$${r.price.toLocaleString()}` : null;
  const na = normalizeAddress(r.address);

  // SELECT-then-INSERT/UPDATE avoids neon ON CONFLICT type-inference issues
  let existing;
  if (sd) {
    existing = await sql`
      SELECT id FROM comparable_sales
      WHERE sale_date = ${sd} AND sale_price = ${r.price}
        AND LOWER(TRIM(REPLACE(sale_address, CHR(160), ' '))) = ${na}
      LIMIT 1
    `;
  } else {
    existing = await sql`
      SELECT id FROM comparable_sales
      WHERE sale_date IS NULL AND sale_price = ${r.price}
        AND LOWER(TRIM(REPLACE(sale_address, CHR(160), ' '))) = ${na}
      LIMIT 1
    `;
  }

  if (existing && existing.length > 0) {
    await sql`
      UPDATE comparable_sales SET
        verification_status = ${vStatus},
        source_url = ${srcUrls},
        source_name = ${srcNames},
        collection_date = ${todayStr},
        original_evidence = ${evidenceJson}::jsonb,
        bedrooms = COALESCE(${r.bedrooms}, bedrooms),
        bathrooms = COALESCE(${r.bathrooms}, bathrooms),
        car_spaces = COALESCE(${r.carSpaces}, car_spaces),
        land_size_sqm = COALESCE(${r.landSize}, land_size_sqm)
      WHERE id = ${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO comparable_sales (
        sale_address, sale_price, sale_date, property_type,
        bedrooms, bathrooms, car_spaces, land_size_sqm,
        suburb, state, postcode,
        source_url, source_name, collection_date,
        verification_status, raw_price_text,
        sa2_code, sa2_name,
        original_evidence
      ) VALUES (
        ${r.address}, ${r.price}, ${sd}, 'House',
        ${r.bedrooms}, ${r.bathrooms}, ${r.carSpaces}, ${r.landSize},
        ${SUBURB}, ${STATE}, ${POSTCODE},
        ${srcUrls}, ${srcNames}, ${todayStr},
        ${vStatus}, ${priceText},
        ${SA2_CODE}, ${SA2_NAME},
        ${evidenceJson}::jsonb
      )
    `;
  }
  return vStatus;
}

async function main() {
  console.log(`📡 Scraping ${SUBURB} ${STATE} ${POSTCODE} via REA + Domain…`);
  const allSales = await scrapeSoldData(SUBURB, STATE, POSTCODE);
  console.log(`✅ Raw deduped sales: ${allSales.length}`);

  // Filter to House only via address-based inference
  const houses = allSales.filter((s) => {
    const a = (s.address || "").toLowerCase();
    if (/townhouse|town\s*house/i.test(a)) return false;
    if (/^.+\/$/.test(a.trim()) || /^\d+\//.test(a)) return false;
    if (/apartment|apt\s/i.test(a)) return false;
    if (/villa/i.test(a)) return false;
    return true;
  });
  console.log(`✅ Houses: ${houses.length}`);

  for (const r of houses) {
    const sources = (r.source || "").split("+").filter(Boolean);
    console.log(`   ${r.address} -> $${r.price} [${r.source}] status=${r.verificationStatus || "unverified"}`);
  }

  // --- Step 1: Ensure original_evidence column ---
  console.log("\n✅ Schema: original_evidence column ready");
  try {
    await sql`ALTER TABLE comparable_sales ADD COLUMN IF NOT EXISTS original_evidence JSONB`;
  } catch { /* already exists */ }

  // --- Step 2: Demote ALL existing Oakleigh "verified" to "unverified" ---
  console.log("\n🔄 Resetting all existing Oakleigh verified → unverified…");
  await sql`
    UPDATE comparable_sales
    SET verification_status = 'unverified'
    WHERE suburb = ${SUBURB}
      AND verification_status = 'verified'
  `;
  const remCheck = await sql`
    SELECT COUNT(*)::int AS c
    FROM comparable_sales
    WHERE suburb = ${SUBURB} AND verification_status = 'verified'
  `;
  console.log(`   Remaining Oakleigh verified after reset: ${remCheck[0].c}`);

  // --- Step 3: Upsert all Houses with current verification ---
  console.log("\n📦 Upserting records…");
  let verified = 0;
  let unverified = 0;
  let errors = 0;

  for (const r of houses) {
    try {
      const v = await upsertRecord(r, sql);
      if (v === "verified") verified++;
      else unverified++;
    } catch (e) {
      console.warn(`  ⚠️  ${(r.address || "").slice(0, 40)}: ${e.message.slice(0, 80)}`);
      errors++;
    }
  }

  console.log(`✅ verified: ${verified} | unverified: ${unverified} | errors: ${errors}`);

  // --- Step 4: Summary ---
  console.log("\n" + "=".repeat(65));
  console.log("📊  FINAL SUMMARY");
  console.log("=".repeat(65));

  const total = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales`;
  const oakTotal = await sql`
    SELECT COUNT(*)::int AS c FROM comparable_sales WHERE suburb = ${SUBURB}
  `;
  const byStatus = await sql`
    SELECT verification_status, COUNT(*)::int AS c
    FROM comparable_sales
    WHERE suburb = ${SUBURB}
    GROUP BY verification_status
  `;
  const allHouses = await sql`
    SELECT sale_address, sale_price, sale_date::text, source_name, verification_status
    FROM comparable_sales
    WHERE suburb = ${SUBURB}
    ORDER BY sale_price
  `;

  console.log(`Total DB records:        ${total[0].c}`);
  console.log(`Oakleigh total:          ${oakTotal[0].c}`);
  console.log(`Oakleigh by status:`);
  for (const r of byStatus) console.log(`  ${r.verification_status}: ${r.c}`);

  console.log(`\n📋 Unverified Oakleigh House records (${allHouses.length}):`);
  for (const r of allHouses) {
    const d = r.sale_date || "no date";
    console.log(`  $${(r.sale_price || 0).toLocaleString()} ${r.sale_address}`);
    console.log(`    Sale Date: ${d} | Sources: ${r.source_name} [${r.verification_status}]`);
  }

  console.log("=".repeat(65));
  console.log("✅  Sync complete. No data outside Oakleigh was deleted.");
  console.log(`   ${verified} verified | ${unverified} unprocessed`);
}

main().catch((e) => {
  console.error("❌", e.message);
  console.error(e.stack);
  process.exit(1);
});
