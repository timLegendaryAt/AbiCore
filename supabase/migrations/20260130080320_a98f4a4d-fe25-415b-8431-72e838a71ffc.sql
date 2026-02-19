-- Create table for storing shared cache output data
CREATE TABLE public.shared_cache_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_cache_id UUID NOT NULL REFERENCES public.shared_caches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL,
  node_id TEXT NOT NULL,
  node_label TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shared_cache_id, company_id, workflow_id, node_id)
);

-- Enable RLS
ALTER TABLE public.shared_cache_data ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to manage shared cache data
CREATE POLICY "Authenticated users can manage shared_cache_data"
  ON public.shared_cache_data
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_shared_cache_data_lookup ON public.shared_cache_data(shared_cache_id, company_id);
CREATE INDEX idx_shared_cache_data_workflow ON public.shared_cache_data(workflow_id, node_id);