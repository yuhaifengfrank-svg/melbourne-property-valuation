#!/usr/bin/env python3
"""
VICMAP Parcel Processor — Melbourne Metro
=========================================
Extracts land sizes from parcel geometry, aggregates by LGA.

Input:  shapefile at /tmp/vicmap-raw/...
Output: data/vicmap/lga_land_size.json (LGA-level stats)
        data/vicmap/lga_boundaries.geojson (LGA outlines, V2)

Uses pyshp + shapely for geometry processing.
1.1M parcels — processed in batches.
"""

import shapefile
import json, os, time, math
from collections import defaultdict

SHP_PATH = "/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP"
OUT_DIR = "data/vicmap"

# LGA names — only metro Melbourne + surrounding
LGA_NAMES = {
    "246": "Banyule", "210": "Bayside", "211": "Boroondara", "212": "Brimbank",
    "213": "Cardinia", "214": "Casey", "215": "Darebin", "216": "Frankston",
    "217": "Glen Eira", "218": "Greater Dandenong", "219": "Hobsons Bay",
    "220": "Hume", "221": "Kingston", "222": "Knox", "223": "Manningham",
    "224": "Maribyrnong", "225": "Maroondah", "226": "Melbourne",
    "227": "Melton", "228": "Monash", "229": "Moonee Valley",
    "230": "Merri-bek", "231": "Mornington Peninsula", "232": "Nillumbik",
    "233": "Port Phillip", "234": "Stonnington", "235": "Whitehorse",
    "236": "Whittlesea", "237": "Wyndham", "238": "Yarra",
    "239": "Yarra Ranges", "352": "Mitchell", "353": "Macedon Ranges",
    "354": "Moorabool", "355": "Golden Plains", "356": "Surf Coast",
    "410": "Bass Coast", "428": "South Gippsland",
}

