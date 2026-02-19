-- Master Company Database - Single Source of Truth Architecture
-- Creates domain-organized, version-controlled company intelligence storage

-- 1. Create the company_domain enum
CREATE TYPE company_domain AS ENUM (
  'leadership',
  'strategy', 
  'product',
  'operations',
  'market',
  'revenue',
  'customer',
  'people',
  'finance'
);

-- 2. Create domain definitions table (metadata for UI)
CREATE TABLE company_domain_definitions (
  domain company_domain PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  sort_order INTEGER DEFAULT 0,
  color TEXT
);

-- 3. Create the primary master data table (Single Source of Truth)
CREATE TABLE company_master_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain company_domain NOT NULL,
  field_key TEXT NOT NULL,
  field_value JSONB,
  field_type TEXT DEFAULT 'text',
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_reference JSONB,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(company_id, domain, field_key)
);

-- Indexes for performance
CREATE INDEX idx_master_data_company ON company_master_data(company_id);
CREATE INDEX idx_master_data_domain ON company_master_data(company_id, domain);
CREATE INDEX idx_master_data_source ON company_master_data(source_type);

-- 4. Create revision history table (complete audit trail)
CREATE TABLE company_master_data_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_data_id UUID NOT NULL REFERENCES company_master_data(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  domain company_domain NOT NULL,
  field_key TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  change_type TEXT NOT NULL,
  changed_by UUID,
  change_source TEXT,
  change_metadata JSONB,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_master_history_data ON company_master_data_history(master_data_id);
CREATE INDEX idx_master_history_company ON company_master_data_history(company_id);

-- 5. Create field definitions table (registry for expected fields)
CREATE TABLE company_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain company_domain NOT NULL,
  field_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  field_type TEXT NOT NULL DEFAULT 'text',
  is_required BOOLEAN DEFAULT FALSE,
  validation_rules JSONB,
  default_value JSONB,
  sort_order INTEGER DEFAULT 0,
  
  UNIQUE(domain, field_key)
);

