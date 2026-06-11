#!/usr/bin/env python3
"""
VICMAP → SA2 Land Size Processor V5 (All-native, LGA-batched)
==============================================================
Spatial join: Vicmap parcel centroids → ABS SA2 boundaries.

Strategy:
  1. Load SA2 boundaries in GDA2020 (native), compute bbox in Vicgrid for grid
  2. Load Vicmap parcels filtered by LGA codes (from lga_code_mapping.json)
  3. Build minimal SA2 grid per LGA region
  4. Point-in-polygon in GDA2020

Input:  Vicmap V_PARCEL_MP.shp
        ABS SA2_2021_AUST_GDA2020.shp
        data/vicmap/lga_code_mapping.json
Output: data/vicmap/sa2_land_size.json
"""

import shapefile
import json, os, sys, time
from collections import defaultdict
from pyproj import Transformer

SHP_VICMAP = "/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/VMPROP/V_PARCEL_MP"
SHP_SA2    = "/tmp/sa2_2021/SA2_2021_AUST_GDA2020.shp"
MAPPING    = "data/vicmap/lga_code_mapping.json"
OUT_PATH   = "data/vicmap/sa2_land_size.json"
os.makedirs("data/vicmap", exist_ok=True)

EPS = 1e-12
to_gda = Transformer.from_crs("EPSG:7899", "EPSG:7844", always_xy=True)


def shoelace(pts):
    a = 0.0
    for i in range(len(pts)-1):
        a += pts[i][0]*pts[i+1][1] - pts[i+1][0]*pts[i][1]
    return abs(a)/2.0

def polygon_area(shp):
    pts = shp.points
    if not pts or len(pts) < 3: return None
    parts = shp.parts
    rings = []
    for i, s in enumerate(parts):
        e = parts[i+1] if i+1 < len(parts) else len(pts)
        r = pts[s:e]
        if len(r) >= 3: rings.append(shoelace(r))
    if not rings: return None
    a = rings[0]
    for h in rings[1:]: a -= h
    return max(0.0, a)

def pip(lon, lat, pts):
    inside = False
    n = len(pts)
    j = n-1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj-xi)*(lat-yi)/(yj-yi+EPS)+xi):
            inside = not inside
        j = i
    return inside


def load_sa2():
    print(f"Loading SA2: {SHP_SA2}")
    t0 = time.time()
    sf = shapefile.Reader(SHP_SA2)
    f = [f[0] for f in sf.fields[1:]]
    ic = f.index("SA2_CODE21")
    inn = f.index("SA2_NAME21")
    lst = []
    for i in range(sf.numRecords):
        rec = sf.record(i)
        code = str(rec[ic])
        if not code.startswith("2"): continue
        shp = sf.shape(i)
        if not hasattr(shp, 'bbox') or shp.bbox is None: continue
        lst.append((code, str(rec[inn]), shp.bbox, shp.points))
    print(f"  {len(lst)} VIC SA2s in {time.time()-t0:.1f}s")
    return lst


def process():
    t0 = time.time()

    # Load mapping to know which LGA codes to process
    with open(MAPPING) as f:
        lga_map = json.load(f)
    vicmap_lga_codes = set(lga_map.keys())
    print(f"Vicmap LGA codes to process: {len(vicmap_lga_codes)}")
    print(f"  Sample: {sorted(vicmap_lga_codes)[:5]}")

    sa2_list = load_sa2()

    # For each Vicmap LGA, load its parcels and match to SA2
    vf = shapefile.Reader(SHP_VICMAP)
    vflds = [f[0] for f in vf.fields[1:]]
    ilga = vflds.index("PC_LGAC")
    istat = vflds.index("PC_STAT")
    ispic = vflds.index("PC_SPIC")
    iroad = vflds.index("ROAD")
    total = vf.numRecords
    print(f"Vicmap: {total:,} records")

    data = defaultdict(lambda: {"a": [], "n": 0, "l": set()})
    p = s_sa2 = 0
    stats = {"stat": 0, "road": 0, "spic": 0, "area": 0}
    prog = 0

    for i in range(total):
        rec = vf.record(i)
        lga = str(rec[ilga])
        if lga not in vicmap_lga_codes:
            continue

        if rec[istat] != 'A': stats['stat'] += 1; continue
        if rec[iroad] == 'Y': stats['road'] += 1; continue
        if rec[ispic] != 101: stats['spic'] += 1; continue

        shp = vf.shape(i)
        b = shp.bbox
        cx, cy = (b[0]+b[2])/2, (b[1]+b[3])/2
        area = polygon_area(shp)
        if area is None or area < 100 or area > 3000:
            stats['area'] += 1
            continue

        lon, lat = to_gda.transform(cx, cy)

        # SA2 lookup: check all SA2s (only ~522 for VIC, fast enough)
        # But optimize: check SA2s whose bbox contains this point
        found = None
        for code, name, bbox, pts in sa2_list:
            if lon < bbox[0] or lon > bbox[2] or lat < bbox[1] or lat > bbox[3]:
                continue
            if pip(lon, lat, pts):
                found = (code, name)
                break

        if not found:
            s_sa2 += 1
            continue

        code, name = found
        data[code]["a"].append(area)
        data[code]["n"] += 1
        data[code]["s"] = name
        data[code]["l"].add(lga)
        p += 1

        if p >= prog + 100000:
            prog += 100000
            el = time.time() - t0
            print(f"  {p:,} matched ({p/el:.0f}/s)  LGA reject: {total-i:,} remain...")

    el = time.time() - t0
    print(f"\nDone in {el:.1f}s: matched {p:,} parcels")
    print(f"  Skipped: {json.dumps(stats)}, no-SA2: {s_sa2:,}")

    res = {}
    for code, d in sorted(data.items()):
        aa = sorted(d["a"])
        if len(aa) < 5: continue
        n = len(aa)
        res[code] = {
            "sa2_name": d["s"],
            "median":   round(aa[n//2], 0),
            "mean":     round(sum(aa)/n, 0),
            "q25":      round(aa[n//4], 0),
            "q75":      round(aa[n*3//4], 0),
            "p10":      round(aa[n//10], 0),
            "p90":      round(aa[n*9//10], 0),
            "min":      round(aa[0], 0),
            "max":      round(aa[-1], 0),
            "count":    n,
            "lga_codes": sorted(d["l"])
        }

    with open(OUT_PATH, "w") as f:
        json.dump(res, f, indent=2, ensure_ascii=False)
    print(f"\nWritten {len(res)} SA2s to {OUT_PATH}")

    # Show target SA2s
    for c in sorted(res):
        s = res[c]
        n = s['sa2_name'].lower()
        if 'donvale' in n or 'park orchards' in n:
            print(f"  >>> {c}: {s['sa2_name']} median={s['median']}m²  n={s['count']:,}")
        if 'manningham' in n:
            print(f"  LGA {c}: {s['sa2_name'][:50]:50s} median={s['median']:>6.0f}m²  n={s['count']:>7,}")


if __name__ == "__main__":
    process()
