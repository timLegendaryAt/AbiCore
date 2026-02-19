-- Remove the unique constraint on type column if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_agent_type' 
        AND conrelid = 'public.ai_agents'::regclass
    ) THEN
        ALTER TABLE public.ai_agents DROP CONSTRAINT unique_agent_type;
    END IF;
END $$;