-- 6. Enable Row-Level Security on all tables
ALTER TABLE company_master_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_master_data_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_domain_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_field_definitions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for company_master_data
CREATE POLICY "Company members can view master data"
ON company_master_data FOR SELECT
USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Platform admins can manage master data"
ON company_master_data FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 8. RLS Policies for company_master_data_history
CREATE POLICY "Company members can view history"
ON company_master_data_history FOR SELECT
USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Platform admins can manage history"
ON company_master_data_history FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 9. RLS Policies for domain definitions (read-only for authenticated)
CREATE POLICY "Authenticated users can view domain definitions"
ON company_domain_definitions FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage domain definitions"
ON company_domain_definitions FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 10. RLS Policies for field definitions (read-only for authenticated)
CREATE POLICY "Authenticated users can view field definitions"
ON company_field_definitions FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage field definitions"
ON company_field_definitions FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- 11. Create automatic history tracking trigger
CREATE OR REPLACE FUNCTION track_master_data_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO company_master_data_history (
      master_data_id, company_id, domain, field_key,
      previous_value, new_value, change_type, 
      changed_by, change_source, version
    ) VALUES (
      OLD.id, OLD.company_id, OLD.domain, OLD.field_key,
      OLD.field_value, NEW.field_value, 'update',
      auth.uid(), 'user', NEW.version
    );
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO company_master_data_history (
      master_data_id, company_id, domain, field_key,
      previous_value, new_value, change_type,
      changed_by, change_source, version
    ) VALUES (
      NEW.id, NEW.company_id, NEW.domain, NEW.field_key,
      NULL, NEW.field_value, 'create',
      auth.uid(), 'user', NEW.version
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER master_data_history_trigger
BEFORE INSERT OR UPDATE ON company_master_data
FOR EACH ROW EXECUTE FUNCTION track_master_data_changes();

-- 12. Seed domain definitions
INSERT INTO company_domain_definitions (domain, display_name, description, icon_name, sort_order, color) VALUES
('leadership', 'Leadership', 'Founders, executives, board members, and governance', 'Users', 1, 'blue'),
('strategy', 'Strategy', 'Vision, mission, goals, and competitive positioning', 'Target', 2, 'purple'),
('product', 'Product', 'Products, services, R&D, and innovation', 'Package', 3, 'green'),
('operations', 'Operations', 'Delivery, processes, supply chain, and logistics', 'Settings', 4, 'orange'),
('market', 'Market', 'Industry, market size, competition, and marketing', 'TrendingUp', 5, 'cyan'),
('revenue', 'Revenue', 'Sales, pricing, revenue streams, and monetization', 'DollarSign', 6, 'emerald'),
('customer', 'Customer', 'Customer segments, experience, support, and success', 'Heart', 7, 'pink'),
('people', 'People', 'Team, culture, hiring, and organization structure', 'UserCheck', 8, 'amber'),
('finance', 'Finance', 'Funding, financials, metrics, and accounting', 'Wallet', 9, 'slate');

-- 13. Seed field definitions
INSERT INTO company_field_definitions (domain, field_key, display_name, field_type, sort_order) VALUES
-- Leadership
('leadership', 'ceo_name', 'CEO Name', 'text', 1),
('leadership', 'ceo_linkedin', 'CEO LinkedIn', 'url', 2),
('leadership', 'founders', 'Founders', 'array', 3),
('leadership', 'board_members', 'Board Members', 'array', 4),
('leadership', 'advisors', 'Advisors', 'array', 5),
-- Strategy
('strategy', 'vision', 'Vision Statement', 'text', 1),
('strategy', 'mission', 'Mission Statement', 'text', 2),
('strategy', 'company_stage', 'Company Stage', 'text', 3),
('strategy', 'competitive_advantage', 'Competitive Advantage', 'text', 4),
-- Product
('product', 'product_description', 'Product Description', 'text', 1),
('product', 'product_stage', 'Product Stage', 'text', 2),
('product', 'key_features', 'Key Features', 'array', 3),
('product', 'tech_stack', 'Technology Stack', 'array', 4),
-- Operations
('operations', 'business_model', 'Business Model', 'text', 1),
('operations', 'operational_model', 'Operational Model', 'text', 2),
('operations', 'key_partnerships', 'Key Partnerships', 'array', 3),
-- Market
('market', 'industry', 'Industry', 'text', 1),
('market', 'target_market', 'Target Market', 'text', 2),
('market', 'market_size', 'Market Size (TAM)', 'text', 3),
('market', 'competitors', 'Key Competitors', 'array', 4),
-- Revenue
('revenue', 'revenue_model', 'Revenue Model', 'text', 1),
('revenue', 'pricing_strategy', 'Pricing Strategy', 'text', 2),
('revenue', 'mrr', 'Monthly Recurring Revenue', 'number', 3),
('revenue', 'arr', 'Annual Recurring Revenue', 'number', 4),
-- Customer
('customer', 'customer_segments', 'Customer Segments', 'array', 1),
('customer', 'customer_count', 'Number of Customers', 'number', 2),
('customer', 'customer_acquisition', 'Acquisition Strategy', 'text', 3),
('customer', 'retention_rate', 'Retention Rate', 'number', 4),
-- People
('people', 'team_size', 'Team Size', 'number', 1),
('people', 'key_hires_needed', 'Key Hires Needed', 'array', 2),
('people', 'culture_values', 'Culture & Values', 'text', 3),
('people', 'locations', 'Office Locations', 'array', 4),
-- Finance
('finance', 'funding_stage', 'Funding Stage', 'text', 1),
('finance', 'total_raised', 'Total Raised', 'number', 2),
('finance', 'monthly_burn', 'Monthly Burn Rate', 'number', 3),
('finance', 'runway_months', 'Runway (Months)', 'number', 4),
('finance', 'last_valuation', 'Last Valuation', 'number', 5);