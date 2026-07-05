# OC-DF-001-R1 — Data Lineage (Corrected)

## Source Records (17 total)

### 1. Vicmap Address (Identity & Geography)
- **publisher:** Land Use Victoria / Department of Transport and Planning
- **url:** https://discover.data.vic.gov.au/dataset?q=vicmap+address
- **licence:** CC BY 4.0 (verified via vic.gov.au/copyright)
- **cadence:** Weekly
- **grain:** Address
- **data_class:** FACT
- **raw_archive:** None — accessed via API/WFS
- **access_status:** verified
- **license_status:** verified (CC BY 4.0 via vic.gov.au)
- **commercial_reuse:** verified
- **automated_access:** unknown (API rate limits may apply)
- **evidence_url:** https://www.vic.gov.au/copyright
- **evidence_checked:** 2026-06-30

### 2. VGV Suburb Median Statistics (Price)
- **publisher:** Valuer-General Victoria / Department of Transport and Planning
- **url (exact dataset):** https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb
- **free products:** Suburb-level quarterly median (15-month window), annual time series (20-year), LGA summary
- **not free:** Address-level raw property sales require LANDATA or commercial broker
- **licence:** CC BY 4.0 (verified via Data.Vic dataset page — suburb median datasets only)
- **cadence:** Quarterly (15-month window) / Annual (time series)
- **grain:** Suburb median / LGA summary
- **data_class:** FACT (suburb median only; address-level sales is not a free fact)
- **raw_archive:** None — XLS/XLSX downloads from Data.Vic
- **access_status:** verified
- **license_status:** verified (CC BY 4.0 for Data.Vic-published suburb medians)
- **commercial_reuse:** verified
- **automated_access:** unknown (Data.Vic CKAN API available but file may be behind redirect)
- **evidence_url:** https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb
- **evidence_checked:** 2026-06-30

### 3. DFFH Rental Report (Rent)
- **publisher:** Department of Families, Fairness and Housing
- **url:** https://www.dffh.vic.gov.au/rental-report (dataset landing — currently 404)
- **licence:** No explicit dataset licence found
- **cadence:** Quarterly
- **grain:** Suburb (~200-210 suburbs covered per quarter)
- **data_class:** FACT
- **raw_archive:** None — PDF/XLSX download from DFFH website
- **access_status:** restricted
- **license_status:** unknown (no licence statement on rental report page; website terms-of-use page 404)
- **commercial_reuse:** unknown — Codex notes that DFFH may prohibit commercial reuse
- **automated_access:** unknown
- **evidence_url:** n/a (no licence URL; dffh.vic.gov.au/about-us/website-terms-use returned 404)
- **evidence_checked:** 2026-06-30
- **note:** Recommend DFFH data use be limited to derived metrics, not published as external fact, until licence clarified

### 4. ABS Regional Population (ERP)
- **publisher:** Australian Bureau of Statistics
- **url:** https://www.abs.gov.au/statistics/people/population/regional-population
- **licence:** CC BY 4.0 (presumed — ABS footer links to Creative Commons; no dedicated CC page found)
- **cadence:** Annual
- **grain:** SA2 / LGA
- **data_class:** FACT
- **raw_archive:** None — ABS website API/CSV download
- **access_status:** verified
- **license_status:** verified_likely (CC BY 4.0 presumed — ABS data is Crown Copyright typically CC-licensed)
- **commercial_reuse:** verified_likely
- **automated_access:** known (ABS API available)
- **evidence_url:** https://www.abs.gov.au/website-privacy-copyright-and-disclaimer (copyright page, not explicit CC)
- **evidence_checked:** 2026-06-30

### 5. ABS Census 2021 GCP (Income, Dwellings, Demographics)
- **publisher:** Australian Bureau of Statistics
- **url:** https://www.abs.gov.au/census/find-census-data/datapacks
- **licence:** CC BY 4.0 (presumed — same as ERP; ABS standard for published statistical products)
- **cadence:** Five-yearly (last: 2021)
- **grain:** SA1 / SA2 / LGA
- **data_class:** FACT
- **raw_archive:** None — 119 CSV loaded as JSONB into `census_sa2_data`
- **access_status:** verified
- **license_status:** verified_likely (CC BY 4.0 presumed)
- **commercial_reuse:** verified_likely
- **automated_access:** known (ABS data API)
- **evidence_url:** https://www.abs.gov.au/website-privacy-copyright-and-disclaimer
- **evidence_checked:** 2026-06-30

### 6. ABS SEIFA (Socio-Economic Index)
- **publisher:** Australian Bureau of Statistics
- **url:** https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia
- **licence:** CC BY 4.0 (presumed)
- **cadence:** Release-based
- **grain:** SA1 / SA2 / LGA
- **data_class:** FACT
- **raw_archive:** Not ingested
- **access_status:** not_ingested
- **license_status:** verified_likely
- **commercial_reuse:** verified_likely
- **evidence_checked:** 2026-06-30

