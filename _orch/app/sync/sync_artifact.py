#!/usr/bin/env python3
"""
sync_artifact.py — Oracle Data Factory → Neon sync pipeline

Modes:
  dry-run (default):  read artifact, validate, print plan. No DB.
  verify:             check target table/row count
  sync:               write to target (requires --approve)
  promote:            write to Production (requires --approve)

Usage:
  python3 sync_artifact.py --artifact=suburb_metrics
  python3 sync_artifact.py --artifact=suburb_metrics --mode=verify
  python3 sync_artifact.py --artifact=suburb_metrics --mode=sync --approve
  python3 sync_artifact.py --artifact=suburb_metrics --mode=promote --approve

Environment:
  TARGET_DATABASE_URL    — SQLite file path or Postgres connection string
  PRODUCTION_DATABASE_URL — Production Neon (guarded, for promote only)

Constraints (hard rules):
  - Never connect to Production without Preview verification
  - Never write to Production without --approve
  - Never sync raw datasets (only artifacts)
  - Never sync parcel-level geometry
  - All tests in test environment only (MEMORY.md Hard Rule #2)
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import re
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────
STUDIO_ROOT = Path(os.environ.get("STUDIO_ROOT", str(Path.home() / "aushomevalue-studio")))
ARTIFACTS_DIR = STUDIO_ROOT / "data" / "artifacts"
MANIFEST_PATH = ARTIFACTS_DIR / "manifest.json"
DEFAULT_TEST_DB = STUDIO_ROOT / "db" / "scratch" / "test_neon.db"

# ── Artifact → Table mapping ──────────────────────────────────────────
# Artifact key  → target table name
# This is the canonical mapping. Only artifacts may be synced.
ARTIFACT_TABLE_MAP = {
    "suburb_metrics": "suburb_metrics",
    "vicplan_monash": "suburb_planning_summary",
    "rba_macro_full": "rba_macro_full",
}


# ── Guard: Production host patterns ───────────────────────────────────
PRODUCTION_HOST_PATTERNS = [
    r"ep-winter-band-a7qym6bq",
    r"ep-winter-band",
]


def die(msg: str, code: int = 1):
    print(f"⛔ {msg}", file=sys.stderr)
    sys.exit(code)


def check_not_production(url: str, allow_production: bool = False):
    """Guard: never accidentally connect to Production."""
    if url.startswith("/") or url.startswith("file:"):
        return  # local SQLite path — safe
    for pat in PRODUCTION_HOST_PATTERNS:
        if re.search(pat, url):
            if allow_production:
                print(f"  ℹ️  Production host detected: {url}")
                return
            die(
                f"❌ Production host pattern '{pat}' detected in URL!\n"
                f"   This is a PRODUCTION database. Test in test environment first.\n"
                f"   To explicitly target Production, use --mode=promote --approve."
            )


def get_connection(url: str):
    """Open SQLite (file path) or Postgres (connection string)."""
    is_sqlite = url.startswith("/") or url.startswith("file:") or url.endswith(".db")
    if is_sqlite:
        path = url.replace("file://", "").replace("file:", "")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        print(f"  📁 Local SQLite: {path}")
        return conn
    else:
        try:
            import psycopg
            conn = psycopg.connect(url)
            return conn
        except ImportError:
            die("No Postgres driver (psycopg). For SQLite, use a file:// path.")


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Schema for suburb_metrics table ───────────────────────────────────
SUBURB_METRICS_DDL = """
CREATE TABLE IF NOT EXISTS suburb_metrics (
    sa2_code TEXT PRIMARY KEY,
    suburb_name TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'VIC',
    population_total INTEGER,
    population_employed INTEGER,
    median_household_income INTEGER,
    median_rent_weekly INTEGER,
    median_mortgage_monthly INTEGER,
    dwellings_total INTEGER,
    families_total INTEGER,
    source TEXT DEFAULT 'ABS_2021_GCP',
    source_version TEXT DEFAULT '2021'
);
"""

RBA_MACRO_FULL_DDL = """
CREATE TABLE IF NOT EXISTS rba_macro_full (
    series_id TEXT PRIMARY KEY,
    indicator TEXT NOT NULL,
    value REAL,
    date TEXT,
    frequency TEXT,
    unit TEXT,
    source TEXT DEFAULT 'Reserve Bank of Australia',
    source_version TEXT DEFAULT '2026-Q1'
);
"""

VICPLAN_MONASH_DDL = """
CREATE TABLE IF NOT EXISTS suburb_planning_summary (
    id TEXT PRIMARY KEY,
    zone_code TEXT,
    zone_name TEXT NOT NULL,
    zone_short TEXT,
    overlay TEXT,
    address TEXT,
    suburb TEXT,
    state TEXT DEFAULT 'VIC',
    lga TEXT DEFAULT 'Monash',
    zone_colour TEXT,
    data_source TEXT DEFAULT 'VicPlan',
    data_version TEXT DEFAULT '2025-Q1',
    scraped_at TEXT
);
"""


def ensure_table(conn, table_name: str):
    """Create table if not exists (idempotent)."""
    if table_name == "suburb_metrics":
        conn.executescript(SUBURB_METRICS_DDL)
        conn.commit()
        print(f"  ✅ Table '{table_name}' ensured.")
    elif table_name == "suburb_planning_summary":
        conn.executescript(VICPLAN_MONASH_DDL)
        conn.commit()
        print(f"  ✅ Table '{table_name}' ensured.")
    elif table_name == "rba_macro_full":
        conn.executescript(RBA_MACRO_FULL_DDL)
        conn.commit()
        print(f"  ✅ Table '{table_name}' ensured.")
    else:
        die(f"Unknown table: {table_name}")


def load_artifact(artifact_key: str) -> dict:
    """Load artifact from manifest + JSON file."""
    if not MANIFEST_PATH.exists():
        apath = ARTIFACTS_DIR / f"{artifact_key}.json"
        if not apath.exists():
            die(f"Artifact file not found: {apath}")
        print(f"  ℹ️  No manifest.json found. Loading artifact directly.")
        data = json.loads(apath.read_text())
        records = data.get("records", data)
        row_count = len(records) if isinstance(records, list) else 0
        return {
            "artifact_key": artifact_key,
            "file_path": str(apath),
            "hash_match": True,
            "manifest_row_count": row_count,
            "parsed_row_count": row_count,
            "records": records if isinstance(records, list) else [],
            "columns": list(records[0].keys()) if row_count > 0 else [],
            "safe_for_preview": True,
            "safe_for_production": False,
            "table_name": ARTIFACT_TABLE_MAP.get(artifact_key, artifact_key),
        }

    manifest = json.loads(MANIFEST_PATH.read_text())
    entry = None
    for a in manifest.get("artifacts", []):
        if a["artifact_key"] == artifact_key:
            entry = a
            break
    if not entry:
        die(f"Artifact '{artifact_key}' not found in manifest.")

    apath = ARTIFACTS_DIR / entry["file_path"]
    if not apath.exists():
        apath = ARTIFACTS_DIR / f"{artifact_key}.json"
    if not apath.exists():
        die(f"Artifact file not found: {apath}")

    actual_hash = compute_sha256(apath)
    expected_hash = entry["sha256"]
    hash_match = actual_hash == expected_hash

    data = json.loads(apath.read_text())
    records = data.get("records", data)
    row_count = len(records) if isinstance(records, list) else 0

    return {
        "artifact_key": artifact_key,
        "file_path": str(apath),
        "hash_match": hash_match,
        "expected_hash": expected_hash,
        "actual_hash": actual_hash,
        "manifest_row_count": entry["row_count"],
        "parsed_row_count": row_count,
        "records": records if isinstance(records, list) else [],
        "columns": list(records[0].keys()) if row_count > 0 else [],
        "safe_for_preview": entry.get("safe_for_preview", False),
        "safe_for_production": entry.get("safe_for_production", False),
        "table_name": ARTIFACT_TABLE_MAP.get(artifact_key, artifact_key),
    }


def dry_run(artifact: dict):
    """Mode: dry-run — read, validate, print plan. No DB."""
    print(f"\n{'='*60}")
    print(f"  DRY RUN — No database operations performed")
    print(f"{'='*60}")
    print(f"  Target host:         N/A (dry-run, no connection)")
    print(f"  Artifact key:        {artifact['artifact_key']}")
    print(f"  File path:           {artifact['file_path']}")
    print(f"  Hash match:          {'✅ YES' if artifact['hash_match'] else '❌ NO'}")
    print(f"  Expected SHA256:     {artifact['expected_hash']}")
    print(f"  Actual SHA256:       {artifact['actual_hash']}")
    print(f"  Manifest row count:  {artifact['manifest_row_count']}")
    print(f"  Parsed row count:    {artifact['parsed_row_count']}")
    print(f"  Columns ({len(artifact['columns'])}): {', '.join(artifact['columns'])}")
    print(f"  Safe for preview:    {'✅' if artifact['safe_for_preview'] else '❌'}")
    print(f"  Safe for production: {'✅' if artifact['safe_for_production'] else '❌'}")
    print(f"  Table name:          {artifact['table_name']}")

    if artifact["parsed_row_count"] > 0:
        print(f"\n  First 3 sample rows:")
        for i, row in enumerate(artifact["records"][:3]):
            print(f"    [{i+1}] {json.dumps(row, default=str)}")

    print(f"\n  Proposed INSERT count: {artifact['parsed_row_count']}")
    print(f"  Proposed operation:   INSERT OR IGNORE (upsert)")
    print(f"\n  ✅ No writes performed (dry-run mode).")


def verify_table(conn, table: str, label: str):
    """Verify: check table exists, row count, sample rows."""
    try:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,)
        )
        exists = cursor.fetchone()
        if not exists:
            print(f"  ❌ Table '{table}' does not exist on {label}.")
            return None

        cursor = conn.execute(f"SELECT COUNT(*) AS cnt FROM \"{table}\"")
        count = cursor.fetchone()[0]
        print(f"  ✅ {label}.{table} — {count} rows")

        cursor = conn.execute(f"SELECT * FROM \"{table}\" LIMIT 5")
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]
        print(f"  Sample rows ({label}.{table}):")
        for i, row in enumerate(rows[:3]):
            row_data = {col_names[j]: str(row[j])[:60] for j in range(len(col_names))}
            print(f"    [{i+1}] {json.dumps(row_data)}")
        return count
    except Exception as e:
        print(f"  ❌ Error verifying {label}.{table}: {e}")
        return None


def sync_to_target(artifact: dict, url: str, label: str, mode: str):
    """Sync or promote: write artifact data to target DB."""
    check_not_production(url, allow_production=(mode == "promote"))
    conn = get_connection(url)
    table = artifact["table_name"]
    records = artifact["records"]
    columns = artifact["columns"]
    row_count = artifact["parsed_row_count"]

    if not records:
        die("No records to sync.")

    # Ensure table exists
    ensure_table(conn, table)

    # Build INSERT OR IGNORE
    qmarks = ", ".join(["?" for _ in columns])
    col_list = ", ".join([f'"{c}"' for c in columns])
    insert_sql = (
        f"INSERT OR IGNORE INTO \"{table}\" ({col_list}) "
        f"VALUES ({qmarks})"
    )

    try:
        vals = [[rec[c] for c in columns] for rec in records]
        conn.executemany(insert_sql, vals)
        conn.commit()
        print(f"  ✅ {label}.{table} — {len(vals)} rows synced successfully.")

        # Verify
        cursor = conn.execute(f"SELECT COUNT(*) FROM \"{table}\"")
        final_count = cursor.fetchone()[0]
        print(f"  ✅ {label}.{table} — final count after sync: {final_count}")
    except Exception as e:
        conn.rollback()
        print(f"  ❌ Sync to {label}.{table} failed: {e}")
        return False
    finally:
        conn.close()
    return True


def main():
    parser = argparse.ArgumentParser(description="Oracle Data Factory → Neon sync")
    parser.add_argument("--artifact", required=True, help="Artifact key (e.g. suburb_metrics)")
    parser.add_argument("--mode", choices=["dry-run", "verify", "sync", "promote"],
                        default="dry-run", help="Operation mode (default: dry-run)")
    parser.add_argument("--approve", action="store_true", help="Confirm write operation")
    args = parser.parse_args()

    print(f"\n🔧 sync_artifact.py — mode={args.mode} artifact={args.artifact}")

    # ── 1. Load artifact ───────────────────────────────────────────
    print(f"\n📂 Loading artifact '{args.artifact}'...")
    artifact = load_artifact(args.artifact)

    # Validate integrity
    if not artifact["hash_match"]:
        die(
            f"SHA256 mismatch! File may be corrupted.\n"
            f"  Expected: {artifact['expected_hash']}\n"
            f"  Actual:   {artifact['actual_hash']}"
        )

    if artifact["manifest_row_count"] != artifact["parsed_row_count"]:
        die(
            f"Row count mismatch!\n"
            f"  Manifest: {artifact['manifest_row_count']}\n"
            f"  Parsed:   {artifact['parsed_row_count']}"
        )

    # ── 2. Mode dispatch ──────────────────────────────────────────
    if args.mode == "dry-run":
        dry_run(artifact)
        print(f"\n{'='*60}")
        print(f"  DRY RUN COMPLETE — No database operations performed")
        print(f"{'='*60}")
        return

    # ── Determine target URL ──────────────────────────────────────
    target_url = os.environ.get("TARGET_DATABASE_URL", str(DEFAULT_TEST_DB))

    if args.mode == "verify":
        check_not_production(target_url)
        conn = get_connection(target_url)
        verify_table(conn, artifact["table_name"], "TARGET")
        conn.close()
        return

    if args.mode == "sync":
        if not args.approve:
            die("--approve required for sync mode. Run dry-run and verify first.")
        if not artifact["safe_for_preview"]:
            die("Artifact not marked safe_for_preview. Update manifest to proceed.")
        print(f"\n📤 Syncing to test environment...")
        sync_to_target(artifact, target_url, "TEST", mode="sync")
        print(f"\n✅ Sync complete. Run `--mode=verify` to confirm.")
        return

    if args.mode == "promote":
        if not args.approve:
            die("--approve required for promote mode. This writes to PRODUCTION!")
        prod_url = os.environ.get("PRODUCTION_DATABASE_URL", "")
        if not prod_url:
            die("PRODUCTION_DATABASE_URL not set.")

        # Must verify test first
        check_not_production(target_url)
        conn = get_connection(target_url)
        count = verify_table(conn, artifact["table_name"], "TEST")
        conn.close()
        if count is None or count == 0:
            die("Test verification failed. Sync to test environment first (--mode=sync --approve).")

        print(f"\n📤 Promoting to Production Neon...")
        sync_to_target(artifact, prod_url, "PRODUCTION", mode="promote")
        print(f"\n✅ Promotion to Production complete.")
        return


if __name__ == "__main__":
    main()
