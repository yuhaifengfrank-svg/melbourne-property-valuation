#!/usr/bin/env python3
"""
Stage 2: Aggregate street tree data from 9 council GeoJSON files
into street_tree_by_street.json

Run on VM: 
  scp scripts/aggregate-trees.py vm-aushomevalue:~
  ssh vm-aushomevalue python3 ~/aggregate-trees.py
  scp vm-aushomevalue:~/data/street_tree_by_street.json ~/Documents/<project>/data/
"""

import json, os, re, sys, glob

RAW_DIR = '/home/ubuntu/data/street-tree-raw'
OUTPUT_FILE = '/home/ubuntu/data/street_tree_by_street.json'

COUNCIL_FILES = {
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
    if val is None:
        return None
    s = str(val).strip().lower()
    if not s or s in ('none', 'null', 'n/a', 'not applicable', 'not assess', '0', '', 'unknown'):
        return None
    try:
        return float(s)
    except ValueError:
        pass
    # Range: extract midpoint
    nums = re.findall(r'[\d.]+', s)
    if len(nums) >= 2:
        vals = [float(x) for x in nums[:2]]
        if 'mm' in s:
            return round(sum(vals) / 2 / 10, 1)
        return round(sum(vals) / 2, 1)
    elif len(nums) == 1:
        if 'mm' in s:
            return round(float(nums[0]) / 10, 1)
        return float(nums[0])
    return None


def parse_height(val):
    if val is None:
        return None
    s = str(val).strip().lower()
    if not s or s in ('none', 'null', 'n/a', 'not applicable', 'not assess', '0', '', 'unknown'):
        return None
    try:
        h = float(s)
        # If value > 50, probably in mm (unusual for height but possible)
        if h > 50:
            return round(h / 100, 1)
        return h
    except ValueError:
        pass
    nums = re.findall(r'[\d.]+', s)
    if len(nums) >= 2:
        vals = [float(x) for x in nums[:2]]
        # Ranges like "02-06" (meters) or "15-25" (meters)
        return round(sum(vals) / 2, 1)
    elif len(nums) == 1:
        return float(nums[0])
    return None


def extract_location_brimbank(props):
    """Brimbank: Location = 'Front 191 DENTON AVENUE, St Albans'"""
    loc = str(props.get('Location', props.get('location', '')) or '').strip()
    suburb = ''
    street = ''
    if ',' in loc:
        parts = loc.rsplit(',', 1)
        suburb = parts[1].strip().upper()
        street_part = parts[0].strip()
        street_part = re.sub(r'^(Front|Rear|Side|Beside)\s+', '', street_part, flags=re.IGNORECASE)
        street_part = re.sub(r'^\d+\s*', '', street_part).strip()
        street = street_part.upper()
    else:
        suburb = 'BRIMBANK'
        street = loc.upper()
        street = re.sub(r'^(Front|Rear|Side)\s+', '', street, flags=re.IGNORECASE)
        street = re.sub(r'^\d+\s*', '', street).strip()
    return suburb, street


def extract_coord(props):
    p = {k.lower(): v for k, v in props.items()}
    lat = p.get('lat') or p.get('latitude') or p.get('y')
    lon = p.get('lon') or p.get('long') or p.get('longitude') or p.get('x')
    if lat and lon:
        try:
            return (float(lon), float(lat))
        except (ValueError, TypeError):
            pass
    geo = p.get('geolocation')
    if isinstance(geo, dict):
        try:
            return (float(geo.get('lon', 0)), float(geo.get('lat', 0)))
        except (ValueError, TypeError):
            pass
    return None


# =========== Council processors ===========

def process_manningham(feats):
    records = []
    for feat in feats:
        p = feat.get('properties', {})
        suburb = str(p.get('suburb', '') or '').strip().upper()
        street = str(p.get('street', '') or '').strip().upper()
        if not suburb or not street:
            continue
        coord = extract_coord(p)
        # dbh in mm range e.g. "250 - 500mm"
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        # species = e.g. "Agonis flexuosa"
        genus = str(p.get('species', p.get('alphatree', '')) or '').strip()
        if genus.lower() in ('', 'none', 'unknown'):
            genus = None
        records.append((suburb, street, coord, dbh, height, genus, 'manningham'))
    return records


def process_hobsons_bay(feats):
    records = []
    for feat in feats:
        p = feat.get('properties', {})
        suburb = str(p.get('suburb', '') or '').strip().upper()
        if not suburb:
            continue
        # No street field — fall back to combined Genus+Suburb as pseudo-street
        # Actually we need to skip since no street-level grouping
        continue
    return records


def process_brimbank(feats):
    records = []
    for feat in feats:
        p = feat.get('properties', {})
        suburb, street = extract_location_brimbank(p)
        if not suburb or not street:
            continue
        coord = extract_coord(p)
        dbh = parse_cm(p.get('dbh'))
        height = parse_height(p.get('height'))
        genus_g = str(p.get('Genus', '') or '').strip()
        genus_s = str(p.get('Species', '') or '').strip()
        if genus_g and genus_g not in ('Unknown', 'None', ''):
            if genus_s and genus_s not in ('Unknown', 'None', 'sp.', ''):
                genus = f'{genus_g} {genus_s}'
            else:
                genus = genus_g
        else:
            genus = None
        records.append((suburb, street, coord, dbh, height, genus, 'brimbank'))
    return records


# =========== Main ===========

def main():
    all_records = []
    total_features = 0
    council_counts = {}
    
    for council_id, filename in COUNCIL_FILES.items():
        fpath = os.path.join(RAW_DIR, filename)
        if not os.path.exists(fpath):
            print(f'  SKIP {council_id}: file not found')
            continue
        
        with open(fpath) as f:
            data = json.load(f)
        feats = data.get('features', [])
        total_features += len(feats)
        council_counts[council_id] = len(feats)
        
        if council_id == 'manningham':
            recs = process_manningham(feats)
        elif council_id == 'hobsons_bay':
            recs = process_hobsons_bay(feats)
        elif council_id == 'brimbank':
            recs = process_brimbank(feats)
        else:
            # Glen Eira, Yarra, Port Phillip, Melbourne, Wyndham, Ballarat
            # These have no suburb/street fields — skip for now
            recs = []
        
        all_records.extend(recs)
        print(f'  {council_id}: {len(feats)} feats → {len(recs)} street records')
    
    # Aggregate by (suburb, street)
    streets = {}
    for suburb, street, coord, dbh, height, genus, council in all_records:
        key = f'{suburb}::{street}'
        if key not in streets:
            streets[key] = {
                'suburb': suburb,
                'street': street,
                'councils': set(),
                'count': 0,
                'dbh_vals': [],
                'height_vals': [],
                'genera': set(),
                'lons': [],
                'lats': [],
            }
        e = streets[key]
        e['councils'].add(council)
        e['count'] += 1
        if dbh is not None:
            e['dbh_vals'].append(dbh)
        if height is not None:
            e['height_vals'].append(height)
        if genus:
            e['genera'].add(genus)
        if coord:
            e['lons'].append(coord[0])
            e['lats'].append(coord[1])
    
    # Build output
    records_out = []
    for key, e in streets.items():
        avg_dbh = round(sum(e['dbh_vals']) / len(e['dbh_vals']), 1) if e['dbh_vals'] else None
        avg_h = round(sum(e['height_vals']) / len(e['height_vals']), 1) if e['height_vals'] else None
        avg_lon = sum(e['lons']) / len(e['lons']) if e['lons'] else None
        avg_lat = sum(e['lats']) / len(e['lats']) if e['lats'] else None
        
        density = e['count']
        if density == 0: cs = 1
        elif density < 5: cs = 2
        elif density < 20: cs = 3
        elif density < 50: cs = 4
        else: cs = 5
        
        maturity = 'unknown'
        if avg_dbh is not None:
            if avg_dbh < 15: maturity = 'low'
            elif avg_dbh < 35: maturity = 'medium'
            else: maturity = 'high'
        
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
            'source': 'data.gov.au council open data portals',
            'processed_at': '2026-06-28T00:00:00Z',
            'version': '1.0',
            'total_features': total_features,
            'total_with_location': sum(1 for r in all_records),
            'streets_in_output': len(records_out),
            'councils_processed': list(council_counts.keys()),
            'councils_skipped_no_suburb': ['glen_eira', 'yarra', 'port_phillip', 'melbourne', 'wyndham', 'ballarat', 'hobsons_bay'],
        },
        'records': records_out,
    }
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    # Stats
    print(f'\n=== Summary ===')
    print(f'Total features read: {total_features}')
    print(f'Total street records: {len(records_out)}')
    suburbs = sorted(set(r['suburb'] for r in records_out))
    print(f'Unique suburbs: {len(suburbs)}')
    print(f'Suburbs: {suburbs[:50]}')
    has_dbh = sum(1 for r in records_out if r['avg_dbh_cm'] is not None)
    has_height = sum(1 for r in records_out if r['avg_height_m'] is not None)
    has_coord = sum(1 for r in records_out if r['approx_coord'] is not None)
    tree_total = sum(r['tree_count'] for r in records_out)
    print(f'Total trees aggregated: {tree_total}')
    print(f'Streets with DBH: {has_dbh}/{len(records_out)}')
    print(f'Streets with Height: {has_height}/{len(records_out)}')
    print(f'Streets with coords: {has_coord}/{len(records_out)}')


if __name__ == '__main__':
    main()
