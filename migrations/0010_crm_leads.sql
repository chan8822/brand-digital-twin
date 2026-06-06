-- Migration to create crm_leads table for CRM Lead Gen Ingestion (PROAS)
CREATE TABLE IF NOT EXISTS brand_twin.crm_leads(
  lead_id STRING NOT NULL,  -- PK
  tenant_id STRING NOT NULL,
  email STRING NOT NULL,
  gclid STRING,
  fbclid STRING,
  status STRING NOT NULL,  -- 'prospect' | 'sql' | 'closed_won'
  value DOUBLE NOT NULL,
  google_synced_status STRING,
  meta_synced_status STRING,
  updated_at TIMESTAMP)
  PARTITION BY DATE(updated_at)
  CLUSTER BY tenant_id, status;
