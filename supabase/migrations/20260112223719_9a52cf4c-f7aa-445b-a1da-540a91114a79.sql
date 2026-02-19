-- Create table for company ingest schemas
-- Stores the expected field definitions for company data ingestion per workflow node
CREATE TABLE public.company_ingest_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields array structure: { key: string, label: string, type: string, required: boolean, description: string }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workflow_id, node_id)
);

-- Enable RLS
ALTER TABLE public.company_ingest_schemas ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all schemas
CREATE POLICY "Platform admins can manage ingest schemas"
ON public.company_ingest_schemas
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_company_ingest_schemas_updated_at
BEFORE UPDATE ON public.company_ingest_schemas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();