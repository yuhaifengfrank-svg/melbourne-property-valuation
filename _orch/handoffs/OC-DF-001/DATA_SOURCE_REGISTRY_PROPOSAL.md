# OC-DF-001 — Proposed Data Source Registry

**Agent:** OpenClaw  
**Prepared:** 2026-06-30 17:00 (Australia/Melbourne)  
**Branch:** `deploy/oracle-artifacts`  
**Status:** Reviewable artifact — NOT written to database

**Reference contract:** `docs/data/SUBURB_INTELLIGENCE_DATA_CONTRACT_V2.md`  
**Related handoff:** `_orch/handoffs/OC-DF-000/`

## Proposed Schema for `data_source_registry`

```sql
CREATE TABLE IF NOT EXISTS data_source_registry (
  source_key       TEXT PRIMARY KEY,
  publisher        TEXT NOT NULL,
  url              TEXT,
  licence          TEXT,
  licence_url      TEXT,
  terms_notes      TEXT,
  cadence          TEXT,       -- e.g. "monthly", "quarterly", "annual", "release-based", "irregular"
  grain            TEXT,       -- e.g. "LGA", "suburb", "SA2", "address", "permit", "school"
  data_class       TEXT,       -- "FACT", "DERIVED_INPUT"
  raw_path_oracle  TEXT,       -- VM path for immutable raw downloads
  first_loaded     DATE,
  last_loaded      DATE,
  record_count     INTEGER,
  coverage_notes   TEXT,
  known_limitations TEXT,
  verified_by       TEXT DEFAULT 'OpenClaw',
  verified_at       TIMESTAMPTZ DEFAULT NOW(),
  requires_codex_review BOOLEAN DEFAULT TRUE
);
```

## Proposed Records

### 1. Vicmap Address (Identity & Geography)

| Field | Value |
|-------|-------|
| source_key | `vicmap_address` |
| publisher | Land Use Victoria / DELWP |
| url | https://www.land.vic.gov.au/vicmap |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Free for commercial use with attribution; weekly refresh via Data.Vic or subscription |
| cadence | Weekly |
| grain | Address |
| data_class | FACT |
| raw_path_oracle | Not on VM (accessed via Vicmap Address API or Data.Vic WFS) |
| coverage_notes | Full VIC address register; used for suburb→LGA mapping, address normalisation |
| known_limitations | API rate limits; bulk download requires subscription or scheduled Data.Vic extract |

### 2. VGV Property Sales (Price)

| Field | Value |
|-------|-------|
| source_key | `vgv_property_sales` |
| publisher | Valuer-General Victoria (VGV) / DELWP |
| url | https://www.land.vic.gov.au/valuergeneral-victoria |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Suburb median published quarterly; raw sales data available for download |
| cadence | Quarterly |
| grain | Suburb (median) / Property (raw sales) |
| data_class | FACT |
| raw_path_oracle | Not on VM (data accessed via monthly comparable_sales pipeline) |
| coverage_notes | All VIC suburb medians available; raw sales includes property-level records |
| known_limitations | Suburb medians are not comparable sales; multi-unit sales undercounted in some suburbs |

### 3. DFFH Rental Report (Rent)

| Field | Value |
|-------|-------|
| source_key | `dffh_rental_report` |
| publisher | Department of Families, Fairness and Housing (DFFH) |
| url | https://www.dffh.vic.gov.au/rental-report |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Published quarterly; available as PDF and XLSX |
| cadence | Quarterly |
| grain | Suburb |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | ~200-210 suburbs covered per quarter |
| known_limitations | Not all 3641 suburbs covered; new-letting counts available but not yet ingested; PDF-only for some history |

### 4. ABS Regional Population (ERP)

| Field | Value |
|-------|-------|
| source_key | `abs_regional_population` |
| publisher | Australian Bureau of Statistics |
| url | https://www.abs.gov.au/statistics/people/population/regional-population |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Annual estimated resident population by SA2 and LGA |
| cadence | Annual |
| grain | SA2 / LGA |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | All VIC SA2s |
| known_limitations | SA2→suburb mapping required for suburb-level estimates; not all suburbs map 1:1 to SA2 |

### 5. ABS Census 2021 (Income, Dwellings, Demographics)

| Field | Value |
|-------|-------|
| source_key | `abs_census_2021_gcp` |
| publisher | Australian Bureau of Statistics |
| url | https://www.abs.gov.au/census/find-census-data/datapacks |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | General Community Profile (GCP) data pack; five-yearly |
| cadence | Five-yearly (last: 2021, next: 2026) |
| grain | SA1 / SA2 / LGA |
| data_class | FACT |
| raw_path_oracle | 119 CSV files loaded as JSONB in census_sa2_data table |
| coverage_notes | 524 VIC SA2s; 9 core tables loaded (income, dwellings, tenure, rent, mortgage, household) |
| known_limitations | Census data ages quickly; 2021 field may not reflect current conditions; proxy values when mapped to suburb level |

