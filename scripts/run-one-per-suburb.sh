#!/bin/bash
# ── Run all 12 daily batches, ONE SUBURB per process ──
# Each suburb gets its own Node.js invocation → clean memory every time.
# Uses the progress file from daily-batch-collection.mjs to track state.
# Usage:  bash scripts/run-one-per-suburb.sh

set -e
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
LOG_FILE="/tmp/daily-one-per-suburb-$(date +%Y%m%d).log"

echo "==========================================" | tee -a "$LOG_FILE"
echo "Daily Batch — One Suburb Per Process — $(date)" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

# Check VM lake
rsync -az --dry-run /dev/null vm-aushomevalue:/tmp/ >/dev/null 2>&1
echo "VM lake: $([ $? -eq 0 ] && echo '✅' || echo '⚠️  unreachable')" | tee -a "$LOG_FILE"

# Step 1: load all 537 suburbs (same logic as the script)
echo "Loading suburb list..." | tee -a "$LOG_FILE"
SUBURB_FILE="/tmp/all-batch-suburbs-$$.json"
"$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const [{rows}] = await Promise.all([
  (async () => {
    const melbSA4 = ['205','206','207','208','209','210','211','212'];
    const main = await sql\`
      SELECT LOWER(TRIM(suburb)) AS suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
      FROM school_locations WHERE sa4_code = ANY(\${{melbSA4}}) AND state = 'VIC'
      GROUP BY LOWER(TRIM(suburb)), state ORDER BY LOWER(TRIM(suburb))
    \`;
    const extra = await sql\`
      SELECT LOWER(TRIM(suburb)) AS suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
      FROM comparable_sales WHERE state = 'VIC' AND (sa4_code IS NULL OR sa4_code NOT IN ('205','206','207','208','209','210','211','212'))
      GROUP BY LOWER(TRIM(suburb)), state ORDER BY LOWER(TRIM(suburb))
    \`;
    // filter dups
    const seen = new Set(main.map(r => r.suburb));
    const combined = [...main];
    for (const r of extra) { if (!seen.has(r.suburb)) { combined.push(r); seen.add(r.suburb); } }
    // remove Sans Souci
    const filtered = combined.filter(r => r.suburb !== 'sans souci');
    require('fs').writeFileSync('$SUBURB_FILE', JSON.stringify(filtered));
    console.log('Total suburbs:', filtered.length);
  })()
]);
" 2>&1 | tee -a "$LOG_FILE"

# Step 2: partition into 12 batches
echo "Partitioning into 12 batches..." | tee -a "$LOG_FILE"
python3 -c "
import json
data = json.load(open('$SUBURB_FILE'))
total = len(data)
batch_size = (total + 11) // 12  # ceil
for i in range(12):
    start = i * batch_size
    end = min((i + 1) * batch_size, total)
    batch = data[start:end]
    with open('/tmp/batch-{}.json'.format(i + 1), 'w') as f:
        json.dump(batch, f)
    print(f'Batch {i+1}: {len(batch)} suburbs ({start+1}-{end})')
" 2>&1 | tee -a "$LOG_FILE"

# Step 3: process each batch, one suburb per node process
for BATCH_NUM in $(seq 1 12); do
  BATCH_FILE="/tmp/batch-${BATCH_NUM}.json"
  if [ ! -f "$BATCH_FILE" ]; then
    echo "❌ Batch file missing: $BATCH_FILE" | tee -a "$LOG_FILE"
    continue
  fi

  SUBURB_COUNT=$(python3 -c "import json; print(len(json.load(open('$BATCH_FILE'))))" 2>/dev/null || echo "0")
  echo "
──────────────────────────────────────────────
📋 Batch $BATCH_NUM/12 — $SUBURB_COUNT suburbs
──────────────────────────────────────────────" | tee -a "$LOG_FILE"

  # Read each suburb and run
  python3 -c "
import json, os, sys
data = json.load(open('$BATCH_FILE'))
for i, suburb in enumerate(data):
    s = suburb['suburb']
    st = suburb.get('state', 'VIC')
    pc = suburb.get('postcode', '')
    print(f'SUBURB|{s}|{st}|{pc}|{i+1}|{len(data)}')
" | while IFS='|' read -r _ SUBURB STATE POSTCODE IDX TOTAL; do
    echo "  [$IDX/$TOTAL] Processing: $SUBURB ($POSTCODE)" | tee -a "$LOG_FILE"

    # Count existing for this type today
    TODAY=$(date +%Y-%m-%d)
    EXISTING=$("$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql\`SELECT COUNT(*)::int AS cnt FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;
console.log(r[0].cnt || 0);
" 2>/dev/null || echo "0")
    
    if [ "$EXISTING" -gt 0 ] 2>/dev/null; then
      echo "    ✓ Already $EXISTING records today, skipping" | tee -a "$LOG_FILE"
      continue
    fi

    # Run single suburb collection via a one-shot script
    "$NODE_BIN" -e "
import { scrapeSoldData } from './lib/browser-collector.js';
import { getSql } from './api/_db.js';
import fs from 'fs';
import { execSync } from 'child_process';

const suburb = '$SUBURB';
const state = '$STATE';
const postcode = '$POSTCODE' || null;
const batchNum = $BATCH_NUM;
const BATCH_DATE = '$TODAY';
const VM_HOST = 'vm-aushomevalue';
const VM_RAW_DIR = '/opt/aushomevalue/data/raw/parcel';

const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

async function main() {
  // Scrape up to 3 pages
  let sales = await scrapeSoldData(suburb, state, postcode, 3);
  if (!Array.isArray(sales) || sales.length === 0) {
    console.log('  No sales found for', suburb);
    return;
  }

  // Write to VM lake
  const safeName = suburb.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = 'daily_\${BATCH_DATE}_batch\${batchNum}_\${safeName}.json';
  const tmpPath = '/tmp/\${filename}';
  const payload = JSON.stringify({
    metadata: {
      suburb, collection_date: BATCH_DATE,
      batch_id: 'daily-\${BATCH_DATE}-batch\${batchNum}',
      source: 'REA+Domain CDP',
      record_count: sales.length,
      collected_at: new Date().toISOString()
    }, records: sales
  }, null, 2);
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try {
    execSync('rsync -az --rsync-path=\"mkdir -p ' + VM_RAW_DIR + ' && rsync\" ' + tmpPath + ' ' + VM_HOST + ':' + VM_RAW_DIR + '/' + filename, { timeout: 15000 });
    fs.unlinkSync(tmpPath);
    console.log('  📦 raw/' + filename + ' sent to VM lake');
  } catch (e) {
    console.log('  ⚠️  VM lake write failed:', e.message.slice(0, 80));
  }

  // Format and insert into comparable_sales
  const { formatAsComparables } = await import('./lib/browser-collector.js');
  const grouped = {};
  for (const s of sales) {
    const pt = s.propertyType || 'Unknown';
    if (!grouped[pt]) grouped[pt] = [];
    grouped[pt].push(s);
  }

  let inserted = 0, skipped = 0;
  for (const [pt, records] of Object.entries(grouped)) {
    const topN = records.slice(0, 12);
    for (const rec of topN) {
      try {
        await q(
          \`INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, postcode,
            source_url, source_name,
            collection_date, collection_round, batch_id
          ) VALUES (
            \\\$1::text, \\\$2::numeric, \\\$3::date, \\\$4::text,
            \\\$5::int, \\\$6::int, \\\$7::int, \\\$8::numeric,
            \\\$9::text, \\\$10::text, \\\$11::text,
            \\\$12::text, \\\$13::text,
            \\\$14::date, \\\$15::text, \\\$16::text
          ) ON CONFLICT (sale_address, source_name, sale_price, sale_date, property_type)
          DO NOTHING\`,
          [
            rec.address, rec.price,
            rec.saleDate ? rec.saleDate.replace(/\\//g, '-') : null,
            rec.propertyType || null,
            rec.bedrooms || null, rec.bathrooms || null,
            rec.carSpaces || null, rec.landSize || null,
            suburb, state, postcode,
            rec.evidenceUrls?.[0] || rec.sourceUrl || null,
            rec.source || 'realestate.com.au',
            BATCH_DATE, 'daily', 'daily-' + batchNum
          ]
        );
        inserted++;
      } catch(e) {
        skipped++;
        if (e.code !== '23505') {
          console.log('  ⚠️  Insert error:', e.message.slice(0, 80));
        }
      }
    }
  }

  console.log('  ++ ' + suburb + ': ' + sales.length + ' scraped, ' + inserted + ' inserted, ' + skipped + ' skipped');
}

main().catch(e => { console.error('FATAL:', e.message.slice(0, 120)); process.exit(1); });
" 2>&1 | tee -a "$LOG_FILE"

    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
      echo "  !! $SUBURB failed (exit $EXIT_CODE), continuing" | tee -a "$LOG_FILE"
    fi

    # Cool down between suburbs to let macOS GC
    sleep 4
  done

  echo "  ✅ Batch $BATCH_NUM complete" | tee -a "$LOG_FILE"

  # Update collection_state
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
await sql\`UPDATE collection_state SET last_batch = \${{'$BATCH_NUM'}}, last_run_date = \${{'$TODAY'}}::date, updated_at = NOW() WHERE id = 'daily_batch'\`;
console.log('  → collection_state updated to batch $BATCH_NUM');
" 2>&1 | tee -a "$LOG_FILE"

  # Cool down between batches
  sleep 15
done

# Cleanup temp files
rm -f "$SUBURB_FILE" /tmp/batch-*.json 2>/dev/null

echo "" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
echo "🎉 ALL 12 BATCHES COMPLETE — $(date)" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
