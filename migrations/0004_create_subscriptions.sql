-- Migration 0004: Create subscriptions table for trial and billing tracking
CREATE TABLE IF NOT EXISTS brand_twin.subscriptions(
  org_id            TEXT PRIMARY KEY,
  status            TEXT NOT NULL,        -- 'trial' | 'suggest_amount' | 'pending_review' | 'active' | 'past_due' | 'suspended'
  amount            NUMERIC,              -- monthly subscription cost
  currency          TEXT NOT NULL,        -- e.g. 'USD'
  period            TEXT NOT NULL,        -- 'month'
  trial_day         INT NOT NULL,         -- current day of trial (0-based)
  trial_length_days INT NOT NULL,         -- e.g. 14 or 30
  next_charge_at    TIMESTAMPTZ,
  note              TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
