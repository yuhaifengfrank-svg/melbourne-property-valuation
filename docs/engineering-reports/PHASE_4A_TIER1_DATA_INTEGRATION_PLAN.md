# Phase 4A — Tier 1 Data Integration Plan

**Prepared**: 2026-06-09
**Author**: 玄甲
**Status**: Plan only — no implementation yet

---

## Overview

Three highest-priority Tier 1 data sources for upgrading suburb intelligence:

| # | Source | Data Type | Current Gap | Impact Area |
|---|--------|-----------|-------------|-------------|
| 1 | G45 Dwelling Counts | Census dwelling structure by bedrooms | Population estimate uses Tot_P_P / 2.5 proxy | Population Score + Supply Constraint Score |
| 2 | SALM SA2 Labour Market | Quarterly labour force estimates | Only Census 2021 snapshots, no trend | Economic/Income Score → overall confidence |
| 3 | VPA Precinct Boundaries | Development precinct GIS data | No forward-looking supply metrics | Supply Constraint Score + Infrastructure Score |

Each source analysis below follows the same structure.

---

## 1. G45 — Dwelling Structure by Number of Bedrooms

### Source URL
```
https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA2_for_VIC_short-header.zip
```
(Also available individually as `2021Census_G45_VIC_SA2.csv` inside the ZIP)

### Access Method
- **Free download** — same ABS GCP datapack ZIP already downloaded in Phase 1E (12.3 MB)
- ZIP contains 119 CSV files; G45 is one of them
- Pattern identical to G01/G46a/G46b loaders already in project
- Process: `wget` or `curl` → unzip → CSV parse → `pg` Pool INSERT/UPDATE

### File Format
- **CSV** — 2 header rows + data rows
- Columns: `SA2_CODE`, `SA2_NAME`, plus ~60 dwelling-type × bedroom combinations
- ABS coding: `G45_` prefix with cell references like `G45_1_1` (Separate house, 1 bedroom count)
- Approximately 525 rows for VIC SA2s

### Target Database Table
```
census_sa2_data
  └─ new column: g45_data JSONB
```

**Migration SQL:**
```sql
ALTER TABLE census_sa2_data ADD COLUMN IF NOT EXISTS g45_data JSONB;
```

### Mapping Method
- **SA2 code**: Direct match on `sa2_code` (same 9-digit ABS code)
- Already works via existing `census-service.js` bridge: suburb → `school_locations.sa2_code` → `census_sa2_data`

### Fields to Import (into JSONB)

**Raw counts (per SA2):**
| ABS Cell | Description | Example code |
|----------|-------------|-------------|
| `G45_1_1` | Separate house — 1 bedroom | Count of 1-br detached houses |
| `G45_1_2` | Separate house — 2 bedrooms | |
| `G45_1_3` | Separate house — 3 bedrooms | |
| `G45_1_4` | Separate house — 4+ bedrooms | |
| `G45_2_1` | Semi-detached — 1 bedroom | |
| `G45_2_2` | Semi-detached — 2 bedrooms | |
| `G45_2_3` | Semi-detached — 3 bedrooms | |
| `G45_2_4` | Semi-detached — 4+ bedrooms | |
| `G45_3_1` | Flat/apartment — 0 bedrooms (studio) | |
| `G45_3_2` | Flat/apartment — 1 bedroom | |
| `G45_3_3` | Flat/apartment — 2 bedrooms | |
| `G45_3_4` | Flat/apartment — 3 bedrooms | |
| `G45_3_5` | Flat/apartment — 4+ bedrooms | |
| `G45_4` | Other dwelling | Caravans, cabins, houseboats |
| `G45_5` | Not stated | |

### Fields to Calculate (derived metrics)

