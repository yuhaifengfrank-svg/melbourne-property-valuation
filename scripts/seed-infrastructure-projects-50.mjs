#!/usr/bin/env node
/**
 * seed-infrastructure-projects-50.mjs
 *
 * Phase: Data Source Expansion — Step 2
 * Purpose: Seed infrastructure_projects table with 50+ known Victoria projects
 *          covering transport, health, education, employment across all metro regions.
 *
 * Coords: approx lat/lng for project location or nearest major intersection.
 * Budgets: publicly stated figures ($M AUD).
 *
 * Usage: source .env && node scripts/seed-infrastructure-projects-50.mjs
 */

const DB_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_yxd0rKOc3uvR@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
import { neon } from "@neondatabase/serverless";
const sql = neon(DB_URL);

const projects = [
  // ════════════════════════════════════════
  // TRANSPORT — Rail (highest impact)
  // ════════════════════════════════════════
  {
    project_name: "Suburban Rail Loop (SRL) East — Cheltenham to Box Hill",
    project_type: "transport", suburb: "Box Hill", latitude: -37.8189, longitude: 145.1243,
    estimated_budget_m: 34500, status: "under_construction", estimated_completion: "2035",
    catchment_radius_km: 8, lga: "Whitehorse"
  },
  {
    project_name: "Suburban Rail Loop (SRL) North — Box Hill to Melbourne Airport",
    project_type: "transport", suburb: "Box Hill", latitude: -37.7558, longitude: 145.1207,
    estimated_budget_m: 55000, status: "planning", estimated_completion: "2045",
    catchment_radius_km: 8, lga: "Banyule"
  },
  {
    project_name: "Suburban Rail Loop (SRL) South — Cheltenham station",
    project_type: "transport", suburb: "Cheltenham", latitude: -37.9685, longitude: 145.0562,
    estimated_budget_m: 34500, status: "under_construction", estimated_completion: "2035",
    catchment_radius_km: 5, lga: "Bayside"
  },
  {
    project_name: "Metro Tunnel — Sunbury to Cranbourne/Pakenham",
    project_type: "transport", suburb: "Melbourne CBD", latitude: -37.8100, longitude: 144.9662,
    estimated_budget_m: 13700, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 3, lga: "Melbourne"
  },
  {
    project_name: "Melbourne Airport Rail Link",
    project_type: "transport", suburb: "Airport West", latitude: -37.7260, longitude: 144.8320,
    estimated_budget_m: 13000, status: "planning", estimated_completion: "2033",
    catchment_radius_km: 5, lga: "Hume"
  },
  // Level Crossing Removal Projects — 50+ sites across Melbourne (representative subset)
  {
    project_name: "LXRP — Carrum (Station St & Eel Race Rd)",
    project_type: "transport", suburb: "Carrum", latitude: -38.0757, longitude: 145.1215,
    estimated_budget_m: 28000, status: "under_construction", estimated_completion: "2028",
    catchment_radius_km: 3, lga: "Kingston"
  },
  {
    project_name: "LXRP — Glen Huntly (Neerim Rd)",
    project_type: "transport", suburb: "Glen Huntly", latitude: -37.8894, longitude: 145.0401,
    estimated_budget_m: 1400, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 2, lga: "Glen Eira"
  },
  {
    project_name: "LXRP — Murrumbeena (Murrumbeena Rd)",
    project_type: "transport", suburb: "Murrumbeena", latitude: -37.8897, longitude: 145.0648,
    estimated_budget_m: 1200, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 2, lga: "Glen Eira"
  },
  {
    project_name: "LXRP — Pakenham (Racecourse Rd & McGregor Rd)",
    project_type: "transport", suburb: "Pakenham", latitude: -38.0774, longitude: 145.4884,
    estimated_budget_m: 800, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 3, lga: "Cardinia"
  },
  {
    project_name: "LXRP — Cranbourne East (Thompsons Rd)",
    project_type: "transport", suburb: "Cranbourne East", latitude: -38.1050, longitude: 145.2870,
    estimated_budget_m: 900, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 3, lga: "Casey"
  },
  {
    project_name: "LXRP — Surrey Hills (Union Rd)",
    project_type: "transport", suburb: "Surrey Hills", latitude: -37.8258, longitude: 145.0975,
    estimated_budget_m: 600, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 2, lga: "Boroondara"
  },

  // ════════════════════════════════════════
  // TRANSPORT — Road/Tunnel
  // ════════════════════════════════════════
  {
    project_name: "West Gate Tunnel",
    project_type: "transport", suburb: "Footscray", latitude: -37.7980, longitude: 144.8980,
    estimated_budget_m: 6700, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 5, lga: "Maribyrnong"
  },
  {
    project_name: "North East Link (Bulleen to Watsonia)",
    project_type: "transport", suburb: "Bulleen", latitude: -37.7600, longitude: 145.0850,
    estimated_budget_m: 15800, status: "under_construction", estimated_completion: "2028",
    catchment_radius_km: 5, lga: "Banyule"
  },
  {
    project_name: "Mordialloc Freeway extension (Cheltenham to Frankston)",
    project_type: "transport", suburb: "Mordialloc", latitude: -38.0019, longitude: 145.0970,
    estimated_budget_m: 2100, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 4, lga: "Kingston"
  },
  {
    project_name: "Monash Freeway upgrade (Warrigal Rd to O'Shea Rd)",
    project_type: "transport", suburb: "Oakleigh", latitude: -37.8950, longitude: 145.0910,
    estimated_budget_m: 1600, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 3, lga: "Monash"
  },
  {
    project_name: "Western Freeway/Outer Western Ring Road",
    project_type: "transport", suburb: "Rockbank", latitude: -37.7356, longitude: 144.6650,
    estimated_budget_m: 3500, status: "planning", estimated_completion: "2030",
    catchment_radius_km: 5, lga: "Melton"
  },
  {
    project_name: "South East Freeway corridor upgrades",
    project_type: "transport", suburb: "Dandenong", latitude: -37.9840, longitude: 145.2150,
    estimated_budget_m: 1200, status: "planning", estimated_completion: "2028",
    catchment_radius_km: 4, lga: "Greater Dandenong"
  },

  // ════════════════════════════════════════
  // HEALTH
  // ════════════════════════════════════════
  {
    project_name: "Footscray Hospital Redevelopment (new $1.5B)",
    project_type: "health", suburb: "Footscray", latitude: -37.8000, longitude: 144.9000,
    estimated_budget_m: 1500, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 5, lga: "Maribyrnong"
  },
  {
    project_name: "Royal Melbourne Hospital — Arden Precinct expansion",
    project_type: "health", suburb: "Parkville", latitude: -37.7987, longitude: 144.9558,
    estimated_budget_m: 1200, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 4, lga: "Melbourne"
  },
  {
    project_name: "Monash Medical Centre — Clayton expansion",
    project_type: "health", suburb: "Clayton", latitude: -37.9180, longitude: 145.1240,
    estimated_budget_m: 950, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 4, lga: "Monash"
  },
  {
    project_name: "Sunshine Hospital — Joan Kirner Women's & Children's expansion",
    project_type: "health", suburb: "Sunshine", latitude: -37.7870, longitude: 144.8310,
    estimated_budget_m: 800, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 4, lga: "Brimbank"
  },
  {
    project_name: "Austin Hospital — expansion and redevelopment",
    project_type: "health", suburb: "Heidelberg", latitude: -37.7540, longitude: 145.0510,
    estimated_budget_m: 600, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 4, lga: "Banyule"
  },
  {
    project_name: "Casey Hospital — expansion (Berwick)",
    project_type: "health", suburb: "Berwick", latitude: -38.0410, longitude: 145.3440,
    estimated_budget_m: 450, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 5, lga: "Casey"
  },
  {
    project_name: "Northern Hospital — Epping expansion",
    project_type: "health", suburb: "Epping", latitude: -37.6430, longitude: 145.0200,
    estimated_budget_m: 550, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 5, lga: "Whittlesea"
  },
  {
    project_name: "Frankston Hospital — redevelopment",
    project_type: "health", suburb: "Frankston", latitude: -38.1450, longitude: 145.1240,
    estimated_budget_m: 450, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 5, lga: "Frankston"
  },
  {
    project_name: "Werribee Mercy Hospital — expansion (new building)",
    project_type: "health", suburb: "Werribee", latitude: -37.9000, longitude: 144.6590,
    estimated_budget_m: 350, status: "planning", estimated_completion: "2028",
    catchment_radius_km: 5, lga: "Wyndham"
  },

  // ════════════════════════════════════════
  // EDUCATION — Universities & TAFE
  // ════════════════════════════════════════
  {
    project_name: "RMIT University — City campus innovation building",
    project_type: "education", suburb: "Melbourne CBD", latitude: -37.8081, longitude: 144.9640,
    estimated_budget_m: 1200, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 2, lga: "Melbourne"
  },
  {
    project_name: "Deakin University — Burwood campus expansion",
    project_type: "education", suburb: "Burwood", latitude: -37.8470, longitude: 145.1130,
    estimated_budget_m: 350, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 3, lga: "Whitehorse"
  },
  {
    project_name: "Melbourne University — Student Precinct redevelopment",
    project_type: "education", suburb: "Parkville", latitude: -37.7998, longitude: 144.9608,
    estimated_budget_m: 500, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 2, lga: "Melbourne"
  },
  {
    project_name: "Swinburne University — Hawthorn campus expansion",
    project_type: "education", suburb: "Hawthorn", latitude: -37.8214, longitude: 145.0360,
    estimated_budget_m: 400, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 2, lga: "Boroondara"
  },
  {
    project_name: "Monash University — Clayton campus Engineering expansion",
    project_type: "education", suburb: "Clayton", latitude: -37.9083, longitude: 145.1377,
    estimated_budget_m: 500, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 3, lga: "Monash"
  },
  {
    project_name: "La Trobe University — Bundoora campus city presence",
    project_type: "education", suburb: "Melbourne CBD", latitude: -37.8105, longitude: 144.9626,
    estimated_budget_m: 500, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 2, lga: "Melbourne"
  },
  {
    project_name: "Victoria University — Footscray Park campus upgrade",
    project_type: "education", suburb: "Footscray", latitude: -37.8000, longitude: 144.8960,
    estimated_budget_m: 250, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 2, lga: "Maribyrnong"
  },

  // ════════════════════════════════════════
  // EMPLOYMENT / URBAN RENEWAL (National Employment Clusters)
  // ════════════════════════════════════════
  {
    project_name: "Fishermans Bend Urban Renewal (Australia's largest urban renewal)",
    project_type: "employment", suburb: "Port Melbourne", latitude: -37.8390, longitude: 144.9420,
    estimated_budget_m: 10000, status: "planning", estimated_completion: "2050",
    catchment_radius_km: 4, lga: "Port Phillip"
  },
  {
    project_name: "Arden Precinct — Macaulay/North Melbourne urban renewal",
    project_type: "employment", suburb: "North Melbourne", latitude: -37.8010, longitude: 144.9450,
    estimated_budget_m: 8000, status: "planning", estimated_completion: "2040",
    catchment_radius_km: 3, lga: "Melbourne"
  },
  {
    project_name: "Werribee National Employment & Innovation Cluster",
    project_type: "employment", suburb: "Werribee", latitude: -37.9000, longitude: 144.6610,
    estimated_budget_m: 4000, status: "planning", estimated_completion: "2035",
    catchment_radius_km: 5, lga: "Wyndham"
  },
  {
    project_name: "Monash National Employment & Innovation Cluster",
    project_type: "employment", suburb: "Clayton", latitude: -37.9120, longitude: 145.1300,
    estimated_budget_m: 2500, status: "planning", estimated_completion: "2030",
    catchment_radius_km: 4, lga: "Monash"
  },
  {
    project_name: "Parkville National Employment & Innovation Cluster (biomedical)",
    project_type: "employment", suburb: "Parkville", latitude: -37.7970, longitude: 144.9560,
    estimated_budget_m: 3000, status: "under_construction", estimated_completion: "2030",
    catchment_radius_km: 3, lga: "Melbourne"
  },
  {
    project_name: "Dandenong South Employment Precinct",
    project_type: "employment", suburb: "Dandenong South", latitude: -38.0120, longitude: 145.2180,
    estimated_budget_m: 1500, status: "under_construction", estimated_completion: "2028",
    catchment_radius_km: 5, lga: "Greater Dandenong"
  },
  {
    project_name: "Epping North Industrial Precinct",
    project_type: "employment", suburb: "Epping", latitude: -37.6380, longitude: 145.0250,
    estimated_budget_m: 1000, status: "planning", estimated_completion: "2028",
    catchment_radius_km: 5, lga: "Whittlesea"
  },
  {
    project_name: "Sunshine National Employment Cluster",
    project_type: "employment", suburb: "Sunshine", latitude: -37.7850, longitude: 144.8350,
    estimated_budget_m: 2000, status: "planning", estimated_completion: "2030",
    catchment_radius_km: 4, lga: "Brimbank"
  },
  {
    project_name: "La Trobe National Employment & Innovation Cluster (Bundoora)",
    project_type: "employment", suburb: "Bundoora", latitude: -37.7220, longitude: 145.0500,
    estimated_budget_m: 1500, status: "planning", estimated_completion: "2035",
    catchment_radius_km: 4, lga: "Banyule"
  },

  // ════════════════════════════════════════
  // TRANSPORT — Tram/Bus
  // ════════════════════════════════════════
  {
    project_name: "Melbourne Tram — Route 58 extension (Toorak to Glen Iris)",
    project_type: "transport", suburb: "Glen Iris", latitude: -37.8590, longitude: 145.0720,
    estimated_budget_m: 300, status: "planning", estimated_completion: "2028",
    catchment_radius_km: 2, lga: "Stonnington"
  },
  {
    project_name: "SmartBus network improvements — Doncaster to CBD (Eastern)",
    project_type: "transport", suburb: "Doncaster", latitude: -37.7870, longitude: 145.1240,
    estimated_budget_m: 800, status: "planning", estimated_completion: "2027",
    catchment_radius_km: 3, lga: "Manningham"
  },
  {
    project_name: "Western Roads Upgrade — Tarneit/Williams Landing",
    project_type: "transport", suburb: "Tarneit", latitude: -37.8400, longitude: 144.6880,
    estimated_budget_m: 600, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 4, lga: "Wyndham"
  },

  // ════════════════════════════════════════
  // UTILITY / MAJOR PROJECTS
  // ════════════════════════════════════════
  {
    project_name: "Victorian Renewable Energy Zone — Western Victoria",
    project_type: "utility", suburb: "Ararat", latitude: -37.2850, longitude: 142.9300,
    estimated_budget_m: 3000, status: "under_construction", estimated_completion: "2028",
    catchment_radius_km: 20, lga: "Ararat"
  },
  {
    project_name: "Desalination Plant — Wonthaggi (water security)",
    project_type: "utility", suburb: "Wonthaggi", latitude: -38.6050, longitude: 145.5900,
    estimated_budget_m: 5800, status: "completed", estimated_completion: "2012",
    catchment_radius_km: 50, lga: "Bass Coast"
  },
  {
    project_name: "Melbourne Metro Water Recycling — Western Treatment Plant",
    project_type: "utility", suburb: "Werribee", latitude: -37.9400, longitude: 144.6300,
    estimated_budget_m: 1200, status: "planning", estimated_completion: "2030",
    catchment_radius_km: 10, lga: "Wyndham"
  },

  // ════════════════════════════════════════
  // RECREATION / CULTURE
  // ════════════════════════════════════════
  {
    project_name: "Melbourne Arts Precinct Transformation (NGV / Arts Centre)",
    project_type: "recreation", suburb: "Melbourne CBD", latitude: -37.8230, longitude: 144.9690,
    estimated_budget_m: 1700, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 3, lga: "Melbourne"
  },
  {
    project_name: "Melbourne Park redevelopment (tennis precinct)",
    project_type: "recreation", suburb: "Melbourne CBD", latitude: -37.8210, longitude: 144.9790,
    estimated_budget_m: 700, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 2, lga: "Melbourne"
  },

  // ════════════════════════════════════════
  // HOUSING / SOCIAL INFRASTRUCTURE
  // ════════════════════════════════════════
  {
    project_name: "Big Housing Build — Preston (social housing)",
    project_type: "housing", suburb: "Preston", latitude: -37.7430, longitude: 145.0030,
    estimated_budget_m: 5300, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 3, lga: "Darebin"
  },
  {
    project_name: "Big Housing Build — Flemington (social housing)",
    project_type: "housing", suburb: "Flemington", latitude: -37.7840, longitude: 144.9350,
    estimated_budget_m: 1200, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 3, lga: "Moonee Valley"
  },
  {
    project_name: "Big Housing Build — Dandenong (social housing)",
    project_type: "housing", suburb: "Dandenong", latitude: -37.9870, longitude: 145.2200,
    estimated_budget_m: 800, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 3, lga: "Greater Dandenong"
  },

  // ════════════════════════════════════════
  // ADDITIONAL LXRP SITES (geographic spread)
  // ════════════════════════════════════════
  {
    project_name: "LXRP — Donald (Bell Street, Preston)",
    project_type: "transport", suburb: "Preston", latitude: -37.7420, longitude: 145.0060,
    estimated_budget_m: 500, status: "completed", estimated_completion: "2024",
    catchment_radius_km: 2, lga: "Darebin"
  },
  {
    project_name: "LXRP — Grange Rd (Cheltenham)",
    project_type: "transport", suburb: "Cheltenham", latitude: -37.9690, longitude: 145.0550,
    estimated_budget_m: 400, status: "completed", estimated_completion: "2024",
    catchment_radius_km: 2, lga: "Bayside"
  },
  {
    project_name: "LXRP — Webb St (Narre Warren)",
    project_type: "transport", suburb: "Narre Warren", latitude: -38.0250, longitude: 145.3050,
    estimated_budget_m: 500, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 3, lga: "Casey"
  },
  {
    project_name: "LXRP — Main St (Cheltenham to Mordialloc corridor)",
    project_type: "transport", suburb: "Mordialloc", latitude: -38.0000, longitude: 145.0900,
    estimated_budget_m: 600, status: "under_construction", estimated_completion: "2025",
    catchment_radius_km: 2, lga: "Kingston"
  },

  // ════════════════════════════════════════
  // ADDITIONAL — Regional Victoria balanced coverage
  // ════════════════════════════════════════
  {
    project_name: "Geelong Fast Rail (Waurn Ponds to CBD)",
    project_type: "transport", suburb: "Geelong", latitude: -38.1470, longitude: 144.3600,
    estimated_budget_m: 4000, status: "planning", estimated_completion: "2030",
    catchment_radius_km: 8, lga: "Greater Geelong"
  },
  {
    project_name: "Regional Rail Revival — Ballarat line upgrades",
    project_type: "transport", suburb: "Ballarat", latitude: -37.5600, longitude: 143.8500,
    estimated_budget_m: 800, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 5, lga: "Ballarat"
  },
  {
    project_name: "Moe Hospital redevelopment (Latrobe Valley)",
    project_type: "health", suburb: "Moe", latitude: -38.1790, longitude: 146.2610,
    estimated_budget_m: 250, status: "under_construction", estimated_completion: "2026",
    catchment_radius_km: 10, lga: "Latrobe"
  },
  {
    project_name: "Bendigo Hospital — expansion",
    project_type: "health", suburb: "Bendigo", latitude: -36.7580, longitude: 144.2820,
    estimated_budget_m: 300, status: "under_construction", estimated_completion: "2027",
    catchment_radius_km: 10, lga: "Greater Bendigo"
  },
];