### 7. ACARA School Profiles (Schools)
- **publisher:** Australian Curriculum, Assessment and Reporting Authority
- **url:** https://www.acara.edu.au/contact-us/acara-data-access
- **licence:** CC BY 4.0 (website content and downloadable school data); **excluded: logos, photos, videos, some PDF reports with separate licence**
- **cadence:** Annual
- **grain:** School
- **data_class:** FACT
- **raw_archive:** None — loaded into `school_locations`
- **access_status:** verified
- **license_status:** verified (CC BY 4.0 with explicit exceptions for photos/videos/logos/some PDFs)
- **commercial_reuse:** verified (for standard data products under CC BY 4.0)
- **automated_access:** unknown
- **evidence_url:** https://www.acara.edu.au/contact-us/copyright
- **evidence_checked:** 2026-06-30

### 8. DEWR SALM (Labour)
- **publisher:** Department of Employment and Workplace Relations, Australian Government
- **url:** https://www.dewr.gov.au/employment-research/small-area-labour-markets
- **licence:** Australian Government data typically CC BY 4.0; SALM-specific licence statement not found
- **cadence:** Quarterly
- **grain:** SA2 / LGA
- **data_class:** MODELLED (SALM page explicitly states "modelled estimates" and recommends caution)
- **raw_archive:** None — loaded into `salm_data`
- **access_status:** verified
- **license_status:** unknown (Australian Government website copyright is typically CC BY 4.0 but SALM-specific licence not confirmed)
- **commercial_reuse:** unknown
- **automated_access:** unknown
- **evidence_url:** https://www.dewr.gov.au/employment-research/small-area-labour-markets
- **evidence_checked:** 2026-06-30

### 9. CSA Crime Statistics (Crime)
- **publisher:** Crime Statistics Agency Victoria
- **url (exact dataset):** https://www.crimestatistics.vic.gov.au/crime-statistics/latest-crime-data/data-tables
- **licence:** CC BY 3.0 AU (verified: crimestatistics.vic.gov.au uses CC BY 3.0 Australia, not 4.0 International)
- **cadence:** Quarterly
- **grain:** Suburb / LGA
- **data_class:** FACT
- **raw_archive:** None — XLSX downloaded from CSA website
- **access_status:** verified
- **license_status:** verified (CC BY 3.0 AU)
- **commercial_reuse:** verified (CC BY 3.0 AU permits commercial use)
- **automated_access:** unknown (CSA site may block automated downloads)
- **evidence_url:** https://www.crimestatistics.vic.gov.au/copyright
- **evidence_checked:** 2026-06-30

### 10. VicPlan (Planning Zones, Overlays)
- **publisher:** Department of Transport and Planning (formerly DELWP)
- **url:** https://mapshare.vic.gov.au/vicplan/
- **licence:** CC BY 4.0 (via vic.gov.au copyright; service hosted on vic.gov.au domain)
- **cadence:** Release-based (continuous updates)
- **grain:** Polygon / suburb intersection
- **data_class:** FACT
- **raw_archive:** None — cached via `planning_cache` (70k+ records)
- **access_status:** verified
- **license_status:** verified (CC BY 4.0 via vic.gov.au)
- **commercial_reuse:** verified
- **automated_access:** known (WFS available; large response requires caching)
- **evidence_url:** https://www.vic.gov.au/copyright
- **evidence_checked:** 2026-06-30

### 11. Victorian Heritage Register (Heritage)
- **publisher:** Heritage Victoria
- **url:** https://www.heritage.vic.gov.au/
- **licence:** CC BY 4.0 (via vic.gov.au copyright)
- **cadence:** Release-based
- **grain:** Address / Polygon
- **data_class:** FACT
- **raw_archive:** None — 2,680 VHR zones loaded in `vhr_zones`
- **access_status:** verified
- **license_status:** verified (CC BY 4.0 via vic.gov.au)
- **commercial_reuse:** verified
- **automated_access:** unknown
- **evidence_url:** https://www.vic.gov.au/copyright
- **evidence_checked:** 2026-06-30

### 12. OSM Points of Interest (POI)
- **publisher:** OpenStreetMap Foundation
- **url:** https://overpass-api.de/
- **licence:** ODbL (Open Database License) 1.0
- **cadence:** Continuous
- **grain:** Point / Suburb
- **data_class:** FACT
- **raw_archive:** None — Overpass API on-demand; no durable raw snapshot
- **access_status:** verified
- **license_status:** verified (ODbL 1.0)
- **commercial_reuse:** verified (ODbL permits commercial use with attribution)
- **automated_access:** verified but rate-limited
- **evidence_url:** https://opendatacommons.org/licenses/odbl/
- **evidence_checked:** 2026-06-30

