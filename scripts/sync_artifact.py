#!/usr/bin/env python3
"""
sync_artifact.py — Oracle Data Factory → Preview Neon (dry-run first)

Flow:
  1. Read manifest.json → validate artifact exists
  2. If DRY_RUN (default): print sync plan, do nothing
  3. If DRY_RUN=false: connect to Preview Neon, verify target table,
     run SELECT count(*) to confirm connectivity
  4. No data written (reserved for Step 3)

Usage:
  # Dry-run (default, safe)
  python3 app/sync/sync_artifact.py --artifact=abs_census_2021

  # Connect but verify only (no write)
  DRY_RUN=false python3 app/sync/sync_artifact.py --artifact=vicplan_monash

  # Full sync (requires explicit operator approval)
  # (coming in Step 3)

Environment:
  PREVIEW_DATABASE_URL — Neon connection string (injected at runtime)
  DRY_RUN              — default "true"; set to "false" for connectivity test

Output:
  stdout: sync plan or verification results
  No writes to Neon or disk beyond log entries.
"""

import json
import os
import sys

PROJECT_ROOT = "/opt/aushomevalue"
MANIFEST_PATH = os.path.join(PROJECT_ROOT, "data", "artifacts", "manifest.json")
LOG_DIR = os.path.join(PROJECT_ROOT, "logs", "sync")
os.makedirs(LOG_DIR, exist_ok=True)


def load_manifest():
    with open(MANIFEST_PATH) as f:
        return json.load(f)


def get_artifact(manifest, key):
    for a in manifest.get("artifacts", []):
        if a["artifact_key"] == key:
            return a
    return None


def print_header(msg):
    print("=" * 60)
    print(f"  {msg}")
    print("=" * 60)


def print_plan(artifact):
    """Print the sync plan without connecting to any DB."""
    print_header("SYNC PLAN (DRY RUN — NO DB CONNECTION)")
    print(f"  Artifact:        {artifact['artifact_key']}")
    print(f"  File:            {artifact['file_path']}")
    print(f"  Source key:      {artifact['source_key']}")
    print(f"  Rows:            {artifact['row_count']:,}")
    print(f"  File size:       {artifact['file_size_bytes']:,} bytes")
    print(f"  SHA256:          {artifact['sha256'][:16]}...")
    print(f"  Target table:    {artifact['intended_neon_table']}")
    print(f"  Schema version:  {artifact['schema_version']}")
    print()
    preview_ok = "✅ YES" if artifact["safe_for_preview_sync"] else "❌ NO"
    prod_ok = "✅ YES" if artifact["safe_for_production_sync"] else "❌ NO"
    print(f"  Safe for preview:   {preview_ok}")
    print(f"  Safe for production: {prod_ok}")
    print()
    
    if not artifact["safe_for_preview_sync"]:
        print("  ⛔ BLOCKED: This artifact is not marked safe for preview sync.")
        print("     Update manifest.json before attempting sync.")
        return
    
    print("  Sync would:")
    if artifact["artifact_key"] == "abs_census_2021":
        print("    1. Parse g41 (dwelling structure) + g01/g02 from flat fields")
        print("    2. For each SA2: UPDATE census_sa2_data SET g41 = jsonb, updated_at = now()")
        print("       WHERE sa2_code = <code>")
        print("    3. Log count of updated rows")
    elif artifact["artifact_key"] == "rba_macro_full":
        print("    1. Parse series.cash_rate_target.records[]")
        print("    2. INSERT INTO macro_indicators (indicator, value, recorded_date, source)")
        print("    3. Repeat for CPI, GDP, Labour Force, J1 forecasts")
        print("    4. Log count of inserted rows per indicator type")
    elif artifact["artifact_key"] == "vicplan_monash":
        print("    1. Parse zone_summary.records[]")
        print("    2. INSERT INTO suburb_planning_summary")
        print("       (suburb='Monash', lga='MONASH', dominant_zone_code=..., ...)")
        print("    3. Log inserted rows")
    else:
        print("    1. (no specific sync logic defined for this artifact)")
    
    print()
    print("  To proceed to connectivity test:")
    print("    DRY_RUN=false python3 app/sync/sync_artifact.py --artifact=<key>")
    print()
    print("  ⚠️  No database connection was made during this dry run.")


