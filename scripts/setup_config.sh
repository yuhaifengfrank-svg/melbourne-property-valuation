# =============================================================================
# Oracle Data Factory — Environment Variables Template
# =============================================================================
# Copy this file to .env and fill in real values.
#   cp .env.example .env
#   chmod 600 .env
#
# Phase 1B: Oracle offline data factory only.
# No .env must ever contain production secrets on Oracle.
# =============================================================================

# ---------------------------------------------------------------------------
# Oracle Data Factory Paths (local fs, no external deps)
# ---------------------------------------------------------------------------
ORACLE_DATA_ROOT=/opt/aushomevalue/data
ORACLE_ARTIFACT_ROOT=/opt/aushomevalue/data/artifacts
ORACLE_LOG_ROOT=/opt/aushomevalue/logs
ORACLE_CONFIG_ROOT=/opt/aushomevalue/config

# ---------------------------------------------------------------------------
# Preview Neon — MANUAL SYNC ONLY
# Phase 1C will populate this for dry-run import.
# This database is NEVER written to automatically.
# Password is injected at runtime by operator, never stored on disk.
# ---------------------------------------------------------------------------
# Format: postgresql://user:password@host:port/database?sslmode=require
PREVIEW_DATABASE_URL=postgresql://user_placeholder:password_placeholder@host_placeholder:5432/db_placeholder?sslmode=require

# ---------------------------------------------------------------------------
# Production Neon — NEVER STORE HERE
# Production connection string is NEVER written to Oracle disk.
# Sync to Production requires:
#   1. Codex review approval
#   2. manual approval from operator
#   3. Connection string injected at runtime only
# ---------------------------------------------------------------------------
# PRODUCTION_DATABASE_URL is NOT set in this file.

# ---------------------------------------------------------------------------
# Optional: Slack / Notification (future use)
# ---------------------------------------------------------------------------
# SLACK_WEBHOOK_URL=
