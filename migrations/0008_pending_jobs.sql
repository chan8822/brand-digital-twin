-- Migration 0008: Create pending_jobs table and claim function for Supabase/PostgreSQL

CREATE TABLE IF NOT EXISTS pending_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    action_id VARCHAR(255),
    run_at TIMESTAMPTZ NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    locked_by VARCHAR(255),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_jobs_scheduled ON pending_jobs(status, run_at);

-- Atomic job claim function using SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_next_pending_job(
  current_time_ms BIGINT,
  owner_id TEXT
) RETURNS SETOF pending_jobs AS $$
DECLARE
  claimed_job pending_jobs;
BEGIN
  UPDATE pending_jobs
  SET status = 'processing',
      locked_by = owner_id,
      expires_at = to_timestamp((current_time_ms + 10000) / 1000.0) -- 10s default lease
  WHERE job_id = (
    SELECT job_id
    FROM pending_jobs
    WHERE status = 'pending' AND EXTRACT(EPOCH FROM run_at) * 1000 <= current_time_ms
    ORDER BY run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO claimed_job;

  IF FOUND THEN
    RETURN NEXT claimed_job;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql;
