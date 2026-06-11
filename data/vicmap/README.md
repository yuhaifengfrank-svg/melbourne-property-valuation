# VICMAP Parcel Data

**Source:** VICMAP (Land Use Victoria)  
**License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use with attribution  
**Extent:** Melbourne Metro (VAR1-4000)  
**CRS:** GDA2020 / Vicgrid  

## Files

The raw shapefile is too large for git (~1.8 GB). It lives at:

```
/tmp/vicmap-raw/gda2020_vicgrid/esrishape/customised_delivery/MELB_METRO_VAR1-4000/
```

| File | Size | Description |
|------|------|-------------|
| `V_PARCEL_MP.shp` | 670 MB | Parcel geometry (polygons) |
| `V_PARCEL_MP.dbf` | 1.1 GB | Parcel attributes (40 columns) |
| `V_PARCEL_MP.shx` | 21 MB | Spatial index |
| `EXTRACT_POLYGON.shp` | 8 KB | Melbourne metro boundary |

## Fields

Key fields in V_PARCEL_MP (see `v_parcel_mp_column_names.txt` for full list):

- `PARCEL_ID` — Unique parcel identifier
- `PARCEL_PFI` — Permanent feature identifier
- `PC_LGAC` — LGA code (links to council)
- `PC_PLANNO` — Plan number
- `PC_LOTNO` — Lot number
- `PC_SUB` — Subdivision
- `PC_PNUM` — P number (crown description)
- `PARCEL_SPI` — Standard Parcel Identifier
- `PC_STAT` — Status (current/historical)

## Next Steps

1. Install `gdal` or `pyshp` to read shapefiles
2. Filter to current parcels only (`PC_STAT = 'C'`)
3. Convert to GeoJSON for web use
4. Merge with `suburb_metrics` by LGA or postcode
5. Render parcel-level heatmaps on suburb pages
