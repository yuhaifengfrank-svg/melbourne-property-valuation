-- Migration 015: Council Registry (Phase 1)
--
-- Master table of all 79 VIC Local Government Areas (LGAs) with demographics.
-- Populated by scripts/populate-council-registry.mjs
--
-- Usage: cat db/migration-015-council-registry.sql | node -e "...sql.unsafe(require('fs').readFileSync('/dev/stdin','utf8'))"
-- Or run the ETL script directly (it creates the table).

CREATE TABLE IF NOT EXISTS public.council_registry (
    lga_code            TEXT        PRIMARY KEY,
    lga_name            TEXT        NOT NULL UNIQUE,
    lga_name_official   TEXT,
    state               TEXT        NOT NULL DEFAULT 'VIC',
    population_2021     INTEGER,
    area_km2            NUMERIC(12,2),
    density_km2         NUMERIC(10,1),
    suburb_count        INTEGER,
    council_type        TEXT,
    region              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    census_data_year    INTEGER     DEFAULT 2021
);

CREATE INDEX IF NOT EXISTS idx_council_registry_name ON public.council_registry (lga_name);

COMMENT ON TABLE  public.council_registry                        IS 'Master registry of VIC Local Government Areas with demographics and geography';
COMMENT ON COLUMN public.council_registry.lga_code               IS 'ABS/Vicmap LGA code (5 digits)';
COMMENT ON COLUMN public.council_registry.lga_name               IS 'LGA name as known to school_locations and Vicmap';
COMMENT ON COLUMN public.council_registry.population_2021        IS 'Total population from ABS Census 2021 (G01 Tot_P_P)';
COMMENT ON COLUMN public.council_registry.area_km2               IS 'Total land area in square kilometres (Vicmap Admin)';
COMMENT ON COLUMN public.council_registry.density_km2            IS 'Population density per km² (pop/area)';
COMMENT ON COLUMN public.council_registry.suburb_count           IS 'Number of distinct suburbs mapped to this LGA in school_locations';
COMMENT ON COLUMN public.council_registry.council_type           IS 'Council classification: Metropolitan, Interface, Regional, Rural';
COMMENT ON COLUMN public.council_registry.region                 IS 'Victorian Government planning region (e.g. Melbourne, Barwon South West)';
COMMENT ON COLUMN public.council_registry.census_data_year       IS 'Year of census data used for population numbers';
