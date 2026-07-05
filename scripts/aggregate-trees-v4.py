#!/usr/bin/env python3
"""
Stage 2 v4 — Aggregates street tree data into street-level + suburb-level.

Uses pre-computed suburb centroids CSV for fast nearest-suburb assignment.

Outputs:
  1. street_tree_by_street.json  → street-level (Manningham + Brimbank)
  2. suburb_tree_canopy.json     → suburb-level (all 9 councils via nearest-centroid)
"""

import json, os, re, sys

RAW_DIR = '/home/ubuntu/data/street-tree-raw'
CENTROIDS_FILE = '/tmp/vic_suburb_centroids.csv'
STREET_OUTPUT = '/home/ubuntu/data/street_tree_by_street.json'
SUBURB_OUTPUT = '/home/ubuntu/data/suburb_tree_canopy.json'

COUNCILS = [
    ('manningham', 'manningham.geojson'),
    ('hobsons_bay', 'hobsons_bay.geojson'),
    ('brimbank', 'brimbank.geojson'),
    ('glen_eira', 'glen_eira.geojson'),
    ('yarra', 'yarra.geojson'),
    ('port_phillip', 'port_phillip.geojson'),
    ('melbourne', 'melbourne.geojson'),
    ('wyndham', 'wyndham.geojson'),
    ('ballarat', 'ballarat.geojson'),
]


def parse_cm(val):
    if val is None: return None
    s = str(val).strip().lower()
    if not s or s in ('none','null','n/a','not applicable','not assess','0','','unknown','?'): return None
    try: return float(s)
    except ValueError: pass
    nums = re.findall(r'[\d.]+', s)
    if len(nums) >= 2:
        vals = [float(x) for x in nums[:2]]
        return round(sum(vals)/2/10, 1) if 'mm' in s else round(sum(vals)/2, 1)
    elif len(nums) == 1:
        return round(float(nums[0])/10, 1) if 'mm' in s else float(nums[0])
    return None


def parse_height(val):
    if val is None: return None
    s = str(val).strip().lower()
    if not s or s in ('none','null','n/a','not applicable','not assess','0','','unknown','?'): return None
    try:
        h = float(s)
        return round(h/100, 1) if h > 50 else h
    except ValueError: pass
    nums = re.findall(r'[\d.]+', s)
    if len(nums) >= 2: return round(sum(float(x) for x in nums[:2])/2, 1)
    elif len(nums) == 1: return float(nums[0])
    return None


def extract_prop_coord(p):
    kl = {k.lower(): v for k, v in p.items()}
    lat = kl.get('lat') or kl.get('latitude') or kl.get('y')
    lon = kl.get('lon') or kl.get('long') or kl.get('longitude') or kl.get('x')
    if lat and lon:
        try: return (float(lon), float(lat))
        except: pass
    geo = kl.get('geolocation')
    if isinstance(geo, dict):
        try: return (float(geo.get('lon',0)), float(geo.get('lat',0)))
        except: pass
    return None


# ========== Nearest-suburb index (from CSV) ==========

SUBURB_CENTROIDS = None  # [(lon, lat, name)]

