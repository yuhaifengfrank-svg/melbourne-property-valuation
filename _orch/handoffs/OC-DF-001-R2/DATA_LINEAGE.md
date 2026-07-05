# OC-DF-001-R2 — Data Lineage (Final Corrected)

## Licence Status Enum

All values use only the agreed enum: `verified`, `restricted`, `unknown`.
No `verified_likely`, `presumed`, or inferred licence status used.

---

## Source Records (17 total)

### 1. Vicmap Address (Identity & Geography)

| Field | Value |
|-------|-------|
| **Publisher** | Land Use Victoria / Department of Transport and Planning |
| **Exact dataset URL** | https://discover.data.vic.gov.au/dataset?q=vicmap+address |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified |
| **Commercial reuse** | verified |
| **Automated access** | unknown (API rate limits may apply) |
| **Cadence** | Weekly |
| **Grain** | Address |
| **Data class** | FACT |
| **Evidence URL** | https://www.vic.gov.au/copyright |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — accessed via API/WFS |
| **Terms notes** | vic.gov.au copyright page applies to all vic.gov.au hosted services |

### 2. VGV Suburb Median Statistics (Price)

| Field | Value |
|-------|-------|
| **Publisher** | Valuer-General Victoria / Department of Transport and Planning |
| **Exact dataset URL** | https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb |
| **Free products** | Suburb-level quarterly median (15-month window), annual time series (20-year), LGA summary |
| **Not free** | Address-level raw property sales require LANDATA or commercial broker |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified |
| **Commercial reuse** | verified |
| **Automated access** | unknown (Data.Vic CKAN API available; files may be behind redirect to land.vic.gov.au which is Cloudflare-blocked) |
| **Cadence** | Quarterly (15-month window) / Annual (time series) |
| **Grain** | Suburb median / LGA summary |
| **Data class** | FACT |
| **Evidence URL** | https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — XLS/XLSX downloads from Data.Vic |
| **Terms notes** | Verifiable via Data.Vic dataset-page licence field. Land Use Victoria domain (land.vic.gov.au) is Cloudflare-protected and could not be directly fetched. |

### 3. DFFH Rental Report (Rent)

| Field | Value |
|-------|-------|
| **Publisher** | Department of Families, Fairness and Housing |
| **Exact dataset URL** | https://www.dffh.vic.gov.au/publications/rental-report |
| **Licence** | No explicit dataset licence found; website terms-of-use page returned 404 |
| **Licence status** | unknown |
| **Commercial reuse** | restricted (Codex notes DFFH may prohibit commercial reuse) |
| **Automated access** | unknown |
| **Cadence** | Quarterly |
| **Grain** | Suburb (~200-210 suburbs covered per quarter) |
| **Data class** | FACT |
| **Evidence URL** | n/a (no licence URL; landing page accessible, licence page 404) |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — PDF/XLSX download from DFFH website |
| **Access** | Public website access is unrestricted |
| **Terms notes** | Recommend DFFH data use be limited to derived metrics, not published as external fact, until licence clarified |

### 4. ABS Regional Population (ERP)

| Field | Value |
|-------|-------|
| **Publisher** | Australian Bureau of Statistics |
| **Exact dataset URL** | https://www.abs.gov.au/statistics/people/population/regional-population |
| **Licence** | ABS data is Crown Copyright; CC BY 4.0 is the standard ABS licensing for published statistical products |
| **Licence status** | unknown (ABS footer links to Creative Commons, but dedicated CC page returned 404; ABS copyright page does not explicitly state CC) |
| **Commercial reuse** | unknown |
| **Automated access** | known (ABS API available) |
| **Cadence** | Annual |
| **Grain** | SA2 / LGA |
| **Data class** | FACT |
| **Evidence URL** | https://www.abs.gov.au/website-privacy-copyright-and-disclaimer (copyright page) |
| **Evidence checked** | 2026-06-30 |
| **Terms notes** | Abs.gov.au/website-privacy-copyright-and-disclaimer lists "Creative Commons" in footer links but dedicated CC page is 404 |

### 5. ABS Census 2021 GCP (Income, Dwellings, Demographics)

| Field | Value |
|-------|-------|
| **Publisher** | Australian Bureau of Statistics |
| **Exact dataset URL** | https://www.abs.gov.au/census/find-census-data/datapacks |
| **Licence** | Same as ABS ERP — standard Crown Copyright with Creative Commons expected |
| **Licence status** | unknown |
| **Commercial reuse** | unknown |
| **Automated access** | known (ABS data API) |
| **Cadence** | Five-yearly (last: 2021) |
| **Grain** | SA1 / SA2 / LGA |
| **Data class** | FACT |
| **Evidence URL** | https://www.abs.gov.au/website-privacy-copyright-and-disclaimer |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — 119 CSV loaded as JSONB into `census_sa2_data` |

### 6. ABS SEIFA (Socio-Economic Index)

