-- Migration to add offline conversions upload sync columns to touchpoints table
ALTER TABLE brand_twin.touchpoints ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMP;
ALTER TABLE brand_twin.touchpoints ADD COLUMN IF NOT EXISTS meta_synced_at TIMESTAMP;
