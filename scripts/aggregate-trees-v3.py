#!/usr/bin/env python3
"""
Stage 2 v3 — Aggregates street tree data into two outputs:

1. street_tree_by_street.json  → street-level (Manningham + Brimbank only — have street+suburb)
2. suburb_tree_canopy.json     → suburb-level (all 9 councils)

Suburb assignment for councils without location fields uses
the first tree point's nearest suburb centroid (no spatial index needed).
"""

import json, os, re, sys, math

RAW_DIR = '/home/ubuntu/data/street-tree-raw'
BOUNDARY_FILE = '/home/ubuntu/data/suburb-boundaries/vic_localities.geojson'
STREET_OUTPUT = '/home/ubuntu/data/street_tree_by_street.json'
SUBURB_OUTPUT = '/home/ubuntu/data/suburb_tree_canopy.json'

COUNCILS = {
    'manningham': 'manningham.geojson',
    'hobsons_bay': 'hobsons_bay.geojson',
    'brimbank': 'brimbank.geojson',
    'glen_eira': 'glen_eira.geojson',
    'yarra': 'yarra.geojson',
    'port_phillip': 'port_phillip.geojson',
    'melbourne': 'melbourne.geojson',
    'wyndham': 'wyndham.geojson',
    'ballarat': 'ballarat.geojson',
}


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


def extract_coord(props_or_geom):
    if isinstance(props_or_geom, dict) and 'coordinates' in props_or_geom:
        geom = props_or_geom
        if geom.get('type') == 'Point':
            return tuple(geom['coordinates'][:2])
        return None
    p = {k.lower(): v for k, v in props_or_geom.items()}
    lat = p.get('lat') or p.get('latitude') or p.get('y')
    lon = p.get('lon') or p.get('long') or p.get('longitude') or p.get('x')
    if lat and lon:
        try: return (float(lon), float(lat))
        except: pass
    geo = p.get('geolocation')
    if isinstance(geo, dict):
        try: return (float(geo.get('lon',0)), float(geo.get('lat',0)))
        except: pass
    return None


# ========== Nearest-suburb assignment ==========

SUBURB_CENTROIDS = None  # [(lon, lat, name)]

def load_suburb_centroids():
    global SUBURB_CENTROIDS
    if SUBURB_CENTROIDS:
        return SUBURB_CENTROIDS
    
    print('  Loading suburb centroids...', flush=True)
    with open(BOUNDARY_FILE) as f:
        bdata = json.load(f)
    
    centroids = []
    for feat in bdata['features']:
        prop = feat['properties']
        name = str(prop.get('LOC_NAME', '') or '').strip().upper()
        if not name: continue
        geom = feat['geometry']
        if not geom: continue
        coords = geom.get('coordinates', [])
        gtype = geom.get('type', '')
        
        if gtype == 'Polygon':
            # First ring, average all points
            ring = coords[0]
            n = len(ring)
            if n == 0: continue
            lon = sum(p[0] for p in ring) / n
            lat = sum(p[1] for p in ring) / n
            centroids.append((lon, lat, name))
        elif gtype == 'MultiPolygon':
            # Weight by approximate area (number of points)
            total_area = 0
            avg_lon = 0.0
            avg_lat = 0.0
            for poly in coords:
                ring = poly[0]
                n = len(ring)
                if n == 0: continue
                area = n
                avg_lon += sum(p[0] for p in ring)
                avg_lat += sum(p[1] for p in ring)
                total_area += area
            if total_area > 0:
                centroids.append((avg_lon / sum(len(p[0]) for p in coords if p[0]), 
                                  avg_lat / sum(len(p[0]) for p in coords if p[0]),
                                  name))
    
    print(f'  Loaded {len(centroids)} suburb centroids', flush=True)
    SUBURB_CENTROIDS = centroids
    return centroids


def nearest_suburb(coord):
    """Find nearest suburb centroid (Euclidean — fine for metro Melbourne)."""
    centroids = load_suburb_centroids()
    if not coord or len(coord) < 2:
        return None
    
    best_dist = float('inf')
    best_name = None
    lon, lat = coord[0], coord[1]
    
    for slon, slat, sname in centroids:
        d = (slon - lon)**2 + (slat - lat)**2  # skip sqrt for speed
        if d < best_dist:
            best_dist = d
            best_name = sname
    
    if best_dist < 0.2:  # ~20km radius — Melbourne metro fits
        return best_name
    
    return None


# ========== Per-council record extractors ==========

def records_manningham(feats):
    out = []
    for f in feats:
        p = f['properties']
        suburb = str(p.get('suburb','') or '').strip().upper()
        street = str(p.get('street','') or '').strip().upper()
        if not suburb or not street: continue
        coord = extract_coord(p) or extract_coord(f.get('geometry'))
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
        suburb = ''
        street = ''
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
        coord = extract_coord(p) or extract_coord(f.get('geometry'))
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


def records_spatial(feats, council_id):
    """For councils without suburb fields — use nearest-suburb assignment."""
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


# ========== Street-level aggregation ==========