| Derived Field | Formula | Use |
|--------------|---------|-----|
| `total_dwellings` | Sum of all dwelling counts | Replace current `Tot_P_P / 2.5` proxy |
| `pct_separate_house` | (G45_1 total) / total_dwellings × 100 | Housing density indicator |
| `pct_medium_density` | (G45_2 total) / total_dwellings × 100 | Townhouses, duplexes |
| `pct_high_density` | (G45_3 total) / total_dwellings × 100 | Apartments, flats |
| `pct_small_dwellings` | (G45_*_1 + G45_*_2) / total_dwellings × 100 | 0-2 bed dwellings |
| `pct_large_dwellings` | (G45_1_4 + G45_2_4 + G45_3_5) / total_dwellings × 100 | 4+ bed dwellings |
| `avg_bedrooms_per_dwelling` | Weighted average of bedrooms | Housing size profile |
| `pct_studio` | G45_3_1 / G45_3 total × 100 | Micro-living indicator |
| `dwelling_diversity_index` | 1 - Σ(p_i²) where p_i = dwelling type share | Housing mix diversity (0-1) |

### Confidence Impact

| Signal | Influence |
|--------|-----------|
| Replace proxy dwelling count with real data | ✅ **Small positive** to **Population Score** confidence |
| Housing type distribution (vs default assumption) | ✅ **Medium positive** to **Supply Constraint Score** confidence |
| New derived fields validate against existing data | ✅ **Small positive** to **Overall Confidence** |
| No new external data source risk | N/A — same ABS Census, already loaded |

### Expected Effect on Scores

#### Population Score (+2–5 pts for most suburbs)
- **Before**: Dwellings estimated as `Tot_P_P / 2.5` (Census G01 persons count divided by 2.5)
- **After**: Real dwelling count from G45
- Impact: In suburbs where actual dwellings ≠ persons/2.5 (e.g. student areas with high person-per-dwelling, or affluent areas with large homes), the population density metrics become accurate
- Effect: **+0–3 pts** for most suburbs, **+3–8 pts** for areas with unusual household structures

#### Supply Constraint Score (+3–8 pts)
- **Before**: No housing type data — supply constraint based only on vacancy rates + growth corridors
- **After**: Housing type distribution available:
  - High % separate house → **upward constraint** (land-intensive, harder to supply)
  - High % medium/high density → **downward constraint** (easier to add density)
  - Low avg bedrooms → indicates dense area, lower constraint
- Effect: **+3–8 pts** for suburbs with predominantly detached housing, **0 to -3** for high-density suburbs

#### Infrastructure Score
- Minimal direct effect — housing mix doesn't directly measure infrastructure
- **Indirect**: Better dwelling counts → better population estimates → better infrastructure demand modeling

#### Overall Confidence
- **+1–3 pts** — replaces proxy with ground truth; small but universal improvement

### Implementation Effort

| Stage | Time | Description |
|-------|------|-------------|
| Download + parse | ~10 min | Same pattern as existing G01 loader |
| DB migration | ~5 min | Add `g45_data` column |
| Validate | ~5 min | Check row counts, sample cross-reference |
| Factor integration | ~30 min | Update `census-service.js` + `factor-breakdown.js` |
| Test | ~10 min | Re-score 5 suburbs, diff against baseline |
| **Total** | **~1 hour** | |

### Risks

| Risk | Mitigation |
|------|------------|
| ZIP no longer available at same URL | ABS is stable; can use DataLab API as fallback |
| Cell naming differs from expectation | Check ABS G45 metadata doc first; dump raw CSV sample |
| SA2 coverage gap | SAL-level coverage is better than SA2; but existing SA2 G01 covers 524/524 |
| Existing g01 dwell proxy inconsistency | G45 totals may differ slightly; use G45 as ground truth, drop proxy |

---

## 2. SALM — SA2 Labour Market Estimates

### Source URL
```
https://www.dewr.gov.au/download/16930/salm-smoothed-sa2-datafiles-asgs-2021-december-quarter-2024/39893/salm-smoothed-sa2-datafiles-asgs-2021-december-quarter-2024/csv
```
(CSV — 2.3 MB, updated quarterly; December 2024 is latest available; March 2026 due June 2026)

Also available:
```
https://www.dewr.gov.au/download/16930/salm-smoothed-sa2-datafiles-asgs-2021-december-quarter-2024/39894/salm-smoothed-sa2-datafiles-asgs-2021-december-quarter-2024/xlsx
```
(XLSX — 2.1 MB)

### Access Method
- **Free download** from DEWR (Dept of Employment and Workplace Relations)
- No API key required
- Direct HTTPS download (curl/wget)
- Quarterly releases: subscribe to SALM mailing list or crawl /resources/ page
- Available at SA2 and LGA levels
- Two variants: **Smoothed** (recommended) and **Unsmoothed**

