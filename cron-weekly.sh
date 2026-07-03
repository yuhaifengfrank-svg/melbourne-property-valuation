#!/bin/bash
# ── cron-weekly.sh ──
# 包装 cron-weekly.mjs，自动检查 Chrome CDP 端口。

CHROME_PORT=18800

# 检查 Chrome CDP 是否在运行
curl -s http://127.0.0.1:$CHROME_PORT/json/version > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "[cron-weekly] Chrome CDP not available on port $CHROME_PORT, trying to start..."
  if [ -f /Users/FrankAI/start-chrome-cdp.sh ]; then
    bash /Users/FrankAI/start-chrome-cdp.sh
    sleep 10
    curl -s http://127.0.0.1:$CHROME_PORT/json/version > /dev/null 2>&1
    if [ $? -ne 0 ]; then
      echo "[cron-weekly] Still cannot reach Chrome CDP. Aborting."
      exit 1
    fi
  else
    echo "[cron-weekly] start-chrome-cdp.sh not found. Make sure Chrome is running with --remote-debugging-port=$CHROME_PORT"
    exit 1
  fi
fi

cd /Users/FrankAI/Documents/澳洲房地产评估系统 || exit 1

NODE_BIN="/Users/FrankAI/.local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[cron-weekly] Node executable unavailable: $NODE_BIN" >&2
  exit 1
fi

# Load the database URL locally so credentials are not embedded in crontab.
if [ -z "$DATABASE_URL" ] && [ -f .env ]; then
  export DATABASE_URL="$(grep -E "^DATABASE_URL='" .env | sed "s/^DATABASE_URL='//;s/'$//")"
fi
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set; aborting cron-weekly." >&2
  exit 1
fi
"$NODE_BIN" cron-weekly.mjs >> /tmp/cron-weekly.log 2>&1