### 6. ABS SEIFA (Socio-Economic Index)

| Field | Value |
|-------|-------|
| source_key | `abs_seifa` |
| publisher | Australian Bureau of Statistics |
| url | https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Release-based; SA1/SA2/LGA levels |
| cadence | Release-based (next: after 2026 Census) |
| grain | SA1 / SA2 / LGA |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | Not ingested yet |
| known_limitations | Five-yearly; IRSAD is a relative index, not a direct income measure |

### 7. ACARA School Profiles (Schools)

| Field | Value |
|-------|-------|
| source_key | `acara_school_profiles` |
| publisher | Australian Curriculum, Assessment and Reporting Authority |
| url | https://www.acara.edu.au/contact-us/acara-data-access |
| licence | Creative Commons Attribution 4.0 International (school profile data) |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | School-level data including ICSEA, enrolment, location; annual update |
| cadence | Annual |
| grain | School |
| data_class | FACT |
| raw_path_oracle | Not on VM (loaded into school_locations table) |
| coverage_notes | All VIC schools |
| known_limitations | ICSEA measures socio-educational advantage, not school quality or investment outcomes; location accuracy varies |

### 8. DEWR SALM (Labour)

| Field | Value |
|-------|-------|
| source_key | `dewr_salm` |
| publisher | Department of Employment and Workplace Relations |
| url | https://www.dewr.gov.au/small-area-labour-markets |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Small Area Labour Markets; SA2 level; quarterly |
| cadence | Quarterly |
| grain | SA2 |
| data_class | FACT |
| raw_path_oracle | Not on VM (loaded into salm_data table) |
| coverage_notes | All VIC SA2s |
| known_limitations | SA2→suburb mapping required; unemployment rate is modelled, not surveyed |

### 9. CSA Crime Data (Crime)

| Field | Value |
|-------|-------|
| source_key | `csa_crime_victoria` |
| publisher | Crime Statistics Authority (CSA) Victoria |
| url | https://www.crimestatistics.vic.gov.au/crime-statistics/latest-crime-data |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Quarterly data tables; LGA and suburb-level available |
| cadence | Quarterly |
| grain | Suburb / LGA |
| data_class | FACT |
| raw_path_oracle | Not on VM (loaded into suburb_metrics via scripts/import-csa-crime.mjs) |
| coverage_notes | 247/248 suburbs covered |
| known_limitations | Recorded crime only; not all incidents reported; small counts suppressed |

### 10. VicPlan (Planning Zones, Overlays, Heritage)

| Field | Value |
|-------|-------|
| source_key | `vicplan` |
| publisher | DELWP / Department of Transport and Planning |
| url | https://mapshare.vic.gov.au/vicplan/ |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | WFS and WMS available; planning scheme data |
| cadence | Release-based (continuous updates) |
| grain | Polygon / Suburb intersection |
| data_class | FACT |
| raw_path_oracle | Not on VM (Queries handled via planning_cache + ST_Contains) |
| coverage_notes | All VIC planning zones and overlays; 70k+ planning_cache records |
| known_limitations | WFS response large for statewide queries; cached by suburb centroid; not address-level individual property lookup |

### 11. Victorian Heritage Register (Heritage)

| Field | Value |
|-------|-------|
| source_key | `victorian_heritage_register` |
| publisher | Heritage Victoria |
| url | https://www.heritage.vic.gov.au/ |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | VHR register of heritage places; includes HO overlays from VicPlan |
| cadence | Release-based |
| grain | Address / Polygon |
| data_class | FACT |
| raw_path_oracle | Not on VM (2,680 VHR zones loaded in vhr_zones table) |
| coverage_notes | 2,680 VHR entries |
| known_limitations | HO (Heritage Overlay) via VicPlan may capture more local heritage than VHR; not all properties in HO are individually listed |

### 12. OSM Points of Interest (POI)

| Field | Value |
|-------|-------|
| source_key | `osm_poi_overpass` |
| publisher | OpenStreetMap Foundation |
| url | https://overpass-api.de/ |
| licence | ODbL (Open Database License) |
| licence_url | https://opendatacommons.org/licenses/odbl/ |
| terms_notes | Requires attribution; commercial use permitted; Overpass API has usage limits |
| cadence | Continuous (queried on demand) |
| grain | Point / Suburb |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | 247/248 suburbs covered; avg 32.9 POIs per suburb |
| known_limitations | Community-maintained; coverage varies by area; Overpass API rate limits; supplement for Vicmap Features of Interest |

### 13. VBA Building Permits (Council Metrics)

