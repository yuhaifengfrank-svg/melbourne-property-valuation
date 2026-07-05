#!/usr/bin/env python3
"""
Stage 2 v2: Aggregate street tree data from 9 council GeoJSON files
into street_tree_by_street.json

Uses VIC suburb boundaries for spatial reverse-geocoding of councils
that don't have suburb/street fields in their data.

Usage: scp to VM, run, scp output back

Council status:
  manningham  → has suburb + street fields
  brimbank    → has Location field (parsed for suburb+street)
  hobsons_bay → has suburb field, no street field (suburb-level only)
  glen_eira   → has geometry, spatial join for suburb
  yarra       → has geometry, spatial join for suburb
  port_phillip → has geometry, spatial join for suburb
  melbourne   → has geometry, spatial join for suburb
  wyndham     → has geometry, spatial join for suburb
  ballarat    → has geometry, spatial join for suburb
"""

import json, os, re, sys, glob, subprocess, tempfile

RAW_DIR = '/home/ubuntu/data/street-tree-raw'
BOUNDARY_FILE = '/home/ubuntu/data/suburb-boundaries/vic_localities.geojson'
OUTPUT_FILE = '/home/ubuntu/data/street_tree_by_street.json'

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
    if not s or s in ('none','null','n/a','not applicable','not assess','0','','unknown'): return None
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
    if not s or s in ('none','null','n/a','not applicable','not assess','0','','unknown'): return None
    try:
        h = float(s)
        return round(h/100, 1) if h > 50 else h
    except ValueError: pass
    nums = re.findall(r'[\d.]+', s)
    if len(nums) >= 2: return round(sum(float(x) for x in nums[:2])/2, 1)
    elif len(nums) == 1: return float(nums[0])
    return None

def extract_coord(props):
    p = {k.lower(): v for k, v in props.items()}
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

def extract_location_brimbank(props):
    loc = str(props.get('Location', props.get('location', '')) or '').strip()
    if ',' in loc:
        parts = loc.rsplit(',', 1)
        suburb = parts[1].strip().upper()
        street_part = parts[0].strip()
        street_part = re.sub(r'^(Front|Rear|Side|Beside)\s+', '', street_part, flags=re.IGNORECASE)
        street_part = re.sub(r'^\d+\s*', '', street_part).strip()
        return (suburb, street_part.upper())
    return ('BRIMBANK', loc.upper().replace('FRONT ','').replace('REAR ','').replace('SIDE ',''))


# ========= per-council record extractors =========

def records_manningham(feats):
    out = []
    for f in feats:
        p = f['properties']
        suburb = str(p.get('suburb','') or '').strip().upper()
        street = str(p.get('street','') or '').strip().upper()
        if not suburb or not street: continue
        coord = extract_coord(p)
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        genus = str(p.get('species', p.get('alphatree','')) or '').strip()
        if genus.lower() in ('','none','unknown'): genus = None
        out.append((suburb, street, coord, dbh, height, genus, 'manningham'))
    return out

def records_brimbank(feats):
    out = []
    for f in feats:
        p = f['properties']
        suburb, street = extract_location_brimbank(p)
        if not suburb or not street: continue
        coord = extract_coord(p)
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        gg = str(p.get('Genus','') or '').strip()
        gs = str(p.get('Species','') or '').strip()
        if gg and gg not in ('Unknown','None',''):
            genus = f'{gg} {gs}' if gs and gs not in ('Unknown','None','sp.','') else gg
        else: genus = None
        out.append((suburb, street, coord, dbh, height, genus, 'brimbank'))
    return out

def records_hobsons_bay(feats):
    # Only suburb-level, no street → group by suburb (use "" as street)
    out = []
    for f in feats:
        p = f['properties']
        suburb = str(p.get('suburb','') or '').strip().upper()
        if not suburb: continue
        coord = extract_coord(p)
        # Parse DBH from dbh_mm (string like "Not Applicable" or numbers)
        dbh = parse_cm(p.get('dbh_mm'))
        height = parse_height(p.get('height'))
        gg = str(p.get('Genus','') or '').strip()
        gs = str(p.get('Species','') or '').strip()
        if gg and gg not in ('Unknown','None',''):
            genus = f'{gg} {gs}' if gs and gs not in ('Unknown','None','','sp.') else gg
        else: genus = None
        # Use a synthetic street key so all trees in same suburb group together
        out.append((suburb, '', coord, dbh, height, genus, 'hobsons_bay'))
    return out


# ========= Spatial reverse geocode =========

# Build R-tree index for suburb boundaries
BUILT_INDEX = None

def build_spatial_index():
    global BUILT_INDEX
    if BUILT_INDEX:
        return BUILT_INDEX
    from shapely.geometry import shape, Point
    from shapely import STRtree
    
    print('  Loading suburb boundaries...')
    with open(BOUNDARY_FILE) as f:
        bdata = json.load(f)
    
    polygons = []
    names = []
    for feat in bdata['features']:
        prop = feat['properties']
        name = str(prop.get('LOC_NAME', '') or '').strip().upper()
        if not name:
            continue
        geom = shape(feat['geometry'])
        if geom and not geom.is_empty:
            polygons.append(geom)
            names.append(name)
    
    print(f'  Loaded {len(polygons)} suburb boundaries')
    tree = STRtree(polygons)
    BUILT_INDEX = (tree, polygons, names)
    return BUILT_INDEX


