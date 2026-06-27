"""
ingest_vicplan_monash.py — VicPlan Monash LGA planning zones → summary artifact

Flow:
  1. Connect to Preview Neon DB (via DATABASE_URL env var)
  2. Query vicplan_zones for Monash LGA
  3. Group by zone_code, compute area statistics
  4. Query vicplan_overlays for Monash LGA
  5. Output planning_summary JSON → data/artifacts/planning_summary/

Environment:
  DATABASE_URL — Neon connection string with user/password

Usage:
  DATABASE_URL='postgresql://...' python3 app/ingest/ingest_vicplan_monash.py

Output:
  data/artifacts/planning_summary/vicplan_monash.json
"""

import json
import os
import sys

PROJECT_ROOT = "/opt/aushomevalue"
ARTIFACTS_DIR = os.path.join(PROJECT_ROOT, "data", "artifacts", "planning_summary")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

LGA_TARGET = "Monash"

def main():
    print(f"=== VicPlan {LGA_TARGET} → Planning Summary ===")
    
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[ERROR] DATABASE_URL not set")
        sys.exit(1)
    
    try:
        import psycopg2
    except ImportError:
        print("[ERROR] psycopg2 not installed")
        sys.exit(1)
    
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # 1) Zone summary
    print(f"  Querying zones for {LGA_TARGET}...")
    cur.execute("""
        SELECT 
            zone_code,
            zone_description,
            COUNT(*) as parcel_count,
            ROUND(AVG(ST_Area(geom::geography))::numeric, 0) as avg_area_sqm
        FROM vicplan_zones
        WHERE lga = %s
        GROUP BY zone_code, zone_description
        ORDER BY parcel_count DESC
    """, (LGA_TARGET,))
    
    zones_raw = cur.fetchall()
    zone_summary = [
        {
            "zone_code": row[0],
            "zone_description": row[1],
            "parcel_count": row[2],
            "avg_area_sqm": float(row[3]) if row[3] else None
        }
        for row in zones_raw
    ]
    
    total_zones = sum(z["parcel_count"] for z in zone_summary)
    dominant_zone = zone_summary[0]["zone_code"] if zone_summary else None
    
    # 2) Overlay summary
    print(f"  Querying overlays for {LGA_TARGET}...")
    try:
        cur.execute("""
            SELECT 
                overlay_code,
                overlay_description,
                COUNT(*) as parcel_count
            FROM vicplan_overlays
            WHERE lga = %s
            GROUP BY overlay_code, overlay_description
            ORDER BY parcel_count DESC
        """, (LGA_TARGET,))
        overlays_raw = cur.fetchall()
        overlay_summary = [
            {
                "overlay_code": row[0],
                "overlay_description": row[1],
                "parcel_count": row[2]
            }
            for row in overlays_raw
        ]
    except Exception as e:
        print(f"  [WARN] Overlay query failed: {e}")
        overlay_summary = []
    
    cur.close()
    conn.close()
    
    # 3) Build artifact
    artifact = {
        "source": "VicPlan Planning Zones & Overlays",
        "lga": LGA_TARGET,
        "extracted_at": "2026-06-23",
        "zone_summary": {
            "records": zone_summary,
            "total_parcels": total_zones,
            "dominant_zone": dominant_zone,
            "unique_zone_codes": len(zone_summary)
        },
        "overlay_summary": {
            "records": overlay_summary,
            "unique_overlay_codes": len(overlay_summary)
        }
    }
    
    output_path = os.path.join(ARTIFACTS_DIR, "vicplan_monash.json")
    with open(output_path, "w") as f:
        json.dump(artifact, f, indent=2)
    
    print(f"  Zones: {total_zones} parcels, {len(zone_summary)} unique codes")
    print(f"  Dominant: {dominant_zone}")
    print(f"  Overlays: {len(overlay_summary)} unique codes")
    print(f"✅ Written: {output_path}")
    print(f"   File size: {os.path.getsize(output_path):,} bytes")

if __name__ == "__main__":
    main()