### File Format
- **CSV** — ~7,010 rows (national), 2.3 MB
- 3 data items × 2,337 SA2s
- Columns: `Data Item`, `SA2 Name`, `SA2 Code (2021 ASGS)`, `Dec-10` through `Dec-24` (57 quarterly columns)
- **VIC coverage**: 510 SA2s (all 3 metrics available)
- Data items:
  - `Smoothed labour force (persons)`
  - `Smoothed unemployment (persons)`
  - `Smoothed unemployment rate (%)`

### Target Database Table

Need new table — SALM is not Census data, it's quarterly time series.

```
salm_sa2_data
├── sa2_code        TEXT PRIMARY KEY
├── sa2_name        TEXT
├── latest_quarter  TEXT          -- e.g. 'Dec-24'
├── latest_labour_force   INTEGER -- Dec-24 smoothed labour force
├── latest_unemployed     INTEGER -- Dec-24 smoothed unemployed
├── latest_unemp_rate     REAL    -- Dec-24 smoothed unemployment rate
├── historical_data       JSONB   -- { 'Dec-10': { lf, unemp, rate }, ... }
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

Or alternatively add to `census_sa2_data` as a JSONB column `salm_data`.

### Mapping Method
- **SA2 code**: Direct match via 9-digit `SA2 Code (2021 ASGS)` column
- 510 of ~524 VIC SA2s covered (97%+)
- Missing SA2s are small-population areas where LFS sample wasn't large enough
- For missing SA2s: use nearest-neighbor or SA3 average as fallback

### Fields to Import

| Raw Field | Type | Source Column |
|-----------|------|--------------|
| `sa2_code` | TEXT | SA2 Code (2021 ASGS) |
| `sa2_name` | TEXT | SA2 Name |
| `labour_force` | INTEGER | Smoothed labour force (persons) — Dec-24 |
| `unemployed` | INTEGER | Smoothed unemployment (persons) — Dec-24 |
| `unemployment_rate` | REAL | Smoothed unemployment rate (%) — Dec-24 |
| All historical quarters | JSONB | Dec-10 through Sep-24 |

### Fields to Calculate

| Derived Field | Formula | Use |
|--------------|---------|-----|
| `employment` | labour_force - unemployed | Number of employed persons |
| `participation_rate_est` | labour_force / SA2_population_15plus × 100 | Estimated participation rate |
| `unemp_rate_trend` | Slope of unemp_rate over last 8 quarters | Labour market direction |
| `unemp_rate_yoy_change` | rate(Dec-24) - rate(Dec-23) | Year-on-year change |
| `unemp_rate_volatility` | Std dev of unemp_rate over last 12 quarters | Labour market stability |
| `relative_unemployment` | suburb_rate / VIC_average_rate | Compared to state average |

### Confidence Impact

| Signal | Influence |
|--------|-----------|
| Current (Dec-24) vs Census 2021 (Aug-21) — 3.5 years fresher | ✅ **Significant positive** to **Income/Employment** factor |
| Quarterly trend enables directional scoring | ✅ **Medium positive** to **Overall Confidence** |
| DEWR modelled estimates — not raw survey | ⚠️ Statistical uncertainty — use smoothed variant, apply confidence discount |
| 97% + SA2 coverage in VIC | ✅ Missing areas are low-population, accept SA3 fallback |

### Expected Effect on Scores

#### Overall Confidence (+5–15 pts for Income/Employment factor)

**Current state**: Employment metrics come from Census G46a+b (Aug 2021 — 5-year-old snapshot). SALM provides Dec-24 data — fresher by 3.5 years. This is the single biggest confidence gap in the current model.

| Suburb Type | Current G46 | SALM Dec-24 | Effect |
|-------------|-------------|-------------|--------|
| Post-COVID growth corridor (Werribee, Tarneit) | 2021 data — pre-boom | Dec-24 — includes boom | +15 pts |
| Stable inner suburb (Camberwell, Balwyn) | 2021 data — stable | Dec-24 — similar, validates | +5 pts |
| Regional with COVID disruption | 2021 data — mid-COVID | Dec-24 — post-COVID recovery | +10 pts |

#### Population Score
- Small indirect effect: employment drives migration patterns
- **+0–2 pts** where employment growth is strong

#### Infrastructure Score
- Indirect: stronger employment validates infrastructure demand estimates
- **+0–3 pts** for suburbs where SALM shows employment growth > 5% YoY

#### Supply Constraint Score
- No direct effect — employment doesn't constrain supply

### Implementation Effort

| Stage | Time | Description |
|-------|------|-------------|
| Download CSV + inspect | ~5 min | Single URL, 2.3 MB |
| Create migration | ~10 min | `salm_sa2_data` table or column |
| Write loader script | ~30 min | Parse CSV, filter VIC, upsert to DB |
| Map suburb → SA2 | ~5 min | Via existing `school_locations.sa2_code` |
| Integrate into scoring | ~1 hour | Update `census-service.js` + `factor-breakdown.js` |
| Validation | ~15 min | Compare G46 vs SALM for 5 suburbs |
| **Total** | **~2 hours** | |

### Risks

| Risk | Mitigation |
|------|------------|
| DEWR URL changes quarterly | Use stable page URL, not direct download; scrape latest from page |
| Modelled data ≠ ground truth | Use smoothed variant; don't rely on single quarter; take YoY context |
| Coverage gap (~3% SA2s) | SA3 fallback for missing SA2s |
| Mutual obligation suspension noise (COVID-era) | Exclude Sep-20 to Mar-22 quarters from trend calculations |
| No microdata — only aggregate | Can't derive more granular metrics; accept limitations |

---

## 3. VPA — Precinct Boundaries (Victorian Planning Authority)

### Source URL
```
https://data-planvic.opendata.arcgis.com
```
(ArcGIS Open Data portal — multiple download formats)

```
https://discover.data.vic.gov.au/dataset/vpa-precinct-boundaries
```
(data.vic.gov.au landing page)

Direct download (GeoJSON):
```
https://data-planvic.opendata.arcgis.com/datasets/planvic::vpa-precinct-boundaries.geojson
```
(or similar — check portal for current URL)

### Access Method
- **Free download** — open government data
- Multiple format options: GeoJSON, Shapefile, KML, CSV, ArcGIS REST API
- No API key needed
- Via data.vic.gov.au (CC BY 4.0 license) or VPA ArcGIS Open Data portal
- Can also query via ArcGIS REST API for spatial joins:
  - `https://services.planning.vic.gov.au/arcgis/rest/services/VPA/...`
