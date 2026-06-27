#!/bin/bash
# Usage: cron-batch.sh <batchNumber>
# cron-friendly wrapper for daily-batch-collection.mjs
export DATABASE_URL="postgresql://neondb_owner:npg_yxd0rKOc3uvR@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"
cd /Users/FrankAI/Documents/澳洲房地产评估系统
node scripts/daily-batch-collection.mjs "$1" >> /tmp/cron-batch-$1.log 2>&1
