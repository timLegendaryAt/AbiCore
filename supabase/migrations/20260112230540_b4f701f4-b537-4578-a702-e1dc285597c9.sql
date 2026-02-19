-- Add columns for content hash tracking and cascade execution
ALTER TABLE public.company_node_data
ADD COLUMN IF NOT EXISTS content_hash TEXT,
ADD COLUMN IF NOT EXISTS dependency_hashes JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ;

-- Add index for faster hash lookups
CREATE INDEX IF NOT EXISTS idx_company_node_data_content_hash 
ON public.company_node_data(company_id, node_id, content_hash);

-- Add comment explaining the cascade system
COMMENT ON COLUMN public.company_node_data.content_hash IS 'SHA-256 hash of node output for change detection';
COMMENT ON COLUMN public.company_node_data.dependency_hashes IS 'Map of dependency node IDs to their content_hash when this node last executed';
COMMENT ON COLUMN public.company_node_data.last_executed_at IS 'Timestamp of last actual execution (not cache hit)';