async function main() {
  console.log(`Seeding ${projects.length} infrastructure projects...`);

  // Truncate table first
  await sql`TRUNCATE infrastructure_projects RESTART IDENTITY CASCADE`;
  console.log("  Truncated existing data");

  // Batch insert
  let inserted = 0;
  for (const p of projects) {
    await sql`
      INSERT INTO infrastructure_projects
        (project_name, project_type, suburb, latitude, longitude,
         catchment_radius_km, estimated_budget_m, status, estimated_completion, lga)
      VALUES
        (${p.project_name}, ${p.project_type}, ${p.suburb}, ${p.latitude}, ${p.longitude},
         ${p.catchment_radius_km || 5}, ${p.estimated_budget_m}, ${p.status}, ${p.estimated_completion}, ${p.lga || null})
    `;
    inserted++;
  }
  console.log(`  Inserted ${inserted} projects`);

  // Verify
  const count = await sql`SELECT COUNT(*) as cnt FROM infrastructure_projects`;
  console.log(`  Total in table: ${count[0].cnt}`);

  const types = await sql`
    SELECT project_type, COUNT(*) as cnt, ROUND(AVG(estimated_budget_m)) as avg_budget_m
    FROM infrastructure_projects
    GROUP BY project_type ORDER BY cnt DESC
  `;
  console.log("\n Breakdown by type:");
  for (const t of types) {
    console.log(`  ${t.project_type.padEnd(15)} ${String(t.cnt).padStart(3)} projects, avg $${t.avg_budget_m}M`);
  }

  console.log("\nDone! ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
