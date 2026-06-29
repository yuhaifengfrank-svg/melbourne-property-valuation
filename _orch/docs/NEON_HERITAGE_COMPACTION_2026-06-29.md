# Neon Heritage Compaction Record

**Executed:** 2026-06-29 (Australia/Melbourne)
**Environment:** Neon Production and Oracle VM raw storage
**Purpose:** Preserve exact Melbourne Heritage Overlay checks without restoring the full VicPlan Overlay table.

## Verified Starting State

- `vicplan_zones`: not present in Neon Production.
- `vicplan_overlays`: not present in Neon Production.
- Neon database size before the compact table: 92 MB.
- `planning_cache`: 70,207 rows, approximately 29 MB.
- `vhr_zones`: 2,680 rows, approximately 2.8 MB.
- The previously documented 248 MB VicPlan tables had already been removed; no drop operation was performed in this task.

## Compact Artifact

- Source: Victorian Government VicPlan WFS `plan_overlay`.
- Server-side filter: `zone_code LIKE 'HO%'` plus the AusHomeValue Melbourne service bounding box.
- Feature count: 14,942.
- Geometry type: MultiPolygon.
- Oracle path: `/home/ubuntu/raw/vicplan/heritage_overlays_melbourne.geojson`.
- Oracle artifact size: approximately 17 MB.

## Neon Result

- Table: `heritage_overlays`.
- Rows: 14,942.
- Invalid geometries: 0.
- Total relation size: approximately 6.5 MB.
- Database size after import: 99 MB.
- Indexes:
  - primary key on `pfi`;
  - GiST spatial index on `geom`;
  - B-tree index on `zone_code`.

## Verification

- Random `ST_PointOnSurface` lookup returned its expected HO polygon.
- Application service returned `flagged: true`, source `HO`, for a known point.
- A non-HO test point returned `flagged: false`.
- Full local regression suite: 112 passed, 0 failed.

## Reproducible Scripts

- `scripts/build-heritage-overlay-artifact.mjs`
- `scripts/import-heritage-overlays.mjs`

The import script defaults to dry-run. Production writes require both `--apply` and `--confirm-production`.

## Operational Notes

- Do not restore the full `vicplan_overlays` table for Heritage checks.
- Do not claim that Oracle already held a VicPlan backup before this task; it did not. The compact HO artifact is now the verified Oracle copy.
- Application code must query `heritage_overlays`, not `vicplan_overlays`.
- A rollback would remove only `heritage_overlays`; do not run that operation while the Heritage service depends on it.
