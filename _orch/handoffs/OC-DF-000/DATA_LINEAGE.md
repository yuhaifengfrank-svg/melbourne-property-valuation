# OC-DF-000 — Data Lineage

## Council Data Sources

| Source | URL | Terms | Cadence | Grain | Raw path on VM |
|--------|-----|-------|---------|-------|----------------|
| Data.Vic LGA boundaries | data.vic.gov.au | Creative Commons 4.0 | Annual | LGA | Not on VM (area_km² from PostGIS) |
| VBA/BPC raw permit data (March 2026) | discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries | Creative Commons 4.0 | Monthly | Permit | `/tmp/vba-data/2026-01_to_2026-03_raw.csv` (converted from XLSB → CSV via pyxlsb) |

## Suburb Data Sources (pre-existing, verified by previous sessions)

| Source | Coverage | Status |
|--------|----------|--------|
| OSM (POI via Overpass API) | 247/247 | All populated |
| CSA Crime (VIC Police) | 247/247 | All populated (7 crime columns) |
| VHR Heritage (Vic Heritage Register) | 2,680 zones | All in DB |

## VBA Raw File Checksum

```
File: /Users/FrankAI/Downloads/20260763-Rawdata-March-2026.xlsb
Type: Microsoft Excel 2007+ (binary XLSB)
Parsed via: pyxlsb → CSV → aggregated by node pg
Row count: 24,235 permits (Jan+Feb+Mar 2026)
```

## Transformations

1. XLSB binary → CSV (Python pyxlsb, pandas)
2. CSV → per-LGA monthly aggregation (Node.js, `pg` client)
3. Classification:
   - New Residential = Domestic + NOW=1
   - Multi Unit = Residential + NOW=1
   - Alterations = NOW=3 | 4
   - Commercial = Commercial | Retail | Industrial
4. UPSERT into `council_metrics` table
5. Manual hard-mapping for VBA name discrepancies:
   - `Port Philip` (VBA) → lga_code 25900 (Port Phillip)
   - `Queenscliff (B)` (VBA) → lga_code 26080 (Queenscliffe)
