#!/bin/bash
# ── 21 Stubborn Suburbs — REA only, 50 pages ──
# Run manually or via cron to top up low-data suburbs.
# Runs AFTER the main daily batch to fill in gaps.

cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"

TODAY=$(date +%Y-%m-%d)
LOG_FILE="/tmp/rea-topup-${TODAY}.log"

say() { echo "$*" | tee -a "$LOG_FILE"; }

say "=========================================="
say "REA-only top-up — 21 stubborn suburbs — $(date)"
say "=========================================="

python3 -c "
import json
data = json.load(open('/tmp/stubborn-suburbs.json'))
for s in data:
    print(f\"{s['suburb']}|{s['state']}|{s.get('postcode','')}\")
" | while IFS='|' read -r SUBURB STATE POSTCODE; do
  say ""
  say "--- $SUBURB ($POSTCODE) ---"

  # Delete existing data for today for this suburb
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{await sql\`DELETE FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;})();
" 2>/dev/null

  # REA-only 50 pages
  "$NODE_BIN" scripts/collect-rea-only.mjs "$SUBURB" "$STATE" "$POSTCODE" 0 2>&1 | tee -a "$LOG_FILE"

  sleep 5
done

say ""
say "=========================================="
say "Top-up DONE — $(date)"
say "=========================================="
