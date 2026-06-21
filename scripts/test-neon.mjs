import { neon } from "@neondatabase/serverless";
const sql = neon("postgresql://neondb_owner:npg_HYR8v9VSTOJe@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require");

async function tests() {
  // Check sql keys
  console.log("sql keys:", Object.keys(sql).slice(0, 10));
  const proto = Object.getPrototypeOf(sql);
  const m1 = Object.getOwnPropertyNames(proto);
  const m2 = Object.getOwnPropertyNames(Object.getPrototypeOf(proto));
  console.log("proto methods:", m1.slice(0, 20));
  // Try writing a raw test
  const r = await sql`SELECT COUNT(*)::int as cnt FROM comparable_sales WHERE suburb = 'Armadale'`;
  console.log("simple query works:", r.length);
  
  // Try ANY with array
  const arr = ["Unit", "Apartment"];
  const r2 = await sql`
    SELECT COUNT(*)::int as cnt FROM comparable_sales 
    WHERE property_type = ANY(${arr}::text[])
    AND suburb = 'Armadale'
  `;
  console.log("ANY($arr) works:", r2[0].cnt);
  
  // Try sql.unsafe
  const typesStr = "'Unit','Apartment'";
  const r3 = await sql`
    SELECT COUNT(*)::int as cnt FROM comparable_sales 
    WHERE property_type IN (${sql.unsafe(typesStr)})
    AND suburb = 'Armadale'
  `;
  console.log("sql.unsafe IN works:", r3[0].cnt);
}

await tests();
process.exit(0);
