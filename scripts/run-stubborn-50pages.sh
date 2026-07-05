#!/bin/bash
# ── Deep deep collect: 22 stubborn suburbs with 50 pages ──
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"

LOG_FILE="/tmp/stubborn-50pages-$(date +%Y%m%d).log"
TODAY=$(date +%Y-%m-%d)

say() { echo "$*" | tee -a "$LOG_FILE"; }

say "=========================================="
say "Stubborn suburbs — 50 pages — $TODAY"
say "=========================================="

python3 -c "
import json
data = json.load(open('/tmp/stubborn-suburbs.json'))
for s in data:
    print(f\"{s['suburb']}|{s['state']}|{s.get('postcode','')}\")
" | while IFS='|' read -r SUBURB STATE POSTCODE; do
  say ""
  say "--- $SUBURB ($POSTCODE) 50 pages ---"

  # Delete existing data for today for this suburb
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  await sql\`DELETE FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;
})();
" 2>/dev/null

  # Scrape with 50 pages
  "$NODE_BIN" scripts/collect-one-suburb.mjs "$SUBURB" "$STATE" "$POSTCODE" 99 50 2>&1 | tee -a "$LOG_FILE"

  RC=$?
  if [ $RC -ne 0 ]; then
    say "  !! FAILED (exit $RC)"
  fi

  sleep 5
done

say ""
say "=========================================="
say "DONE — $(date)"
say "=========================================="
