#!/bin/bash
# ── Daily Batch Slot 1 (02:00) ──
# Runs daily-batch-collection.mjs with auto-advance (no batch argument).
# collection_state table tracks last_batch + last_run_date for 12-batch rotation.
# Slot 1 advances last_batch by 1. Slot 2 advances by another 1.
# Full cycle: 6 days (2 batches/day × 12 batches)

cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[slot1] Node executable unavailable: $NODE_BIN" >&2
  exit 1
fi

# Load DATABASE_URL from .env and export to node subprocess
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
export NODE_PATH="$PWD/node_modules"

"$NODE_BIN" scripts/daily-batch-collection.mjs >> /tmp/cron-batch-slot1.log 2>&1
