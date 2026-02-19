-- Create ssot_pending_changes table for storing changes awaiting approval
CREATE TABLE public.ssot_pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  node_id TEXT,
  execution_run_id UUID REFERENCES execution_runs(id) ON DELETE SET NULL,
  
  -- Change details from SSOT_CHANGE_PLAN
  change_id TEXT NOT NULL,
  target_level ssot_level NOT NULL,
  target_domain company_domain NOT NULL,
  target_path JSONB NOT NULL,
  
  -- Change operation
  action TEXT NOT NULL,
  data_type TEXT NOT NULL,
  is_scored BOOLEAN DEFAULT false,
  evaluation_method TEXT,
  input_field_ids UUID[],
  
  -- Values
  current_value JSONB,
  proposed_value JSONB NOT NULL,
  provenance JSONB,
  
  -- Validation
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_errors TEXT[],
  validation_warnings TEXT[],
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Linked notification
  alert_id UUID REFERENCES system_alerts(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ssot_pending_changes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Company members can view pending changes"
  ON public.ssot_pending_changes FOR SELECT
  USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Platform admins can manage pending changes"
  ON public.ssot_pending_changes FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_ssot_pending_company ON public.ssot_pending_changes(company_id);
CREATE INDEX idx_ssot_pending_status ON public.ssot_pending_changes(status);
CREATE INDEX idx_ssot_pending_domain ON public.ssot_pending_changes(target_domain);

-- Add SSOT Update output destination
INSERT INTO public.output_destinations (
  name, destination_type, profile, edge_function, color, icon, description, is_active, sort_order
) VALUES (
  'SSOT Update',
  'internal_db',
  'ssot_update',
  'execute-ssot-changes',
  '#f59e0b',
  'FileEdit',
  'Execute SSOT Change Plans with approval workflow',
  true,
  4
);