def polygon_area_from_points(points):
    """
    Calculate polygon area in m² using Shoelace formula.
    GDA2020 / Vicgrid coordinates are in meters — area is m².
    """
    if not points or len(points) < 3:
        return 0
    area = 0.0
    n = len(points)
    for j in range(n):
        x1, y1 = points[j]
        x2, y2 = points[(j + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0

def process():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    print(f"Reading shapefile: {SHP_PATH}")
    t0 = time.time()
    
    sf = shapefile.Reader(SHP_PATH)
    fields = [f[0] for f in sf.fields[1:]]
    print(f"Fields: {fields}")
    total = sf.numRecords
    print(f"Total records: {total:,}")
    
    # Column indices (with fallback for renamed columns)
    def get_idx(names):
        for n in names:
            if n in fields:
                return fields.index(n)
        return None
    
    idx_lga = get_idx(["PC_LGAC"])
    idx_stat = get_idx(["PC_STAT"])
    idx_road = get_idx(["ROAD"])
    idx_dtype = get_idx(["PC_DTYPE"])
    
    print(f"  LGA col:  {fields[idx_lga] if idx_lga else 'NOT FOUND'}")
    print(f"  Stat col: {fields[idx_stat] if idx_stat else 'NOT FOUND'}")
    print(f"  Road col: {fields[idx_road] if idx_road else 'NOT FOUND'}")
    print(f"  Dtype col: {fields[idx_dtype] if idx_dtype else 'NOT FOUND'}")
    
    if idx_lga is None:
        print("ERROR: LGA column not found!")
        return
    
    # Stats accumulators
    lga_data = defaultdict(lambda: {"areas": [], "parcel_count": 0})
    
    batch_size = 20000
    processed = 0
    active = 0
    skipped_stat = 0
    skipped_road = 0
    skipped_lga = 0
    skipped_big = 0
    skipped_tiny = 0
    
    records_iter = sf.iterRecords()
    shapes_iter = sf.iterShapes()
    
    while True:
        try:
            rec = next(records_iter)
            shp = next(shapes_iter)
            processed += 1
        except StopIteration:
            break
        
        if processed % 50000 == 0:
            elapsed = time.time() - t0
            rate = processed / elapsed if elapsed > 0 else 0
            print(f"  {processed:,}/{total:,} ({100*processed/total:.1f}%) — "
                  f"{elapsed:.0f}s @ {rate:.0f} rec/s", flush=True)
        
        # Filter: active only
        stat = rec[idx_stat] if idx_stat else 'A'
        if stat != 'A':
            skipped_stat += 1
            continue
        
        # Filter: not a road
        if idx_road is not None:
            is_road = rec[idx_road]
            if is_road == 'Y':
                skipped_road += 1
                continue
        
        # Check LGA — skip non-metro
        lga_code = str(rec[idx_lga]).strip()
        if lga_code not in LGA_NAMES:
            skipped_lga += 1
            continue
        
        active += 1
        dtype = str(rec[idx_dtype]).strip() if idx_dtype else '15'
        
        # Only count residential-type parcels for area stats
        is_residential = dtype in ('15', '1', '2', '3', '4', '14', '')
        
        lga_data[lga_code]["parcel_count"] += 1
        
        if is_residential:
            # Calculate area from geometry (skip non-residential)
            try:
                points = shp.points
                parts = shp.parts
                
                # Build exterior ring area
                rings = []
                for pi, start in enumerate(parts):
                    end = parts[pi + 1] if pi + 1 < len(parts) else len(points)
                    ring = points[start:end]
                    area = polygon_area_from_points(ring)
                    rings.append(area)
                
                if rings:
                    # Subtract holes from exterior
                    parcel_area = rings[0]
                    for hole in rings[1:]:
                        parcel_area -= hole
                    
                    if parcel_area > 0 and parcel_area <= 5000:  # 0-5000 m² = residential
                        lga_data[lga_code]["areas"].append(parcel_area)
                    elif parcel_area > 5000:
                        skipped_big += 1
                    else:
                        skipped_tiny += 1
            except Exception:
                pass
    
    print(f"\n--- Processing Stats ---")
    print(f"Processed: {processed:,}")
    print(f"Active (non-road, metro): {active:,}")
    print(f"Skipped (status != A): {skipped_stat:,}")
    print(f"Skipped (road): {skipped_road:,}")
    print(f"Skipped (non-metro LGA): {skipped_lga:,}")
    print(f"Skipped (area > 5000 m²): {skipped_big:,}")
    print(f"Skipped (area <= 0 m²): {skipped_tiny:,}")
    
    # Compute statistics per LGA
    result = {}
    for lga_code, data in lga_data.items():
        lga_name = LGA_NAMES.get(lga_code, f"LGA_{lga_code}")
        areas = sorted(data["areas"])
        n = len(areas)
        
        if n == 0:
            result[lga_code] = {
                "lga_name": lga_name,
                "parcel_count": data["parcel_count"],
                "residential_count": 0,
                "median_area_m2": None,
                "mean_area_m2": None,
                "q25_m2": None,
                "q75_m2": None,
            }
        else:
            median = areas[n // 2] if n % 2 == 1 else (areas[n//2 - 1] + areas[n//2]) / 2
            q25 = areas[n // 4]
            q75 = areas[3 * n // 4]
            mean = sum(areas) / n
            
            result[lga_code] = {
                "lga_name": lga_name,
                "parcel_count": data["parcel_count"],
                "residential_count": n,
                "median_area_m2": round(median, 1),
                "mean_area_m2": round(mean, 1),
                "q25_area_m2": round(q25, 1),
                "q75_area_m2": round(q75, 1),
                "min_area_m2": round(areas[0], 1),
                "max_area_m2": round(areas[-1], 1),
            }
    
    # Write output
    out_path = os.path.join(OUT_DIR, "lga_land_size.json")
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Output: {out_path}")
    print(f"   LGAs processed: {len(result)}")
    for code, data in sorted(result.items()):
        n = data["residential_count"]
        med = data["median_area_m2"]
        print(f"   {data['lga_name']:20s} (code {code}) — {n:>8,} parcels, median {med:>7.0f} m²")
    
    elapsed = time.time() - t0
    print(f"\n⏱ Total time: {elapsed:.0f}s")

if __name__ == "__main__":
    process()