| Field | Value |
|-------|-------|
| **Publisher** | Australian Bureau of Statistics |
| **Exact dataset URL** | https://www.abs.gov.au/statistics/people/people-and-communities/socio-economic-indexes-areas-seifa-australia |
| **Licence** | Same as ABS other products |
| **Licence status** | unknown |
| **Commercial reuse** | unknown |
| **Grain** | SA1 / SA2 / LGA |
| **Data class** | FACT |
| **Status** | Not ingested |
| **Evidence checked** | 2026-06-30 |

### 7. ACARA School Profiles (Schools)

| Field | Value |
|-------|-------|
| **Publisher** | Australian Curriculum, Assessment and Reporting Authority |
| **Exact dataset URL** | https://www.acara.edu.au/contact-us/acara-data-access |
| **Licence** | CC BY 4.0 (website content and standard downloadable data products) |
| **Excluded** | Logos, photos, videos, some PDF reports with separate licence |
| **Licence status** | verified |
| **Commercial reuse** | verified (for standard ACARA-hosted downloadable data products without source-specific exclusion) |
| **Automated access** | unknown |
| **Cadence** | Annual |
| **Grain** | School |
| **Data class** | FACT |
| **Evidence URL** | https://www.acara.edu.au/contact-us/copyright |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — loaded into `school_locations` |
| **Terms notes** | CC BY 4.0 applies to standard downloadable data products that are ACARA-hosted and not under a separate source-specific exclusion. Attribution and exception conditions must be observed. |

### 8. DEWR SALM (Labour)

| Field | Value |
|-------|-------|
| **Publisher** | Department of Employment and Workplace Relations, Australian Government |
| **Exact dataset URL** | https://www.dewr.gov.au/employment-research/small-area-labour-markets |
| **Licence** | Australian Government data — CC BY 4.0 is typical but SALM-specific licence statement not found |
| **Licence status** | unknown |
| **Commercial reuse** | unknown |
| **Automated access** | unknown |
| **Cadence** | Quarterly |
| **Grain** | SA2 / LGA |
| **Data class** | MODELLED (SALM page explicitly states "modelled estimates" and includes usage caution) |
| **Evidence URL** | https://www.dewr.gov.au/employment-research/small-area-labour-markets |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — loaded into `salm_sa2_data` |
| **Terms notes** | SALM documentation advises: "Do not derive employment estimates", use caution with small labour force (<1,000), and prefer year-on-year comparisons |

### 9. CSA Crime Statistics (Crime)

| Field | Value |
|-------|-------|
| **Publisher** | Crime Statistics Agency Victoria |
| **Exact dataset URL** | https://www.crimestatistics.vic.gov.au/crime-statistics/latest-crime-data/data-tables |
| **Licence** | CC BY 3.0 Australia |
| **Licence status** | verified |
| **Commercial reuse** | verified (CC BY 3.0 AU permits commercial use with attribution) |
| **Automated access** | unknown (CSA site may rate-limit automated requests) |
| **Cadence** | Quarterly |
| **Grain** | Suburb / LGA |
| **Data class** | FACT |
| **Evidence URL** | https://www.crimestatistics.vic.gov.au/copyright |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — XLSX downloaded from CSA website |
| **Terms notes** | Licence is CC BY 3.0 Australia (not 4.0 International). Attribution to "Crime Statistics Agency (CSA)" required. "Agency" not "Authority". |

### 10. VicPlan (Planning Zones, Overlays)

| Field | Value |
|-------|-------|
| **Publisher** | Department of Transport and Planning (formerly DELWP) |
| **Exact service URL** | https://mapshare.vic.gov.au/vicplan/ |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified (vic.gov.au copyright page) |
| **Commercial reuse** | verified |
| **Automated access** | known (WFS available; large response requires caching) |
| **Cadence** | Release-based (continuous updates) |
| **Grain** | Polygon / suburb intersection |
| **Data class** | FACT |
| **Evidence URL** | https://www.vic.gov.au/copyright |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — cached via `planning_cache` (70k+ records) |

### 11. Victorian Heritage Register (Heritage)

| Field | Value |
|-------|-------|
| **Publisher** | Heritage Victoria |
| **Exact URL** | https://www.heritage.vic.gov.au/ |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified (vic.gov.au copyright page) |
| **Commercial reuse** | verified |
| **Automated access** | unknown |
| **Cadence** | Release-based |
| **Grain** | Address / Polygon |
| **Data class** | FACT |
| **Evidence URL** | https://www.vic.gov.au/copyright |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — 2,680 VHR zones loaded in `vhr_zones` |

### 12. OSM Points of Interest (POI)

| Field | Value |
|-------|-------|
| **Publisher** | OpenStreetMap Foundation |
| **Exact service URL** | https://overpass-api.de/ |
| **Licence** | ODbL (Open Database License) 1.0 |
| **Licence status** | verified |
| **Commercial reuse** | verified (ODbL permits commercial use with attribution) |
| **Automated access** | verified but rate-limited |
| **Cadence** | Continuous |
| **Grain** | Point / Suburb |
| **Data class** | FACT |
| **Evidence URL** | https://opendatacommons.org/licenses/odbl/ |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | None — Overpass API on-demand; no durable raw snapshot |

