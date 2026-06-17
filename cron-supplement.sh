#!/bin/bash
cd /Users/FrankAI/Documents/澳洲房地产评估系统 || exit 1
export DATABASE_URL="postgresql://neondb_owner:npg_HYR8v9VSTOJe@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
node cron-supplement.mjs >> /tmp/cron-supplement.log 2>&1
