#!/bin/bash
# ── cron-weekly.sh ──
# 包装 cron-weekly.mjs，从项目目录跑，加载 .env
cd /Users/FrankAI/Documents/澳洲房地产评估系统 || exit 1
export DATABASE_URL="postgresql://neondb_owner:npg_HYR8v9VSTOJe@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
node cron-weekly.mjs >> /tmp/cron-weekly.log 2>&1
