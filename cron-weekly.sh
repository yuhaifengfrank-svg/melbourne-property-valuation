#!/bin/bash
# ── cron-weekly.sh ──
# 包装 cron-weekly.mjs，从项目目录跑。DATABASE_URL 必须由调用环境提供。
cd /Users/FrankAI/Documents/澳洲房地产评估系统 || exit 1
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set; aborting cron-weekly." >&2
  exit 1
fi
node cron-weekly.mjs >> /tmp/cron-weekly.log 2>&1
