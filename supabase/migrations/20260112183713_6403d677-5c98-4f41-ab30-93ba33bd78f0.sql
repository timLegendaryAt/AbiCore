-- Drop the unique constraint on type - we need multiple agents per type
DROP INDEX IF EXISTS public.unique_agent_type;

-- Add an agent_role column for more granular classification
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS agent_role TEXT DEFAULT 'general';

-- Add description column for better documentation
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS description TEXT;

-- Create index on type + role for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ai_agents_type_role ON public.ai_agents(type, agent_role);