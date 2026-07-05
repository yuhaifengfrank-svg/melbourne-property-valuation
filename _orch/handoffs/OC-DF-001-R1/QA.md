# OC-DF-001-R1 — Quality Assurance

## Verification Queries (Live Production, 2026-06-30 17:38)

| Query | Result | Status |
|-------|--------|--------|
| `SELECT state, COUNT(*) FROM suburb_metrics GROUP BY state` | VIC=247, NSW=1 | ✅ |
| `SELECT suburb FROM suburb_metrics WHERE state='NSW'` | "sans souci" | ✅ |
| `VIC: poi_total_count IS NOT NULL` | 247/247 | ✅ |
| `VIC: crime_total_count IS NOT NULL` | 247/247 | ✅ |
| `VIC: uv_score_v4 IS NOT NULL` | 245/247 | ✅ (Docklands, Southbank missing) |
| `SELECT COUNT(*) FROM council_registry` | 79 | ✅ |
| `SELECT COUNT(*) FROM council_metrics` | 237 | ✅ |
| `SELECT COUNT(*) FROM vhr_zones` | 2680 | ✅ |
| `SELECT pg_database_size(current_database())` | 99 MB | ✅ |

## Licence Verification

| Source | URL Tested | Licence Found | Result |
|--------|-----------|--------------|--------|
| acara.edu.au | /contact-us/copyright | CC BY 4.0 (website content, with exceptions) | ✅ |
| crimestatistics.vic.gov.au | /copyright | CC BY 3.0 AU | ✅ |
| vic.gov.au | /copyright | CC BY 4.0 | ✅ |
| discover.data.vic.gov.au (VBA) | dataset page | CC BY 4.0 | ✅ |
| discover.data.vic.gov.au (VGV) | dataset page | CC BY 4.0 | ✅ |
| discover.data.vic.gov.au (CSA) | N/A (uses crimestatistics.vic.gov.au) | CC BY 3.0 AU | ✅ |
| dffh.vic.gov.au | /rental-report /about-us/website-terms-use | 404 — no licence found | ❌ Restricted |
| land.vic.gov.au | /valuergeneral-victoria | Cloudflare 403 | ⚠️ Inferred from Data.Vic |

## Checksums

- VBA raw XLSB file: `20260763-Rawdata-March-2026.xlsb` — stored locally only
- Archives verified: OC-DF-000, OC-DF-001, CX-DF-001, OC-DF-001-R1 handoff directories complete

## Tests

All verification queries passed with no failures. No transformation or ingestion in this task.
