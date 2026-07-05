-- Migration 014: POI (Point of Interest) scores for suburb_metrics
--
-- Adds 8 per-category POI density scores + composite POI score + raw counts.
-- Populated by scripts/populate-poi-metrics.mjs via Overpass API.
--
-- Categories:
--   poi_healthcare_score: hospital, clinic, pharmacy — 3km radius
--   poi_shopping_score: supermarket, mall, convenience, department_store — 2km
--   poi_recreation_score: park, playground, sports_centre, garden, nature_reserve — 2km
--   poi_dining_score: restaurant, cafe, pub, bar, fast_food — 2km
--   poi_transit_score: railway station — 2km
--   poi_education_score: kindergarten, library, college, university — 3km
--   poi_fitness_score: swimming_pool, fitness_centre — 3km
--   poi_public_services_score: police, fire_station, post_office, townhall, community_centre — 3km

BEGIN;

-- 8 per-category scores (0-100, NULL = not computed)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_healthcare_score       NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_shopping_score         NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_recreation_score       NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_dining_score           NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_transit_score          NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_education_score        NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_fitness_score          NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_public_services_score  NUMERIC(5,1);

-- Composite POI convenience score (0-100, weighted average of all categories)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_composite_score        NUMERIC(5,1);

-- Raw POI counts (for debug / future recalibration)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS poi_total_count            INTEGER;

COMMENT ON COLUMN suburb_metrics.poi_healthcare_score IS 'POI density: hospital/clinic/pharmacy — 3km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_shopping_score IS 'POI density: supermarket/mall/convenience — 2km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_recreation_score IS 'POI density: park/playground/sports_centre — 2km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_dining_score IS 'POI density: restaurant/cafe/pub/bar — 2km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_transit_score IS 'POI density: railway stations — 2km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_education_score IS 'POI density: kindergarten/library/college — 3km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_fitness_score IS 'POI density: swimming_pool/fitness_centre — 3km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_public_services_score IS 'POI density: police/fire/post_office/townhall — 3km (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_composite_score IS 'Weighted composite POI convenience score (0-100)';
COMMENT ON COLUMN suburb_metrics.poi_total_count IS 'Total raw POI count (sum of all categories)';

COMMIT;
