#!/usr/bin/env python3
"""
scripts/populate-council-metrics-raw.py

Phase 2 (alternative): Aggregate VBA/BPC raw permit data (parsed XLSB CSV)
into council_metrics table per LGA per month.

Direct SQL UPSERT approach using Python + psycopg2.
Fall back to safe aggregate + print SQL statements for manual execution.

Run: python3 scripts/populate-council-metrics-raw.py
"""

import csv, os, sys, re
from collections import defaultdict

# ── Configuration ──
DATA_FILE = '/tmp/vba-data/2026-01_to_2026-03_raw.csv'

# ── LGA mapping ──
# (Built-in mapping: VBA name → lga_code)
# Synced from council_registry via Node (manual update if registry changes)
VBA_TO_LGA_CODE = {
    'Alpine': '20460', 'Ararat': '20260', 'Ballarat': '20570',
    'Banyule': '20660', 'Bass Coast': '20740', 'Baw Baw': '20830',
    'Bayside': '20910', 'Benalla': '21010', 'Boroondara': '21110',
    'Brimbank': '21180', 'Buloke': '21270', 'Campaspe': '21370',
    'Cardinia': '21430', 'Casey': '21470', 'Central Goldfields': '21610',
    'Colac-Otway': '21730', 'Corangamite': '21830', 'Darebin': '21890',
    'East Gippsland': '22030', 'Frankston': '22170', 'Gannawarra': '22200',
    'Glen Eira': '22310', 'Glenelg': '22370', 'Golden Plains': '22420',
    'Greater Bendigo': '22530', 'Greater Dandenong': '22670',
    'Greater Geelong': '22750', 'Greater Shepparton': '22860',
    'Hepburn': '23010', 'Hindmarsh': '23060', 'Hobsons Bay': '23110',
    'Horsham': '23230', 'Hume': '23270', 'Indigo': '23330',
    'Kingston': '23430', 'Knox': '23670', 'Latrobe': '23810',
    'Loddon': '23890', 'Macedon Ranges': '23970', 'Manningham': '24210',
    'Mansfield': '24250', 'Maribyrnong': '24330', 'Maroondah': '24410',
    'Melbourne': '24600', 'Melton': '24650', 'Merri-bek': '24700',
    'Mildura': '24790', 'Mitchell': '24860', 'Moira': '24920',
    'Monash': '24970', 'Moonee Valley': '25060', 'Moorabool': '25170',
    'Mornington': '25340', 'Mount Alexander': '25380', 'Moyne': '25450',
    'Mt Buller Alpine Resort': '90001',  # special purpose
    'Murrindindi': '25570', 'Nillumbik': '25610',
    'Northern Grampians': '25700', 'Port Philip': '25770',
    'Pyrenees': '25840', 'Queenscliff (B)': '25870',
    'South Gippsland': '26060', 'Southern Grampians': '26120',
    'Stonnington': '26210', 'Strathbogie': '26260', 'Surf Coast': '26310',
    'Swan Hill': '26350', 'Towong': '26450', 'Wangaratta': '26560',
    'Warrnambool': '26660', 'Wellington': '26700', 'West Wimmera': '26790',
    'Whitehorse': '26860', 'Whittlesea': '26910', 'Wodonga': '26960',
    'Wyndham': '27070', 'Yarra': '27110', 'Yarra Ranges': '27160',
    'Yarriambiack': '27210',
}


def parse_csv(path):
    """Parse CSV with proper quote handling."""
    rows = []
    with open(path, 'r', newline='') as f:
        reader = csv.reader(f)
        for row in reader:
            rows.append(row)
    return rows[0], rows[1:]  # header, data


def aggregate(header, rows):
    """Aggregate raw permit rows into per-LGA per-month stats."""
    col = {h: i for i, h in enumerate(header)}

    required = ['Site_Municipality', 'BASIS_Month_Y', 'BASIS_Month_M',
                'Reported_Cost_of_works', 'BASIS_Building_Use', 'BASIS_NOW']
    for c in required:
        assert c in col, f"Missing column: {c}"

    # Aggregation keys: (municipality, year, month)
    agg = defaultdict(lambda: {
        'total_count': 0, 'total_value': 0,
        'new_res_count': 0, 'new_res_value': 0,
        'multi_count': 0, 'multi_value': 0,
        'alt_count': 0, 'alt_value': 0,
        'comm_count': 0, 'comm_value': 0,
    })

    for row in rows:
        municip = row[col['Site_Municipality']].strip()
        if not municip:
            continue

        # Skip numeric-only values (postcode artifacts)
        if re.match(r'^\d+\.?\d*$', municip):
            continue

        year = int(float(row[col['BASIS_Month_Y']]))
        month = int(float(row[col['BASIS_Month_M']]))
        cost = float(row[col['Reported_Cost_of_works']] or 0)
        use = row[col['BASIS_Building_Use']].strip()
        now = float(row[col['BASIS_NOW']] or 0)

        key = (municip, year, month)
        r = agg[key]
        r['total_count'] += 1
        r['total_value'] += cost

        is_new = now == 1.0
        is_alt = now in (3.0, 4.0)
        is_commercial = use in ('Commercial', 'Retail', 'Industrial')

        if is_new and use == 'Domestic':
            r['new_res_count'] += 1
            r['new_res_value'] += cost
        elif is_new and use == 'Residential':
            r['multi_count'] += 1
            r['multi_value'] += cost
        elif is_alt:
            r['alt_count'] += 1
            r['alt_value'] += cost
        elif is_commercial:
            r['comm_count'] += 1
            r['comm_value'] += cost

    return agg


