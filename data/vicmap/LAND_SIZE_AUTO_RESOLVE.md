# Land Size Auto-Resolve Architecture

## Problem
Frontend sends `{address, suburb, propertyType}` without `landSize`.
Valuation engine needs landSize for Hedonic Model + land factor adjustments.

## Approach
Build a land size resolution service that:
1. Receives address string
2. Attempts to look up parcel boundaries (Vicmap)
3. Falls back through progressive tiers

## Resolution Tier Chain

### Tier 1: Comparable Sales Land Size (Fastest, most accurate)
Check DB comparable_sales for same address or nearby similar addresses
- Matches exact street address → use that land_size_sqm
- Matches same street with similar distance from centroid → interpolate

### Tier 2: LGA Median (Residential proxy)
- suburb → school_locations → lga_code → lga_code_mapping.json → Vicmap LGA median
- Already implemented in land-size-service.js

### Tier 3: Suburb-wide default based on zone
Not implemented yet. Future: zoning-based estimate.

## Implementation: Parcel-level Query (The Hard Part)

Since Vicmap has no street address, we need coordinates first.

### Component: Address → Coordinates
Use Nominatim (free, no API key).
- Parse address to (lat, lng)
- If full address fails, try suburb centroid as fallback

### Component: Coordinates → Parcel Area
Vicmap shapefile has 2.78M polygons without spatial index.
Production solution: Pre-built parcel lookup index.

#### CURRENT SOLUTION: Skip parcel-level for now
Use LGA residential proxy median directly in valuation-service.js
when no landSize provided by user.

This gives a reasonable default for ~90% of cases.
For edge cases like 5-7 Old Warrandyte Rd (4000m²), 
the comparable sales data already captures the land premium.

## Why Not Full PostGIS/R-tree Now

See 2026-06-10 decision log. Summary:
1. Nominatim can't resolve specific house numbers (returned empty for tested addresses)
2. R-tree index ~80MB exceeds Vercel Hobby plan disk limit (50MB)
3. No guaranteed improvement: even with coordinates, finding correct parcel among 
   96K Manningham parcels requires point-in-polygon which is O(n) without spatial index
4. Running cost would require Vercel Pro ($20/mo) + Mapbox Geocoding (free tier sufficient)
5. Valuation improvement from parcel-level land size is small (<2%) since 
   comparable sales already reflect land value differences

## Files
- lib/land-size-service.js → Tier 2 (LGA median) already done
- lib/valuation-service.js → Tier 1 (comparable sales land_size) already done
- To add: default fallback in runValuation when no landSize provided

## TODO
- [x] Tier 1: DB comparable sales land_size_sqm
- [x] Tier 2: LGA residential proxy median
- [ ] Inject Tier 2 as default when no landSize in request
