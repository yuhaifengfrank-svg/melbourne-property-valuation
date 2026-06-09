const xlsx = require('/Users/FrankAI/Documents/澳洲房地产评估系统/node_modules/xlsx');
const { readFileSync } = require('fs');

// 1) Parse the local VGV file
const buf = readFileSync('/Users/FrankAI/Downloads/Houses-by-suburb-2013-2023.xlsx');
const wb = xlsx.read(buf, { type:'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

// Column layout: [Suburb, 2013, 2014, ..., 2023, empty, chg22_23, chg13_23, PA]
const YEAR_COLS = [
  { idx: 1, year: 2013 }, { idx: 2, year: 2014 }, { idx: 3, year: 2015 },
  { idx: 4, year: 2016 }, { idx: 5, year: 2017 }, { idx: 6, year: 2018 },
  { idx: 7, year: 2019 }, { idx: 8, year: 2020 }, { idx: 9, year: 2021 },
  { idx: 10, year: 2022 }, { idx: 11, year: 2023 },
];

const suburbs = [];
for (let r = 4; r < rows.length; r++) { // data starts at row 5 (0-indexed 4)
  const row = rows[r];
  if (!row || !row[0]) continue;
  const name = String(row[0]).trim();
  if (!name || /^(Locality|Suburb|Total|Melbourne|Vic|Regional)/.test(name)) continue;

  const annual = {};
  for (const c of YEAR_COLS) {
    // Cells with '-' are missing data; numeric strings are numbers
    const val = row[c.idx];
    if (val == null || val === '-' || val === '') continue;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
    if (!isNaN(n) && n > 0) annual[c.year] = n;
  }
  if (Object.keys(annual).length === 0) continue;

  const years = Object.keys(annual).map(Number).sort((a,b) => a-b);
  const latest = years[years.length - 1];
  let cagr5 = null, cagr10 = null;
  if (annual[latest-4]) cagr5 = (Math.pow(annual[latest]/annual[latest-4], 1/5) - 1) * 100;
  if (annual[latest-9]) cagr10 = (Math.pow(annual[latest]/annual[latest-9], 1/10) - 1) * 100;

  suburbs.push({
    suburb: name.toUpperCase(),
    yearly: annual,
    latestYear: latest,
    latestMedian: annual[latest],
    cagr5: cagr5 != null ? Math.round(cagr5*100)/100 : null,
    cagr10: cagr10 != null ? Math.round(cagr10*100)/100 : null,
  });
}

console.log(`Parsed ${suburbs.length} suburbs from VGV file`);

// 2) DB: add columns & write
const { neon } = require('/Users/FrankAI/Documents/澳洲房地产评估系统/node_modules/@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

(async () => {
  // Add columns if missing
  await sql.query(`
    ALTER TABLE suburb_metrics
    ADD COLUMN IF NOT EXISTS govt_house_median NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS govt_house_year SMALLINT,
    ADD COLUMN IF NOT EXISTS govt_5yr_cagr NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS govt_10yr_cagr NUMERIC(5,2)
  `, []);
  console.log('Columns added/verified');

  let updated = 0, skipped = 0;
  for (const s of suburbs) {
    const m = await sql.query('SELECT suburb FROM suburb_metrics WHERE LOWER(suburb) = LOWER($1) LIMIT 1', [s.suburb]);
    if (m.length === 0) { skipped++; continue; }

    await sql.query(`
      UPDATE suburb_metrics SET
        govt_house_median = $1::numeric,
        govt_house_year = $2::smallint,
        govt_5yr_cagr = $3::numeric(5,2),
        govt_10yr_cagr = $4::numeric(5,2),
        updated_at = NOW()
      WHERE LOWER(suburb) = LOWER($5)
    `, [
      s.latestMedian != null ? Math.round(s.latestMedian * 100) / 100 : null,
      s.latestYear,
      s.cagr5,
      s.cagr10,
      s.suburb,
    ]);
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated} updated...`);
  }

  console.log(`\nResults: ${updated} updated, ${skipped} skipped (not in suburb_metrics)`);

  // Summary
  const stats = await sql.query('SELECT COUNT(*)::int AS w5, AVG(govt_5yr_cagr)::numeric(5,2) AS avg5 FROM suburb_metrics WHERE govt_5yr_cagr IS NOT NULL', []);
  console.log(`With 5yr CAGR: ${stats[0].w5}, Average: ${stats[0].avg5}%`);
})();
