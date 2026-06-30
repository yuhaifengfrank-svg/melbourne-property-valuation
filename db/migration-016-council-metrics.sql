-- Migration 016: Council Metrics (Phase 2)
--
-- Per-LGA building permit statistics from VBA/BPC Monthly Summaries.
-- Populated by scripts/populate-council-metrics.mjs
--
-- Captures monthly building activity per LGA and a rolling 12-month aggregate.

CREATE TABLE IF NOT EXISTS public.council_metrics (
    id                      BIGSERIAL   PRIMARY KEY,
    lga_code                TEXT        NOT NULL REFERENCES public.council_registry(lga_code),
    report_year             INTEGER     NOT NULL,
    report_month            INTEGER     NOT NULL,
    permits_new_residential INTEGER     DEFAULT 0,
    permits_new_multi_unit  INTEGER     DEFAULT 0,
    permits_alterations     INTEGER     DEFAULT 0,
    permits_commercial      INTEGER     DEFAULT 0,
    permits_total           INTEGER     DEFAULT 0,
    value_new_residential   NUMERIC(14,2) DEFAULT 0,
    value_new_multi_unit    NUMERIC(14,2) DEFAULT 0,
    value_alterations       NUMERIC(14,2) DEFAULT 0,
    value_commercial        NUMERIC(14,2) DEFAULT 0,
    value_total             NUMERIC(14,2) DEFAULT 0,
    avg_value_per_permit    NUMERIC(12,2),
    data_source             TEXT        DEFAULT 'VBA/BPC Monthly Summary',
    data_file               TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lga_code, report_year, report_month)
);

CREATE INDEX IF NOT EXISTS idx_council_metrics_lga     ON public.council_metrics (lga_code);
CREATE INDEX IF NOT EXISTS idx_council_metrics_period  ON public.council_metrics (report_year, report_month);

-- Materialized view: rolling 12-month aggregate
DROP MATERIALIZED VIEW IF EXISTS public.council_metrics_12m;

CREATE MATERIALIZED VIEW public.council_metrics_12m AS
SELECT
    lga_code,
    MAX(report_year)  AS latest_year,
    MAX(report_month) AS latest_month,
    SUM(permits_total)::bigint              AS permits_12m_total,
    SUM(permits_new_residential)::bigint    AS permits_12m_new_residential,
    SUM(permits_new_multi_unit)::bigint     AS permits_12m_new_multi_unit,
    SUM(permits_alterations)::bigint        AS permits_12m_alterations,
    SUM(permits_commercial)::bigint         AS permits_12m_commercial,
    SUM(value_total)                        AS value_12m_total,
    COUNT(*)::int                           AS months_covered
FROM public.council_metrics
WHERE report_year >= (SELECT MAX(report_year) - 1 FROM public.council_metrics)
GROUP BY lga_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_council_metrics_12m_lga ON public.council_metrics_12m (lga_code);

COMMENT ON TABLE  public.council_metrics                     IS 'Monthly building permit statistics per LGA from VBA/BPC (since 2015)';
COMMENT ON TABLE  public.council_metrics_12m                 IS 'Rolling 12-month aggregate of building permit stats per LGA';
COMMENT ON COLUMN public.council_metrics.permits_new_residential IS 'New single residential dwelling permits';
COMMENT ON COLUMN public.council_metrics.permits_new_multi_unit  IS 'New multi-unit (townhouse/apartment) permits';
COMMENT ON COLUMN public.council_metrics.permits_alterations     IS 'Alterations and additions permits';
COMMENT ON COLUMN public.council_metrics.permits_commercial      IS 'Commercial and industrial permits';
COMMENT ON COLUMN public.council_metrics.avg_value_per_permit    IS 'Average construction value per permit ($K)';