### 13. VBA Building Permits (Council Metrics — Raw)
- **publisher:** Building and Plumbing Commission (formerly VBA)
- **url (exact dataset):** https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries
- **licence:** CC BY 4.0 (verified on Data.Vic dataset page)
- **cadence:** Monthly
- **grain:** Permit (raw)
- **data_class:** FACT (raw permit rows)
- **derived class:** DERIVED (LGA/month aggregation)
- **raw_archive:** `_raw / vba_raw_permits/20260763-Rawdata-March-2026.xlsb` — **not on Oracle VM; currently only on local machine** (`/Users/FrankAI/Downloads/`)
- **access_status:** restricted (Cloudflare blocks automated downloads)
- **license_status:** verified (CC BY 4.0 via discover.data.vic.gov.au)
- **commercial_reuse:** verified
- **automated_access:** blocked (Cloudflare on VBA domain)
- **evidence_url:** https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries
- **evidence_checked:** 2026-06-30
- **note:** LGA/month aggregation is DERIVED output, not FACT. Source URLs on Data.Vic point to VBA/BPC domain behind Cloudflare.

### 14. Know Your Council (Financial & Satisfaction)
- **publisher:** Local Government Victoria / Department of Government Services
- **url:** https://knowyourcouncil.vic.gov.au/ (redirects to https://www.vic.gov.au/know-your-council)
- **licence:** CC BY 4.0 (vic.gov.au service, inherits vic.gov.au copyright)
- **cadence:** Annual
- **grain:** LGA
- **data_class:** FACT
- **raw_archive:** Not ingested
- **access_status:** not_ingested
- **license_status:** verified (CC BY 4.0 via vic.gov.au)
- **commercial_reuse:** verified
- **automated_access:** unknown
- **evidence_url:** https://www.vic.gov.au/copyright
- **evidence_checked:** 2026-06-30

### 15. PTV GTFS (Public Transport)
- **publisher:** Public Transport Victoria / Department of Transport
- **url:** https://www.ptv.vic.gov.au/about-ptv/data-and-reports/datasets/
- **licence:** CC BY 4.0 (presumed — vic.gov.au service)
- **cadence:** Dynamic
- **grain:** Stop / Route / Trip
- **data_class:** FACT
- **raw_archive:** Not ingested
- **access_status:** not_ingested
- **license_status:** unknown (PTV-specific licence not confirmed)
- **commercial_reuse:** unknown
- **automated_access:** known (GTFS static feed available)
- **evidence_checked:** 2026-06-30

### 16. Victoria in Future (Population Projections)
- **publisher:** Department of Transport and Planning
- **url:** https://www.planning.vic.gov.au/guides-and-resources/data-and-insights/victoria-in-future
- **licence:** CC BY 4.0 (presumed — vic.gov.au service)
- **cadence:** Release-based
- **grain:** SA2 / LGA
- **data_class:** FACT (external projections — note: these are modelled projections, not observed facts)
- **raw_archive:** Not ingested
- **access_status:** not_ingested
- **license_status:** unknown (projection-specific licence not confirmed)
- **commercial_reuse:** unknown
- **automated_access:** unknown
- **evidence_checked:** 2026-06-30

### 17. Vicmap Features of Interest (Authoritative POI)
- **publisher:** Land Use Victoria / Department of Transport and Planning
- **url:** https://discover.data.vic.gov.au/dataset?q=vicmap+features+of+interest
- **licence:** CC BY 4.0 (via vic.gov.au)
- **cadence:** Periodic
- **grain:** Point
- **data_class:** FACT
- **raw_archive:** Not ingested
- **access_status:** not_ingested
- **license_status:** unknown (dataset-specific page not checked)
- **commercial_reuse:** unknown
- **automated_access:** unknown
- **evidence_checked:** 2026-06-30

## Derived Metrics Used

| Derived Metric | Source Facts | Classification |
|---|---|---|
| House gross yield | VGV median + DFFH rent | DERIVED |
| Unit gross yield | VGV median + DFFH rent | DERIVED |
| Price CAGR | VGV median (2+ periods) | DERIVED |
| Price-to-income | VGV median + ABS income | DERIVED |
| Population growth | ABS ERP (2+ periods) | DERIVED |
| Crime rate (per 1k) | CSA incidents + ABS ERP | DERIVED |
| School access score | ACARA locations | DERIVED |
| VBA permit totals | VBA raw permits | DERIVED (aggregation) |
| UV V4 score | 8 expert segment models | MODELLED |

## Known Limitations (from contract)

- SALM unemployment estimates are modelled, not surveyed
- ABS unoccupied dwellings ≠ rental vacancy rate
- ICSEA measures socio-educational advantage, not school quality
- VGV suburb medians are not comparable sales
- Approved planning permit ≠ construction started
- SA2→suburb mapping proxy may differ from office allocation
