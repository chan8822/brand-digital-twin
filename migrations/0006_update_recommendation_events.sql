-- Migration 0006: Update recommendation_events schema for detailed telemetry
ALTER TABLE brand_twin.recommendation_events
  ALTER COLUMN recommendation_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS finding_code TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS dollar_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS note TEXT;
