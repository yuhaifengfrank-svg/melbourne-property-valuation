# OC-DF-000 — Quality Assurance

## Commands Executed

| Purpose | Command | Result |
|---------|---------|--------|
| Git status | `git status --short --branch` | Confirmed branch, dirty files |
| Git log | `git log -5 --oneline --decorate` | Confirmed HEAD + history |
| Council registry | `SELECT COUNT(*) FROM council_registry` | 79 ✅ |
| area_km² | `SELECT COUNT(*) FROM council_registry WHERE area_km2 IS NOT NULL` | 79 ✅ |
| Council metrics | `SELECT COUNT(*) FROM council_metrics` | 237 ✅ |
| Council metrics MV | `SELECT COUNT(*) FROM council_metrics_12m` | 79 ✅ (concurrent refresh OK) |
| POI coverage | `SELECT COUNT(*) FROM suburb_metrics WHERE poi_total_count IS NOT NULL` | 247 ✅ |
| Crime coverage | `SELECT COUNT(*) FROM suburb_metrics WHERE crime_total_count IS NOT NULL` | 247 ✅ |
| UV V4 | `SELECT COUNT(*) FROM suburb_metrics WHERE uv_score_v4 IS NOT NULL` | 245 ✅ |
| VHR heritage | `SELECT COUNT(*) FROM vhr_zones` | 2680 ✅ |
| DB size | `pg_database_size()` | 99 MB |

## Counts Pass/Fail

All queries executed successfully. All coverage expectations met.

## Rejected Rows

None — no transformation or ingestion in this task.

## Data Quality

- POI: 1 suburb without POI (248 total, 247 populated)
- UV V4: 3 suburbs without score (245/248)
- All council-level data: 79/79 LGAs have registry, area_km², and 3 months of metrics
