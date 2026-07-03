#!/bin/bash
# ── Coastal catch-up (8 zero-sales resort suburbs, 10 pages each) ──

cd /Users/FrankAI/Documents/澳洲房地产评估系统

NODE_BIN="/Users/FrankAI/.local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[coastal] Node executable unavailable: $NODE_BIN" >&2
  exit 1
fi

export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
export NODE_PATH="$PWD/node_modules"

"$NODE_BIN" scripts/coastal-catchup.mjs >> /tmp/coastal-cron.log 2>&1
