#!/usr/bin/env node
/**
 * sync-oakleigh.mjs — Dual-source verified comparable importer
 *
 *  Usage:  node scripts/sync-oakleigh.mjs
 *
 * - Scrapes REA + Domain sold listings for Oakleigh VIC
 * - Only imports House types (not Unit/Apartment/Townhouse)
 * - "verified" ONLY when same address+price appears in BOTH sources
 * - Doesn't DELETE any data outside current batch
 * - Resets all previous Oakleigh "verified" to "unverified" before re-verifying
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

const REA_URL =
  "https://www.realestate.com.au/sold/in-oakleigh+vic/list-1?activeSort=solddate&propertyTypes=house";
const DOMAIN_URL =
  "https://www.domain.com.au/sold-listings/oakleigh-vic-3166/";

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

function inferType(addr) {
  const a = addr.toLowerCase();
  if (/townhouse|town\s*house/i.test(a)) return "Townhouse";
  if (/apartment|apt\s/i.test(a)) return "Apartment";
  if (/villa/i.test(a)) return "Villa";
  if (/vacant\s*land/i.test(a)) return "Vacant land";
  if (/^\d+\s*\//.test(a) || /\/\d+\s/.test(a)) return "Unit";
  if (/^(unit|flat)\s/i.test(a)) return "Unit";
  return "House";
}

async function upsertRecord(r, sql) {
  const sd = parseSaleDate(r.saleDate);
  const sources = (r.source || "").split("+").filter(Boolean);
  const isDual = sources.length >= 2;
  const vStatus = isDual ? "verified" : "unverified";

  const srcUrls = sources
    .map((s) => (s.includes("domain") ? DOMAIN_URL : s.includes("rea") ? REA_URL : s))
    .filter(Boolean)
    .join(" AND ");
  const srcNames = sources.join("+");
  const todayStr = new Date().toISOString().slice(0, 10);
  const priceText = r.price ? `$${r.price.toLocaleString()}` : null;

  // Upsert via DO UPDATE
  await sql`
    INSERT INTO comparable_sales (
      sale_address, sale_price, sale_date, property_type,
      bedrooms, bathrooms, car_spaces, land_size_sqm,
      suburb, state, postcode,
      source_url, source_name, collection_date,
      verification_status, raw_price_text,
      sa2_code, sa2_name
    ) VALUES (
      ${r.address}, ${r.price}, ${sd}, 'House',
      ${r.bedrooms}, ${r.bathrooms}, ${r.carSpaces}, ${r.landSize},
      ${SUBURB}, ${STATE}, ${POSTCODE},
      ${srcUrls}, ${srcNames}, ${todayStr},
      ${vStatus}, ${priceText},
      ${SA2_CODE}, ${SA2_NAME}
    )
    ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
    DO UPDATE SET
      verification_status = EXCLUDED.verification_status,
      source_url = EXCLUDED.source_url,
      source_name = EXCLUDED.source_name,
      collection_date = EXCLUDED.collection_date
  `;
  return vStatus;
}

async function main() {
  console.log(`📡 Scraping ${SUBURB} ${STATE} ${POSTCODE} via REA + Domain…`);
  const allSales = await scrapeSoldData(SUBURB, STATE, POSTCODE);
  console.log(`✅ Raw deduped sales: ${allSales.length}`);

  // Filter to House only
  const houses = allSales.filter((s) => inferType(s.address) === "House");
  console.log(`✅ Houses: ${houses.length}`);

  for (const r of houses) {
    const sources = (r.source || "").split("+").filter(Boolean);
    console.log(`   ${r.address} -> $${r.price} [${sources.length} sources: ${sources.join(", ")}]`);
  }

  // --- Step 1: Demote ALL existing Oakleigh "verified" to "unverified" ---
  console.log("\n🔄 Resetting all existing Oakleigh verified → unverified…");
  const demoteResult = await sql`
    UPDATE comparable_sales
    SET verification_status = 'unverified'
    WHERE suburb = ${SUBURB}
      AND verification_status = 'verified'
  `;
  // Check remaining
  const remCheck = await sql`
    SELECT COUNT(*)::int AS c
    FROM comparable_sales
    WHERE suburb = ${SUBURB} AND verification_status = 'verified'
  `;
  console.log(`   Remaining Oakleigh verified after reset: ${remCheck[0].c}`);

  // --- Step 2: Upsert all Houses with current verification ---
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
      if (e.message?.includes("duplicate key")) {
        // Race condition: re-insert with update
        try {
          const sources = (r.source || "").split("+").filter(Boolean);
          const vStatus = sources.length >= 2 ? "verified" : "unverified";
          // Manual update instead
          const sd = parseSaleDate(r.saleDate);
          await sql`
            UPDATE comparable_sales
            SET verification_status = ${vStatus},
                source_url = ${sources.map(s => s.includes("domain") ? DOMAIN_URL : REA_URL).join(" AND ")},
                source_name = ${sources.join("+")},
                collection_date = CURRENT_DATE
            WHERE sale_address = ${r.address}
              AND suburb = ${SUBURB}
              AND sale_price = ${r.price}
              AND (sale_date = ${sd} OR (sale_date IS NULL AND ${sd} IS NULL))
          `;
          if (vStatus === "verified") verified++;
          else unverified++;
        } catch (e2) {
          console.warn(`  ⚠️  ${r.address.slice(0, 40)}: ${e2.message.slice(0, 80)}`);
          errors++;
        }
      } else {
        console.warn(`  ⚠️  ${r.address.slice(0, 40)}: ${e.message.slice(0, 80)}`);
        errors++;
      }
    }
  }

  console.log(`✅ verified: ${verified} | unverified: ${unverified} | errors: ${errors}`);

  // --- Step 3: Dedup index ---
  console.log("\n🗂️  Dedup index…");
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx
      ON comparable_sales (
        sale_address,
        COALESCE(sale_date, '1970-01-01'::date),
        COALESCE(sale_price, -1),
        source_name
      )
    `;
    console.log("✅ Index ready");
  } catch (e) {
    if (!e.message?.includes("already exists")) throw e;
    console.log("✅ Index already exists");
  }

  // --- Summary ---
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
  const verifiedHouses = await sql`
    SELECT sale_address, sale_price, sale_date::text, source_name, source_url
    FROM comparable_sales
    WHERE suburb = ${SUBURB}
      AND verification_status = 'verified'
      AND property_type = 'House'
    ORDER BY sale_price
  `;

  console.log(`Total DB records:         ${total[0].c}`);
  console.log(`Oakleigh total:           ${oakTotal[0].c}`);
  console.log(`Oakleigh by status:`);
  for (const r of byStatus) console.log(`  ${r.verification_status}: ${r.c}`);

  if (verifiedHouses.length > 0) {
    console.log(`\n📋 Verified Oakleigh House records (${verifiedHouses.length}):`);
    for (const r of verifiedHouses) {
      const d = r.sale_date || "no date";
      const urls = (r.source_url || "").replace(/ AND /g, "\n        ");
      console.log(`  $${(r.sale_price || 0).toLocaleString()}`);
      console.log(`    Address:    ${r.sale_address}`);
      console.log(`    Sale Date:  ${d}`);
      console.log(`    Sources:    ${r.source_name}`);
      console.log(`    URLs:       ${urls}`);
      console.log("");
    }
  }

  console.log("=".repeat(65));
  console.log("✅  Sync complete. No data outside Oakleigh was deleted.");
  console.log(`   ${verifiedHouses.length} verified | ${oakTotal[0].c - verifiedHouses.length} unprocessed`);
}

main().catch((e) => {
  console.error("❌", e.message);
  console.error(e.stack);
  process.exit(1);
});
