const https = require('https');
const xlsx = require('/Users/FrankAI/Documents/澳洲房地产评估系统/node_modules/xlsx');
const { writeFileSync, existsSync, readFileSync } = require('fs');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*',
  'Referer': 'https://discover.data.vic.gov.au/',
};

const VGV_URLS = {
  houses: 'https://www.land.vic.gov.au/__data/assets/excel_doc/0029/709751/Houses-by-suburb-2013-2023.xlsx',
  units: 'https://www.land.vic.gov.au/__data/assets/excel_doc/0033/756582/units-by-suburb-2014-2024.xlsx',
  land: 'https://www.land.vic.gov.au/__data/assets/excel_doc/0034/756583/land-by-suburb-2014-2024.xlsx',
};

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: BROWSER_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(new URL(res.headers.location, url).href).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function parseVGV(rows) {
  const hdr = rows[0];
  const yearCols = [];
  for (let i = 0; i < hdr.length; i++) {
    const h = String(hdr[i] || '').trim();
    if (/^\d{4}$/.test(h)) yearCols.push({ i, y: parseInt(h) });
  }
  
  const suburbs = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0]) continue;
    const name = String(row[0]).trim();
    if (!name || name === 'Suburb' || /^(Total|Melbourne|Vic)/.test(name)) continue;
    
    const annual = {};
    for (const c of yearCols) {
      const v = parseFloat(row[c.i]);
      if (!isNaN(v) && v > 0) annual[c.y] = v;
    }
    if (Object.keys(annual).length === 0) continue;
    
    const years = Object.keys(annual).map(Number).sort((a,b)=>a-b);
    const latest = years[years.length - 1];
    let cagr5 = null, cagr10 = null;
    if (annual[latest-4]) cagr5 = (Math.pow(annual[latest]/annual[latest-4], 1/5) - 1) * 100;
    if (annual[latest-9]) cagr10 = (Math.pow(annual[latest]/annual[latest-9], 1/10) - 1) * 100;
    
    suburbs.push({
      suburb: name,
      latestYear: latest, latestMedian: annual[latest],
      cagr5: cagr5 != null ? Math.round(cagr5*100)/100 : null,
      cagr10: cagr10 != null ? Math.round(cagr10*100)/100 : null,
      annualCount: Object.keys(annual).length,
    });
  }
  return { years: yearCols.map(c=>c.y), suburbs };
}

async function main() {
  const all = {};
  for (const [key, url] of Object.entries(VGV_URLS)) {
    console.log(`Downloading ${key}...`);
    const buf = await httpGet(url);
    console.log(`  ${(buf.length/1024).toFixed(0)} KB`);
    const wb = xlsx.read(buf, { type:'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
    const parsed = parseVGV(rows);
    console.log(`  ${parsed.suburbs.length} suburbs, years ${parsed.years.length}`);
    all[key] = parsed;
  }

  // Print summary
  const h5 = all.houses.suburbs.filter(s => s.cagr5 != null);
  const h10 = all.houses.suburbs.filter(s => s.cagr10 != null);
  console.log(`\nHouse: ${all.houses.suburbs.length} total, ${h5.length} with 5yr, ${h10.length} with 10yr`);
  
  const sorted = h5.sort((a,b) => b.cagr5 - a.cagr5);
  console.log('Top 5 house growth:');
  sorted.slice(0,5).forEach(s => console.log(`  ${s.suburb} ${s.cagr5.toFixed(1)}% → \$${(s.latestMedian||0).toLocaleString()}`));
  console.log('Bottom 5:');
  sorted.slice(-5).reverse().forEach(s => console.log(`  ${s.suburb} ${s.cagr5.toFixed(1)}% → \$${(s.latestMedian||0).toLocaleString()}`));
  
  // Match against suburb_metrics
  const { neon } = require('/Users/FrankAI/Documents/澳洲房地产评估系统/node_modules/@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  
  let matched = 0;
  for (const s of all.houses.suburbs) {
    const m = await sql.query('SELECT suburb FROM suburb_metrics WHERE LOWER(suburb) = LOWER($1) LIMIT 1', [s.suburb]);
    if (m.length > 0) matched++;
  }
  console.log(`\nMatch against suburb_metrics: ${matched}/${all.houses.suburbs.length}`);
  
  // Write migration script
  const output = {
    downloaded: new Date().toISOString(),
    house: all.houses,
    units: all.units,
    land: all.land,
  };
  writeFileSync('/tmp/vgv_full_data.json', JSON.stringify(output, null, 2));
  console.log('\nSaved: /tmp/vgv_full_data.json');
}

main().catch(e => { console.error('FAIL:', e.message, e.stack?.slice(0,500)); process.exit(1); });