- Update frequency: as new precincts are declared

### File Format
- **GeoJSON** or **Shapefile** — spatial polygon data
- Attributes per precinct:
  - `PRECINCT_NAME` — e.g. "Werribee West PSP"
  - `PRECINCT_CODE` — unique identifier
  - `TYPE` — PSP (Precinct Structure Plan), ICP (Infrastructure Contributions Plan), CDP (Development Plan)
  - `STATUS` — Current, Completed, Under Review, etc.
  - `PROJECT_CATEGORY` — Greenfield, Urban Renewal, Regional
  - `LEAD_AGENCY` — VPA, council, DTP
  - `GAZETTE_DATE` — when plan was gazetted (completed)
  - `AREA_HA` — precinct area in hectares
  - `WEBSITE_URL` — VPA project page
  - `GEOMETRY` — polygon boundary (GeoJSON format)

### Target Database Table

```
vpa_precincts
├── precinct_code    TEXT PRIMARY KEY
├── precinct_name    TEXT
├── type             TEXT               -- PSP / ICP / CDP …
├── status           TEXT               -- Current / Completed / Under Review
├── project_category TEXT               -- Greenfield / Urban Renewal / Regional
├── lead_agency      TEXT
├── gazette_date     DATE
├── area_ha          REAL
├── website_url      TEXT
├── geometry_geojson JSONB              -- polygon boundary (for spatial ops)
├── sa2_codes        TEXT[]             -- SA2 codes that intersect this precinct
├── suburb_names     TEXT[]             -- suburb names that intersect
├── created_at       TIMESTAMP
└── updated_at       TIMESTAMP
```

Second table for suburb-to-precinct mapping:

