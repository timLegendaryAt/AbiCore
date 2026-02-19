-- Phase 1: L1C Domain Context Database Foundation

-- 1. Add 'L1C' to ssot_level enum
ALTER TYPE ssot_level ADD VALUE 'L1C' AFTER 'L1';

-- 2. Create Context Fact Definitions (Schema Registry)
CREATE TABLE context_fact_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  fact_type TEXT NOT NULL DEFAULT 'text',
  category TEXT NOT NULL DEFAULT 'attribute', -- 'attribute' | 'constraint' | 'segment'
  
  -- Which domains this fact typically applies to
  default_domains company_domain[] DEFAULT '{}',
  
  -- Validation
  allowed_values JSONB,
  validation_rules JSONB,
  
  -- Display
  sort_order INTEGER DEFAULT 0,
  icon_name TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE context_fact_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view fact definitions"
  ON context_fact_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage fact definitions"
  ON context_fact_definitions FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- 3. Create Canonical Facts Table (Company Data)
CREATE TABLE company_context_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Fact identification
  fact_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  fact_value JSONB,
  fact_type TEXT NOT NULL DEFAULT 'text',
  
  -- Categorization
  category TEXT NOT NULL DEFAULT 'attribute',
  
  -- Metadata
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_reference JSONB,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  
  -- Audit
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(company_id, fact_key)
);

-- Enable RLS
ALTER TABLE company_context_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view context facts"
  ON company_context_facts FOR SELECT
  USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Platform admins can manage context facts"
  ON company_context_facts FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_context_facts_company ON company_context_facts(company_id);
CREATE INDEX idx_context_facts_key ON company_context_facts(fact_key);

-- 4. Create Domain Context References (Junction Table)
CREATE TABLE domain_context_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES company_context_facts(id) ON DELETE CASCADE,
  domain company_domain NOT NULL,
  relevance_note TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(fact_id, domain)
);

-- Enable RLS
ALTER TABLE domain_context_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view domain references"
  ON domain_context_references FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage domain references"
  ON domain_context_references FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Create index for domain lookups
CREATE INDEX idx_domain_refs_domain ON domain_context_references(domain);
CREATE INDEX idx_domain_refs_fact ON domain_context_references(fact_id);

-- 5. Create Score Influence References (For Phase 3/4)
CREATE TABLE score_influence_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_definition_id UUID REFERENCES company_field_definitions(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  influence_type TEXT NOT NULL, -- 'benchmark_selector' | 'weight_modifier' | 'rubric_selector'
  influence_config JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(field_definition_id, fact_key)
);

-- Enable RLS
ALTER TABLE score_influence_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view influence references"
  ON score_influence_references FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage influence references"
  ON score_influence_references FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- 6. Seed Initial Context Fact Definitions
INSERT INTO context_fact_definitions (fact_key, display_name, description, fact_type, category, default_domains, sort_order, icon_name) VALUES
-- Attributes
('hq_location', 'Headquarters Location', 'Primary office location', 'text', 'attribute', '{leadership,operations,people}', 1, 'MapPin'),
('operating_countries', 'Operating Countries', 'Countries where the company operates', 'array', 'attribute', '{operations,market}', 2, 'Globe'),
('founded_year', 'Founded Year', 'Year the company was founded', 'number', 'attribute', '{leadership}', 3, 'Calendar'),
('employee_count_band', 'Employee Count Band', 'Approximate employee headcount range', 'text', 'attribute', '{people,operations}', 4, 'Users'),

-- Business Model (Segments)
('business_model', 'Business Model', 'B2B, B2C, B2B2C, etc.', 'text', 'segment', '{strategy,revenue,customer}', 10, 'Building'),
('go_to_market', 'Go-to-Market Motion', 'Sales-led, Product-led, Hybrid', 'text', 'segment', '{strategy,revenue}', 11, 'Rocket'),
('pricing_model', 'Pricing Model', 'Subscription, Usage-based, One-time, Freemium', 'text', 'segment', '{revenue}', 12, 'CreditCard'),
('acv_band', 'ACV Band', 'Annual Contract Value range', 'text', 'segment', '{revenue,customer}', 13, 'DollarSign'),
('target_market', 'Target Market', 'SMB, Mid-Market, Enterprise', 'text', 'segment', '{strategy,customer,revenue}', 14, 'Target'),

-- Constraints
('regulated_industry', 'Regulated Industry', 'Whether the company operates in a regulated space', 'boolean', 'constraint', '{operations,product,finance}', 20, 'Shield'),
('compliance_frameworks', 'Compliance Frameworks', 'Required certifications (SOC2, HIPAA, etc.)', 'array', 'constraint', '{operations,product}', 21, 'CheckCircle'),
('unionized_workforce', 'Unionized Workforce', 'Whether workforce is unionized', 'boolean', 'constraint', '{people,operations}', 22, 'Users'),
('seasonality', 'Seasonality', 'Whether business has seasonal patterns', 'text', 'constraint', '{revenue,operations}', 23, 'Sun'),
('geographic_restrictions', 'Geographic Restrictions', 'Regions where the company cannot operate', 'array', 'constraint', '{operations,market}', 24, 'AlertTriangle');