def load_centroids():
    global SUBURB_CENTROIDS
    if SUBURB_CENTROIDS: return SUBURB_CENTROIDS
    centroids = []
    with open(CENTROIDS_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('LOC_NAME') or not line: continue
            parts = line.split(',', 2)
            if len(parts) < 3: continue
            name, slon, slat = parts[0], parts[1], parts[2]
            try: centroids.append((float(slon), float(slat), name.upper().strip()))
            except ValueError: continue
    print(f'  Loaded {len(centroids)} suburb centroids', flush=True)
    SUBURB_CENTROIDS = centroids
    return centroids


def _build_grid(centroids):
    """Build a 2D grid index: (grid_x, grid_y) -> list of (lon, lat, name).
    Grid cell ~0.02 deg (~2km) for metro Melbourne."""
    grid = {}
    for slon, slat, sname in centroids:
        gx = int(slon / 0.02)
        gy = int(slat / 0.02)
        key = (gx, gy)
        grid.setdefault(key, []).append((slon, slat, sname))
        # Also store in neighboring cells for edge cases
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                key2 = (gx + dx, gy + dy)
                if key2 != key and key2 not in grid:
                    grid[key2] = []
    return grid

def nearest_suburb(coord):
    centroids = load_centroids()
    if not coord or len(coord) < 2: return None
    
    # Rebuild grid if not cached
    if not hasattr(nearest_suburb, '_grid'):
        nearest_suburb._grid = _build_grid(centroids)
    
    grid = nearest_suburb._grid
    lon, lat = coord[0], coord[1]
    gx = int(lon / 0.02)
    gy = int(lat / 0.02)
    
    best_dist = float('inf')
    best_name = None
    
    # Search current cell + neighbors
    # If no centroids nearby, expand search gradually
    for radius in range(3):  # search up to 3 cells (~6km)
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                cell = grid.get((gx + dx, gy + dy))
                if not cell: continue
                for slon, slat, sname in cell:
                    d = (slon - lon)**2 + (slat - lat)**2
                    if d < best_dist:
                        best_dist = d
                        best_name = sname
        if best_name:  # found something
            break
    
    return best_name if best_dist < 0.15 else None  # ~15km radius


# ========== Record extractors ==========

def records_manningham(feats):
    out = []
    for f in feats:
        p = f['properties']
        suburb = str(p.get('suburb','') or '').strip().upper()
        street = str(p.get('street','') or '').strip().upper()
        if not suburb or not street: continue
        coord = extract_prop_coord(p) or (f.get('geometry') or {}).get('coordinates')
        if coord and len(coord) >= 2: coord = (coord[0], coord[1])
        else: coord = None
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        genus = str(p.get('species', p.get('alphatree','')) or '').strip()
        if genus.lower() in ('','none','unknown'): genus = None
        out.append({'suburb': suburb, 'street': street, 'coord': coord,
                     'dbh': dbh, 'height': height, 'genus': genus, 'council': 'manningham'})
    return out


def records_brimbank(feats):
    out = []
    for f in feats:
        p = f['properties']
        loc = str(p.get('Location', p.get('location', '')) or '').strip()
        if ',' in loc:
            parts = loc.rsplit(',', 1)
            suburb = parts[1].strip().upper()
            sp = parts[0].strip()
            sp = re.sub(r'^(Front|Rear|Side|Beside)\s+', '', sp, flags=re.IGNORECASE)
            sp = re.sub(r'^\d+\s*', '', sp).strip()
            street = sp.upper()
        else:
            suburb = 'BRIMBANK'
            street = loc.upper().replace('FRONT ','').replace('REAR ','')
        if not suburb or not street: continue
        coord = extract_prop_coord(p) or next((c for c in [f.get('geometry')] if c and c.get('coordinates')), None)
        if coord and isinstance(coord, dict):
            coord = tuple(coord.get('coordinates', [])[:2])
        elif coord and isinstance(coord, (list, tuple)):
            coord = tuple(coord[:2])
        else:
            coord = None
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        gg = str(p.get('Genus','') or '').strip()
        gs = str(p.get('Species','') or '').strip()
        if gg and gg not in ('Unknown','None',''):
            genus = f'{gg} {gs}' if gs and gs not in ('Unknown','None','sp.','') else gg
        else: genus = None
        out.append({'suburb': suburb, 'street': street, 'coord': coord,
                     'dbh': dbh, 'height': height, 'genus': genus, 'council': 'brimbank'})
    return out


def records_by_coord(feats, council_id):
    """For councils without suburb fields — use nearest-centroid assignment."""
    out = []
    for f in feats:
        p = f['properties']
        geom = f.get('geometry')
        if not geom or geom.get('type') != 'Point': continue
        coord = tuple(geom['coordinates'][:2])
        suburb = nearest_suburb(coord)
        if not suburb: continue
        
        dbh = parse_cm(p.get('dbh') or p.get('diameter_breast_height') or p.get('DBH'))
        height = parse_height(p.get('height') or p.get('Height'))
        
        genus = None
        for key in ('genus', 'scientific_name', 'scientificname', 'Botanical',
                     'common_name', 'Common_Name', 'common', 'commonname', 'species'):
            val = p.get(key)
            if val and str(val).strip() not in ('', 'None', 'Unknown', 'unknown'):
                genus = str(val).strip()
                break
        
        out.append({'suburb': suburb, 'street': '',
                     'coord': coord, 'dbh': dbh, 'height': height,
                     'genus': genus, 'council': council_id})
    return out


# ========== Aggregators ==========

def aggregate_streets(records):
    streets = {}
    for r in records:
        if not r.get('street'): continue
        key = f"{r['suburb']}::{r['street']}"
        e = streets.setdefault(key, {
            'suburb': r['suburb'], 'street': r['street'],
            'councils': set(), 'count': 0,
            'dbh_vals': [], 'height_vals': [], 'genera': set(),
            'lons': [], 'lats': [],
        })
        e['councils'].add(r['council'])
        e['count'] += 1
        if r['dbh'] is not None: e['dbh_vals'].append(r['dbh'])
        if r['height'] is not None: e['height_vals'].append(r['height'])
        if r['genus']: e['genera'].add(r['genus'])
        if r['coord']:
            e['lons'].append(r['coord'][0])
            e['lats'].append(r['coord'][1])
    
    out = []
    for e in streets.values():
        avg_dbh = round(sum(e['dbh_vals'])/len(e['dbh_vals']), 1) if e['dbh_vals'] else None
        avg_h = round(sum(e['height_vals'])/len(e['height_vals']), 1) if e['height_vals'] else None
        avg_lon = sum(e['lons'])/len(e['lons']) if e['lons'] else None
        avg_lat = sum(e['lats'])/len(e['lats']) if e['lats'] else None
        density = e['count']
        cs = 1 if density == 0 else 2 if density < 5 else 3 if density < 20 else 4 if density < 50 else 5
        maturity = 'unknown'
        if avg_dbh is not None:
            maturity = 'low' if avg_dbh < 15 else 'medium' if avg_dbh < 35 else 'high'
        out.append({
            'suburb': e['suburb'], 'street': e['street'],
            'tree_count': e['count'],
            'avg_dbh_cm': avg_dbh, 'avg_height_m': avg_h,
            'genus_count': len(e['genera']),
            'genera': sorted(e['genera'])[:20],
            'councils': sorted(e['councils']),
            'canopy_score': cs, 'maturity': maturity,
            'approx_coord': [avg_lon, avg_lat] if avg_lon else None,
            'coord_source': 'aggregated' if avg_lon else None,
        })
    out.sort(key=lambda r: (r['suburb'], r['street']))
    return out


def aggregate_suburbs(all_records):
    suburbs = {}
    for r in all_records:
        key = r['suburb']
        e = suburbs.setdefault(key, {
            'councils': set(), 'count': 0,
            'dbh_vals': [], 'height_vals': [], 'genera': set(),
        })
        e['councils'].add(r['council'])
        e['count'] += 1
        if r['dbh'] is not None: e['dbh_vals'].append(r['dbh'])
        if r['height'] is not None: e['height_vals'].append(r['height'])
        if r['genus']: e['genera'].add(r['genus'])
    
    out = []
    for key, e in suburbs.items():
        avg_dbh = round(sum(e['dbh_vals'])/len(e['dbh_vals']), 1) if e['dbh_vals'] else None
        avg_h = round(sum(e['height_vals'])/len(e['height_vals']), 1) if e['height_vals'] else None
        dc = 'very_low'
        if e['count'] > 10000: dc = 'very_high'
        elif e['count'] > 5000: dc = 'high'
        elif e['count'] > 1000: dc = 'medium'
        elif e['count'] > 100: dc = 'low'
        maturity = 'unknown'
        if avg_dbh is not None:
            maturity = 'low' if avg_dbh < 15 else 'medium' if avg_dbh < 35 else 'high'
        out.append({
            'suburb': key, 'councils': sorted(e['councils']),
            'tree_count': e['count'],
            'avg_dbh_cm': avg_dbh, 'avg_height_m': avg_h,
            'genus_count': len(e['genera']),
            'genera': sorted(e['genera'])[:20],
            'canopy_density': dc, 'maturity': maturity,
        })
    out.sort(key=lambda r: r['suburb'])
    return out


# ========== Main ==========

def main():
    load_centroids()
    
    all_records = []
    total_features = 0
    
    for council_id, filename in COUNCILS:
        fpath = os.path.join(RAW_DIR, filename)
        if not os.path.exists(fpath):
            print(f'  SKIP {council_id}: file not found', flush=True)
            continue
        
        with open(fpath) as f:
            data = json.load(f)
        feats = data.get('features', [])
        total_features += len(feats)
        
        if council_id == 'manningham':
            recs = records_manningham(feats)
        elif council_id == 'brimbank':
            recs = records_brimbank(feats)
        else:
            recs = records_by_coord(feats, council_id)
        
        all_records.extend(recs)
        print(f'  {council_id}: {len(feats)} feats → {len(recs)} records', flush=True)
    
    street_records = aggregate_streets(all_records)
    suburb_records = aggregate_suburbs(all_records)
    
    street_total = sum(r['tree_count'] for r in street_records)
    suburb_total = sum(r['tree_count'] for r in suburb_records)
    
    # Write
    with open(STREET_OUTPUT, 'w') as f:
        json.dump({
            'metadata': {'source': 'data.gov.au', 'version': '1.0',
                         'total_features': total_features,
                         'streets': len(street_records), 'trees': street_total},
            'records': street_records
        }, f, indent=2)
    
    with open(SUBURB_OUTPUT, 'w') as f:
        json.dump({
            'metadata': {'source': 'data.gov.au + centroid reverse geocode', 'version': '1.1',
                         'total_features': total_features,
                         'suburbs': len(suburb_records), 'trees': suburb_total},
            'records': suburb_records
        }, f, indent=2)
    
    print(f'\n=== Summary ===', flush=True)
    print(f'Total features: {total_features}', flush=True)
    print(f'Street records: {len(street_records)} (trees: {street_total})', flush=True)
    print(f'Suburb records: {len(suburb_records)} (trees: {suburb_total})', flush=True)
    street_subs = sorted(set(r['suburb'] for r in street_records))
    suburb_subs = sorted(set(r['suburb'] for r in suburb_records))
    print(f'Street-level suburbs: {len(street_subs)}', flush=True)
    print(f'Suburb-level suburbs: {len(suburb_subs)}', flush=True)
    print(f'Suburbs: {suburb_subs[:30]}', flush=True)
    has_dbh = sum(1 for r in suburb_records if r['avg_dbh_cm'] is not None)
    has_height = sum(1 for r in suburb_records if r['avg_height_m'] is not None)
    print(f'Suburbs with DBH: {has_dbh}/{len(suburb_records)}', flush=True)
    print(f'Suburbs with height: {has_height}/{len(suburb_records)}', flush=True)


if __name__ == '__main__':
    main()
