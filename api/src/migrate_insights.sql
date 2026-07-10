-- Run this on the GCP Postgres instance to add insights support
-- psql -U veynbi -d veynbi -f migrate_insights.sql

CREATE TABLE IF NOT EXISTS call_insights (
  id                          SERIAL PRIMARY KEY,
  call_id                     INTEGER NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id                   INTEGER NOT NULL,

  -- Classification
  call_category               VARCHAR(100),
  call_subcategory            VARCHAR(200),
  call_outcome                VARCHAR(50),

  -- Customer sentiment
  customer_sentiment_overall  VARCHAR(20),
  customer_sentiment_score    NUMERIC(4,2),
  customer_emotions           JSONB DEFAULT '[]',

  -- Agent sentiment
  agent_sentiment_overall     VARCHAR(50),
  agent_sentiment_score       NUMERIC(4,2),
  agent_tone_consistency      VARCHAR(20),

  -- Complaints
  top_complaints              JSONB DEFAULT '[]',

  -- Signal intelligence
  threat_detected             BOOLEAN DEFAULT FALSE,
  threat_details              TEXT,
  social_media_mention        BOOLEAN DEFAULT FALSE,
  social_media_details        TEXT,
  escalation_request          BOOLEAN DEFAULT FALSE,
  escalation_details          TEXT,
  regulatory_mention          BOOLEAN DEFAULT FALSE,
  regulatory_details          TEXT,

  -- Key moments
  key_moments                 JSONB DEFAULT '[]',

  -- Location & products
  location_mentioned          VARCHAR(200),
  product_mentions            JSONB DEFAULT '[]',

  -- Talk time
  customer_talk_pct           NUMERIC(5,1),
  agent_talk_pct              NUMERIC(5,1),

  -- Summary & meta
  summary                     TEXT,
  error                       TEXT,
  processed_at                TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_insights_tenant ON call_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_insights_category ON call_insights(tenant_id, call_category);
CREATE INDEX IF NOT EXISTS idx_call_insights_outcome ON call_insights(tenant_id, call_outcome);
CREATE INDEX IF NOT EXISTS idx_call_insights_threat ON call_insights(tenant_id, threat_detected);
CREATE INDEX IF NOT EXISTS idx_call_insights_sentiment ON call_insights(tenant_id, customer_sentiment_overall);

-- Add insights_status column to upload_batches if not exists
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS insights_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS insights_processed INTEGER DEFAULT 0;
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS insights_errors INTEGER DEFAULT 0;
