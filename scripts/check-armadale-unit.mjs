import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error("No DATABASE_URL"); process.exit(1); }

const sql = neon(dbUrl);

// Armadale data
const arm = await sql`SELECT property_type, COUNT(*)::int as cnt FROM comparable_sales WHERE suburb = 'Armadale' GROUP BY property_type ORDER BY cnt DESC`;
console.log("=== Armadale ===");
for (const r of arm) console.log(`  ${r.property_type}: ${r.cnt}`);

const armUnit = await sql`SELECT sale_address, sale_price, sale_date, property_type, source_name FROM comparable_sales WHERE suburb = 'Armadale' AND property_type IN ('Unit','Apartment','Townhouse') ORDER BY sale_date DESC LIMIT 30`;
console.log("\nArmadale Unit/Townhouse records:");
for (const r of armUnit) console.log(`  ${r.property_type} | $${Math.round(r.sale_price/1000)}k | ${r.sale_date} | ${(r.sale_address||'').slice(0,45)} | ${r.source_name}`);

console.log(`\nArmadale Unit total: ${armUnit.length}`);

// Balaclava data
const bal = await sql`SELECT property_type, COUNT(*)::int as cnt FROM comparable_sales WHERE suburb = 'Balaclava' GROUP BY property_type ORDER BY cnt DESC`;
console.log("\n=== Balaclava ===");
for (const r of bal) console.log(`  ${r.property_type}: ${r.cnt}`);

const balUnit = await sql`SELECT sale_address, sale_price, sale_date, property_type, source_name FROM comparable_sales WHERE suburb = 'Balaclava' AND property_type IN ('Unit','Apartment','Townhouse') ORDER BY sale_date DESC LIMIT 30`;
console.log("\nBalaclava Unit/Townhouse records:");
for (const r of balUnit) console.log(`  ${r.property_type} | $${Math.round(r.sale_price/1000)}k | ${r.sale_date} | ${(r.sale_address||'').slice(0,45)} | ${r.source_name}`);

console.log(`\nBalaclava Unit total: ${balUnit.length}`);

process.exit(0);
