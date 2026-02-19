-- Create table for dynamic integration ingest sources
CREATE TABLE integration_ingest_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id TEXT NOT NULL,
  ingest_point_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(integration_id, ingest_point_id)
);

-- Enable RLS
ALTER TABLE integration_ingest_sources ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage ingest sources
CREATE POLICY "Platform admins can manage ingest sources"
ON integration_ingest_sources
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Everyone can read active ingest sources (needed for workflow UI)
CREATE POLICY "Anyone can read active ingest sources"
ON integration_ingest_sources
FOR SELECT
USING (is_active = true);

-- Add updated_at trigger
CREATE TRIGGER update_integration_ingest_sources_updated_at
BEFORE UPDATE ON integration_ingest_sources
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Seed with current ingest points
INSERT INTO integration_ingest_sources (integration_id, ingest_point_id, name, description, fields) VALUES
('abivc', 'initial_submission', 'Initial Submission', 
 'Complete company profile from initial intake including company details, financials, team info, funding data, and all intake form responses.',
 '["company_data", "intake_submissions", "intake_fields"]'),
('abi', 'initial_submission', 'Initial Submission',
 'Company profile synced from Abi platform including company details, financials, team info, and all intake form responses.',
 '["company_data", "intake_submissions", "intake_fields"]');