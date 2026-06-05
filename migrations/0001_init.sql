-- Phase 0 canonical schema (BigQuery)
-- Minimal subset to compute true POAS + the audit/shadow log.
-- Note: BigQuery does not enforce PK/FK; keys are documented in comments.
-- Money is NUMERIC (exact decimal). Every table carries source-traceability + tenant_id.

CREATE SCHEMA IF NOT EXISTS brand_twin
  OPTIONS (location = 'US');

-- Common columns on every table (documented, repeated inline):
--   tenant_id STRING, source_system STRING, source_id STRING,
--   source_version STRING, ingested_at TIMESTAMP

CREATE TABLE IF NOT EXISTS brand_twin.variants(
  variant_id STRING NOT NULL,  -- PK (internal canonical id)
  product_id STRING,
  sku STRING,
  title STRING,
  price NUMERIC,
  cost_cogs NUMERIC,  -- the profit anchor
  currency STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,  -- platform-native id (e.g. Shopify variant gid)
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, variant_id;

CREATE TABLE IF NOT EXISTS brand_twin.customers(
  customer_id STRING NOT NULL,  -- PK (resolved profile)
  account_id STRING,  -- FK -> accounts (nullable; B2B)
  type STRING,  -- 'b2c' | 'b2b_contact'
  first_seen TIMESTAMP,
  consent_status STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, customer_id;

CREATE TABLE IF NOT EXISTS brand_twin.identity_links(
  customer_id STRING NOT NULL,  -- FK -> customers
  identifier_type STRING,  -- 'email' | 'phone' | 'device' | 'click_id'
  identifier_hash STRING,  -- hashed, never raw PII
  confidence FLOAT64,
  tenant_id STRING NOT NULL,
  source_system STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, customer_id;

CREATE TABLE IF NOT EXISTS brand_twin.orders(
  order_id STRING NOT NULL,  -- PK
  customer_id STRING,  -- FK -> customers
  account_id STRING,  -- FK -> accounts (nullable)
  channel STRING,  -- e.g., 'b2c_web'
  surface STRING,  -- e.g., Shopify shop domain
  placed_at TIMESTAMP NOT NULL,
  currency STRING,
  gross_revenue NUMERIC,
  total_discounts NUMERIC,
  total_tax NUMERIC,
  shipping_charged NUMERIC,
  status STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  PARTITION BY DATE(placed_at)
  CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.order_lines(
  order_line_id STRING NOT NULL,  -- PK
  order_id STRING NOT NULL,  -- FK -> orders
  variant_id STRING,  -- FK -> variants
  sku STRING,
  qty INT64,
  unit_price NUMERIC,
  line_discount NUMERIC,
  unit_cost NUMERIC,  -- COGS
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.refunds(
  refund_id STRING NOT NULL,  -- PK
  order_line_id STRING NOT NULL,  -- FK -> order_lines
  amount NUMERIC,
  refunded_at TIMESTAMP,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, order_line_id;

CREATE TABLE IF NOT EXISTS brand_twin.fulfillment_costs(
  order_id STRING NOT NULL,  -- FK -> orders
  shipping_cost NUMERIC,
  marketplace_fee NUMERIC,
  carrier STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.campaigns(
  campaign_id STRING NOT NULL,  -- PK
  platform STRING,  -- 'google' | 'meta' | 'amazon' | ...
  name STRING,
  objective STRING,
  status STRING,
  surface STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  source_id STRING,
  source_version STRING,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, campaign_id;

CREATE TABLE IF NOT EXISTS brand_twin.spend_facts(
  campaign_id STRING NOT NULL,  -- FK -> campaigns
  platform STRING,
  day DATE NOT NULL,
  amount NUMERIC,
  currency STRING,
  tenant_id STRING NOT NULL,
  source_system STRING,
  ingested_at TIMESTAMP)
  PARTITION BY day
  CLUSTER BY tenant_id, campaign_id;

CREATE TABLE IF NOT EXISTS brand_twin.touchpoints(
  touchpoint_id STRING NOT NULL,  -- PK
  customer_id STRING,  -- FK -> customers
  campaign_id STRING,  -- FK -> campaigns
  order_id STRING,  -- FK -> orders (nullable until attributed)
  occurred_at TIMESTAMP,
  type STRING,  -- 'impression' | 'click'
  tenant_id STRING NOT NULL,
  source_system STRING,
  ingested_at TIMESTAMP)
  PARTITION BY DATE(occurred_at)
  CLUSTER BY tenant_id, order_id;

-- Audit + shadow: append-only record of every proposed/simulated/executed action.
CREATE TABLE IF NOT EXISTS brand_twin.action_log(
  action_id STRING NOT NULL,  -- PK
  tenant_id STRING NOT NULL,
  actor STRING,  -- 'agent:media_buyer' | 'human:<id>'
  action_type STRING,
  target_entity STRING,
  proposed_payload JSON,
  status STRING,  -- 'planned' | 'simulated' | 'executed' | 'rolled_back' | 'blocked'
  reason STRING,
  policy_version STRING,
  confidence FLOAT64,
  approver STRING,
  rollback_ref STRING,
  created_at TIMESTAMP)
  PARTITION BY DATE(created_at)
  CLUSTER BY tenant_id, action_type;

-- Agency OS Team Members & Collaboration
CREATE TABLE IF NOT EXISTS brand_twin.team_members(
  member_id STRING NOT NULL,  -- PK
  org_id STRING NOT NULL,
  user_id STRING NOT NULL,
  role_name STRING,  -- 'media_buyer' | 'account_mgr' | 'cmo' | 'cfo' | 'admin'
  permissions JSON,  -- custom fine-grained permissions
  capacity_pct INT64,  -- utilization metric (0-100)
  tenant_id STRING NOT NULL,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, member_id;

-- Agency OS Client Profiles
CREATE TABLE IF NOT EXISTS brand_twin.clients(
  client_id STRING NOT NULL,  -- PK
  org_id STRING NOT NULL,
  name STRING NOT NULL,
  industry STRING,
  mrr NUMERIC,  -- Agency Monthly Recurring Revenue from client
  margin_target NUMERIC,  -- Target profit margin (e.g. 0.40 for 40%)
  health_score INT64,  -- calculated health score (0-100)
  churn_risk FLOAT64,  -- churn probability (0.0 to 1.0)
  tenant_id STRING NOT NULL,
  ingested_at TIMESTAMP)
  CLUSTER BY tenant_id, client_id;

-- Campaign Briefs / Draft Strategy Requests
CREATE TABLE IF NOT EXISTS brand_twin.campaign_briefs(
  brief_id STRING NOT NULL,  -- PK
  campaign_id STRING,
  client_id STRING,
  status STRING,  -- 'draft' | 'pending_approval' | 'approved' | 'live'
  projected_roi NUMERIC,
  budget NUMERIC,
  created_by STRING,  -- member_id
  approved_by STRING,  -- member_id
  tenant_id STRING NOT NULL,
  created_at TIMESTAMP,
  approved_at TIMESTAMP)
  CLUSTER BY tenant_id, brief_id;

-- Interactive Approvals Queue
CREATE TABLE IF NOT EXISTS brand_twin.approvals(
  approval_id STRING NOT NULL,  -- PK
  org_id STRING NOT NULL,
  entity_type STRING,  -- 'campaign' | 'budget_shift' | 'whatsapp_broadcast'
  entity_id STRING,
  requested_by STRING,  -- member_id or client_id
  assigned_to STRING,  -- role_name or specific member_id
  status STRING,  -- 'pending' | 'approved' | 'rejected'
  reason STRING,
  tenant_id STRING NOT NULL,
  created_at TIMESTAMP,
  completed_at TIMESTAMP)
  CLUSTER BY tenant_id, approval_id;

-- Real-Time Activity Feed & Notifications
CREATE TABLE IF NOT EXISTS brand_twin.activity_feed(
  event_id STRING NOT NULL,  -- PK
  org_id STRING NOT NULL,
  user_id STRING,  -- recipient (null means broadcast)
  actor_id STRING,  -- initiator
  action_type STRING,  -- e.g. 'brief_created', 'alert_triggered'
  entity_type STRING,
  entity_id STRING,
  summary STRING,
  is_read BOOLEAN,
  tenant_id STRING NOT NULL,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, event_id;

-- Client Portal Tokens
CREATE TABLE IF NOT EXISTS brand_twin.client_portals(
  portal_id STRING NOT NULL,  -- PK
  client_id STRING NOT NULL,
  access_token STRING NOT NULL,
  expires_at TIMESTAMP,
  permissions JSON,  -- array of strings, e.g. ["view_performance", "approve_briefs"]
  tenant_id STRING NOT NULL,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, portal_id;

-- 360 Operational OS Inbound Signals
CREATE TABLE IF NOT EXISTS brand_twin.brand_signals(
  signal_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  source
    STRING
      NOT NULL,  -- 'social' | 'pr' | 'sentiment' | 'ads' | 'content' | 'inventory' | 'team' | 'client'
  type STRING NOT NULL,
  severity STRING NOT NULL,  -- 'critical' | 'high' | 'medium' | 'low' | 'info'
  message STRING,
  payload JSON,
  timestamp TIMESTAMP)
  CLUSTER BY tenant_id, source;

-- Connected Platform Settings / Integrations
CREATE TABLE IF NOT EXISTS brand_twin.integration_states(
  integration_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  provider
    STRING NOT NULL,  -- 'gmail' | 'brandwatch' | 'asana' | 'hubspot' | 'quickbooks' | 'figma'
  status STRING NOT NULL,  -- 'active' | 'suspended' | 'expired'
  settings JSON,
  updated_at TIMESTAMP)
  CLUSTER BY tenant_id, provider;

-- Social Mentions & News Tracking
CREATE TABLE IF NOT EXISTS brand_twin.social_mentions(
  mention_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  platform STRING NOT NULL,  -- 'twitter' | 'reddit' | 'blogs' | 'news'
  content STRING,
  sentiment STRING,  -- 'positive' | 'negative' | 'neutral'
  reach INT64,
  influencer BOOLEAN,
  url STRING,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, platform;

-- Competitor Signal Feed
CREATE TABLE IF NOT EXISTS brand_twin.competitor_signals(
  competitor_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  competitor_name STRING NOT NULL,
  signal_type STRING NOT NULL,  -- 'ad_launch' | 'price_change' | 'new_product'
  details JSON,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, competitor_name;

-- Bank Statements / Transactions
CREATE TABLE IF NOT EXISTS brand_twin.financial_transactions(
  transaction_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  account_id STRING,
  amount NUMERIC,
  type STRING,  -- 'expense' | 'income'
  category STRING,
  description STRING,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, category;

-- Creative Asset Tracking
CREATE TABLE IF NOT EXISTS brand_twin.creative_assets(
  asset_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  type STRING NOT NULL,  -- 'design' | 'video' | 'copy'
  title STRING,
  location STRING,
  campaign STRING,
  compliance_ok BOOLEAN,
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, campaign;

-- Hardened durable background jobs / timers
CREATE TABLE IF NOT EXISTS brand_twin.pending_jobs(
  job_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  type STRING NOT NULL,  -- 'poas_daily' | 'settling_window'
  action_id STRING,
  run_at TIMESTAMP NOT NULL,
  payload JSON,
  status STRING NOT NULL,  -- 'pending' | 'processing' | 'completed' | 'failed'
  created_at TIMESTAMP)
  CLUSTER BY tenant_id, type;

-- Onboarding path observability telemetry events
CREATE TABLE IF NOT EXISTS brand_twin.onboarding_events(
  event_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  stage STRING NOT NULL,
  event_name STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  duration_ms INT64,
  data JSON)
  CLUSTER BY tenant_id, stage;

-- Atomic job claim function using SKIP LOCKED for PostgreSQL / Supabase
CREATE OR REPLACE FUNCTION brand_twin.claim_next_pending_job(
  current_time_ms BIGINT,
  owner_id TEXT
) RETURNS SETOF brand_twin.pending_jobs AS $$
DECLARE
  claimed_job brand_twin.pending_jobs;
BEGIN
  UPDATE brand_twin.pending_jobs
  SET status = 'processing'
  WHERE job_id = (
    SELECT job_id
    FROM brand_twin.pending_jobs
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

-- Auth & Org Hierarchy tables
-- legal_acceptances table to log consent history
CREATE TABLE IF NOT EXISTS brand_twin.legal_acceptances(
  acceptance_id  STRING NOT NULL, -- PK
  user_id        STRING NOT NULL,
  doc_version    STRING NOT NULL, -- e.g. 'v1.0'
  ip_address     STRING,
  accepted_at    TIMESTAMP NOT NULL
)
CLUSTER BY user_id;

CREATE TABLE IF NOT EXISTS brand_twin.users(
  user_id       STRING NOT NULL, -- PK
  email         STRING NOT NULL, -- UNIQUE
  pw_hash       STRING NOT NULL,
  status        STRING NOT NULL, -- 'pending_verification' | 'active' | 'disabled'
  deleted_at    TIMESTAMP,
  created_at    TIMESTAMP)
  CLUSTER BY user_id;

CREATE TABLE IF NOT EXISTS brand_twin.refresh_tokens(
  token_hash STRING NOT NULL, -- PK
  user_id    STRING NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked    BOOLEAN NOT NULL,
  created_at TIMESTAMP)
  CLUSTER BY token_hash;

CREATE TABLE IF NOT EXISTS brand_twin.orgs(
  org_id     STRING NOT NULL, -- PK
  name       STRING NOT NULL,
  owner_user STRING NOT NULL,
  plan       STRING NOT NULL,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP)
  CLUSTER BY org_id;

CREATE TABLE IF NOT EXISTS brand_twin.org_members(
  org_id STRING NOT NULL,
  user_id STRING NOT NULL,
  role STRING NOT NULL,
  PRIMARY KEY (org_id, user_id));

CREATE TABLE IF NOT EXISTS brand_twin.brand_twin_trust(
  tenant STRING NOT NULL,
  op STRING NOT NULL,
  tier INT64 NOT NULL,
  updated_at TIMESTAMP,
  PRIMARY KEY(tenant, op)
);