```
suburb_precinct_map
├── suburb_name      TEXT
├── sa2_code         TEXT
├── precinct_code    TEXT
├── intersection_area_ha  REAL
├── pct_of_suburb    REAL               -- What % of the suburb is in this precinct
├── pct_of_precinct  REAL               -- What % of the precinct is in this suburb
├── created_at       TIMESTAMP
└── PRIMARY KEY (suburb_name, precinct_code)
```

### Mapping Method

**Option A — Server-side spatial join (recommended)**
1. Download GeoJSON file
2. Use Node.js `@turf/turf` library to compute intersects:
   - Load SA2 boundaries (we have them from ABS or Vicmap)
   - Load VPA precinct boundaries
   - For each SA2, compute which precincts intersect and the overlap area
3. Store results in `suburb_precinct_map`

**Option B — Manual table (fallback)**
- VPA precincts are named after suburbs they're in (e.g., "Werribee West PSP" → Werribee)
- Can create a lookup table from precinct metadata without spatial compute
- Less precise but zero GIS dependencies

### Fields to Import

| Field | Source | Type |
|-------|--------|------|
| Precinct code | PRECINCT_CODE | TEXT |
| Precinct name | PRECINCT_NAME | TEXT |
| Type | TYPE (PSP/ICP/CDP) | TEXT |
| Status | STATUS | TEXT |
| Category | PROJECT_CATEGORY | TEXT |
| Area (ha) | AREA_HA | REAL |
| Gazette date | GAZETTE_DATE | DATE |
| Website | WEBSITE_URL | TEXT |

### Fields to Calculate

| Derived Field | Formula | Use |
|--------------|---------|-----|
| `n_precincts` | COUNT precincts per suburb | Supply pipeline indicator |
| `precinct_area_pct` | SUM(intersection_area_ha) / suburb_area_ha × 100 | How much suburb is under planning |
| `has_active_psp` | Any precinct with STATUS='Current' AND TYPE='PSP' | Forward supply signal |
| `has_completed_psp` | Any precinct with STATUS='Completed' | Historical supply signal |
| `active_precinct_types` | ARRAY of distinct types | Development diversity |
| `nearest_completion_year` | MAX(GAZETTE_DATE where TYPE='PSP') | How recent was last major plan |
| `greenfield_precinct_area` | SUM(area_ha where CATEGORY='Greenfield') | New land release pipeline |
| `renewal_precinct_area` | SUM(area_ha where CATEGORY='Urban Renewal') | Infill development pipeline |
| `supply_pipeline_score` | Composite: n_precincts × has_active_psp × log(greenfield_area) | Forward supply indicator |

### Confidence Impact

| Signal | Influence |
|--------|-----------|
| Forward-looking supply (not just historical vacancy) | ✅ **Significant positive** to **Supply Constraint Score** |
| Spatial data requires GIS processing | ⚠️ Medium risk — @turf intersection on 110 precincts × 524 SA2s is ~57k operations, feasible |
| Only VIC — not applicable to other states | ✅ Acceptable — Phase 1 is VIC-only |
| Attribute completeness varies | ⚠️ Some precincts missing area/gazette date; handle nullable |

### Expected Effect on Scores

#### Supply Constraint Score (+5–20 pts for growth corridor suburbs)

| Suburb Type | Current Score | VPA Signal | Expected Change |
|-------------|--------------|------------|-----------------|
| Growth corridor (Werribee, Tarneit, Mickleham) | ~45–55 | Many active PSPs → high forward supply = lower constraint | **-10 to -15** (more supply = less constraint = different scoring direction) |
| Urban renewal (Fishermans Bend, Footscray) | ~60–70 | Active ICP/CDP → significant infill supply | **-5 to -10** |
| Established suburb no precincts (Camberwell, Brighton) | ~70–80 | No precincts → no new supply → higher constraint | **+0** (no change) |
| Regional (Ballarat, Bendigo, Geelong) | ~55–65 | Some PSPs, smaller scale | **-3 to -8** |

*(Note: "Constraint" means upward pressure on prices from limited supply. More precincts = more supply = lower constraint = lower supply score. Direction depends on how factor-breakdown.js uses the raw metric.)*

