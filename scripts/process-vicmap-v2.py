#!/usr/bin/env python3
"""
VICMAP Parcel Processor V2 — Extract LGA-level land size stats
===============================================================
Reads all active residential parcels, computes areas from geometry,
aggregates by Vicmap LGA code → LGA name, outputs median/mean/quartile
land sizes.

Performance target: process 2.7M parcels in < 2 minutes on M-series Mac.
"""

import shapefile
import json, os, sys, time, math
from collections import defaultdict
from pyproj import Transformer

SHP_PATH = "/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP"
OUT_DIR = "data/vicmap"
MAPPING_PATH = os.path.join(OUT_DIR, "lga_code_mapping.json")

# Load LGA code → name mapping
try:
    with open(MAPPING_PATH) as f:
        LGA_MAP = json.load(f)
except FileNotFoundError:
    print(f"ERROR: Mapping file not found at {MAPPING_PATH}")
    print("Run the mapping generation script first.")
    sys.exit(1)

# Reverse map: name → codes (for LGAs split across multiple Vicmap codes)
NAME_TO_CODES = defaultdict(list)
for code, name in LGA_MAP.items():
    NAME_TO_CODES[name].append(code)


def shoelace_area(points):
    """Compute area of a polygon ring using the Shoelace formula.
    Coordinates are in GDA2020 Vicgrid (meters), so area is in m²."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for j in range(n):
        x1, y1 = points[j]
        x2, y2 = points[(j + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def get_area_from_shape(shp):
    """Calculate area in m² from shapefile polygon record."""
    try:
        points = shp.points
        parts = shp.parts
        if not points or len(points) < 3:
            return None

        rings = []
        for i, start in enumerate(parts):
            end = parts[i + 1] if i + 1 < len(parts) else len(points)
            ring = points[start:end]
            if len(ring) >= 3:
                area = shoelace_area(ring)
                rings.append(area)

        if not rings:
            return None

        exterior = rings[0]
        for hole in rings[1:]:
            exterior -= hole

        return max(0, exterior)
    except Exception:
        return None


def process():
    t0 = time.time()

    print(f"Reading shapefile: {SHP_PATH}")
    sf = shapefile.Reader(SHP_PATH)
    fields = [f[0] for f in sf.fields[1:]]
    total = sf.numRecords
    print(f"Total records: {total:,}")

    # Column indices
    idx_lga = fields.index("PC_LGAC")
    idx_stat = fields.index("PC_STAT")
    idx_dtype = fields.index("PC_DTYPE")
    idx_road = fields.index("ROAD")

    # Accumulate areas per LGA name (merged across codes)
    # Schema: { lga_name: { "areas": [float, ...], "parcel_count": int, "res_count": int } }
    lga_data = defaultdict(lambda: {"areas": [], "parcel_count": 0, "res_count": 0, "codes_used": set()})

    valid_dtypes = {'15', '1', '2', '3', '4'}  # Standard residential

    batch_size = 20000
    processed = 0
    active = 0
    skipped_stat = 0
    skipped_road = 0
    skipped_dtype = 0
    skipped_unmapped = 0
    skipped_area = 0
    area_none = 0

    # Track per-code stats too (for validation)
    code_stats = defaultdict(lambda: {"area_sum": 0.0, "count": 0, "res_count": 0})

    for i in range(0, total, batch_size):
        end = min(i + batch_size, total)
        rec_iter = sf.iterRecords()
        shp_iter = sf.iterShapes()

        # Skip to position by iterating (no iterRecords slice — simpler to use index)
        # Actually let me just use the fast path: read records and shapes by index

        for j in range(i, end):
            rec = sf.record(j)
            shp = sf.shape(j)

            # Status filter
            stat = str(rec[idx_stat]).strip()
            if stat != 'A':
                skipped_stat += 1
                continue

            # Road filter
            is_road = str(rec[idx_road]).strip() if idx_road < len(rec) else 'N'
            if is_road == 'Y':
                skipped_road += 1
                continue

            # Get LGA code
            lga_code = str(rec[idx_lga]).strip()
            lga_name = LGA_MAP.get(lga_code)
            if not lga_name:
                skipped_unmapped += 1
                continue

            # Calc area
            area = get_area_from_shape(shp)
            if area is None:
                area_none += 1
                continue

            # Filter extreme outliers (> 10 hectares = 100,000 m² = likely farm/industrial)
            if area <= 0 or area > 100000:
                skipped_area += 1
                continue

            is_res = str(rec[idx_dtype]).strip() in valid_dtypes

            lga_data[lga_name]["areas"].append(area)
            lga_data[lga_name]["parcel_count"] += 1
            lga_data[lga_name]["codes_used"].add(lga_code)
            if is_res:
                lga_data[lga_name]["res_count"] += 1

            code_stats[lga_code]["area_sum"] += area
            code_stats[lga_code]["count"] += 1
            if is_res:
                code_stats[lga_code]["res_count"] += 1

            active += 1

            if active % 100000 == 0:
                elapsed = time.time() - t0
                rate = active / elapsed if elapsed > 0 else 0
                eta = (total - i) / rate if rate > 0 else 0
                print(f"  {active:,} active parcels ({100 * i / total:.1f}% scanned) — "
                      f"{elapsed:.0f}s @ {rate:.0f} rec/s, ETA {eta:.0f}s", flush=True)

    elapsed = time.time() - t0
    print(f"\n=== Summary ===")
    print(f"Total records:      {total:,}")
    print(f"Active (PC_STAT=A): {active:,} ({100*active/total:.1f}%)")
    print(f"Skipped (status):   {skipped_stat:,}")
    print(f"Skipped (road):     {skipped_road:,}")
    print(f"Unmapped LGA code: {skipped_unmapped:,}")
    print(f"Skipped (area >10ha): {skipped_area:,}")
    print(f"Area calc failed:   {area_none:,}")
    print(f"Time: {elapsed:.0f}s ({active/elapsed:.0f} rec/s)")

    # Compute LGA-level stats
    print(f"\n=== LGA Land Size Stats ===")
    result = {}

    for lga_name in sorted(lga_data.keys()):
        data = lga_data[lga_name]
        areas = sorted(data["areas"])
        n = len(areas)
        res_n = data["res_count"]

        if n < 10:
            result[lga_name] = {
                "lga_name": lga_name,
                "codes": sorted(data["codes_used"]),
                "parcel_count": data["parcel_count"],
                "residential_parcels": res_n,
                "median_area_m2": None,
                "status": "insufficient_data",
            }
            print(f"  {lga_name:30s} — INSUFFICIENT DATA ({n} parcels)")
            continue

        def percentile(sorted_list, p):
            k = (p / 100.0) * (len(sorted_list) - 1)
            kf = int(k)
            kc = kf + 1
            frac = k - kf
            return sorted_list[kf] * (1 - frac) + sorted_list[kc] * frac

        median = percentile(areas, 50)
        mean = sum(areas) / n
        q25 = percentile(areas, 25)
        q75 = percentile(areas, 75)
        p10 = percentile(areas, 10)
        p90 = percentile(areas, 90)

        result[lga_name] = {
            "lga_name": lga_name,
            "codes": sorted(data["codes_used"]),
            "parcel_count": data["parcel_count"],
            "residential_parcels": res_n,
            "median_area_m2": round(median, 1),
            "mean_area_m2": round(mean, 1),
            "q25_area_m2": round(q25, 1),
            "q75_area_m2": round(q75, 1),
            "p10_area_m2": round(p10, 1),
            "p90_area_m2": round(p90, 1),
            "min_area_m2": round(areas[0], 1),
            "max_area_m2": round(areas[-1], 1),
        }

        print(f"  {lga_name:30s} median={median:8.1f} m²  "
              f"q25={q25:8.1f}  q75={q75:8.1f}  "
              f"count={n:>8,}  res={res_n:>8,}")

    # Save full results
    out_path = os.path.join(OUT_DIR, "lga_land_size.json")
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    # Save per-code raw data (for validation)
    code_out = os.path.join(OUT_DIR, "lga_code_raw_counts.json")
    code_raw = {}
    for code in sorted(code_stats.keys()):
        s = code_stats[code]
        code_raw[code] = {
            "lga_name": LGA_MAP.get(code, "UNKNOWN"),
            "total_parcels": s["count"],
            "res_parcels": s["res_count"],
        }
    with open(code_out, "w") as f:
        json.dump(code_raw, f, indent=2)

    print(f"\nFull LGA stats:  {out_path}")
    print(f"Code-level stats: {code_out}")
    print(f"Total time: {elapsed:.0f}s")


if __name__ == "__main__":
    process()