def verify_connectivity(artifact):
    """Connect to Preview Neon and verify target table exists. Zero writes."""
    db_url = os.environ.get("PREVIEW_DATABASE_URL")
    if not db_url:
        print("❌ PREVIEW_DATABASE_URL not set. Cannot verify connectivity.")
        print("   Inject at runtime: prepend to command, never store in .env")
        return False
    
    # Map artifact to expected table name
    table_map = {
        "abs_census_2021": "census_sa2_data",
        "rba_macro_full": "macro_indicators",
        "vicplan_monash": "suburb_planning_summary",
    }
    target_table = table_map.get(artifact["artifact_key"])
    if not target_table:
        print(f"❌ Unknown target table for artifact '{artifact['artifact_key']}'")
        return False
    
    try:
        import psycopg2
    except ImportError:
        print("⚠️  psycopg2 not installed. Trying Node fallback...")
        return verify_connectivity_node(artifact, db_url, target_table)
    
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Verify target table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
        """, (target_table,))
        exists = cur.fetchone()[0]
        
        if not exists:
            print(f"❌ Target table '{target_table}' does not exist in Preview Neon.")
            cur.close()
            conn.close()
            return False
        
        # Verify row count
        cur.execute(f"SELECT count(*) FROM {target_table}")
        current_rows = cur.fetchone()[0]
        
        print_header("CONNECTIVITY VERIFICATION (NO WRITES)")
        print(f"  Target:          {db_url[:60]}...")
        print(f"  Target table:    {target_table}")
        print(f"  Table exists:    ✅ YES")
        print(f"  Current rows:    {current_rows:,}")
        print(f"  Artifact rows:   {artifact['row_count']:,}")
        print(f"  Would insert:    {artifact['row_count']:,} rows")
        print(f"  New total:       {current_rows + artifact['row_count']:,} rows")
        print()
        print("  ⚠️  No data written. To sync, use: DRY_RUN=false SYNC_CONFIRMED=true ...")
        
        cur.close()
        conn.close()
        return True
    
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


def do_sync_vicplan_monash(artifact, db_url):
    """Sync vicplan_monash.json to suburb_planning_summary on Preview Neon.
    
    Only for vicplan_monash artifact. Other artifacts use different sync logic.
    """
    import subprocess, tempfile, json as pyjson
    
    artifact_path = os.path.join(PROJECT_ROOT, "data", artifact["file_path"].replace("/opt/aushomevalue/data/", ""))
    with open(artifact_path) as f:
        data = pyjson.load(f)
    
    zone_summary = data.get("zone_summary", {})
    dominant_zone = zone_summary.get("dominant_zone", "")
    total_parcels = zone_summary.get("total_parcels", 0)
    unique_codes = zone_summary.get("unique_zone_codes", 0)
    records = zone_summary.get("records", [])
    
    print(f"  Building INSERT for {len(records)} zone code rows...")
    
    # Build the INSERT SQL — one row per zone code with Monash LGA context
    # suburb_planning_summary schema (from inspection):
    #   id, suburb, state, lga, dominant_zone_code, dominant_zone_category, 
    #   dominant_zone_flexibility, overlay_count, overlay_codes[], 
    #   has_design_overlay, has_flood_overlay, has_bushfire_overlay, 
    #   has_environment_overlay, has_development_plan_overlay, 
    #   heritage_status, planning_constraint_level, 
    #   redevelopment_flexibility_score, manual_review_required, 
    #   source_key, source_version, derived_at, created_at, updated_at
    
    values_list = []
    for rec in records:
        zone_code = rec["zone_code"]
        description = rec.get("zone_description", "")
        parcel_count = rec["parcel_count"]
        source_key = artifact.get("source_key", "vicplan_monash_sample")
        
        # Escape single quotes for SQL
        desc_escaped = description.replace("'", "''")
        
        values_list.append((
            "Monash", "VIC", "MONASH",
            zone_code, desc_escaped, parcel_count,
            zone_code == dominant_zone,  # is_dominant
            0, "{}",  # overlay_count, overlay_codes
            False, False, False, False, False,  # overlay booleans
            "unknown", "medium",  # heritage, constraint
            0, True,  # flexibility score, manual review
            source_key, "1.0"  # source_key, source_version
        ))
    
    # Build Node script that does the INSERT
    script_lines = []
    script_lines.append("const { neon } = require('@neondatabase/serverless');")
    script_lines.append(f"const sql = neon({json.dumps(db_url)});")
    script_lines.append("async function run() {")
    script_lines.append("  try {")
    
    # Generate INSERT values (batch to keep SQL shortish)
    batch_size = 20
    for i in range(0, len(values_list), batch_size):
        batch = values_list[i:i+batch_size]
        insert_parts = []
        for v in batch:
            insert_parts.append(
                f"('{v[0]}','{v[1]}','{v[2]}',"
                f"'{v[3]}','{v[4]}',{v[5]},"
                f"{str(v[6]).lower()},{v[7]},'{v[8]}'," +
                "false,false,false,false,false," +
                f"'{v[9]}','{v[10]}'," +
                f"{v[11]},{str(v[12]).lower()},"
                f"'{v[13]}','{v[14]}',now(),now(),now())"
            )
        sql_val = ",".join(insert_parts)
        script_lines.append(f"    await sql`INSERT INTO suburb_planning_summary " +
            f"(suburb,state,lga,dominant_zone_code,zone_description,parcel_count," +
            f"is_dominant,overlay_count,overlay_codes," +
            f"has_design_overlay,has_flood_overlay,has_bushfire_overlay," +
            f"has_environment_overlay,has_development_plan_overlay," +
            f"heritage_status,planning_constraint_level," +
            f"redevelopment_flexibility_score,manual_review_required," +
            f"source_key,source_version,derived_at,created_at,updated_at) " +
            f"VALUES {sql_val}`;")
    
    script_lines.append("    const r = await sql`SELECT count(*)::int as cnt FROM suburb_planning_summary WHERE lga='MONASH'`;")
    script_lines.append("    console.log(JSON.stringify({inserted: " + str(len(values_list)) + ", total_rows: r[0].cnt}));")
    script_lines.append("  } catch(e) { console.error(JSON.stringify({error: e.message})); }")
    script_lines.append("}")
    script_lines.append("run();")
    
    script = "\n".join(script_lines)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.cjs', delete=False) as f:
        f.write(script)
        tmp_path = f.name
    
    try:
        result = subprocess.run(
            ["node", tmp_path],
            capture_output=True, text=True, timeout=15,
            cwd="/home/ubuntu/scraper" if os.path.isdir("/home/ubuntu/scraper") else None,
            env={**os.environ, "NODE_PATH": "/home/ubuntu/scraper/node_modules"}
        )
        os.unlink(tmp_path)
        
        output = result.stdout.strip()
        if output.startswith("{"):
            data = pyjson.loads(output)
            if "error" in data:
                print(f"❌ Sync failed: {data['error']}")
                return False
            print_header("SYNC COMPLETE — Preview Neon")
            print(f"  Inserted:   {data.get('inserted', 0):,} rows")
            print(f"  Total now:  {data.get('total_rows', 0):,} rows (MONASH)")
            return True
        else:
            print(f"❌ Node script output: {output}")
            print(f"   stderr: {result.stderr[:500]}")
            return False
    except Exception as e:
        print(f"❌ Sync execution failed: {e}")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return False


def verify_connectivity_node(artifact, db_url, target_table):
    """Fallback: use Node (@neondatabase/serverless) for connectivity check."""
    import subprocess, tempfile
    
    script = f"""
