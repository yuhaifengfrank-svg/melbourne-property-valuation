#!/bin/bash
# ── Run ALL 12 daily batches, ONE suburb per Node process ──
# Each suburb gets its own Node.js invocation → clean memory every time.
# Usage:  bash scripts/run-all-one-per-suburb.sh [start_batch] [end_batch]

cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"

START_BATCH="${1:-1}"
END_BATCH="${2:-12}"
LOG_FILE="/tmp/daily-oneshot-$(date +%Y%m%d).log"

say() {
  echo "$*" | tee -a "$LOG_FILE"
}

say "=========================================="
say "One-Per-Suburb Collector -- $(date)"
say "Batches: $START_BATCH to $END_BATCH"
say "=========================================="

# Check VM lake
rsync -az --dry-run /dev/null vm-aushomevalue:/tmp/ >/dev/null 2>&1
if [ $? -eq 0 ]; then
  say "VM lake: reachable"
else
  say "VM lake: UNREACHABLE (continuing without VM storage)"
fi

say ""
say "Loading suburb list..."
"$NODE_BIN" scripts/dump-suburb-list.mjs >> "$LOG_FILE" 2>&1
if [ ! -f /tmp/all-suburbs.json ]; then
  say "FAILED to generate suburb list"
  exit 1
fi

# Partition into 12 batches
python3 -c "
import json
data = json.load(open('/tmp/all-suburbs.json'))
total = len(data)
bs = (total + 11) // 12
for i in range(12):
    start = i * bs
    end = min((i+1)*bs, total)
    batch = data[start:end]
    with open('/tmp/batch-%d.json' % (i+1), 'w') as f:
        json.dump(batch, f)
    print('Batch %d: %d suburbs (%d-%d)' % (i+1, len(batch), start+1, end))
" >> "$LOG_FILE" 2>&1

TODAY=$(date +%Y-%m-%d)
say "Date: $TODAY"
say ""

# Process batches
for BATCH_NUM in $(seq "$START_BATCH" "$END_BATCH"); do
  BATCH_FILE="/tmp/batch-${BATCH_NUM}.json"
  if [ ! -f "$BATCH_FILE" ]; then
    say "SKIP: Batch file missing $BATCH_FILE"
    continue
  fi

  SUBURB_COUNT=$(python3 -c "import json; print(len(json.load(open('$BATCH_FILE'))))" 2>/dev/null || echo "0")
  say "=== Batch $BATCH_NUM/12 -- $SUBURB_COUNT suburbs ==="

  # Read suburbs from batch file
  python3 -c "
import json
data = json.load(open('$BATCH_FILE'))
for i,s in enumerate(data):
    print('%s|%s|%s|%d|%d' % (s['suburb'], s.get('state','VIC'), s.get('postcode',''), i+1, len(data)))
" | while IFS='|' read -r SUBURB STATE POSTCODE IDX TOTAL; do
    # Check if already collected today
    EXISTING=$("$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  const r = await sql\`SELECT COUNT(*)::int AS cnt FROM comparable_sales WHERE collection_date = \${{'$TODAY'}}::date AND LOWER(TRIM(suburb)) = \${{'$SUBURB'}}\`;
  console.log(r[0].cnt||0);
})();
" 2>/dev/null)

    if [ -n "$EXISTING" ] && [ "$EXISTING" -gt 0 ] 2>/dev/null; then
      say "  [$IDX/$TOTAL] SKIP $SUBURB ($POSTCODE) -- already $EXISTING records today"
      continue
    fi

    say "  [$IDX/$TOTAL] $SUBURB ($POSTCODE) ..."

    "$NODE_BIN" scripts/collect-one-suburb.mjs "$SUBURB" "$STATE" "$POSTCODE" "$BATCH_NUM" >> "$LOG_FILE" 2>&1
    RC=$?
    if [ $RC -ne 0 ]; then
      say "  !! $SUBURB failed (exit $RC)"
    fi

    # Cooldown
    sleep 4
  done

  say ""
  say "  Batch $BATCH_NUM done"

  # Update collection_state
  "$NODE_BIN" -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  await sql\`UPDATE collection_state SET last_batch = \${{'$BATCH_NUM'}}, last_run_date = \${{'$TODAY'}}::date, updated_at = NOW() WHERE id = 'daily_batch'\`;
  console.log('collection_state updated: batch=$BATCH_NUM');
})();
" >> "$LOG_FILE" 2>&1

  say "  collection_state updated"
  sleep 15
done

# Cleanup
rm -f /tmp/batch-*.json /tmp/all-suburbs.json 2>/dev/null

say ""
say "=========================================="
say "DONE -- $(date)"
say "=========================================="
