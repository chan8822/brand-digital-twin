-- Migration 0003: Recommendation events, variants provenance, and invite allowlist
CREATE TABLE IF NOT EXISTS brand_twin.recommendation_events(
  event_id          TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  action            TEXT NOT NULL,         -- 'shown' | 'approved' | 'executed' | 'dismissed' | 'reversed'
  reason            TEXT,                  -- required for 'dismissed'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant-isolation queries
CREATE INDEX IF NOT EXISTS idx_recommendation_events_tenant ON brand_twin.recommendation_events(tenant_id);

-- Alter variants to track COGS provenance
ALTER TABLE brand_twin.variants ADD COLUMN IF NOT EXISTS provenance TEXT;

-- Invite allowlist table
CREATE TABLE IF NOT EXISTS brand_twin.invite_allowlist(
  email             TEXT PRIMARY KEY
);