def main():
    print("[council-metrics-raw] Aggregating VBA raw permit data\n")

    if not os.path.exists(DATA_FILE):
        print(f"ERROR: Input CSV not found: {DATA_FILE}")
        sys.exit(1)

    header, rows = parse_csv(DATA_FILE)
    print(f"  Rows: {len(rows)}")
    print(f"  Cols: {len(header)}")

    agg = aggregate(header, rows)
    print(f"\n  Aggregated: {len(agg)} LGA-month records\n")

    # Build SQL UPSERT statements
    matched = 0
    unmatched = 0
    unmatched_names = set()
    sql_statements = []
    total_inserts = 0

    for (municip, year, month), rec in sorted(agg.items()):
        lga_code = VBA_TO_LGA_CODE.get(municip)

        if not lga_code:
            unmatched += 1
            unmatched_names.add(municip)
            continue

        matched += 1

        # Convert $ to $'000
        val_new_res = round(rec['new_res_value'] / 1000)
        val_multi = round(rec['multi_value'] / 1000)
        val_alt = round(rec['alt_value'] / 1000)
        val_comm = round(rec['comm_value'] / 1000)
        val_total = round(rec['total_value'] / 1000)
        avg_vpp = round(rec['total_value'] / rec['total_count'] / 1000) if rec['total_count'] > 0 else 0

        sql = f"""-- {municip} ({year}-{month:02d})
INSERT INTO council_metrics 
  (lga_code, report_year, report_month,
   permits_new_residential, permits_new_multi_unit, permits_alterations, permits_commercial, permits_total,
   value_new_residential, value_new_multi_unit, value_alterations, value_commercial, value_total,
   avg_value_per_permit, data_source)
VALUES (
  '{lga_code}', {year}, {month},
  {rec['new_res_count']}, {rec['multi_count']}, {rec['alt_count']}, {rec['comm_count']}, {rec['total_count']},
  {val_new_res}, {val_multi}, {val_alt}, {val_comm}, {val_total},
  {avg_vpp},
  'VBA/BPC Raw Permit Data'
)
ON CONFLICT (lga_code, report_year, report_month) DO UPDATE SET
  permits_new_residential = EXCLUDED.permits_new_residential,
  permits_new_multi_unit = EXCLUDED.permits_new_multi_unit,
  permits_alterations = EXCLUDED.permits_alterations,
  permits_commercial = EXCLUDED.permits_commercial,
  permits_total = EXCLUDED.permits_total,
  value_new_residential = EXCLUDED.value_new_residential,
  value_new_multi_unit = EXCLUDED.value_new_multi_unit,
  value_alterations = EXCLUDED.value_alterations,
  value_commercial = EXCLUDED.value_commercial,
  value_total = EXCLUDED.value_total,
  avg_value_per_permit = EXCLUDED.avg_value_per_permit,
  updated_at = NOW();"""

        sql_statements.append(sql)

    print(f"  Match results: {matched} matched, {unmatched} unmatched\n")

    if unmatched_names:
        print(f"  Unmatched ({len(unmatched_names)}):")
        for n in sorted(unmatched_names):
            print(f"    '{n}'")

    if unmatched > 0:
        print("\n  ❗ WARNING: Some municipalities could not be matched!")
        print("     Need to update VBA_TO_LGA_CODE mapping at top of script.")

    # Write SQL to file
    sql_output = '/tmp/vba-data/council_metrics_upsert.sql'
    os.makedirs('/tmp/vba-data', exist_ok=True)
    with open(sql_output, 'w') as f:
        f.write('-- VBA/BPC Raw Permit Data → council_metrics UPSERT\n')
        f.write('-- Generated: 2026-03 raw data (Jan-Mar 2026)\n')
        f.write(f'-- {matched} LGA-month records\n\n')
        f.write('\n'.join(sql_statements))

    print(f"\n  SQL written to: {sql_output}")

    # Also print summary
    print(f"\n  ── Summary by month ──")
    month_counts = defaultdict(int)
    for (m, y, mo), rec in sorted(agg.items()):
        if VBA_TO_LGA_CODE.get(m):
            month_counts[(y, mo)] += 1
    for (y, mo), cnt in sorted(month_counts.items()):
        print(f"    {y}-{mo:02d}: {cnt} LGAs")

    print(f"\n  ── Top 10 by permit count ──")
    by_count = sorted(
        [((m, y, mo), rec['total_count'], rec['total_value'])
         for (m, y, mo), rec in agg.items()
         if VBA_TO_LGA_CODE.get(m)],
        key=lambda x: -x[1]
    )[:10]
    for (m, y, mo), cnt, val in by_count:
        print(f"    {m:25s} {y}-{mo:02d}: {cnt:5d} permits  ${val/1e6:>8.1f}M")

    print(f"\n  Done! Run the SQL file, then REFRESH MATERIALIZED VIEW council_metrics_12m.")
    print(f"  SQL: psql $DATABASE_URL < {sql_output}")


if __name__ == '__main__':
    main()
