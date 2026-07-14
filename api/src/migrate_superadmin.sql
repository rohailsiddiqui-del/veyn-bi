-- Run once on GCP Postgres to add dashboard_mode + is_active to tenants
-- psql -U veyn_bi -d veyn_bi -f migrate_superadmin.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS dashboard_mode VARCHAR(50) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
