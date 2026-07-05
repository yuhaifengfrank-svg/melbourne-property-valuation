#!/bin/bash
# ── Deep-collect: re-scrape 116 low-data suburbs with more pages ──
# Uses collect-one-suburb.mjs with progressive page counts (5, 10, 15)
# Usage:  bash scripts/run-lowdata-collect.sh
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"

LOG_FILE="/tmp/lowdata-collect-$(date +%Y%m%d).log"
TODAY=$(date +%Y-%m-%d)

say() { echo "$*" | tee -a "$LOG_FILE"; }

say "=========================================="
say "Low-Data Suburb Deep Collect — $TODAY"
say "=========================================="

# Read the 116 suburbs
python3 -c "
import json
data = json.load(open('/tmp/low_data_suburbs.json'))
for s in data:
    print(f\"{s['suburb']}|{s['state']}|{s.get('postcode','')}\")
" | while IFS='|' read -r SUBURB STATE POSTCODE; do
  say ""
  say "--- $SUBURB ($POSTCODE) ---"

  # Check current count
  CNT=$("$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  const r = await sql\`SELECT COUNT(*)::int AS cnt FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;
  console.log(r[0].cnt||0);
})();
" 2>/dev/null || echo "0")

  say "  Currently: $CNT records (target: 30+)"

  if [ "$CNT" -ge 30 ] 2>/dev/null; then
    say "  Already sufficient, skipping"
    continue
  fi

  # Determine max pages based on how far we are from target
  NEED=$((30 - CNT))
  if [ "$NEED" -gt 20 ]; then
    PAGES=15
  elif [ "$NEED" -gt 10 ]; then
    PAGES=10
  else
    PAGES=5
  fi

  say "  Fetching up to $PAGES pages (need $NEED more records)..."

  # Delete today's partial data first, then re-collect fresh
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  await sql\`DELETE FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;
})();
" 2>/dev/null

  "$NODE_BIN" scripts/collect-one-suburb.mjs "$SUBURB" "$STATE" "$POSTCODE" 0 "$PAGES" 2>&1 | tee -a "$LOG_FILE"

  RC=$?
  if [ $RC -ne 0 ]; then
    say "  !! FAILED (exit $RC)"
  fi

  # Cool down
  sleep 5
done

say ""
say "=========================================="
say "DONE — $(date)"
say "=========================================="
