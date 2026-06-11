# Vicmap Land Size Integration

## What was done

1. **Downloaded Vicmap parcel data** (V_PARCEL_MP shapefile, 2.78M parcels)
2. **Resolved LGA code mapping** — Vicmap uses 3-digit authority codes (303-380).
   Mapped 39 codes → 36 LGAs via centroid analysis + cross-validation with parcel counts.
3. **Processed all 2.6M active parcels** in ~50 seconds (M-series Mac)
4. **Computed LGA-level stats**: median, mean, q25, q75, p10, p90 land sizes in m²
5. **Built land-size-service.js** — exposes `getLandSizeFactor()` and `getLandSizeForSuburb()`
6. **Integrated into valuation pipeline** — estimateFromSuburbMedian now uses Vicmap LGA
   median land size as the primary land size reference (vs DB comparable median as fallback)

## Key observations

- **Median land sizes** by LGA are data-driven and consistent with expectations:
  - Inner Melbourne (Melbourne/Port Phillip/Yarra) have large median values due to 
    commercial/industrial parcels, not suitable for residential-only adjustment
  - New growth LGAs (Wyndham 448m², Melton 419m², Casey 536m²) show smaller median lots
  - Established middle-ring (Boroondara 702m², Whitehorse 602m², Monash 652m²)
  - Outer east (Knox 721m², Manningham 931m², Nillumbik 924m²) have larger lots

## Limitations

1. **Melbourne/Port Phillip/Yarra medians inflated by non-residential parcels** — 
   CBD and inner-city commercial/parks/LGA property increases the mean. 
   For apartment/subject in these LGAs, consider clipping to more realistic residential
   range in a future version.

2. **Suburb→LGA mapping is static** — stored in land-size-service.js. 
   Should be replaced by DB-driven lookup when suburb_sa2_map is enriched with LGA info.

3. **No parcel-level geometry stored** after processing — only LGA aggregates.
   For suburb-level stats, would need the SA1/SA2 boundary polygon layer.

## Output files

- `data/vicmap/lga_land_size.json` — LGA-level stats (36 LGAs with useful data)
- `data/vicmap/lga_code_raw_counts.json` — Per-code validation counts
- `data/vicmap/lga_code_mapping.json` — Code → LGA name mapping
- `lib/land-size-service.js` — API for valuation engine
- `scripts/process-vicmap-v2.py` — Processing script (Python, pyshp + pyproj)