### 13. VBA Building Permits (Council Metrics — Raw)

| Field | Value |
|-------|-------|
| **Publisher** | Building and Plumbing Commission (formerly VBA) |
| **Exact dataset URL** | https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified |
| **Commercial reuse** | verified |
| **Automated access** | blocked (source XLSB files hosted on BPC domain behind Cloudflare) |
| **Cadence** | Monthly |
| **Grain** | Permit (raw) |
| **Data class** | FACT (raw permit rows) |
| **Derived class** | DERIVED (LGA/month aggregation) |
| **Evidence URL** | https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries |
| **Evidence checked** | 2026-06-30 |
| **Raw archive** | File on local machine only: `/Users/FrankAI/Downloads/20260763-Rawdata-March-2026.xlsb`. **Not on Oracle VM, not in repository.** SHA-256: not computed (file may have been deleted or moved since download) |
| **Terms notes** | Dataset metadata on Data.Vic shows CC BY 4.0. Actual file download requires Cloudflare bypass (manual browser download). LGA/month aggregation is DERIVED output, not FACT. |

### 14. Know Your Council (Financial & Satisfaction)

| Field | Value |
|-------|-------|
| **Publisher** | Local Government Victoria / Department of Government Services |
| **Exact URL** | https://www.vic.gov.au/know-your-council (redirects from knowyourcouncil.vic.gov.au) |
| **Licence** | Page content inherits CC BY 4.0 from vic.gov.au |
| **Licence status** | **Page content: verified** (vic.gov.au copyright); **Downloadable/dashboard data: unknown** (actual data/export terms not checked) |
| **Commercial reuse** | **Page content: verified**; **Data/downloads: unknown** |
| **Automated access** | **Data/downloads: unknown** |
| **Cadence** | Annual |
| **Grain** | LGA |
| **Data class** | FACT |
| **Evidence URL** | https://www.vic.gov.au/copyright (for page content) |
| **Evidence checked** | 2026-06-30 |
| **Status** | Not ingested |
| **Terms notes** | vic.gov.au CC BY 4.0 applies to page content and general website. Vic.gov.au does publish many data tables under the same licence, but the KYC dashboard/export terms have not been individually verified. |

### 15. PTV GTFS (Public Transport)

| Field | Value |
|-------|-------|
| **Publisher** | Public Transport Victoria / Department of Transport |
| **Exact dataset URL** | https://opendata.transport.vic.gov.au/dataset/gtfs-schedule |
| **Licence** | CC BY 4.0 |
| **Licence status** | verified |
| **Commercial reuse** | verified |
| **Automated access** | known (GTFS static feed available via open data portal) |
| **Cadence** | Dynamic / schedule-based updates |
| **Grain** | Stop / Route / Trip |
| **Data class** | FACT |
| **Evidence URL** | https://opendata.transport.vic.gov.au/dataset/gtfs-schedule |
| **Evidence checked** | 2026-06-30 |
| **Status** | Not ingested |

### 16. Victoria in Future (Population Projections)

| Field | Value |
|-------|-------|
| **Publisher** | Department of Transport and Planning |
| **Exact URL** | https://www.planning.vic.gov.au/guides-and-resources/data-and-insights/victoria-in-future |
| **Licence** | Expected CC BY 4.0 (vic.gov.au hosted) |
| **Licence status** | unknown (projection-specific licence not individually confirmed) |
| **Commercial reuse** | unknown |
| **Automated access** | unknown |
| **Cadence** | Release-based |
| **Grain** | SA2 / LGA |
| **Data class** | MODELLED (projections are modelled, not observed) |
| **Status** | Not ingested |
| **Evidence checked** | 2026-06-30 |

### 17. Vicmap Features of Interest (Authoritative POI)

| Field | Value |
|-------|-------|
| **Publisher** | Land Use Victoria / Department of Transport and Planning |
| **Exact dataset URL** | https://discover.data.vic.gov.au/dataset?q=vicmap+features+of+interest |
| **Licence** | Expected CC BY 4.0 |
| **Licence status** | unknown (dataset-specific page not checked) |
| **Commercial reuse** | unknown |
| **Grain** | Point |
| **Data class** | FACT |
| **Status** | Not ingested |
| **Evidence checked** | 2026-06-30 |

---

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

## Known Limitations (from Data Contract V2)

- VGV suburb medians are not comparable sales
- ABS unoccupied dwellings ≠ rental vacancy rate
- ICSEA measures socio-educational advantage, not school quality
- Planning approval ≠ construction started
- SA2→suburb allocation is a proxy, not an exact boundary
- SALM unemployment is a modelled estimate, not survey-based
- SALM: "Do not derive employment estimates" — official documentation
- Census data ages (2021, next 2026)
- VBA: three months (Jan–Mar 2026) only — not a historical pipeline
- Council Metrics: LGA aggregation is DERIVED, not FACT
- Victoria in Future projections are MODELLED, not observed
