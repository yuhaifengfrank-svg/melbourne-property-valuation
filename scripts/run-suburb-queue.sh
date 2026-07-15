#!/bin/bash
# ── Run suburb queue sequentially, one at a time ──
# Usage: bash scripts/run-suburb-queue.sh [start_index]
# Reads /tmp/suburb-queue.json, writes progress to /tmp/suburb-queue-progress.txt

set -e
cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
export NODE_PATH="$PWD/node_modules"
export DATABASE_URL="$(grep "^DATABASE_URL" .env | sed 's/^DATABASE_URL=//' | tr -d "'\"")"
LOG_FILE="/tmp/suburb-queue-$(date +%Y%m%d).log"
PROGRESS_FILE="/tmp/suburb-queue-progress.txt"
START_IDX="${1:-0}"

echo "==========================================" | tee -a "$LOG_FILE"
echo "Suburb Queue Collection — $(date)" | tee -a "$LOG_FILE"
echo "Start index: $START_IDX" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

# Read queue
TOTAL=$("$NODE_BIN" -e "const d=require('/tmp/suburb-queue.json'); console.log(d.length);" 2>/dev/null)
echo "Total suburbs: $TOTAL" | tee -a "$LOG_FILE"

if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]; then
  echo "ERROR: Empty or missing /tmp/suburb-queue.json" | tee -a "$LOG_FILE"
  exit 1
fi

SUCCESS=0
FAIL=0

for I in $(seq $START_IDX $((TOTAL - 1))); do
  # Get suburb at index I
  SUBURB=$("$NODE_BIN" -e "const d=require('/tmp/suburb-queue.json'); console.log(d[$I]);" 2>/dev/null)
  
  if [ -z "$SUBURB" ]; then
    echo "[$((I+1))/$TOTAL] SKIP: empty suburb at index $I" | tee -a "$LOG_FILE"
    FAIL=$((FAIL + 1))
    continue
  fi

  echo "[$((I+1))/$TOTAL] Processing: $SUBURB ..." | tee -a "$LOG_FILE"
  
  # Run collector
  START_TIME=$(date +%s)
  "$NODE_BIN" scripts/collect-one-suburb.mjs "$SUBURB" "VIC" "" "1" "5" >> "$LOG_FILE" 2>&1
  RC=$?
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  if [ $RC -eq 0 ]; then
    SUCCESS=$((SUCCESS + 1))
    echo "  ✓ $SUBURB done (${DURATION}s)" | tee -a "$LOG_FILE"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $SUBURB failed (exit $RC, ${DURATION}s)" | tee -a "$LOG_FILE"
  fi

  # Write progress checkpoint
  echo "$((I+1)) $SUCCESS $FAIL $SUBURB" > "$PROGRESS_FILE"

  # Cooldown 4 seconds
  if [ $I -lt $((TOTAL - 1)) ]; then
    sleep 4
  fi
done

echo ""
echo "==========================================" | tee -a "$LOG_FILE"
echo "COMPLETE — $(date)" | tee -a "$LOG_FILE"
echo "Total: $TOTAL | Success: $SUCCESS | Failed: $FAIL" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"