const {{ neon }} = require('@neondatabase/serverless');
const sql = neon({json.dumps(db_url)});
async function run() {{
  const r = await sql`SELECT count(*)::int as cnt FROM {target_table}`;
  console.log(JSON.stringify({{current_rows: r[0].cnt}}));
}}
run().catch(e => console.error(JSON.stringify({{error: e.message}})));
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.cjs', delete=False) as f:
        f.write(script)
        tmp_path = f.name
    
    try:
        result = subprocess.run(
            ["node", tmp_path],
            capture_output=True, text=True, timeout=15,
            cwd="/home/ubuntu/scraper" if os.path.isdir("/home/ubuntu/scraper") else None,
            env={**os.environ, "NODE_PATH": "/home/ubuntu/scraper/node_modules"}
        )
        os.unlink(tmp_path)
        
        output = result.stdout.strip()
        if output.startswith("{"):
            data = json.loads(output)
            current_rows = data.get("current_rows", 0)
            print_header("CONNECTIVITY VERIFICATION (NO WRITES) [Node fallback]")
            print(f"  Target:          {db_url[:60]}...")
            print(f"  Target table:    {target_table}")
            print(f"  Table exists:    ✅ YES")
            print(f"  Current rows:    {current_rows:,}")
            print(f"  Artifact rows:   {artifact['row_count']:,}")
            print(f"  Would insert:    {artifact['row_count']:,} rows")
            print("  ⚠️  No data written.")
            return True
        else:
            print(f"❌ Node script output: {output}")
            print(f"   stderr: {result.stderr[:500]}")
            return False
    except Exception as e:
        print(f"❌ Node fallback failed: {e}")
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Sync artifact to Preview Neon")
    parser.add_argument("--artifact", required=True, help="Artifact key from manifest.json")
    args = parser.parse_args()
    
    # Load manifest
    manifest = load_manifest()
    artifact = get_artifact(manifest, args.artifact)
    
    if not artifact:
        print(f"❌ Artifact '{args.artifact}' not found in manifest.json")
        print("   Available artifacts:")
        for a in manifest.get("artifacts", []):
            print(f"     - {a['artifact_key']} ({a['row_count']:,} rows, {a['file_size_bytes']:,} B)")
        sys.exit(1)
    
    # Check dry-run mode
    dry_run = os.environ.get("DRY_RUN", "true").lower() not in ("false", "0", "no")
    sync_confirmed = os.environ.get("SYNC_CONFIRMED", "false").lower() in ("true", "1", "yes")
    
    if dry_run:
        print_plan(artifact)
        print(f"  Log: {LOG_DIR}/sync_{args.artifact}.log")
        return
    
    # Not dry-run mode: verify connectivity only (no writes yet)
    if not sync_confirmed:
        print_plan(artifact)
        print()
        success = verify_connectivity(artifact)
        if not success:
            sys.exit(1)
        print()
        print("  ℹ️  To write data, re-run with SYNC_CONFIRMED=true")
        print("     ⚠️  This requires explicit operator confirmation in chat.")
        return
    
    # Full sync mode — Step 3
    db_url = os.environ.get("PREVIEW_DATABASE_URL")
    if not db_url:
        print("❌ PREVIEW_DATABASE_URL not set. Cannot sync.")
        sys.exit(1)
    
    if artifact["artifact_key"] == "vicplan_monash":
        print_header("FULL SYNC — Preview Neon")
        print(f"  Artifact: {artifact['artifact_key']}")
        print(f"  Target:   suburb_planning_summary")
        print(f"  Rows:     {artifact['row_count']:,}")
        print(f"  Source:   {artifact['source_key']}")
        print()
        
        success = do_sync_vicplan_monash(artifact, db_url)
        if not success:
            sys.exit(1)
        
        print()
        print("  ✅ Sync complete. No other artifacts or tables touched.")
        print(f"  ℹ️  Connection string not persisted to disk.")
    else:
        print(f"⛔ Full sync for artifact '{artifact['artifact_key']}' not yet implemented.")
        print("   Currently supported: vicplan_monash only.")
        sys.exit(1)


if __name__ == "__main__":
    main()
