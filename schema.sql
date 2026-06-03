-- Phase 0 canonical schema (BigQuery)
-- Minimal subset to compute true POAS + the audit/shadow log.
-- Note: BigQuery does not enforce PK/FK; keys are documented in comments.
-- Money is NUMERIC (exact decimal). Every table carries source-traceability + tenant_id.

CREATE SCHEMA IF NOT EXISTS brand_twin
  OPTIONS (location = 'US');

-- Common columns on every table (documented, repeated inline):
--   tenant_id STRING, source_system STRING, source_id STRING,
--   source_version STRING, ingested_at TIMESTAMP

CREATE TABLE IF NOT EXISTS brand_twin.variants (
  variant_id     STRING  NOT NULL,   -- PK (internal canonical id)
  product_id     STRING,
  sku            STRING,
  title          STRING,
  price          NUMERIC,
  cost_cogs      NUMERIC,            -- the profit anchor
  currency       STRING,
  tenant_id      STRING  NOT NULL,
  source_system  STRING,
  source_id      STRING,             -- platform-native id (e.g. Shopify variant gid)
  source_version STRING,
  ingested_at    TIMESTAMP
) CLUSTER BY tenant_id, variant_id;

CREATE TABLE IF NOT EXISTS brand_twin.customers (
  customer_id    STRING  NOT NULL,   -- PK (resolved profile)
  account_id     STRING,             -- FK -> accounts (nullable; B2B)
  type           STRING,             -- 'b2c' | 'b2b_contact'
  first_seen     TIMESTAMP,
  consent_status STRING,
  tenant_id      STRING  NOT NULL,
  source_system  STRING,
  source_id      STRING,
  source_version STRING,
  ingested_at    TIMESTAMP
) CLUSTER BY tenant_id, customer_id;

CREATE TABLE IF NOT EXISTS brand_twin.identity_links (
  customer_id     STRING NOT NULL,   -- FK -> customers
  identifier_type STRING,            -- 'email' | 'phone' | 'device' | 'click_id'
  identifier_hash STRING,            -- hashed, never raw PII
  confidence      FLOAT64,
  tenant_id       STRING NOT NULL,
  source_system   STRING,
  ingested_at     TIMESTAMP
) CLUSTER BY tenant_id, customer_id;

CREATE TABLE IF NOT EXISTS brand_twin.orders (
  order_id         STRING  NOT NULL,   -- PK
  customer_id      STRING,             -- FK -> customers
  account_id       STRING,             -- FK -> accounts (nullable)
  channel          STRING,             -- e.g., 'b2c_web'
  surface          STRING,             -- e.g., Shopify shop domain
  placed_at        TIMESTAMP NOT NULL,
  currency         STRING,
  gross_revenue    NUMERIC,
  total_discounts  NUMERIC,
  total_tax        NUMERIC,
  shipping_charged NUMERIC,
  status           STRING,
  tenant_id        STRING  NOT NULL,
  source_system    STRING,
  source_id        STRING,
  source_version   STRING,
  ingested_at      TIMESTAMP
) PARTITION BY DATE(placed_at)
  CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.order_lines (
  order_line_id  STRING  NOT NULL,   -- PK
  order_id       STRING  NOT NULL,   -- FK -> orders
  variant_id     STRING,             -- FK -> variants
  sku            STRING,
  qty            INT64,
  unit_price     NUMERIC,
  line_discount  NUMERIC,
  unit_cost      NUMERIC,            -- COGS
  tenant_id      STRING  NOT NULL,
  source_system  STRING,
  source_id      STRING,
  source_version STRING,
  ingested_at    TIMESTAMP
) CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.refunds (
  refund_id      STRING  NOT NULL,   -- PK
  order_line_id  STRING  NOT NULL,   -- FK -> order_lines
  amount         NUMERIC,
  refunded_at    TIMESTAMP,
  tenant_id      STRING  NOT NULL,
  source_system  STRING,
  source_id      STRING,
  source_version STRING,
  ingested_at    TIMESTAMP
) CLUSTER BY tenant_id, order_line_id;

CREATE TABLE IF NOT EXISTS brand_twin.fulfillment_costs (
  order_id        STRING  NOT NULL,   -- FK -> orders
  shipping_cost   NUMERIC,
  marketplace_fee NUMERIC,
  carrier         STRING,
  tenant_id       STRING  NOT NULL,
  source_system   STRING,
  source_id       STRING,
  source_version  STRING,
  ingested_at     TIMESTAMP
) CLUSTER BY tenant_id, order_id;

CREATE TABLE IF NOT EXISTS brand_twin.campaigns (
  campaign_id    STRING  NOT NULL,   -- PK
  platform       STRING,             -- 'google' | 'meta' | 'amazon' | ...
  name           STRING,
  objective      STRING,
  status         STRING,
  surface        STRING,
  tenant_id      STRING  NOT NULL,
  source_system  STRING,
  source_id      STRING,
  source_version STRING,
  ingested_at    TIMESTAMP
) CLUSTER BY tenant_id, campaign_id;

CREATE TABLE IF NOT EXISTS brand_twin.spend_facts (
  campaign_id   STRING NOT NULL,     -- FK -> campaigns
  platform      STRING,
  day           DATE   NOT NULL,
  amount        NUMERIC,
  currency      STRING,
  tenant_id     STRING NOT NULL,
  source_system STRING,
  ingested_at   TIMESTAMP
) PARTITION BY day
  CLUSTER BY tenant_id, campaign_id;

CREATE TABLE IF NOT EXISTS brand_twin.touchpoints (
  touchpoint_id STRING NOT NULL,     -- PK
  customer_id   STRING,              -- FK -> customers
  campaign_id   STRING,              -- FK -> campaigns
  order_id      STRING,              -- FK -> orders (nullable until attributed)
  occurred_at   TIMESTAMP,
  type          STRING,              -- 'impression' | 'click'
  tenant_id     STRING NOT NULL,
  source_system STRING,
  ingested_at   TIMESTAMP
) PARTITION BY DATE(occurred_at)
  CLUSTER BY tenant_id, order_id;

-- Audit + shadow: append-only record of every proposed/simulated/executed action.
CREATE TABLE IF NOT EXISTS brand_twin.action_log (
  action_id       STRING NOT NULL,   -- PK
  tenant_id       STRING NOT NULL,
  actor           STRING,            -- 'agent:media_buyer' | 'human:<id>'
  action_type     STRING,
  target_entity   STRING,
  proposed_payload JSON,
  status          STRING,            -- 'planned' | 'simulated' | 'executed' | 'rolled_back' | 'blocked'
  reason          STRING,
  policy_version  STRING,
  confidence      FLOAT64,
  approver        STRING,
  rollback_ref    STRING,
  created_at      TIMESTAMP
) PARTITION BY DATE(created_at)
  CLUSTER BY tenant_id, action_type;
