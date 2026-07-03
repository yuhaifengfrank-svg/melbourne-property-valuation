#!/bin/bash
# ── Daily Batch Slot 2 (04:00) ──
# Runs daily-batch-collection.mjs with auto-advance (no batch argument).
# Slot 2 advances last_batch by 1 after Slot 1 already advanced it.
# collection_state table tracks the rotation.

cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[slot2] Node executable unavailable: $NODE_BIN" >&2
  exit 1
fi

# Load DATABASE_URL from .env and export to node subprocess
export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
export NODE_PATH="$PWD/node_modules"

"$NODE_BIN" scripts/daily-batch-collection.mjs >> /tmp/cron-batch-slot2.log 2>&1