def reverse_geocode(coord):
    """coord = (lon, lat) → suburb name or None"""
    from shapely.geometry import Point
    tree, polygons, names = build_spatial_index()
    pt = Point(coord)
    # Query tree for candidates
    candidates = tree.query(pt)
    for idx in candidates:
        if polygons[idx].contains(pt):
            return names[idx]
    return None


# ========= Main =========

def main():
    record_extractors = {
        'manningham': records_manningham,
        'brimbank': records_brimbank,
        'hobsons_bay': records_hobsons_bay,
    }
    
    all_records = []
    total_features = 0
    spatial_councils = []  # need reverse geocoding
    
    for council_id, filename in COUNCILS.items():
        fpath = os.path.join(RAW_DIR, filename)
        if not os.path.exists(fpath):
            print(f'  SKIP {council_id}: file not found')
            continue
        
        with open(fpath) as f:
            data = json.load(f)
        feats = data.get('features', [])
        total_features += len(feats)
        
        if council_id in record_extractors:
            recs = record_extractors[council_id](feats)
            all_records.extend(recs)
            print(f'  {council_id}: {len(feats)} feats → {len(recs)} records')
        else:
            spatial_councils.append((council_id, feats))
            print(f'  {council_id}: {len(feats)} feats → spatial reverse geocode needed')
    
    # Spatial join for remaining councils
    if spatial_councils:
        print(f'\n--- Reverse geocoding {sum(len(f) for _,f in spatial_councils)} points ---')
        build_spatial_index()
        
        for council_id, feats in spatial_councils:
            matched = 0
            for feat in feats:
                p = feat.get('properties', {})
                geom = feat.get('geometry')
                if not geom or geom.get('type') != 'Point':
                    continue
                coord = geom.get('coordinates')
                if not coord or len(coord) < 2:
                    continue
                
                suburb = reverse_geocode((coord[0], coord[1]))
                if not suburb:
                    continue
                
                street = ''  # No street info
                dbh = parse_cm(p.get('dbh') or p.get('diameter_breast_height') or p.get('DBH'))
                height = parse_height(p.get('height') or p.get('Height'))
                
                # Genus/species
                genus = None
                for key in ('genus', 'scientific_name', 'Botanical', 'common_name', 'Common_Name', 'common', 'species'):
                    val = p.get(key)
                    if val and str(val).strip() not in ('', 'None', 'Unknown', 'unknown'):
                        genus = str(val).strip()
                        break
                
                all_records.append((suburb, '', coord, dbh, height, genus, council_id))
                matched += 1
            
            print(f'  {council_id}: {matched}/{len(feats)} reverse geocoded')
    
    # Aggregate by (suburb, street)
    streets = {}
    for suburb, street, coord, dbh, height, genus, council in all_records:
        key = f'{suburb}::{street}'
        if key not in streets:
            streets[key] = {
                'suburb': suburb, 'street': street,
                'councils': set(), 'count': 0,
                'dbh_vals': [], 'height_vals': [], 'genera': set(),
                'lons': [], 'lats': [],
            }
        e = streets[key]
        e['councils'].add(council)
        e['count'] += 1
        if dbh is not None: e['dbh_vals'].append(dbh)
        if height is not None: e['height_vals'].append(height)
        if genus: e['genera'].add(genus)
        if coord:
            e['lons'].append(coord[0])
            e['lats'].append(coord[1])
    
    # Build output
    records_out = []
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
        
        records_out.append({
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
    
    records_out.sort(key=lambda r: (r['suburb'], r['street']))
    
    output = {
        'metadata': {
            'source': 'data.gov.au council open data portals + VIC suburb boundaries reverse geocode',
            'processed_at': '2026-06-28T00:00:00Z',
            'version': '2.0',
            'total_features': total_features,
            'streets_in_output': len(records_out),
        },
        'records': records_out,
    }
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    # Stats
    print(f'\n=== Summary ===')
    print(f'Total features: {total_features}')
    print(f'Unique street keys: {len(records_out)}')
    suburbs = sorted(set(r['suburb'] for r in records_out))
    print(f'Unique suburbs: {len(suburbs)}')
    print(f'Suburbs: {suburbs[:20]}')
    has_dbh = sum(1 for r in records_out if r['avg_dbh_cm'] is not None)
    has_height = sum(1 for r in records_out if r['avg_height_m'] is not None)
    print(f'Trees aggregated: {sum(r["tree_count"] for r in records_out)}')
    print(f'Streets with DBH: {has_dbh}/{len(records_out)}')
    print(f'Streets with Height: {has_height}/{len(records_out)}')


if __name__ == '__main__':
    main()