| Field | Value |
|-------|-------|
| source_key | `vba_building_permits` |
| publisher | Victorian Building Authority |
| url | https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Monthly summary data; raw permit data available from VBA/BPC |
| cadence | Monthly |
| grain | LGA (summarised from raw permits) |
| data_class | DERIVED (aggregated from raw permits) |
| raw_path_oracle | XLSB file at /Users/FrankAI/Downloads/, CSV at /tmp/vba-data/ |
| coverage_notes | 79/79 VIC LGAs × 3 months (Jan-Mar 2026) |
| known_limitations | Cloudflare blocks automated download; raw XLSB requires pyxlsb parser; Building Use/NOW classification is simplified; Port Philip vs Port Phillip and Queenscliff vs Queenscliffe naming discrepancies |

### 14. Know Your Council (Financial & Satisfaction)

| Field | Value |
|-------|-------|
| source_key | `know_your_council_vic` |
| publisher | State Government Victoria |
| url | https://knowyourcouncil.vic.gov.au/ |
| licence | TBC (public government data, presumed CC-BY) |
| licence_url | TBC |
| terms_notes | Not yet assessed |
| cadence | Annual |
| grain | LGA |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | Not yet ingested |
| known_limitations | Scraping needed; no bulk export found; rate income, population growth, debt ratio, satisfaction expected |

### 15. Transport Victoria GTFS (Public Transport)

| Field | Value |
|-------|-------|
| source_key | `ptv_gtfs` |
| publisher | Public Transport Victoria (PTV) / Department of Transport |
| url | https://www.ptv.vic.gov.au/about-ptv/data-and-reports/datasets/ |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Full GTFS feeds available; regularly updated |
| cadence | Dynamic (regular feed updates) |
| grain | Stop / Route / Trip |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | Not yet ingested |
| known_limitations | Large dataset; GTFS schedules (not real-time); stop→suburb mapping required |

### 16. Victoria in Future (Population/Dwelling Projections)

| Field | Value |
|-------|-------|
| source_key | `victoria_in_future` |
| publisher | Department of Transport and Planning (DELWP) |
| url | https://www.planning.vic.gov.au/guides-and-resources/data-and-insights/victoria-in-future |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Population, household and dwelling projections by SA2/LGA |
| cadence | Release-based |
| grain | SA2 / LGA |
| data_class | FACT (projections) |
| raw_path_oracle | Not on VM |
| coverage_notes | Known to exist; not yet ingested |
| known_limitations | Projections, not forecasts; multi-year release cycle; SA2→suburb mapping required |

### 17. Vicmap Features of Interest (Authoritative POI)

| Field | Value |
|-------|-------|
| source_key | `vicmap_features_of_interest` |
| publisher | Land Use Victoria |
| url | https://www.land.vic.gov.au/vicmap |
| licence | Creative Commons Attribution 4.0 International |
| licence_url | https://creativecommons.org/licenses/by/4.0/ |
| terms_notes | Government-authoritative POI; supplements OSM |
| cadence | Periodic |
| grain | Point |
| data_class | FACT |
| raw_path_oracle | Not on VM |
| coverage_notes | Not yet ingested; listed as alternative to OSM |
| known_limitations | Access method to be confirmed; may require Data.Vic download or API |

## Summary

| ID | Source | Data class | Coverage | Ingested? |
|----|--------|-----------|----------|-----------|
| 1 | Vicmap Address | FACT | Full VIC | Partial (used via API) |
| 2 | VGV Sales | FACT | All VIC suburbs | Yes (monthly) |
| 3 | DFFH Rentals | FACT | ~210 suburbs | Yes |
| 4 | ABS ERP | FACT | All SA2s | Yes |
| 5 | ABS Census 2021 | FACT | 524 SA2s | Yes (9 tables) |
| 6 | ABS SEIFA | FACT | Not ingested | No |
| 7 | ACARA Schools | FACT | All VIC schools | Yes |
| 8 | DEWR SALM | FACT | All SA2s | Yes |
| 9 | CSA Crime | FACT | 247/248 suburbs | Yes |
| 10 | VicPlan | FACT | All VIC | Yes (cached) |
| 11 | VHR Heritage | FACT | 2,680 entries | Yes |
| 12 | OSM POI | FACT | 247/248 suburbs | Yes |
| 13 | VBA Permits | DERIVED | 79/79 LGAs × 3mo | Yes |
| 14 | Know Your Council | FACT | Not ingested | No |
| 15 | PTV GTFS | FACT | Not ingested | No |
| 16 | Victoria in Future | FACT (projections) | Not ingested | No |
| 17 | Vicmap FOI | FACT | Not ingested | No |

## Next Steps

1. Codex review this artifact and validate source terms/licence claims
2. Create `data_source_registry` table via migration
3. Populate records (either from this artifact or Codex-revised version)
4. Proceed to D1 (Canonical Fact Layer) per data contract

## DO NOT

- Write this artifact to Production database without Codex review
- Deploy migration without approval
- Modify scoring, API, or frontend
