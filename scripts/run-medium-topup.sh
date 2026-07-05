#!/bin/bash
# ── Medium-density suburbs (30-49 records): REA-only 50 pages ──
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"

TODAY=$(date +%Y-%m-%d)
LOG_FILE="/tmp/medium-topup-${TODAY}.log"

say() { echo "$*" | tee -a "$LOG_FILE"; }

say "=========================================="
say "Medium suburbs (30-49) — REA 50 pages — $(date)"
say "=========================================="

# Export target suburbs
"$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  const r = await sql\`SELECT LOWER(TRIM(suburb)) AS s, 'VIC' AS state, MODE() WITHIN GROUP (ORDER BY postcode) AS pc FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date GROUP BY LOWER(TRIM(suburb)) HAVING COUNT(*) >= 30 AND COUNT(*) < 50 ORDER BY COUNT(*), LOWER(TRIM(suburb))\`;
  const fs = await import('fs');
  fs.writeFileSync('/tmp/medium-targets.json', JSON.stringify(r.map(x=>({suburb:x.s,state:x.state,postcode:x.pc}))));
  console.log('Target suburbs:', r.length);
})();
" 2>&1 | tee -a "$LOG_FILE"

python3 -c "
import json
data = json.load(open('/tmp/medium-targets.json'))
for s in data:
    print(f\"{s['suburb']}|{s['state']}|{s.get('postcode','')}\")
" | while IFS='|' read -r SUBURB STATE POSTCODE; do
  say ""
  say "--- $SUBURB ---"

  # Delete today's data for this suburb
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{await sql\`DELETE FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;})();
" 2>/dev/null

  "$NODE_BIN" scripts/collect-rea-only.mjs "$SUBURB" "$STATE" "$POSTCODE" 0 2>&1 | tee -a "$LOG_FILE"
  sleep 5
done

say ""
say "=========================================="
say "Medium topup DONE — $(date)"
say "=========================================="
