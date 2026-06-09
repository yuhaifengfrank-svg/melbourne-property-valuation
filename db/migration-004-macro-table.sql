CREATE TABLE IF NOT EXISTS macro_indicators (
  id SERIAL PRIMARY KEY,
  indicator TEXT NOT NULL,       -- e.g. 'cash_rate', 'housing_loan_var_oo', 'cpi_annual', 'unemployment_rate', 'pop_growth_vic'
  value NUMERIC(10,4) NOT NULL,
  recorded_date DATE NOT NULL,    -- the date/timepoint this value refers to
  source TEXT,                    -- e.g. 'RBA F1.1', 'ABS 6401.0'
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator, recorded_date)
);

-- Index for lookup by indicator
CREATE INDEX IF NOT EXISTS idx_macro_indicator_name ON macro_indicators(indicator, recorded_date DESC);
