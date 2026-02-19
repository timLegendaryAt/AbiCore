-- Add settings JSONB column to workflows table
ALTER TABLE workflows 
ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{"data_attribution": "company_data"}'::jsonb;