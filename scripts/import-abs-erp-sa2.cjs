#!/usr/bin/env node
// ── 导入 ABS ERP SA2 人口数据（2001-2025）──
// 数据源: 32180DS0003_2001-25.xlsx — Table 1

const XLSX = require("xlsx");
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("导入 ABS ERP SA2 人口数据...\n");

  const wb = XLSX.readFile("/tmp/abs_erp_sa2.xlsx");
  const data = XLSX.utils.sheet_to_json(wb.Sheets["Table 1"], { header: 1 });

  // 解析 header
  const headerRow = data.findIndex(r => r[9] && r[9].toString().includes("SA2 name"));
  const headers = data[headerRow];
  const yrRow = data[headerRow - 1];

  // 年份列索引: 2001 → 列10, 2025 → 列 34
  const yrCols = {};
  for (let i = 0; i < yrRow.length; i++) {
    if (typeof yrRow[i] === "number" && yrRow[i] >= 2000) {
      yrCols[yrRow[i]] = i;
    }
  }

  // 过滤 SA2 数据行 + VIC only
  const rows = data
    .slice(headerRow + 1)
    .filter(r => r[0] && r[0] === 2); // state code 2 = Victoria (numeric)

  console.log(`VIC SA2 数据行: ${rows.length}`);

  // 建表（如果不存在）
  await sql`
    CREATE TABLE IF NOT EXISTS abs_erp_sa2 (
      sa2_code TEXT PRIMARY KEY,
      sa2_name TEXT NOT NULL,
      year_2001 INTEGER, year_2002 INTEGER, year_2003 INTEGER,
      year_2004 INTEGER, year_2005 INTEGER, year_2006 INTEGER,
      year_2007 INTEGER, year_2008 INTEGER, year_2009 INTEGER,
      year_2010 INTEGER, year_2011 INTEGER, year_2012 INTEGER,
      year_2013 INTEGER, year_2014 INTEGER, year_2015 INTEGER,
      year_2016 INTEGER, year_2017 INTEGER, year_2018 INTEGER,
      year_2019 INTEGER, year_2020 INTEGER, year_2021 INTEGER,
      year_2022 INTEGER, year_2023 INTEGER, year_2024 INTEGER,
      year_2025 INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // UPSERT
  let inserted = 0;
  for (const r of rows) {
    const sa2Code = String(r[8]);
    const sa2Name = r[9];

    // 构建年份映射
    const yrData = {};
    for (const [yr, ci] of Object.entries(yrCols)) {
      const val = r[ci];
      yrData[`year_${yr}`] = val != null ? parseInt(val, 10) : null;
    }

    await sql`
      INSERT INTO abs_erp_sa2 (sa2_code, sa2_name,
        year_2001,year_2002,year_2003,year_2004,year_2005,
        year_2006,year_2007,year_2008,year_2009,year_2010,
        year_2011,year_2012,year_2013,year_2014,year_2015,
        year_2016,year_2017,year_2018,year_2019,year_2020,
        year_2021,year_2022,year_2023,year_2024,year_2025
      ) VALUES (
        ${sa2Code}, ${sa2Name},
        ${yrData.year_2001},${yrData.year_2002},${yrData.year_2003},${yrData.year_2004},${yrData.year_2005},
        ${yrData.year_2006},${yrData.year_2007},${yrData.year_2008},${yrData.year_2009},${yrData.year_2010},
        ${yrData.year_2011},${yrData.year_2012},${yrData.year_2013},${yrData.year_2014},${yrData.year_2015},
        ${yrData.year_2016},${yrData.year_2017},${yrData.year_2018},${yrData.year_2019},${yrData.year_2020},
        ${yrData.year_2021},${yrData.year_2022},${yrData.year_2023},${yrData.year_2024},${yrData.year_2025}
      ) ON CONFLICT (sa2_code) DO UPDATE SET
        sa2_name = EXCLUDED.sa2_name,
        year_2025 = EXCLUDED.year_2025,
        year_2024 = EXCLUDED.year_2024,
        year_2023 = EXCLUDED.year_2023,
        year_2022 = EXCLUDED.year_2022,
        year_2021 = EXCLUDED.year_2021,
        updated_at = NOW()
    `;
    inserted++;
    if (inserted % 100 === 0) process.stdout.write(`  ${inserted}/${rows.length}...\n`);
  }

  console.log(`\n✅ 导入完成: ${inserted} 条`);
  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
