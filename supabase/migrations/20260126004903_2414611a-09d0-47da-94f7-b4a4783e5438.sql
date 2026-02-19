-- Output Destinations Registry
CREATE TABLE output_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('external_api', 'internal_db', 'webhook')),
  profile TEXT DEFAULT 'main',
  edge_function TEXT,
  color TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  config_schema JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE output_destinations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view destinations"
  ON output_destinations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage destinations"
  ON output_destinations FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Seed initial destinations
INSERT INTO output_destinations (name, destination_type, profile, edge_function, color, icon, description, sort_order) VALUES
('Abi Platform', 'external_api', 'abi', 'sync-output-to-abi', '#3b82f6', 'ExternalLink', 'Send outputs to Abi platform', 1),
('AbiVC Platform', 'external_api', 'abivc', 'sync-output-to-abivc', '#a855f7', 'ExternalLink', 'Send outputs to AbiVC platform', 2),
('Master Data (SSOT)', 'internal_db', 'main', 'sync-to-master-data', '#10b981', 'Database', 'Store to company master data', 3);