#!/usr/bin/env python3
"""
VICMAP Parcel Processor — Melbourne Metro
===========================================
Extracts land sizes from parcel geometry, aggregates by suburb/LGA.

Input:  shapefile at /tmp/vicmap-raw/...
Output: data/vicmap/processed/*.json

Steps:
  1. Read all active (PC_STAT='A') parcels
  2. Calculate area from polygon geometry (GDA2020 / Vicgrid → m²)
  3. Group by LGA code (PC_LGAC)
  4. Compute suburb-level stats: median land size, quartiles, parcel count
  5. Export for web use (GeoJSON for map + JSON for stats)

Performance: 1.1M parcels. Process in streaming batches.
"""

import shapefile
from shapely.geometry import shape
from shapely import wkb
import json, sys, os, math, time
from collections import defaultdict

SHP_PATH = "/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP"
OUT_DIR = "data/vicmap"

# LGA name mapping (VIC LGA codes → names)
# Only mapping metro LGAs we care about
LGA_NAMES = {
    "246": "Banyule", "210": "Bayside", "211": "Boroondara", "212": "Brimbank",
    "213": "Cardinia", "214": "Casey", "215": "Darebin", "216": "Frankston",
    "217": "Glen Eira", "218": "Greater Dandenong", "219": "Hobsons Bay",
    "220": "Hume", "221": "Kingston", "222": "Knox", "223": "Manningham",
    "224": "Maribyrnong", "225": "Maroondah", "226": "Melbourne",
    "227": "Melton", "228": "Monash", "229": "Moonee Valley",
    "230": "Moreland", "231": "Mornington Peninsula", "232": "Nillumbik",
    "233": "Port Phillip", "234": "Stonnington", "235": "Whitehorse",
    "236": "Whittlesea", "237": "Wyndham", "238": "Yarra",
    "239": "Yarra Ranges", "352": "Mitchell", "353": "Macedon Ranges",
    "354": "Moorabool", "355": "Golden Plains", "356": "Surf Coast",
    "410": "Bass Coast", "457": "Baw Baw", "459": "South Gippsland",
}

def calculate_area_from_shape(shp_rec):
    """Calculate area in m² from a shapefile record polygon."""
    try:
        # shapefile uses list of shapes — get points
        points = shp_rec.points
        parts = shp_rec.parts
        
        if not points:
            return 0
        
        # Build rings from parts
        rings = []
        for i, start in enumerate(parts):
            end = parts[i + 1] if i + 1 < len(parts) else len(points)
            ring = points[start:end]
            # GDA2020 / Vicgrid coordinates are in meters
            # Area using Shoelace formula
            area = 0.0
            n = len(ring)
            for j in range(n):
                x1, y1 = ring[j]
                x2, y2 = ring[(j + 1) % n]
                area += x1 * y2 - x2 * y1
            area = abs(area) / 2.0
            rings.append(area)
        
        # First ring is exterior, rest are holes (subtract)
        if rings:
            exterior = rings[0]
            for hole in rings[1:]:
                exterior -= hole
            return max(0, exterior)
    except Exception:
        return 0

def process():
    print(f"Reading shapefile: {SHP_PATH}")
    t0 = time.time()
    
    sf = shapefile.Reader(SHP_PATH)
    fields = [f[0] for f in sf.fields[1:]]
    total = sf.numRecords
    print(f"Total records: {total:,}")
    
    # Column indices
    idx_pfi = fields.index("PARCEL_PFI")
    idx_spi = fields.index("PARCEL_SPI")
    idx_lga = fields.index("PC_LGAC")
    idx_stat = fields.index("PC_STAT")
    idx_dtype = fields.index("PC_DTYPE")
    idx_road = fields.index("ROAD")
    idx_plan = fields.index("PC_PLANNO")
    idx_lot = fields.index("PC_LOTNO")
    idx_parcel_id = fields.index("PARCEL_ID") if "PARCEL_ID" in fields else None
    
    # Filtering criteria:
    # PC_STAT = 'A' (active)
    # Not a road (ROAD = 'N')
    # PC_DTYPE = 15 (standard parcel) or similar
    
    # Stats by LGA
    lga_stats = defaultdict(lambda: {
        "areas": [], "count": 0, "road_count": 0, "other_count": 0
    })
    
    batch_size = 10000
    processed = 0
    active = 0
    skipped_road = 0
    skipped_stat = 0
    
    for i in range(0, total, batch_size):
        end = min(i + batch_size, total)
        records = sf.records()[i:end]
        shapes = sf.shapes()[i:end]
        
        for j in range(end - i):
            rec = records[j]
            shp = shapes[j]
            
            stat = rec[idx_stat]
            if stat != 'A':
                skipped_stat += 1
                continue
            
            is_road = rec[idx_road] if idx_road < len(rec) else 'N'
            if is_road == 'Y':
                skipped_road += 1
                continue
            
            is_other = rec[idx_dtype] not in ('15', '1', '2', '3', '4')
            
            lga_code = str(rec[idx_lga]).strip()
            if lga_code not in LGA_NAMES:
                continue  # Skip non-metro LGAs
            
            area_m2 = calculate_area_from_shape(shp)
            if area_m2 <= 0 or area_m2 > 100000:  # Skip tiny or huge (wrong geometry)
                area_m2 = None
            
            lga_stats[lga_code]["count"] += 1
            if is_other:
                lga_stats[lga_code]["other_count"] += 1
            if area_m2 and area_m2 > 0 and not is_other:
                lga_stats[lga_code]["areas"].append(area_m2)
        
        processed += (end - i)
        if (i // batch_size) % 5 == 0:
            elapsed = time.time() - t0
            rate = processed / elapsed if elapsed > 0 else 0
            print(f"  {processed:,}/{total:,} ({100*processed/total:.1f}%) — {elapsed:.0f}s @ {rate:.0f} rec/s", flush=True)
    
    # Compute stats
    print(f"\nActive parcels: {active:,}")
    print(f"Skipped (status): {skipped_stat:,}")
    print(f"Skipped (road): {skipped_road:,}")
    
    result = {}
    for lga_code, stats in lga_stats.items():
        lga_name = LGA_NAMES.get(lga_code, f"LGA {lga_code}")
        areas = sorted(stats["areas"])
        n = len(areas)
        
        if n == 0:
            result[lga_code] = {
                "lga_name": lga_name,
                "parcel_count": stats["count"],
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
                "lga_code": lga_code,
                "parcel_count": stats["count"],
                "residential_parcel_count": n,
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
    print(f"\nOutput: {out_path}")
    print(f"LGAs processed: {len(result)}")
    
    elapsed = time.time() - t0
    print(f"Total time: {elapsed:.0f}s")

if __name__ == "__main__":
    process()