def aggregate_streets(records):
    """Group by (suburb, street). Returns list of record dicts."""
    streets = {}
    for r in records:
        if not r['street']:  # skip records without street name
            continue
        key = f"{r['suburb']}::{r['street']}"
        if key not in streets:
            streets[key] = {
                'suburb': r['suburb'], 'street': r['street'],
                'councils': set(), 'count': 0,
                'dbh_vals': [], 'height_vals': [], 'genera': set(),
                'lons': [], 'lats': [],
            }
        e = streets[key]
        e['councils'].add(r['council'])
        e['count'] += 1
        if r['dbh'] is not None: e['dbh_vals'].append(r['dbh'])
        if r['height'] is not None: e['height_vals'].append(r['height'])
        if r['genus']: e['genera'].add(r['genus'])
        if r['coord']:
            e['lons'].append(r['coord'][0])
            e['lats'].append(r['coord'][1])
    
    out = []
    for key, e in streets.items():
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
            'suburb': e['suburb'],
            'street': e['street'],
            'tree_count': e['count'],
            'avg_dbh_cm': avg_dbh,
            'avg_height_m': avg_h,
            'genus_count': len(e['genera']),
            'genera': sorted(e['genera'])[:20],
            'councils': sorted(e['councils']),
            'canopy_score': cs,
            'maturity': maturity,
            'approx_coord': [avg_lon, avg_lat] if avg_lon else None,
            'coord_source': 'aggregated' if avg_lon else None,
        })
    out.sort(key=lambda r: (r['suburb'], r['street']))
    return out


# ========== Suburb-level aggregation ==========

def aggregate_suburbs(all_records):
    """Group by suburb across all councils."""
    suburbs = {}
    for r in all_records:
        key = r['suburb']
        if key not in suburbs:
            suburbs[key] = {
                'councils': set(), 'count': 0,
                'dbh_vals': [], 'height_vals': [],
                'genera': set(), 'trees': [],
            }
        e = suburbs[key]
        e['councils'].add(r['council'])
        e['count'] += 1
        if r['dbh'] is not None: e['dbh_vals'].append(r['dbh'])
        if r['height'] is not None: e['height_vals'].append(r['height'])
        if r['genus']: e['genera'].add(r['genus'])
        e['trees'].append(r)
    
    out = []
    for key, e in suburbs.items():
        avg_dbh = round(sum(e['dbh_vals'])/len(e['dbh_vals']), 1) if e['dbh_vals'] else None
        avg_h = round(sum(e['height_vals'])/len(e['height_vals']), 1) if e['height_vals'] else None
        
        # Canopy density (trees per area — rough from how many trees in suburb)
        density_bucket = 'low'
        if e['count'] > 10000: density_bucket = 'very_high'
        elif e['count'] > 5000: density_bucket = 'high'
        elif e['count'] > 1000: density_bucket = 'medium'
        
        maturity = 'unknown'
        if avg_dbh is not None:
            maturity = 'low' if avg_dbh < 15 else 'medium' if avg_dbh < 35 else 'high'
        
        out.append({
            'suburb': key,
            'councils': sorted(e['councils']),
            'tree_count': e['count'],
            'avg_dbh_cm': avg_dbh,
            'avg_height_m': avg_h,
            'genus_count': len(e['genera']),
            'genera': sorted(e['genera'])[:20],
            'canopy_density': density_bucket,
            'maturity': maturity,
        })
    
    out.sort(key=lambda r: r['suburb'])
    return out


# ========== Main ==========

def main():
    load_suburb_centroids()
    
    all_records = []
    total_features = 0
    
    for council_id, filename in COUNCILS.items():
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
        elif council_id == 'hobsons_bay':
            recs = records_spatial(feats, council_id)
        else:
            recs = records_spatial(feats, council_id)
        
        all_records.extend(recs)
        print(f'  {council_id}: {len(feats)} feats → {len(recs)} records', flush=True)
    
    # Aggregate
    street_records = aggregate_streets(all_records)
    suburb_records = aggregate_suburbs(all_records)
    
    tree_total = sum(r['tree_count'] for r in street_records)
    tree_total_sub = sum(r['tree_count'] for r in suburb_records)
    
    # Write street output
    street_output = {
        'metadata': {
            'source': 'data.gov.au council open data portals',
            'version': '1.0',
            'total_features': total_features,
            'streets_in_output': len(street_records),
            'trees_aggregated': tree_total,
        },
        'records': street_records,
    }
    with open(STREET_OUTPUT, 'w') as f:
        json.dump(street_output, f, indent=2)
    
    # Write suburb output
    suburb_output = {
        'metadata': {
            'source': 'data.gov.au council open data portals + reverse geocode',
            'version': '1.1 (suburb-level)',
            'total_features': total_features,
            'suburbs_in_output': len(suburb_records),
            'trees_aggregated': tree_total_sub,
        },
        'records': suburb_records,
    }
    with open(SUBURB_OUTPUT, 'w') as f:
        json.dump(suburb_output, f, indent=2)
    
    # Stats
    print(f'\n=== Summary ===', flush=True)
    print(f'Total features: {total_features}', flush=True)
    print(f'Street records: {len(street_records)} (trees: {tree_total})', flush=True)
    print(f'Suburb records: {len(suburb_records)} (trees: {tree_total_sub})', flush=True)
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
