-- Create ai_usage_logs table to track token usage and costs
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  node_id TEXT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(10, 6) DEFAULT 0,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_model ON public.ai_usage_logs(model);
CREATE INDEX idx_ai_usage_logs_workflow_id ON public.ai_usage_logs(workflow_id);
CREATE INDEX idx_ai_usage_logs_company_id ON public.ai_usage_logs(company_id);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all usage logs
CREATE POLICY "Platform admins can manage usage logs"
ON public.ai_usage_logs
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Company members can view their own usage logs
CREATE POLICY "Company members can view their usage logs"
ON public.ai_usage_logs
FOR SELECT
USING (is_company_member(auth.uid(), company_id));