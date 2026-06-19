#!/bin/bash
cd /Users/FrankAI/Documents/澳洲房地产评估系统 || exit 1
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set; aborting cron-supplement." >&2
  exit 1
fi
node cron-supplement.mjs >> /tmp/cron-supplement.log 2>&1
