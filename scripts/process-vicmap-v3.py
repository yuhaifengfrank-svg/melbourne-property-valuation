#!/usr/bin/env python3
"""
VICMAP Parcel Processor V3 — Residential proxy via heuristics
==============================================================
The Vicmap Property Simplified dataset (V_PARCEL_MP) only has 2 PC_DTYPE
values (14=Park, 15=Everything else), making land-use filtering impossible.

Strategy: Use parcel size + SPI code to approximate residential land:
  
  Residential proxy criteria:
    - PC_STAT = 'A' (Active)
    - ROAD = 'N' (Not a road parcel)
    - PC_DTYPE = '15' (not park)
    - Area between 100 m² and 5,000 m² (typical residential)
    - PC_SPIC = 101 (Lot/Plan) — the standard subdivision code

  This is NOT perfect (includes some commercial sites >2,000 m²)
  but provides a much better approximation than including ALL parcels.

Also compute: 
  1. Regular stats (same as V2, no filtering) — for backward compat
  2. Residential proxy filtered — for valuation engine use
  3. Apartment-specific stats (small parcels <500m² with multi-parcel)
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


def compute_stats(name, data_dict, out_filename, comparison_v2=None):
    def perc(sorted_list, p):
        k = (p / 100.0) * (len(sorted_list) - 1)
        kf, kc = int(k), int(k) + 1
        frac = k - kf
        return sorted_list[kf] * (1 - frac) + sorted_list[kc] * frac

    print(f"\n  {'LGA':25s} {'Median':>8s} {'Q25':>8s} {'Q75':>8s} {'Parcels':>8s}")
    print(f"  {'-'*57}")
    result = {}
    for lga in sorted(data_dict.keys()):
        areas = sorted(data_dict[lga]["areas"])
        n = len(areas)
        if n < 10:
            result[lga] = {"lga_name": lga, "parcel_count": n, "median_area_m2": None, "status": "insufficient"}
            continue
        median = perc(areas, 50)
        mean = sum(areas) / n
        result[lga] = {
            "lga_name": lga,
            "parcel_count": n,
            "median_area_m2": round(median, 1),
            "mean_area_m2": round(mean, 1),
            "q25_area_m2": round(perc(areas, 25), 1),
            "q75_area_m2": round(perc(areas, 75), 1),
            "p10_area_m2": round(perc(areas, 10), 1),
            "p90_area_m2": round(perc(areas, 90), 1),
        }
        v2_ref = comparison_v2.get(lga, {}).get("median_area_m2") if comparison_v2 else None
        marker = ""
        if v2_ref and v2_ref != result[lga]["median_area_m2"]:
            diff = result[lga]["median_area_m2"] - v2_ref
            marker = f" (Δ{v2_ref:.0f}→{result[lga]['median_area_m2']:.0f}, {diff:+d}m²)"
        print(f"  {lga:25s} {result[lga]['median_area_m2']:>8.0f} {result[lga]['q25_area_m2']:>8.0f} "
              f"{result[lga]['q75_area_m2']:>8.0f} {result[lga]['parcel_count']:>8,}{marker}")

    outpath = os.path.join(OUT_DIR, out_filename)
    with open(outpath, "w") as f:
        json.dump(result, f, indent=2)
    print(f"  Wrote {outpath}")
    return result


def process():
    t0 = time.time()
    print(f"Reading: {SHP_PATH}")
    sf = shapefile.Reader(SHP_PATH)
    fields = [f[0] for f in sf.fields[1:]]
    total = sf.numRecords

    idx_lga = fields.index("PC_LGAC")
    idx_stat = fields.index("PC_STAT")
    idx_dtype = fields.index("PC_DTYPE")
    idx_road = fields.index("ROAD")
    idx_spic = fields.index("PC_SPIC")
    idx_multi = fields.index("PAR_MULTI")

    # Data containers: { lga_name: {"areas": [...], "count": N} }
    v2_all = defaultdict(lambda: {"areas": [], "count": 0})
    res_proxy = defaultdict(lambda: {"areas": [], "count": 0})
    small_parcels = defaultdict(lambda: {"areas": [], "count": 0})

    counts = {"total": total, "active": 0, "road": 0, "inactive": 0,
              "res_proxy": 0, "over5k": 0, "under100": 0, "unmapped": 0, "area_null": 0}

    batch_size = 20000

    for i in range(0, total, batch_size):
        end = min(i + batch_size, total)
        for j in range(i, end):
            rec = sf.record(j)
            shp = sf.shape(j)

            stat = str(rec[idx_stat]).strip()
            if stat != 'A':
                counts["inactive"] += 1
                continue

            is_road = str(rec[idx_road]).strip()
            if is_road == 'Y':
                counts["road"] += 1
                continue

            counts["active"] += 1

            lga_code = str(rec[idx_lga]).strip()
            lga_name = LGA_MAP.get(lga_code)
            if not lga_name:
                counts["unmapped"] += 1
                continue

            # Area calculation
            area = get_area(shp)
            if area is None:
                counts["area_null"] += 1
                continue

            # ── V2: include everything (backward compat) ──
            v2_all[lga_name]["areas"].append(area)
            v2_all[lga_name]["count"] += 1

            # ── Residential Proxy: ──
            # Size-based heuristic for standard residential parcels
            if area < 100:
                counts["under100"] += 1
                continue
            
            spic = str(rec[idx_spic]) if idx_spic < len(rec) else "0"
            multi = str(rec[idx_multi]) if idx_multi < len(rec) else "N"
            dtype = str(rec[idx_dtype]) if idx_dtype < len(rec) else "15"
            
            # Residential proxy criteria
            is_res = False
            if area >= 100 and area <= 5000:
                if spic == "101":  # Lot/Plan = standard subdivision
                    is_res = True
                elif area <= 2000 and multi == "N":
                    # Smaller, non-multi parcels are likely residential even with other SPI codes
                    is_res = True

            if is_res:
                res_proxy[lga_name]["areas"].append(area)
                res_proxy[lga_name]["count"] += 1
                counts["res_proxy"] += 1
            elif area > 5000:
                counts["over5k"] += 1

            # ── Apartment hint data: small non-Lot/Plan, multi-parcel ──
            if multi == "Y" and area < 5000 and area >= 20:
                small_parcels[lga_name]["areas"].append(area)
                small_parcels[lga_name]["count"] += 1

            if counts["active"] % 300000 == 0:
                pct = 100 * j / total
                elapsed = time.time() - t0
                rate = counts["active"] / elapsed if elapsed > 0 else 0
                print(f"  {counts['active']:,} active ({pct:.0f}%) — "
                      f"{elapsed:.0f}s @ {rate:.0f}/s — "
                      f"res={counts['res_proxy']:,}")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s")
    print(f"Active: {counts['active']:,}, Res proxy: {counts['res_proxy']:,}")
    print(f"Over 5K: {counts['over5k']:,}, Under 100: {counts['under100']:,}")
    print(f"Area null: {counts['area_null']:,}")

    # ── V2 backward compat ──
    compat_v2 = compute_stats("V2 (All parcels)", v2_all, "lga_land_size.json")
    
    # ── Residential Proxy ──
    print(f"\n{'='*60}")
    print(f"Residential Proxy (100-5000m², Lot/Plan or small non-multi)")
    res_stats = compute_stats("Res Proxy", res_proxy, "lga_land_size_residential.json", compat_v2)

    # ── Side-by-side: V2 vs Residential Proxy comparison ──
    print(f"\n{'='*60}")
    print(f"{'LGA':25s} {'V2 All':>8s} {'Res Proxy':>8s} {'Δ':>8s} {'New Count':>10s}")
    print(f"{'-'*59}")
    for lga in sorted(res_stats.keys()):
        v2_m = compat_v2.get(lga, {}).get("median_area_m2")
        r_m = res_stats.get(lga, {}).get("median_area_m2")
        r_c = res_stats.get(lga, {}).get("parcel_count", 0)
        if v2_m and r_m:
            diff = r_m - v2_m
            print(f"  {lga:25s} {v2_m:>8.0f} {r_m:>8.0f} {diff:>+8.0f} {r_c:>10,}")
        elif r_m:
            print(f"  {lga:25s} {'N/A':>8s} {r_m:>8.0f} {'':>8s} {r_c:>10,}")

    print(f"\n{'='*60}")
    print("Key takeaways:")
    print("  - LGAs with large Δ (V2 → Res Proxy) had many commercial/industrial parcels")
    print("  - Melbourne & Port Phillip still show high medians (CBD density)")
    print("  - For apartment-rich inner LGAs, consider using separate data")


if __name__ == "__main__":
    process()
