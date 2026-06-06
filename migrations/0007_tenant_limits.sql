-- Migration 0007: Create tenant_limits table for per-tenant spend caps
CREATE TABLE IF NOT EXISTS tenant_limits (
    tenant_id VARCHAR PRIMARY KEY,
    max_daily_limit NUMERIC NOT NULL DEFAULT 1000.00,
    max_per_action_limit NUMERIC NOT NULL DEFAULT 500.00,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed defaults for existing test tenants
INSERT INTO tenant_limits (tenant_id, max_daily_limit, max_per_action_limit)
VALUES 
    ('test-tenant', 1000.00, 500.00),
    ('org-nike', 2000.00, 1000.00)
ON CONFLICT (tenant_id) DO NOTHING;
