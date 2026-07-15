import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const statsPath = path.resolve("public/site-stats.json");
const current = JSON.parse(fs.readFileSync(statsPath, "utf8"));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = neon(databaseUrl);
const [row] = await sql`
  SELECT
    (SELECT COUNT(*)::integer FROM comparable_sales) AS comparable_sales,
    (SELECT COUNT(*)::integer FROM school_locations) AS schools_mapped,
    (SELECT COUNT(*)::integer FROM suburb_metrics) AS suburbs_covered
`;

const actual = {
  comparableSales: Number(row.comparable_sales),
  schoolsMapped: Number(row.schools_mapped),
  suburbsCovered: Number(row.suburbs_covered)
};

const minimums = { comparableSales: 180000, schoolsMapped: 2800, suburbsCovered: 500 };
const maxLag = { comparableSales: 20000, schoolsMapped: 100, suburbsCovered: 50 };
const errors = [];

for (const key of Object.keys(minimums)) {
  if (actual[key] < minimums[key]) errors.push(`${key} actual ${actual[key]} is below minimum ${minimums[key]}`);
  if (current[key] > actual[key]) errors.push(`${key} published ${current[key]} exceeds actual ${actual[key]}`);
  if (actual[key] - current[key] > maxLag[key]) errors.push(`${key} is stale by ${actual[key] - current[key]}`);
}

console.log(JSON.stringify({ publishedAsOf: current.asOf, published: current, actual }, null, 2));

if (process.argv.includes("--write")) {
  const updated = { asOf: new Date().toISOString().slice(0, 10), ...actual };
  fs.writeFileSync(statsPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`[site-stats] wrote ${statsPath}`);
}

if (errors.length) {
  for (const error of errors) console.error(`[site-stats] ${error}`);
  process.exitCode = 1;
} else {
  console.log("[site-stats] published claims are within verified production bounds");
}