#### Infrastructure Score (+3–10 pts)
- Precincts with completed gazette dates indicate infrastructure has been committed
- Greenfield PSPs = planned infrastructure (transport, schools, water, etc.)
- Effect: **+3–10 pts** for suburbs with recently completed or active precincts

#### Population Score (+2–5 pts)
- Precincts with large greenfield areas → future population growth
- Completed precincts → recent population growth
- Effect: **+2–5 pts** for growth corridor suburbs

#### Overall Confidence (+2–5 pts)
- Forward-looking supply data fills a gap (current model uses only historical vacancy)
- **+2–5 pts** for suburbs with precinct data

### Implementation Effort

| Stage | Time | Description |
|-------|------|-------------|
| Download GeoJSON | ~5 min | Find correct URL, verify format |
| Install @turf/turf | ~5 min | `npm install @turf/turf` |
| Load SA2 boundaries | ~10 min | Download ABS SA2 GeoJSON (if not cached) |
| Spatial join script | ~45 min | Intersect 110 precincts with 524 SA2s |
| Create DB tables | ~10 min | Migration for vpa_precincts + suburb_precinct_map |
| Populate tables | ~10 min | Insert results from spatial join |
| Map suburb → precinct | ~5 min | Via existing sa2_code → suburb bridge |
| Integrate into scoring | ~45 min | Update supply + infrastructure scorers |
| Validation | ~15 min | Check 10 suburbs manually (Werribee, Tarneit, etc.) |
| **Total** | **~2.5 hours** | |

### Risks

| Risk | Mitigation |
|------|------------|
| ArcGIS URL changes | Use data.vic.gov.au permalink as stable reference |
| @turf/turf computation heavy | Pre-compute, store results, never run at runtime |
| Precinct boundaries cross SA2 boundaries | That's expected — compute intersection percentages |
| Some precinct data stale (last updated Jan 2022) | Acceptable — precinct changes are slow (years); supplement with manual updates |
| No VPA data for non-growth suburbs | That's the signal: no precinct = no forward supply = higher constraint |
| Spatial join precision issues | Use boolean grid simplify for intersection; tolerate ±5% area error |

---

## Implementation Priority Matrix

| Source | Value | Effort | Risk | Priority |
|--------|-------|--------|------|----------|
| **SALM** 🔄 | Labour market data fresher by 3.5 years | ~2h | Low | **#1** |
| **G45** 🏠 | Replaces proxy dwelling count | ~1h | Very Low | **#2** |
| **VPA** 🗺️ | Forward-looking supply pipeline | ~2.5h | Medium | **#3** |

### Recommended Order

1. **SALM first** — biggest confidence impact (3.5-year freshness gap), easiest to implement, lowest risk
2. **G45 next** — quickest win (1 hour, uses same pattern as existing loaders, same dataset already cached)
3. **VPA last** — highest value for supply scoring but requires spatial processing; use Option B (manual lookup) as MVP

### Estimated Total Timeline
- **SALM**: 2 hours → implement on Day 1
- **G45**: 1 hour → implement on Day 1 (same session as SALM)
- **VPA**: 2.5 hours → implement on Day 2 (spatial join + scoring integration)

**Total**: ~5.5 hours if batched, or 2 focused sessions.

---

## Cross-Source Interaction

| Interaction | Sources | Effect |
|-------------|---------|--------|
| G45 dwelling count + SALM labour force | Enables accurate **people-per-dwelling ratio** + **employment density** | Better population estimates |
| VPA precincts + SALM employment growth | Can correlate forward supply with labour demand | Better growth projections |
| G45 housing mix + VPA precinct type | If precinct is high-density (renewal), municipality already has high-rise zoning — validates | Better supply constraint calibration |

All three sources integrate orthogonally — no circular dependencies, each can be deployed independently.

---

## Success Criteria

After all 3 sources are integrated:
1. Population Score: dwelling count no longer uses proxy — verified against 5 suburbs
2. Supply Constraint Score: incorporates both housing mix (G45) and forward supply pipeline (VPA)
3. Income/Employment Score: uses Dec-24 labour data, not Aug-21 Census snapshot
4. Overall Confidence: measurable improvement for all 248 suburbs, especially growth corridors

---

*End of Phase 4A plan. Ready for review before implementation.*
