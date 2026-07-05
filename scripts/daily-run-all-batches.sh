#!/bin/bash
# ── Run all 12 daily batch collection batches, one suburb at a time ──
# Each individual suburb runs in its own Node process to avoid OOM.
# Usage:  bash scripts/daily-run-all-batches.sh
#
# If some suburbs survived (progress file), continues from where it stopped.

set -e
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
export NODE_PATH

LOG_FILE="/tmp/daily-all-batches-$(date +%Y%m%d).log"

echo "==========================================" | tee -a "$LOG_FILE"
echo "Daily Batch All Batches — $(date)" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Check VM lake connectivity once
rsync -az --dry-run /dev/null vm-aushomevalue:/tmp/ >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "⚠️  VM lake not reachable. Continuing without VM storage." | tee -a "$LOG_FILE"
else
  echo "✅ VM lake reachable" | tee -a "$LOG_FILE"
fi

# Load suburb list once, split into batches
BATCH_SIZE=5  # internal processing batch for the script

for BATCH_NUM in $(seq 1 12); do
  # Check if this batch is already completed
  PROGRESS_FILE="/tmp/daily-batch-${BATCH_NUM}.json"
  if [ -f "$PROGRESS_FILE" ]; then
    DONE=$(python3 -c "import json; d=json.load(open('$PROGRESS_FILE')); print(len(d.get('done',[])))" 2>/dev/null || echo "0")
    TOTAL=$(python3 -c "import json; d=json.load(open('$PROGRESS_FILE')); print(len(d.get('done',[])) + len(d.get('failed',[])) + len(d.get('skipped',[])) + len(d.get('pending',[])))" 2>/dev/null || echo "0")
    if [ "$DONE" -gt 0 ] && [ "$DONE" -ge "$((TOTAL - 3))" ]; then
      echo "📋 Batch $BATCH_NUM: $DONE/$TOTAL done, skipping (near complete)" | tee -a "$LOG_FILE"
      continue
    fi
    echo "📋 Batch $BATCH_NUM: resuming ($DONE/$TOTAL done)" | tee -a "$LOG_FILE"
  else
    echo "📋 Batch $BATCH_NUM: fresh start" | tee -a "$LOG_FILE"
  fi

  "$NODE_BIN" scripts/daily-batch-collection.mjs "$BATCH_NUM" "$BATCH_SIZE" 2>&1 | tee -a "$LOG_FILE"

  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 134 ] || [ $EXIT_CODE -eq 9 ]; then
    echo "⚠️  Batch $BATCH_NUM killed (OOM/signal $EXIT_CODE). Retrying in 30s..." | tee -a "$LOG_FILE"
    sleep 30
    "$NODE_BIN" scripts/daily-batch-collection.mjs "$BATCH_NUM" "$BATCH_SIZE" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=$?
  fi

  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Batch $BATCH_NUM failed (exit $EXIT_CODE), continuing to next batch" | tee -a "$LOG_FILE"
  else
    echo "✅ Batch $BATCH_NUM complete" | tee -a "$LOG_FILE"
  fi

  # Cool down between batches
  echo "   Sleeping 30s before next batch..." | tee -a "$LOG_FILE"
  sleep 30
done

echo "" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
echo "All batches complete — $(date)" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
