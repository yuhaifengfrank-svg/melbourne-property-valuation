#!/usr/bin/env python3
"""
Compute residential proxy stats from pre-calculated area-data
==============================================================
Reads the full V_PARCEL_MP and applies residential proxy filter:
  - Active, non-road
  - PC_SPIC = 101 (Standard Lot/Plan) OR small non-multi parcels
  - Area between 100m² and 3,000m² (tighter residential range)
  
Output: data/vicmap/lga_land_size_residential.json
"""

import shapefile
import json, os, sys, time
from collections import defaultdict

SHP_PATH = "/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP"
OUT_DIR = "data/vicmap"

with open(os.path.join(OUT_DIR, "lga_code_mapping.json")) as f:
    LGA_MAP = json.load(f)


def shoelace_area(points):
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for j in range(n):
        x1, y1 = points[j]
        x2, y2 = points[(j + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def get_area(shp):
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
                rings.append(shoelace_area(ring))
        if not rings:
            return None
        exterior = rings[0]
        for hole in rings[1:]:
            exterior -= hole
        return max(0, exterior)
    except Exception:
        return None


def main():
    t0 = time.time()
    sf = shapefile.Reader(SHP_PATH)
    fields = [f[0] for f in sf.fields[1:]]
    total = sf.numRecords

    idx = {f: fields.index(f) for f in fields}

    res_areas = defaultdict(list)
    apt_areas = defaultdict(list)
    counts = {"active": 0, "res": 0, "apt": 0, "big": 0, "tiny": 0}

    for i in range(total):
        rec = sf.record(i)
        if str(rec[idx["PC_STAT"]]).strip() != "A":
            continue
        if str(rec[idx["ROAD"]]).strip() == "Y":
            continue

        counts["active"] += 1
        lga_name = LGA_MAP.get(str(rec[idx["PC_LGAC"]]).strip())
        if not lga_name:
            continue

        area = get_area(sf.shape(i))
        if area is None:
            continue

        spic = str(rec[idx["PC_SPIC"]])
        multi = str(rec[idx["PAR_MULTI"]])

        # Residential proxy: Lot/Plan parcels, 100-3000m²
        if spic == "101" and 100 <= area <= 3000:
            res_areas[lga_name].append(area)
            counts["res"] += 1
        elif multi == "Y" and 20 <= area <= 500:
            # Apartment/strata hint: multi-parcel + small area
            apt_areas[lga_name].append(area)
            counts["apt"] += 1
        elif area > 3000:
            counts["big"] += 1
        elif area < 100:
            counts["tiny"] += 1

        if (i + 1) % 500000 == 0:
            elapsed = time.time() - t0
            print(f"  {counts['active']:,} active ({100*(i+1)/total:.0f}%) — "
                  f"res={counts['res']:,} apt={counts['apt']:,}")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s")
    print(f"Active: {counts['active']:,}, Res proxy: {counts['res']:,}, "
          f"Apt hint: {counts['apt']:,}, Big: {counts['big']:,}, Tiny: {counts['tiny']:,}")

    # Compute stats
    def perc(lst, p):
        k = (p / 100.0) * (len(lst) - 1)
        kf, kc = int(k), int(k) + 1
        return lst[kf] * (1 - (k - kf)) + lst[kc] * (k - kf)

    print(f"\nResidential Land Sizes (Lot/Plan parcels 100-3000m²):")
    print(f"  {'LGA':25s} {'Median':>8s} {'Q25':>8s} {'Q75':>8s} {'Parcels':>8s}")
    print(f"  {'-'*57}")
    result = {}
    for lga in sorted(res_areas.keys()):
        a = sorted(res_areas[lga])
        n = len(a)
        if n < 10:
            result[lga] = {"lga_name": lga, "parcel_count": n, "median_area_m2": None}
            continue
        result[lga] = {
            "lga_name": lga, "parcel_count": n,
            "median_area_m2": round(perc(a, 50), 1),
            "mean_area_m2": round(sum(a) / n, 1),
            "q25_area_m2": round(perc(a, 25), 1),
            "q75_area_m2": round(perc(a, 75), 1),
        }
        print(f"  {lga:25s} {result[lga]['median_area_m2']:>8.0f} "
              f"{result[lga]['q25_area_m2']:>8.0f} {result[lga]['q75_area_m2']:>8.0f} {n:>8,}")

    outpath = os.path.join(OUT_DIR, "lga_land_size_residential.json")
    with open(outpath, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nWrote {outpath}")

    # Compare with V2
    print(f"\n{'='*50}")
    print("V2 (All >=100m²) vs Residential Proxy:")
    with open(os.path.join(OUT_DIR, "lga_land_size.json")) as f:
        v2 = json.load(f)
    print(f"  {'LGA':25s} {'V2 All':>7s} {'Res Proxy':>10s} {'Δ':>8s} {'V2 cnt':>8s} {'Res cnt':>8s}")
    for lga in sorted(result.keys()):
        v = v2.get(lga, {})
        r = result[lga]
        vm = v.get("median_area_m2")
        rm = r.get("median_area_m2")
        if vm and rm:
            print(f"  {lga:25s} {vm:>7.0f} {rm:>10.0f} {rm-vm:>+8.0f} "
                  f"{v.get('parcel_count',0):>8,} {r.get('parcel_count',0):>8,}")

    # Key insights
    print(f"\nKey changes:")
    for lga in sorted(result.keys()):
        v = v2.get(lga, {})
        r = result[lga]
        vm = v.get("median_area_m2", 0)
        rm = r.get("median_area_m2", 0)
        vc = v.get("parcel_count", 0)
        rc = r.get("parcel_count", 0)
        if vc and rc and vc - rc > 50000:
            print(f"  {lga}: dropped {vc - rc:,} parcels ({100*rc/vc:.0f}% remaining) — "
                  f"median {vm:.0f}→{rm:.0f}")


if __name__ == "__main__":
    main()
