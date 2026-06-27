import { neon } from "../node_modules/@neondatabase/serverless/index.mjs";
const sql = neon("postgresql://neondb_owner:***@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require");

async function check(suburb) {
  const r = await sql`
    SELECT sale_address, sale_price, sale_date, land_size_sqm, bedrooms, property_type
    FROM comparable_sales
    WHERE suburb = ${suburb} AND state = 'VIC' AND property_type = 'House'
    ORDER BY sale_date DESC
    LIMIT 5
  `;
  return r;
}

const suburbs = ["Balwyn","Toorak","Balwyn North","Brighton","Kew","Camberwell","Albert Park","Malvern","Glen Iris","Hawthorn East"];
for (const s of suburbs) {
  const all = await sql`
    SELECT COUNT(*)::int as cnt FROM comparable_sales
    WHERE suburb = ${s} AND state = 'VIC' AND property_type = 'House'
  `;
  const cnt = all[0].cnt;
  const r = await check(s);
  console.log(s + " (" + cnt + " House records, showing up to 5):");
  for (const row of r) {
    const addr = (row.sale_address||"").slice(0,35).padEnd(37);
    const price = "$" + Math.round((row.sale_price||0)/1000) + "k".padEnd(8);
    const date = (row.sale_date||"").slice(0,10);
    const land = "land:" + (row.land_size_sqm||"-") + "sqm".padEnd(12);
    const beds = (row.bedrooms||"-") + "br";
    console.log("  " + addr + "  " + price + "  " + date + "  " + land + "  " + beds);
  }
  console.log("");
}
