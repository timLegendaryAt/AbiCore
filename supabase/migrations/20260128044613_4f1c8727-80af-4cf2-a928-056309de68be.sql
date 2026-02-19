-- Phase 1: 4-Level SSOT Hierarchy Schema Changes

-- 1.1 Create new enum for field levels
CREATE TYPE public.ssot_level AS ENUM ('L1', 'L2', 'L3', 'L4');

-- 1.2 Modify company_field_definitions table
ALTER TABLE company_field_definitions 
ADD COLUMN level ssot_level DEFAULT 'L4',
ADD COLUMN parent_field_id uuid REFERENCES company_field_definitions(id) ON DELETE SET NULL,
ADD COLUMN is_scored boolean DEFAULT false,
ADD COLUMN evaluation_method text, -- 'benchmark', 'rubric', 'ai', 'formula'
ADD COLUMN evaluation_config jsonb, -- method-specific configuration
ADD COLUMN score_weight numeric DEFAULT 1.0, -- weight when aggregating to parent
ADD COLUMN benchmark_reference jsonb; -- industry benchmarks for comparison

-- Create index for parent lookups
CREATE INDEX idx_company_field_definitions_parent ON company_field_definitions(parent_field_id);
CREATE INDEX idx_company_field_definitions_level ON company_field_definitions(level);

-- 1.3 Modify company_master_data table
ALTER TABLE company_master_data 
ADD COLUMN score integer, -- 0-100 health score (null for L4)
ADD COLUMN score_confidence numeric, -- 0-1 confidence in the score
ADD COLUMN score_reasoning text, -- AI or formula explanation
ADD COLUMN score_calculated_at timestamptz,
ADD COLUMN aggregated_from jsonb; -- array of child field_keys used

-- 1.4 Create company_domain_scores table for L1 aggregated scores
CREATE TABLE company_domain_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain company_domain NOT NULL,
  score integer, -- 0-100 aggregated health score
  confidence numeric, -- 0-1 confidence level
  reasoning text,
  contributing_fields jsonb, -- L2 fields and their scores
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, domain)
);

-- Enable RLS on company_domain_scores
ALTER TABLE company_domain_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies for company_domain_scores
CREATE POLICY "Company members can view domain scores" 
ON company_domain_scores 
FOR SELECT 
USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Platform admins can manage domain scores" 
ON company_domain_scores 
FOR ALL 
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Create updated_at trigger for company_domain_scores
CREATE TRIGGER update_company_domain_scores_updated_at
BEFORE UPDATE ON company_domain_scores
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();